package mail

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/gmail"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
)

// downloadMessageEml rebuilds an RFC 2822 snapshot of a stored message.
func (h *Handler) downloadMessageEml(w http.ResponseWriter, r *http.Request) {
	messageID := chiID(r)
	userID := authmw.UserIDFrom(r)
	if !h.messageInAccessibleAccount(r.Context(), userID, messageID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}

	var msg map[string]any
	found, err := h.sb.From("mail_messages").Select("*").Eq("id", messageID).MaybeSingle(r.Context(), &msg)
	if err != nil || !found {
		mailErr(w, http.StatusNotFound, "Message not found")
		return
	}
	var body struct {
		BodyHTML *string `json:"body_html"`
		BodyText *string `json:"body_text"`
	}
	_, _ = h.sb.From("mail_message_bodies").Select("body_html,body_text").Eq("message_id", messageID).MaybeSingle(r.Context(), &body)

	from := strValue(msg["from_address"])
	if name := strValue(msg["from_name"]); name != "" && from != "" {
		from = name + " <" + from + ">"
	}
	raw := gmail.BuildRawRFC2822ForExport(gmail.ExportOpts{
		From:      from,
		To:        addrsToGmail(msg["to_addresses"]),
		Cc:        addrsToGmail(msg["cc_addresses"]),
		Bcc:       addrsToGmail(msg["bcc_addresses"]),
		Subject:   strValue(msg["subject"]),
		BodyHTML:  strPtrValue(body.BodyHTML),
		BodyText:  strPtrValue(body.BodyText),
		InReplyTo: strValue(msg["in_reply_to"]),
		MessageID: strValue(msg["message_id_header"]),
	})

	filename := sanitizeAttachmentFilename(strValue(msg["subject"]))
	if filename == "" || filename == "attachment" {
		filename = "message"
	}
	filename += ".eml"

	w.Header().Set("Content-Type", "message/rfc822")
	w.Header().Set("Content-Disposition", contentDispositionAttachment(filename))
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(raw)))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(raw))
}

func strValue(v any) string {
	s, _ := v.(string)
	return strings.TrimSpace(s)
}

func addrsToGmail(v any) []gmail.Addr {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]gmail.Addr, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		email, _ := m["email"].(string)
		name, _ := m["name"].(string)
		if strings.TrimSpace(email) == "" {
			continue
		}
		out = append(out, gmail.Addr{Email: email, Name: name})
	}
	return out
}
