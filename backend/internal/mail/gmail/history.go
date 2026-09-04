package gmail

import (
	"context"
	"net/url"
)

// gmailAPIBase is the Gmail REST API root. It is a package-level var (rather
// than an inline literal like the rest of this package) so tests can point
// it at an httptest server.
var gmailAPIBase = "https://gmail.googleapis.com/gmail/v1"

// historyMessageRef is the minimal message reference embedded in a history
// record (messagesAdded/messagesDeleted/labelsAdded/labelsRemoved).
type historyMessageRef struct {
	ID       string   `json:"id"`
	ThreadID string   `json:"threadId"`
	LabelIDs []string `json:"labelIds"`
}

type historyLabelChange struct {
	Message  historyMessageRef `json:"message"`
	LabelIDs []string          `json:"labelIds"`
}

// historyRecord is one entry of `users.history.list`'s `history` array.
type historyRecord struct {
	ID            string `json:"id"`
	MessagesAdded []struct {
		Message historyMessageRef `json:"message"`
	} `json:"messagesAdded"`
	MessagesDeleted []struct {
		Message historyMessageRef `json:"message"`
	} `json:"messagesDeleted"`
	LabelsAdded   []historyLabelChange `json:"labelsAdded"`
	LabelsRemoved []historyLabelChange `json:"labelsRemoved"`
}

type historyListResult struct {
	History       []historyRecord `json:"history"`
	NextPageToken string          `json:"nextPageToken"`
	HistoryID     string          `json:"historyId"`
}

// getProfile fetches the account's current Gmail historyId, used to seed the
// incremental sync cursor after a full sync.
func getProfile(ctx context.Context, accessToken string) (string, error) {
	var out struct {
		HistoryID string `json:"historyId"`
	}
	if err := gmailGet(ctx, accessToken, gmailAPIBase+"/users/me/profile", &out); err != nil {
		return "", err
	}
	return out.HistoryID, nil
}

// historyPageCap bounds how many `users.history.list` pages one sync run
// replays before giving up (500 records/page is Gmail's max).
const historyPageCap = 50

// listHistorySince lists every history record after startHistoryID up to the
// mailbox's current state, paginating as needed.
//
// invalidHistory reports whether Gmail rejected startHistoryID as too old to
// replay (HTTP 404) — the caller should fall back to a full sync and reseed
// the cursor from a fresh users.getProfile call.
func listHistorySince(ctx context.Context, accessToken, startHistoryID string) (records []historyRecord, newHistoryID string, invalidHistory bool, err error) {
	pageToken := ""
	for page := 0; page < historyPageCap; page++ {
		params := url.Values{}
		params.Set("startHistoryId", startHistoryID)
		params.Set("maxResults", "500")
		params.Add("historyTypes", "messageAdded")
		params.Add("historyTypes", "messageDeleted")
		params.Add("historyTypes", "labelAdded")
		params.Add("historyTypes", "labelRemoved")
		if pageToken != "" {
			params.Set("pageToken", pageToken)
		}
		var out historyListResult
		if gerr := gmailGet(ctx, accessToken, gmailAPIBase+"/users/me/history?"+params.Encode(), &out); gerr != nil {
			if isHTTPNotFound(gerr) {
				return nil, "", true, nil
			}
			return nil, "", false, gerr
		}
		records = append(records, out.History...)
		if out.HistoryID != "" {
			newHistoryID = out.HistoryID
		}
		if out.NextPageToken == "" {
			break
		}
		pageToken = out.NextPageToken
	}
	return records, newHistoryID, false, nil
}

// runIncrementalByHistory replays history since historyID and applies the
// deltas locally. handled=false tells the caller to fall back to a full sync
// (historyId was too old for Gmail to replay); handled=true means result is
// final (either a successful incremental apply or a hard failure).
func (c *Client) runIncrementalByHistory(ctx context.Context, accountID, token, historyID string, opts SyncOptions) (result SyncResult, handled bool) {
	records, newHistoryID, invalid, err := listHistorySince(ctx, token, historyID)
	if err != nil {
		return SyncResult{Status: "failed", ErrorMessage: err.Error()}, true
	}
	if invalid {
		return SyncResult{}, false
	}
	synced, fetchErrors := c.applyHistoryRecords(ctx, accountID, token, records, opts)
	if newHistoryID == "" {
		// No history entries (or Gmail omitted historyId on every page): the
		// cursor still needs to advance so we do not replay from stale data
		// forever, so fetch the mailbox's current historyId directly.
		if pid, perr := getProfile(ctx, token); perr == nil {
			newHistoryID = pid
		} else {
			newHistoryID = historyID
		}
	}
	if opts.OnProgress != nil {
		opts.OnProgress(synced, synced)
	}
	return SyncResult{
		Status: "done", MessagesSynced: synced, MessagesListed: synced,
		FetchErrors: fetchErrors, NewHistoryID: newHistoryID,
	}, true
}

// applyHistoryRecords upserts added messages, deletes removed ones, and
// patches the stored label set for label-only changes, in that order so a
// message that was both added and label-changed in the same page is not
// double-fetched.
func (c *Client) applyHistoryRecords(ctx context.Context, accountID, token string, records []historyRecord, opts SyncOptions) (synced, fetchErrors int) {
	freshlyAdded := map[string]bool{}
	for i, rec := range records {
		if opts.CheckCancel != nil && i%10 == 0 && opts.CheckCancel() {
			break
		}
		for _, m := range rec.MessagesAdded {
			id := m.Message.ID
			if id == "" || freshlyAdded[id] {
				continue
			}
			freshlyAdded[id] = true
			raw, gerr := getMessage(ctx, token, id)
			if gerr != nil {
				if !isHTTPNotFound(gerr) {
					fetchErrors++
				}
				continue
			}
			if c.UpsertMessage(ctx, accountID, raw) {
				synced++
			}
		}
	}
	for _, rec := range records {
		for _, m := range rec.MessagesDeleted {
			if m.Message.ID != "" {
				c.deleteLocalByProviderID(ctx, accountID, m.Message.ID)
			}
		}
	}
	for _, rec := range records {
		for _, m := range rec.LabelsAdded {
			if m.Message.ID == "" || freshlyAdded[m.Message.ID] {
				continue
			}
			c.patchLocalLabels(ctx, accountID, m.Message.ID, m.LabelIDs, nil)
		}
		for _, m := range rec.LabelsRemoved {
			if m.Message.ID == "" || freshlyAdded[m.Message.ID] {
				continue
			}
			c.patchLocalLabels(ctx, accountID, m.Message.ID, nil, m.LabelIDs)
		}
	}
	return synced, fetchErrors
}

// deleteLocalByProviderID removes a locally cached message identified by its
// Gmail message id (history's messagesDeleted only carries the provider id,
// not our internal UUID).
func (c *Client) deleteLocalByProviderID(ctx context.Context, accountID, providerMessageID string) {
	var row struct {
		ID string `json:"id"`
	}
	found, _ := c.sb.From("mail_messages").
		Select("id").
		Eq("mail_account_id", accountID).
		Eq("provider_message_id", providerMessageID).
		MaybeSingle(ctx, &row)
	if found && row.ID != "" {
		c.deleteMessageLocally(ctx, row.ID)
	}
}

// patchLocalLabels applies a label add/remove delta to the cached row without
// refetching the full message, and keeps is_read/is_starred in sync with the
// UNREAD/STARRED labels.
func (c *Client) patchLocalLabels(ctx context.Context, accountID, providerMessageID string, add, remove []string) {
	var row struct {
		ID     string   `json:"id"`
		Labels []string `json:"labels"`
	}
	found, _ := c.sb.From("mail_messages").
		Select("id,labels").
		Eq("mail_account_id", accountID).
		Eq("provider_message_id", providerMessageID).
		MaybeSingle(ctx, &row)
	if !found || row.ID == "" {
		return
	}
	labels := row.Labels
	for _, l := range add {
		if !containsStr(labels, l) {
			labels = append(labels, l)
		}
	}
	if len(remove) > 0 {
		filtered := make([]string, 0, len(labels))
		for _, l := range labels {
			if !containsStr(remove, l) {
				filtered = append(filtered, l)
			}
		}
		labels = filtered
	}
	update := map[string]any{"labels": labels}
	if containsStr(add, "UNREAD") {
		update["is_read"] = false
	}
	if containsStr(remove, "UNREAD") {
		update["is_read"] = true
	}
	if containsStr(add, "STARRED") {
		update["is_starred"] = true
	}
	if containsStr(remove, "STARRED") {
		update["is_starred"] = false
	}
	_ = c.sb.From("mail_messages").Update(update).Eq("id", row.ID).Exec(ctx, nil)
}
