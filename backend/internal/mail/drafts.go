package mail

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/idutil"
)

// DraftRequest is the shared HTTP and Harness local draft payload.
type DraftRequest struct {
	MailAccountID string           `json:"mailAccountId"`
	FromAddress   string           `json:"fromAddress"`
	To            []Address        `json:"to"`
	Cc            []Address        `json:"cc"`
	Bcc           []Address        `json:"bcc"`
	Subject       string           `json:"subject"`
	BodyHTML      string           `json:"bodyHtml"`
	BodyText      string           `json:"bodyText"`
	Attachments   []SendAttachment `json:"attachments"`
}

type draftBody = DraftRequest

var htmlTagRe = regexp.MustCompile(`<[^>]+>`)

func draftSnippet(b draftBody) string {
	text := b.BodyText
	if text == "" {
		text = htmlTagRe.ReplaceAllString(b.BodyHTML, " ")
	}
	text = strings.TrimSpace(text)
	if len(text) > 200 {
		text = text[:200]
	}
	return text
}

func (h *Handler) saveDraft(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	var body DraftRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		mailErr(w, http.StatusBadRequest, "mailAccountId required")
		return
	}
	draftID, err := h.SaveDraftForUser(r.Context(), userID, body)
	if err != nil {
		status := http.StatusBadRequest
		var actionErr *mailActionError
		if errors.As(err, &actionErr) {
			status = actionErr.status
		}
		mailErr(w, status, err.Error())
		return
	}
	mailJSON(w, http.StatusCreated, map[string]any{"id": draftID})
}

// SaveDraftForUser validates mailbox ownership and persists one local draft.
func (h *Handler) SaveDraftForUser(ctx context.Context, userID string, body DraftRequest) (string, error) {
	if body.MailAccountID == "" {
		return "", &mailActionError{status: http.StatusBadRequest, message: "mailAccountId required"}
	}
	if !h.hasMailAccountAccess(ctx, userID, body.MailAccountID) {
		return "", &mailActionError{status: http.StatusNotFound, message: "Account not found or access denied"}
	}
	attachments, err := decodeSendAttachments(body.Attachments)
	if err != nil {
		return "", &mailActionError{status: http.StatusBadRequest, message: err.Error()}
	}
	row := map[string]any{
		"mail_account_id":     body.MailAccountID,
		"provider_message_id": "draft:local:" + idutil.UUIDv4(),
		"subject":             body.Subject,
		"from_address":        body.FromAddress,
		"to_addresses":        body.To,
		"cc_addresses":        body.Cc,
		"bcc_addresses":       body.Bcc,
		"snippet":             draftSnippet(body),
		"received_at":         nowISO(),
		"is_read":             true,
		"is_starred":          false,
		"is_sent":             false,
		"is_draft":            true,
		"has_attachments":     false,
		"labels":              []string{"DRAFT"},
	}
	var inserted struct {
		ID string `json:"id"`
	}
	if err := h.sb.From("mail_messages").Insert(row).Returning().Select("id").Single(ctx, &inserted); err != nil || inserted.ID == "" {
		return "", &mailActionError{status: http.StatusBadRequest, message: "Failed to save draft"}
	}
	h.upsertBody(ctx, inserted.ID, body.BodyHTML, body.BodyText)
	storedAttachments := make([]StoredAttachment, 0, len(attachments))
	for _, attachment := range attachments {
		storedAttachments = append(storedAttachments, StoredAttachment{
			Filename:    attachment.Filename,
			ContentType: attachment.ContentType,
			SizeBytes:   len(attachment.Data),
			Data:        attachment.Data,
		})
	}
	h.storeAttachments(ctx, body.MailAccountID, inserted.ID, storedAttachments)
	return inserted.ID, nil
}

func (h *Handler) updateDraft(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	draftID := chiID(r)
	var body draftBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		mailErr(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	ok, owned := h.draftOwned(r, userID, draftID)
	if !ok {
		mailErr(w, http.StatusNotFound, "Draft not found")
		return
	}
	if !owned {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	update := map[string]any{
		"subject":       body.Subject,
		"from_address":  body.FromAddress,
		"to_addresses":  body.To,
		"cc_addresses":  body.Cc,
		"bcc_addresses": body.Bcc,
		"snippet":       draftSnippet(body),
		"received_at":   nowISO(),
	}
	if err := h.sb.From("mail_messages").Update(update).Eq("id", draftID).Exec(r.Context(), nil); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to update draft")
		return
	}
	h.upsertBody(r.Context(), draftID, body.BodyHTML, body.BodyText)
	mailJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) deleteDraft(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	draftID := chiID(r)
	ok, owned := h.draftOwned(r, userID, draftID)
	if !ok {
		mailJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if !owned {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	_ = h.sb.From("mail_message_bodies").Delete().Eq("message_id", draftID).Exec(r.Context(), nil)
	_ = h.sb.From("mail_messages").Delete().Eq("id", draftID).Exec(r.Context(), nil)
	mailJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// draftOwned reports whether the draft exists (ok) and the user owns the
// draft's mail account. Mailboxes are never shared between users.
func (h *Handler) draftOwned(r *http.Request, userID, draftID string) (ok, owned bool) {
	var draft struct {
		ID            string `json:"id"`
		MailAccountID string `json:"mail_account_id"`
	}
	found, _ := h.sb.From("mail_messages").Select("id,mail_account_id").Eq("id", draftID).Eq("is_draft", "true").MaybeSingle(r.Context(), &draft)
	if !found {
		return false, false
	}
	return true, h.hasMailAccountAccess(r.Context(), userID, draft.MailAccountID)
}

// upsertBody writes the message body when at least one part is present.
func (h *Handler) upsertBody(ctx context.Context, messageID, bodyHTML, bodyText string) {
	if bodyHTML == "" && bodyText == "" {
		return
	}
	_ = h.sb.From("mail_message_bodies").Upsert(map[string]any{
		"message_id": messageID,
		"body_html":  nilIfEmpty(bodyHTML),
		"body_text":  nilIfEmpty(bodyText),
	}, "message_id").Exec(ctx, nil)
}
