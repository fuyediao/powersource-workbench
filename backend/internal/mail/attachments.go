package mail

import (
	"context"
	"fmt"
	"net/http"
	"path"
	"regexp"
	"strings"
	"unicode"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/idutil"
)

// mailAttachmentsBucket is the private Supabase Storage bucket that caches
// CRM mail attachment bytes. Clients never talk to Storage directly; they
// download through downloadAttachment.
const mailAttachmentsBucket = "mail-attachments"

// mailAttachmentMaxBytes caps a single cached attachment at 25 MiB (Gmail's
// single-file attachment limit).
const mailAttachmentMaxBytes = 25 << 20

var unsafeFilenameChars = regexp.MustCompile(`[^A-Za-z0-9._\-()+\p{L}\p{N}]+`)

// attachmentMeta is the JSON shape returned on message detail.
type attachmentMeta struct {
	ID          string `json:"id"`
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
	SizeBytes   *int   `json:"size_bytes"`
}

// StoredAttachment is one attachment already written (or about to be written)
// to mail_attachments + optional Storage.
type StoredAttachment struct {
	Filename             string
	ContentType          string
	SizeBytes            int
	ProviderAttachmentID string
	Data                 []byte
}

type mailAttachmentRow struct {
	ID                   string  `json:"id"`
	MessageID            string  `json:"message_id"`
	Filename             string  `json:"filename"`
	ContentType          *string `json:"content_type"`
	SizeBytes            *int    `json:"size_bytes"`
	ProviderAttachmentID *string `json:"provider_attachment_id"`
	StoragePath          *string `json:"storage_path"`
}

// removeMailAttachmentStorage deletes cached objects from the private
// mail-attachments bucket for messageID. Call this before deleting the
// mail_messages row; FK cascades drop mail_attachments metadata afterwards
// and would otherwise leave orphan Storage bytes.
func (h *Handler) removeMailAttachmentStorage(ctx context.Context, messageID string) {
	if messageID == "" {
		return
	}
	var attachments []struct {
		StoragePath *string `json:"storage_path"`
	}
	_ = h.sb.From("mail_attachments").
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
		_ = h.sb.StorageRemove(ctx, mailAttachmentsBucket, paths)
	}
}

// storeAttachments uploads attachment bytes to Storage and inserts
// mail_attachments rows. Existing rows with the same provider_attachment_id
// (or filename when the provider id is empty) are skipped.
func (h *Handler) storeAttachments(ctx context.Context, accountID, messageID string, parts []StoredAttachment) int {
	if messageID == "" || len(parts) == 0 {
		return 0
	}
	stored := 0
	for _, part := range parts {
		if part.Filename == "" && len(part.Data) == 0 {
			continue
		}
		if len(part.Data) > mailAttachmentMaxBytes {
			continue
		}
		if h.attachmentAlreadyStored(ctx, messageID, part) {
			continue
		}
		filename := sanitizeAttachmentFilename(part.Filename)
		contentType := part.ContentType
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		size := part.SizeBytes
		if size <= 0 {
			size = len(part.Data)
		}
		storagePath := ""
		if len(part.Data) > 0 {
			storagePath = accountID + "/" + messageID + "/" + idutil.UUIDv4() + "_" + filename
			if err := h.sb.StorageUpload(ctx, mailAttachmentsBucket, storagePath, part.Data, contentType, true); err != nil {
				continue
			}
		}
		row := map[string]any{
			"message_id":             messageID,
			"filename":               filename,
			"content_type":           nilIfEmpty(contentType),
			"size_bytes":             size,
			"provider_attachment_id": nilIfEmpty(part.ProviderAttachmentID),
			"storage_path":           nilIfEmpty(storagePath),
		}
		if err := h.sb.From("mail_attachments").Insert(row).Exec(ctx, nil); err != nil {
			if storagePath != "" {
				_ = h.sb.StorageRemove(ctx, mailAttachmentsBucket, []string{storagePath})
			}
			continue
		}
		stored++
	}
	if stored > 0 {
		_ = h.sb.From("mail_messages").
			Update(map[string]any{"has_attachments": true}).
			Eq("id", messageID).
			Exec(ctx, nil)
	}
	return stored
}

// attachmentAlreadyStored reports whether a matching attachment row exists.
func (h *Handler) attachmentAlreadyStored(ctx context.Context, messageID string, part StoredAttachment) bool {
	var existing mailAttachmentRow
	q := h.sb.From("mail_attachments").Select("id").Eq("message_id", messageID)
	if part.ProviderAttachmentID != "" {
		found, _ := q.Eq("provider_attachment_id", part.ProviderAttachmentID).MaybeSingle(ctx, &existing)
		return found
	}
	filename := sanitizeAttachmentFilename(part.Filename)
	if filename == "" {
		return false
	}
	found, _ := q.Eq("filename", filename).MaybeSingle(ctx, &existing)
	return found
}

// listAttachmentMeta returns attachment metadata for a message detail payload.
func (h *Handler) listAttachmentMeta(ctx context.Context, messageID string) []attachmentMeta {
	var rows []mailAttachmentRow
	_ = h.sb.From("mail_attachments").
		Select("id,filename,content_type,size_bytes").
		Eq("message_id", messageID).
		Order("created_at", true).
		Exec(ctx, &rows)
	out := make([]attachmentMeta, 0, len(rows))
	for _, row := range rows {
		meta := attachmentMeta{ID: row.ID, Filename: row.Filename, SizeBytes: row.SizeBytes}
		if row.ContentType != nil {
			meta.ContentType = *row.ContentType
		}
		out = append(out, meta)
	}
	return out
}

// downloadAttachment streams a cached (or lazily fetched) attachment.
//
//	GET /mail/messages/{messageId}/attachments/{attachmentId}
func (h *Handler) downloadAttachment(w http.ResponseWriter, r *http.Request) {
	messageID := chi.URLParam(r, "messageId")
	attachmentID := chi.URLParam(r, "attachmentId")
	userID := authmw.UserIDFrom(r)
	if !h.messageInAccessibleAccount(r.Context(), userID, messageID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}

	var row mailAttachmentRow
	found, err := h.sb.From("mail_attachments").
		Select("id,message_id,filename,content_type,size_bytes,provider_attachment_id,storage_path").
		Eq("id", attachmentID).
		Eq("message_id", messageID).
		MaybeSingle(r.Context(), &row)
	if err != nil || !found {
		mailErr(w, http.StatusNotFound, "Attachment not found")
		return
	}

	data, contentType, err := h.loadAttachmentBytes(r.Context(), &row)
	if err != nil || len(data) == 0 {
		mailErr(w, http.StatusBadGateway, "Failed to load attachment")
		return
	}
	if contentType == "" {
		if row.ContentType != nil && *row.ContentType != "" {
			contentType = *row.ContentType
		} else {
			contentType = "application/octet-stream"
		}
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
	w.Header().Set("Content-Disposition", contentDispositionAttachment(row.Filename))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// loadAttachmentBytes returns attachment bytes from Storage, fetching from the
// provider and caching when the Storage object is still missing.
func (h *Handler) loadAttachmentBytes(ctx context.Context, row *mailAttachmentRow) ([]byte, string, error) {
	if row.StoragePath != nil && *row.StoragePath != "" {
		data, contentType, err := h.sb.StorageDownload(ctx, mailAttachmentsBucket, *row.StoragePath)
		if err == nil && len(data) > 0 {
			return data, contentType, nil
		}
	}

	var msg struct {
		MailAccountID     string `json:"mail_account_id"`
		ProviderMessageID string `json:"provider_message_id"`
	}
	found, _ := h.sb.From("mail_messages").
		Select("mail_account_id,provider_message_id").
		Eq("id", row.MessageID).
		MaybeSingle(ctx, &msg)
	if !found {
		return nil, "", fmt.Errorf("message missing")
	}
	var account struct {
		Provider string `json:"provider"`
	}
	found, _ = h.sb.From("mail_accounts").
		Select("provider").
		Eq("id", msg.MailAccountID).
		MaybeSingle(ctx, &account)
	if !found {
		return nil, "", fmt.Errorf("account missing")
	}

	switch account.Provider {
	case "gmail":
		providerID := ""
		if row.ProviderAttachmentID != nil {
			providerID = *row.ProviderAttachmentID
		}
		if providerID == "" {
			return nil, "", fmt.Errorf("missing gmail attachment id")
		}
		data, contentType, err := h.gmail.FetchAttachment(ctx, msg.MailAccountID, msg.ProviderMessageID, providerID)
		if err != nil || len(data) == 0 {
			return nil, "", err
		}
		return h.cacheAttachmentBytes(ctx, msg.MailAccountID, row, data, contentType)
	case "alibaba", "imap":
		hydrated := h.alimail.HydrateBody(ctx, msg.MailAccountID, row.MessageID, msg.ProviderMessageID)
		if hydrated != nil && len(hydrated.Attachments) > 0 {
			parts := make([]StoredAttachment, 0, len(hydrated.Attachments))
			for _, att := range hydrated.Attachments {
				parts = append(parts, StoredAttachment{
					Filename:    att.Filename,
					ContentType: att.ContentType,
					SizeBytes:   len(att.Data),
					Data:        att.Data,
				})
			}
			h.storeAttachments(ctx, msg.MailAccountID, row.MessageID, parts)
		}
		var refreshed mailAttachmentRow
		ok, _ := h.sb.From("mail_attachments").
			Select("id,message_id,filename,content_type,size_bytes,provider_attachment_id,storage_path").
			Eq("id", row.ID).
			MaybeSingle(ctx, &refreshed)
		if !ok || refreshed.StoragePath == nil || *refreshed.StoragePath == "" {
			// Filename match after hydrate (new row may have replaced the empty one).
			ok, _ = h.sb.From("mail_attachments").
				Select("id,message_id,filename,content_type,size_bytes,provider_attachment_id,storage_path").
				Eq("message_id", row.MessageID).
				Eq("filename", sanitizeAttachmentFilename(row.Filename)).
				MaybeSingle(ctx, &refreshed)
		}
		if !ok || refreshed.StoragePath == nil || *refreshed.StoragePath == "" {
			return nil, "", fmt.Errorf("attachment not cached")
		}
		return h.sb.StorageDownload(ctx, mailAttachmentsBucket, *refreshed.StoragePath)
	default:
		return nil, "", fmt.Errorf("unsupported provider")
	}
}

// cacheAttachmentBytes uploads bytes and updates the attachment row's storage_path.
func (h *Handler) cacheAttachmentBytes(ctx context.Context, accountID string, row *mailAttachmentRow, data []byte, contentType string) ([]byte, string, error) {
	if len(data) > mailAttachmentMaxBytes {
		return nil, "", fmt.Errorf("attachment too large")
	}
	if contentType == "" && row.ContentType != nil {
		contentType = *row.ContentType
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	storagePath := accountID + "/" + row.MessageID + "/" + idutil.UUIDv4() + "_" + sanitizeAttachmentFilename(row.Filename)
	if err := h.sb.StorageUpload(ctx, mailAttachmentsBucket, storagePath, data, contentType, true); err == nil {
		_ = h.sb.From("mail_attachments").
			Update(map[string]any{
				"storage_path": storagePath,
				"size_bytes":   len(data),
				"content_type": contentType,
			}).
			Eq("id", row.ID).
			Exec(ctx, nil)
	}
	return data, contentType, nil
}

// sanitizeAttachmentFilename strips path components and unsafe characters.
func sanitizeAttachmentFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "attachment"
	}
	name = path.Base(strings.ReplaceAll(name, "\\", "/"))
	name = unsafeFilenameChars.ReplaceAllString(name, "_")
	name = strings.Trim(name, "._")
	if name == "" {
		return "attachment"
	}
	runes := []rune(name)
	if len(runes) > 180 {
		name = string(runes[:180])
	}
	return name
}

// contentDispositionAttachment builds a Content-Disposition header value.
func contentDispositionAttachment(filename string) string {
	safe := sanitizeAttachmentFilename(filename)
	ascii := strings.Map(func(r rune) rune {
		if r > unicode.MaxASCII || r == '"' || r == '\\' {
			return '_'
		}
		return r
	}, safe)
	if ascii == "" {
		ascii = "attachment"
	}
	return fmt.Sprintf(`attachment; filename="%s"; filename*=UTF-8''%s`, ascii, pathEscapeRFC5987(safe))
}

// pathEscapeRFC5987 percent-encodes a filename for RFC 5987 filename*.
func pathEscapeRFC5987(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '.' || c == '_' || c == '~' {
			b.WriteByte(c)
			continue
		}
		b.WriteString(fmt.Sprintf("%%%02X", c))
	}
	return b.String()
}
