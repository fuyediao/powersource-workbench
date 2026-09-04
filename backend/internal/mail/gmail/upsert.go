package gmail

import (
	"context"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/mailcore"
)

// messageUpsert is the normalized shape written to the mailbox tables.
type messageUpsert struct {
	providerMessageID string
	providerThreadID  string
	subject           string
	fromAddress       string
	fromName          string
	toAddresses       []Addr
	ccAddresses       []Addr
	bccAddresses      []Addr
	snippet           string
	receivedAt        string
	isRead            bool
	isStarred         bool
	isSent            bool
	isDraft           bool
	hasAttachments    bool
	attachmentMetas   []attachmentMeta
	labels            []string
	bodyHTML          string
	bodyText          string
}

// attachmentMeta is Gmail attachment metadata captured during payload walk
// (bytes are fetched lazily on download).
type attachmentMeta struct {
	Filename     string
	ContentType  string
	SizeBytes    int
	AttachmentID string
}

// UpsertMessage normalizes and writes a raw Gmail message to the mailbox
// tables (mail_threads, mail_messages, mail_message_bodies).
func (c *Client) UpsertMessage(ctx context.Context, accountID string, raw map[string]any) bool {
	id, _ := raw["id"].(string)
	if id == "" {
		return false
	}
	mu := messageUpsert{
		providerMessageID: id,
		providerThreadID:  strFromAny(raw["threadId"]),
		snippet:           strFromAny(raw["snippet"]),
	}

	labels := stringSliceFromAny(raw["labelIds"])
	mu.labels = labels
	mu.isRead = !containsStr(labels, "UNREAD")
	mu.isStarred = containsStr(labels, "STARRED")
	mu.isSent = containsStr(labels, "SENT")
	mu.isDraft = containsStr(labels, "DRAFT")

	mu.receivedAt = internalDateRFC3339(raw["internalDate"])

	payload, _ := raw["payload"].(map[string]any)
	headers := gmailHeaders(payload)
	mu.subject = decodeRFC2047(headers["subject"])
	mu.fromName, mu.fromAddress = parseSingleAddress(headers["from"])
	if mu.fromAddress == "" {
		mu.fromAddress = "unknown@invalid.local"
	}
	mu.toAddresses = parseAddressList(headers["to"])
	mu.ccAddresses = parseAddressList(headers["cc"])
	mu.bccAddresses = parseAddressList(headers["bcc"])

	mu.bodyHTML, mu.bodyText, mu.attachmentMetas = walkGmailPayload(payload)
	mu.hasAttachments = len(mu.attachmentMetas) > 0
	return c.upsertMessage(ctx, accountID, mu)
}

// upsertMessage writes the thread, message, and body rows for one message.
//
// mail_threads and mail_messages each have a partial unique index (WHERE
// provider_*_id IS NOT NULL AND btrim(...) != ”), which PostgreSQL's
// ON CONFLICT (cols) clause cannot target. We therefore use an INSERT-first
// strategy: insert the row, and if it already exists (duplicate key), look up
// the existing row ID and update the mutable fields instead.
func (c *Client) upsertMessage(ctx context.Context, accountID string, mu messageUpsert) bool {
	threadID := c.ensureThread(ctx, accountID, mu)

	row := map[string]any{
		"mail_account_id":     accountID,
		"thread_id":           threadID,
		"provider_message_id": mu.providerMessageID,
		"subject":             nilIfEmpty(mu.subject),
		"from_address":        mu.fromAddress,
		"from_name":           nilIfEmpty(mu.fromName),
		"to_addresses":        mu.toAddresses,
		"cc_addresses":        mu.ccAddresses,
		"bcc_addresses":       mu.bccAddresses,
		"snippet":             nilIfEmpty(mu.snippet),
		"received_at":         nilIfEmpty(mu.receivedAt),
		"is_read":             mu.isRead,
		"is_starred":          mu.isStarred,
		"is_sent":             mu.isSent,
		"is_draft":            mu.isDraft,
		"has_attachments":     mu.hasAttachments,
		"labels":              mu.labels,
	}

	msgID := c.insertOrUpdateMessage(ctx, accountID, mu.providerMessageID, row, mu)
	if msgID == "" {
		return false
	}
	if mu.bodyHTML != "" || mu.bodyText != "" {
		c.upsertBody(ctx, msgID, mu.bodyHTML, mu.bodyText)
	}
	c.upsertAttachmentMetas(ctx, msgID, mu.attachmentMetas)
	return true
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
	_ = c.sb.From("mail_messages").
		Update(map[string]any{
			"is_read":    mu.isRead,
			"is_starred": mu.isStarred,
			"labels":     mu.labels,
		}).
		Eq("id", msg.ID).
		Exec(ctx, nil)
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

// upsertAttachmentMetas inserts Gmail attachment metadata rows (without bytes).
// Existing rows with the same provider_attachment_id are left untouched.
func (c *Client) upsertAttachmentMetas(ctx context.Context, messageID string, metas []attachmentMeta) {
	for _, meta := range metas {
		if meta.AttachmentID == "" || meta.Filename == "" {
			continue
		}
		var existing struct {
			ID string `json:"id"`
		}
		found, _ := c.sb.From("mail_attachments").
			Select("id").
			Eq("message_id", messageID).
			Eq("provider_attachment_id", meta.AttachmentID).
			MaybeSingle(ctx, &existing)
		if found {
			continue
		}
		_ = c.sb.From("mail_attachments").Insert(map[string]any{
			"message_id":             messageID,
			"filename":               meta.Filename,
			"content_type":           nilIfEmpty(meta.ContentType),
			"size_bytes":             meta.SizeBytes,
			"provider_attachment_id": meta.AttachmentID,
		}).Exec(ctx, nil)
	}
}

// ── Gmail payload parsing ────────────────────────────────────────────────────

func gmailHeaders(payload map[string]any) map[string]string {
	out := map[string]string{}
	if payload == nil {
		return out
	}
	headers, _ := payload["headers"].([]any)
	for _, h := range headers {
		m, ok := h.(map[string]any)
		if !ok {
			continue
		}
		name, _ := m["name"].(string)
		value, _ := m["value"].(string)
		out[strings.ToLower(name)] = value
	}
	return out
}

// walkGmailPayload extracts the text/html bodies and attachment metadata.
func walkGmailPayload(payload map[string]any) (bodyHTML, bodyText string, attachments []attachmentMeta) {
	var walk func(part map[string]any)
	walk = func(part map[string]any) {
		if part == nil {
			return
		}
		mimeType, _ := part["mimeType"].(string)
		filename, _ := part["filename"].(string)
		body, _ := part["body"].(map[string]any)
		if filename != "" {
			attID, _ := body["attachmentId"].(string)
			size := intFromAny(body["size"])
			if attID != "" {
				attachments = append(attachments, attachmentMeta{
					Filename:     filename,
					ContentType:  mimeType,
					SizeBytes:    size,
					AttachmentID: attID,
				})
			}
		}
		if data, ok := body["data"].(string); ok && data != "" {
			switch mimeType {
			case "text/html":
				if bodyHTML == "" {
					bodyHTML = decodeBase64URL(data)
				}
			case "text/plain":
				if bodyText == "" {
					bodyText = decodeBase64URL(data)
				}
			}
		}
		if parts, ok := part["parts"].([]any); ok {
			for _, p := range parts {
				if pm, ok := p.(map[string]any); ok {
					walk(pm)
				}
			}
		}
	}
	walk(payload)
	return bodyHTML, bodyText, attachments
}

func intFromAny(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case float32:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	default:
		return 0
	}
}

// parseSingleAddress and parseAddressList live in mailcore so header address
// parsing behaves identically across providers.
var (
	parseSingleAddress = mailcore.ParseSingleAddress
	parseAddressList   = mailcore.ParseAddressList
)

func strFromAny(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func stringSliceFromAny(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return []string{}
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// containsStr and nilIfEmpty live in mailcore, shared with the alimail package.
var (
	containsStr = mailcore.ContainsStr
	nilIfEmpty  = mailcore.NilIfEmpty
)
