package alimail

import (
	"context"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/mailcore"
)

// messageUpsert is the normalized shape written to the mailbox tables.
type messageUpsert struct {
	providerMessageID string
	providerThreadID  string
	folderID          string
	subject           string
	fromAddress       string
	fromName          string
	toAddresses       []Addr
	ccAddresses       []Addr
	receivedAt        string
	isRead            bool
	isStarred         bool
	isSent            bool
	isDraft           bool
	labels            []string
}

// mailboxLabel maps a mailbox role to the virtual sidebar label stored on the
// message row.
var mailboxLabel = map[string]string{
	roleInbox:   "INBOX",
	roleSent:    "SENT",
	roleDraft:   "DRAFT",
	roleTrash:   "TRASH",
	roleSpam:    "SPAM",
	roleArchive: "ARCHIVE",
}

// UpsertMessage normalizes and writes one IMAP sync message to the mailbox
// tables (mail_threads, mail_messages).
//
// folderID is the mail_folders.id for msg.MailboxRole when known; pass "" when
// the folder row has not been persisted yet.
//
// Returns the mail_messages.id, or "" on failure.
func (c *Client) UpsertMessage(ctx context.Context, accountID string, msg SyncMessage, folderID string) string {
	providerID := providerMessageID(msg.Mailbox, msg.MailboxRole, msg.UID)
	threadKey := msg.MessageID
	if threadKey == "" {
		subj := msg.Subject
		if subj == "" {
			subj = providerID
		}
		threadKey = "imap:subj:" + subj
	}
	flags := make([]string, len(msg.Flags))
	for i, f := range msg.Flags {
		flags[i] = strings.ToLower(f)
	}
	label := mailboxLabel[msg.MailboxRole]
	if label == "" {
		label = "INBOX"
	}
	mu := messageUpsert{
		providerMessageID: providerID,
		providerThreadID:  threadKey,
		folderID:          folderID,
		subject:           msg.Subject,
		fromAddress:       msg.FromAddress,
		fromName:          msg.FromName,
		toAddresses:       msg.ToAddresses,
		ccAddresses:       msg.CcAddresses,
		receivedAt:        msg.ReceivedAt,
		isRead:            containsStr(flags, `\seen`),
		isStarred:         containsStr(flags, `\flagged`),
		isSent:            msg.MailboxRole == roleSent,
		isDraft:           msg.MailboxRole == roleDraft || containsStr(flags, `\draft`),
		labels:            append([]string{label}, flags...),
	}
	// CONDSTORE CHANGEDSINCE often returns FLAGS-only; never insert a headerless row.
	if msg.FromAddress == "" && msg.Subject == "" && msg.MessageID == "" {
		return c.updateFlagsOnly(ctx, accountID, providerID, mu)
	}
	return c.upsertMessage(ctx, accountID, mu)
}

// updateFlagsOnly refreshes read/star/labels on an existing message row.
func (c *Client) updateFlagsOnly(ctx context.Context, accountID, providerMsgID string, mu messageUpsert) string {
	var msg struct {
		ID     string   `json:"id"`
		Labels []string `json:"labels"`
	}
	found, _ := c.sb.From("mail_messages").
		Select("id,labels").
		Eq("mail_account_id", accountID).
		Eq("provider_message_id", providerMsgID).
		MaybeSingle(ctx, &msg)
	if !found || msg.ID == "" {
		return ""
	}
	labels := mu.labels
	if len(msg.Labels) > 0 {
		// Keep the virtual folder label from the stored row when present.
		role := ""
		for _, existing := range msg.Labels {
			switch strings.ToUpper(existing) {
			case "INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "ARCHIVE":
				role = existing
			}
			if role != "" {
				break
			}
		}
		if role != "" {
			labels = append([]string{role}, flagsWithoutRole(mu.labels)...)
		}
	}
	_ = c.sb.From("mail_messages").Update(map[string]any{
		"is_read":    mu.isRead,
		"is_starred": mu.isStarred,
		"is_draft":   mu.isDraft,
		"labels":     labels,
	}).Eq("id", msg.ID).Exec(ctx, nil)
	return msg.ID
}

func flagsWithoutRole(labels []string) []string {
	out := make([]string, 0, len(labels))
	for _, label := range labels {
		switch strings.ToUpper(label) {
		case "INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "ARCHIVE":
			continue
		default:
			out = append(out, label)
		}
	}
	return out
}

// upsertMessage writes the thread and message rows for one message.
//
// mail_threads and mail_messages each have a partial unique index (WHERE
// provider_*_id IS NOT NULL AND btrim(...) != ”), which PostgreSQL's
// ON CONFLICT (cols) clause cannot target. We therefore use an INSERT-first
// strategy: insert the row, and if it already exists (duplicate key), look up
// the existing row ID and update the mutable fields instead.
func (c *Client) upsertMessage(ctx context.Context, accountID string, mu messageUpsert) string {
	threadID := c.ensureThread(ctx, accountID, mu)

	row := map[string]any{
		"mail_account_id":     accountID,
		"thread_id":           threadID,
		"provider_message_id": mu.providerMessageID,
		"folder_id":           nilIfEmpty(mu.folderID),
		"subject":             nilIfEmpty(mu.subject),
		"from_address":        mu.fromAddress,
		"from_name":           nilIfEmpty(mu.fromName),
		"to_addresses":        mu.toAddresses,
		"cc_addresses":        mu.ccAddresses,
		"received_at":         nilIfEmpty(mu.receivedAt),
		"is_read":             mu.isRead,
		"is_starred":          mu.isStarred,
		"is_sent":             mu.isSent,
		"is_draft":            mu.isDraft,
		"has_attachments":     false,
		"labels":              mu.labels,
	}

	return c.insertOrUpdateMessage(ctx, accountID, mu.providerMessageID, row, mu)
}

// ensureThread inserts or locates the thread row and returns its UUID (or nil).
func (c *Client) ensureThread(ctx context.Context, accountID string, mu messageUpsert) any {
	if mu.providerThreadID == "" {
		return nil
	}
	threadRow := map[string]any{
		"mail_account_id":    accountID,
		"provider_thread_id": mu.providerThreadID,
		"subject":            nilIfEmpty(mu.subject),
		"last_message_at":    nilIfEmpty(mu.receivedAt),
	}
	var thread struct {
		ID string `json:"id"`
	}
	if err := c.sb.From("mail_threads").Insert(threadRow).Returning().Select("id").Single(ctx, &thread); err == nil && thread.ID != "" {
		return thread.ID
	}
	found, _ := c.sb.From("mail_threads").
		Select("id").
		Eq("mail_account_id", accountID).
		Eq("provider_thread_id", mu.providerThreadID).
		MaybeSingle(ctx, &thread)
	if found && thread.ID != "" {
		_ = c.sb.From("mail_threads").
			Update(map[string]any{"last_message_at": nilIfEmpty(mu.receivedAt)}).
			Eq("id", thread.ID).
			Exec(ctx, nil)
		return thread.ID
	}
	return nil
}

// insertOrUpdateMessage inserts a new message row or, on duplicate, updates the
// mutable fields and returns the existing row's UUID.
func (c *Client) insertOrUpdateMessage(ctx context.Context, accountID, providerMsgID string, row map[string]any, mu messageUpsert) string {
	var msg struct {
		ID string `json:"id"`
	}
	if err := c.sb.From("mail_messages").Insert(row).Returning().Select("id").Single(ctx, &msg); err == nil && msg.ID != "" {
		return msg.ID
	}
	found, _ := c.sb.From("mail_messages").
		Select("id").
		Eq("mail_account_id", accountID).
		Eq("provider_message_id", providerMsgID).
		MaybeSingle(ctx, &msg)
	if !found || msg.ID == "" {
		return ""
	}
	update := map[string]any{
		"is_read":    mu.isRead,
		"is_starred": mu.isStarred,
		"is_sent":    mu.isSent,
		"is_draft":   mu.isDraft,
		"labels":     mu.labels,
	}
	if mu.folderID != "" {
		update["folder_id"] = mu.folderID
	}
	_ = c.sb.From("mail_messages").Update(update).Eq("id", msg.ID).Exec(ctx, nil)
	return msg.ID
}

// upsertBody writes the message body when at least one part is present.
func (c *Client) upsertBody(ctx context.Context, messageID, bodyHTML, bodyText string) {
	if bodyHTML == "" && bodyText == "" {
		return
	}
	_ = c.sb.From("mail_message_bodies").Upsert(map[string]any{
		"message_id": messageID,
		"body_html":  nilIfEmpty(bodyHTML),
		"body_text":  nilIfEmpty(bodyText),
	}, "message_id").Exec(ctx, nil)
}

// parseSingleAddress, parseAddressList, containsStr, and nilIfEmpty live in
// mailcore, shared with the gmail package.
var (
	parseSingleAddress = mailcore.ParseSingleAddress
	parseAddressList   = mailcore.ParseAddressList
	containsStr        = mailcore.ContainsStr
	nilIfEmpty         = mailcore.NilIfEmpty
)
