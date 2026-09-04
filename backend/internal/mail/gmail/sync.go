package gmail

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

// reconcileMaxPerSync bounds how many stale INBOX/TRASH rows are reconciled
// against the Gmail API in a single sync run.
const reconcileMaxPerSync = 100

// auxiliaryMailboxLabels are synced on every run without the INBOX
// incremental time cursor so sidebar folders (Spam, Trash, Sent, Drafts)
// populate even when messages never carried INBOX.
var auxiliaryMailboxLabels = []string{"SPAM", "TRASH", "SENT", "DRAFT"}

// SyncOptions configures one Gmail sync run.
type SyncOptions struct {
	Kind            string // "incremental" | "historical"
	HistoricalSince *string
	OnProgress      func(synced, total int)
	CheckCancel     func() bool
}

// SyncResult summarizes the outcome of a Gmail sync run.
type SyncResult struct {
	Status         string // done | failed | cancelled
	MessagesSynced int
	MessagesListed int
	FetchErrors    int
	UpsertErrors   int
	ErrorMessage   string
	// NewHistoryID is the historyId to persist on mail_accounts after a
	// successful run, seeding (or advancing) the next incremental sync's
	// history.list cursor. Empty when the run failed or historyId is
	// unavailable.
	NewHistoryID string
}

// RunSync performs a Gmail sync. Incremental runs replay `users.history.list`
// from historyID when available (fast, no full label listing); historical
// runs and incremental runs with no usable cursor fall back to the full
// label-listing sync, which also reseeds historyID for next time.
func (c *Client) RunSync(ctx context.Context, accountID string, lastSyncAt *string, historyID *string, opts SyncOptions) SyncResult {
	token, err := c.GetAccessToken(ctx, accountID)
	if err != nil {
		return SyncResult{Status: "failed", ErrorMessage: err.Error()}
	}

	if opts.Kind != "historical" && historyID != nil && *historyID != "" {
		if result, handled := c.runIncrementalByHistory(ctx, accountID, token, *historyID, opts); handled {
			return result
		}
		// historyId too old for Gmail to replay: fall through to a full sync,
		// which reseeds the historyId cursor below.
	}

	result := c.runFullSync(ctx, accountID, token, lastSyncAt, opts)
	if result.Status == "done" {
		if newID, perr := getProfile(ctx, token); perr == nil {
			result.NewHistoryID = newID
		}
	}
	return result
}

// runFullSync lists Gmail labels (INBOX + auxiliary mailboxes) and upserts
// every message found, then reconciles local rows removed from INBOX/TRASH.
// It is the sync path used for historical backfills and for the very first
// incremental run before a historyId cursor exists.
func (c *Client) runFullSync(ctx context.Context, accountID, token string, lastSyncAt *string, opts SyncOptions) SyncResult {
	q := ""
	cursor := ""
	if opts.Kind == "historical" {
		if opts.HistoricalSince != nil {
			if t, ok := parseISOTimestamp(*opts.HistoricalSince); ok {
				q = "after:" + strconv.FormatInt(afterEpochSeconds(t), 10)
			}
		}
	} else {
		var dbLatest *time.Time
		if t, ok := c.latestStoredReceivedAt(ctx, accountID); ok {
			dbLatest = &t
		}
		if since, ok := incrementalSince(lastSyncAt, dbLatest); ok {
			q = "after:" + strconv.FormatInt(afterEpochSeconds(since), 10)
			cursor = q
		}
	}

	maxPages, fetchCap := 10, 200
	if opts.Kind == "historical" || cursor != "" {
		maxPages, fetchCap = 100, 5000
	}

	ids, lerr := collectLabelMessageIDs(ctx, token, "INBOX", q, maxPages, fetchCap)
	if lerr != nil {
		return SyncResult{Status: "failed", ErrorMessage: lerr.Error()}
	}

	auxCap := 200
	auxMaxPages := 10
	if opts.Kind == "historical" {
		auxCap = 500
		auxMaxPages = 100
	}
	for _, labelID := range auxiliaryMailboxLabels {
		auxIDs, aerr := collectLabelMessageIDs(ctx, token, labelID, "", auxMaxPages, auxCap)
		if aerr != nil {
			return SyncResult{Status: "failed", ErrorMessage: aerr.Error()}
		}
		ids = mergeUniqueMessageIDs(ids, auxIDs)
	}

	synced := 0
	fetchErrors := 0
	upsertErrors := 0
	total := len(ids)
	for i, id := range ids {
		if opts.CheckCancel != nil && i%25 == 0 && opts.CheckCancel() {
			return SyncResult{
				Status: "cancelled", MessagesSynced: synced, MessagesListed: total,
				FetchErrors: fetchErrors, UpsertErrors: upsertErrors,
			}
		}
		raw, gerr := getMessage(ctx, token, id)
		if gerr != nil {
			fetchErrors++
			continue
		}
		if c.UpsertMessage(ctx, accountID, raw) {
			synced++
		} else {
			upsertErrors++
		}
		if opts.OnProgress != nil && synced%10 == 0 {
			opts.OnProgress(synced, total)
		}
	}
	if opts.OnProgress != nil {
		opts.OnProgress(synced, total)
	}
	if fetchErrors > 0 && synced == 0 && total > 0 {
		return SyncResult{
			Status: "failed", MessagesSynced: synced, MessagesListed: total,
			FetchErrors: fetchErrors, UpsertErrors: upsertErrors,
			ErrorMessage: fmt.Sprintf("Failed to fetch %d of %d Gmail messages", fetchErrors, total),
		}
	}
	if upsertErrors > 0 && synced == 0 && total > 0 {
		return SyncResult{
			Status: "failed", MessagesSynced: synced, MessagesListed: total,
			FetchErrors: fetchErrors, UpsertErrors: upsertErrors,
			ErrorMessage: fmt.Sprintf("Failed to save %d of %d Gmail messages", upsertErrors, total),
		}
	}

	// Pull label changes for messages removed from Gmail INBOX (trash/archive/delete).
	if inboxIDs, lerr := listAllLabelIDs(ctx, token, "INBOX"); lerr == nil {
		synced += c.reconcileLabelRemovals(ctx, accountID, token, "INBOX", inboxIDs)
	}

	// Delete local TRASH rows Gmail permanently removed (empty trash, 30-day purge, etc.).
	if trashIDs, lerr := listAllLabelIDs(ctx, token, "TRASH"); lerr == nil {
		synced += c.reconcileLabelRemovals(ctx, accountID, token, "TRASH", trashIDs)
	}

	return SyncResult{
		Status: "done", MessagesSynced: synced, MessagesListed: total,
		FetchErrors: fetchErrors, UpsertErrors: upsertErrors,
	}
}

// collectLabelMessageIDs lists Gmail message ids for one label, optionally
// filtered by a Gmail search query (`after:` etc.).
func collectLabelMessageIDs(ctx context.Context, token, labelID, q string, maxPages, fetchCap int) ([]string, error) {
	if fetchCap <= 0 {
		return nil, nil
	}
	ids := make([]string, 0, min(fetchCap, 100))
	pageToken := ""
	for page := 0; page < maxPages; page++ {
		list, err := listMessages(ctx, token, labelID, 100, pageToken, q)
		if err != nil {
			return nil, fmt.Errorf("list Gmail %s: %w", labelID, err)
		}
		for _, m := range list.Messages {
			ids = append(ids, m.ID)
			if len(ids) >= fetchCap {
				return ids, nil
			}
		}
		if list.NextPageToken == "" {
			break
		}
		pageToken = list.NextPageToken
	}
	return ids, nil
}

// mergeUniqueMessageIDs appends ids from extra that are not already in base.
func mergeUniqueMessageIDs(base, extra []string) []string {
	if len(extra) == 0 {
		return base
	}
	seen := make(map[string]struct{}, len(base)+len(extra))
	for _, id := range base {
		seen[id] = struct{}{}
	}
	for _, id := range extra {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		base = append(base, id)
	}
	return base
}

// listAllLabelIDs returns every message id currently carrying a Gmail system label.
func listAllLabelIDs(ctx context.Context, token, labelID string) (map[string]bool, error) {
	out := map[string]bool{}
	pageToken := ""
	for page := 0; page < 100; page++ {
		list, err := listMessages(ctx, token, labelID, 100, pageToken, "")
		if err != nil {
			return nil, err
		}
		for _, m := range list.Messages {
			out[m.ID] = true
		}
		if list.NextPageToken == "" {
			break
		}
		pageToken = list.NextPageToken
	}
	return out, nil
}

type inboxRow struct {
	ID                string   `json:"id"`
	ProviderMessageID string   `json:"provider_message_id"`
	Labels            []string `json:"labels"`
	ReceivedAt        *string  `json:"received_at"`
}

// reconcileLabelRemovals refreshes or deletes local rows that still carry
// label but no longer appear in the matching Gmail label list.
func (c *Client) reconcileLabelRemovals(ctx context.Context, accountID, token, label string, presentIDs map[string]bool) int {
	var rows []inboxRow
	if err := c.sb.From("mail_messages").
		Select("id,provider_message_id,labels,received_at").
		Eq("mail_account_id", accountID).
		Contains("labels", "{"+label+"}").
		Exec(ctx, &rows); err != nil {
		return 0
	}

	stale := make([]inboxRow, 0, len(rows))
	for _, row := range rows {
		if !IsGmailProviderMessageID(row.ProviderMessageID) {
			continue
		}
		if presentIDs[row.ProviderMessageID] {
			continue
		}
		stale = append(stale, row)
	}
	if len(stale) == 0 {
		return 0
	}

	sort.Slice(stale, func(i, j int) bool {
		return stringOrEmpty(stale[i].ReceivedAt) > stringOrEmpty(stale[j].ReceivedAt)
	})
	if len(stale) > reconcileMaxPerSync {
		stale = stale[:reconcileMaxPerSync]
	}

	reconciled := 0
	for _, row := range stale {
		raw, err := getMessage(ctx, token, row.ProviderMessageID)
		if err != nil {
			if isHTTPNotFound(err) {
				c.deleteMessageLocally(ctx, row.ID)
				reconciled++
			}
			continue
		}
		if c.UpsertMessage(ctx, accountID, raw) {
			reconciled++
		}
	}
	return reconciled
}

// deleteMessageLocally removes Storage-cached attachment bytes first, then
// deletes the message after Gmail permanently deleted it or Trash was emptied.
// Database foreign keys cascade bodies and attachment metadata.
func (c *Client) deleteMessageLocally(ctx context.Context, messageID string) {
	var attachments []struct {
		StoragePath *string `json:"storage_path"`
	}
	_ = c.sb.From("mail_attachments").
		Select("storage_path").
		Eq("message_id", messageID).
		Exec(ctx, &attachments)
	paths := make([]string, 0, len(attachments))
	for _, attachment := range attachments {
		if attachment.StoragePath != nil && *attachment.StoragePath != "" {
			paths = append(paths, *attachment.StoragePath)
		}
	}
	if len(paths) > 0 {
		_ = c.sb.StorageRemove(ctx, "mail-attachments", paths)
	}
	_ = c.sb.From("mail_messages").Delete().Eq("id", messageID).Exec(ctx, nil)
}

// latestStoredReceivedAt returns the newest received_at already persisted for an account.
func (c *Client) latestStoredReceivedAt(ctx context.Context, accountID string) (time.Time, bool) {
	var row struct {
		ReceivedAt *string `json:"received_at"`
	}
	found, err := c.sb.From("mail_messages").
		Select("received_at").
		Eq("mail_account_id", accountID).
		Not("received_at", "is.null").
		Order("received_at", false).
		Limit(1).
		MaybeSingle(ctx, &row)
	if err != nil || !found || row.ReceivedAt == nil {
		return time.Time{}, false
	}
	return parseISOTimestamp(*row.ReceivedAt)
}

func stringOrEmpty(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// isGmailProviderMessageIDPrefix reports the non-Gmail id prefixes used by other subsystems.
var nonGmailPrefixes = []string{"imap:", "draft:"}

// IsGmailProviderMessageID reports whether providerMessageID is a Gmail API message id.
func IsGmailProviderMessageID(id string) bool {
	if id == "" {
		return false
	}
	for _, p := range nonGmailPrefixes {
		if strings.HasPrefix(id, p) {
			return false
		}
	}
	return true
}
