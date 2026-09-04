package mail

import (
	"context"
	"mime"
	"strings"
	"time"
)

// mailAddr is a parsed email address with an optional display name, used in
// HTTP request/response bodies (send, drafts, stored message rows).
type mailAddr struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

// Address is an email address accepted by in-process mail callers.
type Address = mailAddr

var headerDecoder = mime.WordDecoder{}

// decodeRFC2047 decodes encoded-word header values, returning the input on error.
func decodeRFC2047(s string) string {
	if s == "" || !strings.Contains(s, "=?") {
		return s
	}
	decoded, err := headerDecoder.DecodeHeader(s)
	if err != nil {
		return s
	}
	return decoded
}

// healHeaders decodes RFC 2047 encoded-words in a message row's header fields.
func healHeaders(row map[string]any) {
	if s, ok := row["subject"].(string); ok {
		row["subject"] = decodeRFC2047(s)
	}
	if s, ok := row["from_name"].(string); ok {
		row["from_name"] = decodeRFC2047(s)
	}
	for _, key := range []string{"to_addresses", "cc_addresses", "bcc_addresses"} {
		if arr, ok := row[key].([]any); ok {
			for _, item := range arr {
				if m, ok := item.(map[string]any); ok {
					if n, ok := m["name"].(string); ok {
						m["name"] = decodeRFC2047(n)
					}
				}
			}
		}
	}
}

// getUserAccessibleMailAccountIDs returns the mailboxes the user owns
// (non-disconnected). Mailboxes are never shared between users.
func (h *Handler) getUserAccessibleMailAccountIDs(ctx context.Context, userID string) []string {
	var owned []struct {
		ID string `json:"id"`
	}
	_ = h.sb.From("mail_accounts").Select("id").Eq("owner_user_id", userID).Neq("status", "disconnected").Exec(ctx, &owned)
	ids := make([]string, 0, len(owned))
	for _, a := range owned {
		ids = append(ids, a.ID)
	}
	return ids
}

// hasMailAccountAccess reports whether the user owns the given mail account.
func (h *Handler) hasMailAccountAccess(ctx context.Context, userID, mailAccountID string) bool {
	if mailAccountID == "" {
		return false
	}
	for _, id := range h.getUserAccessibleMailAccountIDs(ctx, userID) {
		if id == mailAccountID {
			return true
		}
	}
	return false
}

func containsStr(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func nowISO() string { return time.Now().UTC().Format(time.RFC3339Nano) }

// parseISOTimestamp parses Supabase / mail timestamps written as RFC3339Nano or RFC3339.
func parseISOTimestamp(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func intOrZero(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func strPtrValue(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// deleteMailMessageLocally removes Storage-cached attachment bytes first, then
// deletes the message row (bodies and attachment metadata cascade via FK).
// Used for bulk "delete forever" and provider reconcile paths.
func (h *Handler) deleteMailMessageLocally(ctx context.Context, messageID string) {
	h.removeMailAttachmentStorage(ctx, messageID)
	_ = h.sb.From("mail_messages").Delete().Eq("id", messageID).Exec(ctx, nil)
}
