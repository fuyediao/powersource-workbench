package mail

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
	"github.com/fuyediao/powersource-workbench/backend/internal/mail/gmail"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/idutil"
)

const maxSendAttachments = 10
const maxSendAttachmentBytes = 25 << 20

// SendAttachment is one base64-encoded outgoing attachment.
type SendAttachment struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	DataBase64  string `json:"dataBase64"`
}

type sendAttachmentIn = SendAttachment

// SendRequest is the shared HTTP and Harness outgoing message payload.
type SendRequest struct {
	MailAccountID      string           `json:"mailAccountId"`
	FromAddress        string           `json:"fromAddress"`
	ReplyTo            string           `json:"replyTo"`
	To                 []Address        `json:"to"`
	Cc                 []Address        `json:"cc"`
	Bcc                []Address        `json:"bcc"`
	Subject            string           `json:"subject"`
	BodyHTML           string           `json:"bodyHtml"`
	BodyText           string           `json:"bodyText"`
	InReplyToMessageID string           `json:"inReplyToMessageId"`
	DraftID            string           `json:"draftId"`
	ScheduledAt        string           `json:"scheduledAt"`
	Attachments        []SendAttachment `json:"attachments"`
}

type sendRequest = SendRequest

// SendResult describes an accepted outgoing message or scheduled job.
type SendResult struct {
	OK        bool   `json:"ok"`
	JobID     string `json:"jobId"`
	Scheduled bool   `json:"scheduled,omitempty"`
}

type mailActionError struct {
	status  int
	message string
}

func (e *mailActionError) Error() string { return e.message }

type decodedAttachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

func (h *Handler) send(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	var body SendRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		mailErr(w, http.StatusBadRequest, "Missing required send fields")
		return
	}
	result, err := h.SendForUser(r.Context(), userID, body)
	if err != nil {
		status := http.StatusBadRequest
		var actionErr *mailActionError
		if errors.As(err, &actionErr) {
			status = actionErr.status
		}
		mailErr(w, status, err.Error())
		return
	}
	status := http.StatusCreated
	if result.Scheduled {
		status = http.StatusAccepted
	}
	mailJSON(w, status, result)
}

// SendForUser validates mailbox ownership, queues, and dispatches one message.
func (h *Handler) SendForUser(ctx context.Context, userID string, body SendRequest) (SendResult, error) {
	if body.MailAccountID == "" || len(body.To) == 0 || body.Subject == "" {
		return SendResult{}, &mailActionError{status: http.StatusBadRequest, message: "Missing required send fields"}
	}

	account, auth := h.loadSendableAccount(ctx, userID, body)
	if !auth.ok {
		return SendResult{}, &mailActionError{status: auth.status, message: auth.message}
	}

	atts, err := decodeSendAttachments(body.Attachments)
	if err != nil {
		return SendResult{}, &mailActionError{status: http.StatusBadRequest, message: err.Error()}
	}

	if scheduled, parseOK := parseISOTimestamp(strings.TrimSpace(body.ScheduledAt)); parseOK && scheduled.After(time.Now().Add(15*time.Second)) {
		jobID := h.insertPendingSendJob(ctx, body, userID, scheduled, atts)
		if jobID == "" {
			return SendResult{}, &mailActionError{status: http.StatusBadRequest, message: "Failed to schedule send"}
		}
		return SendResult{OK: true, JobID: jobID, Scheduled: true}, nil
	}

	// Immediate send: persist a pending mail_send_jobs row first, then dispatch.
	// On failure the job stays pending/failed and a mail_sync_tasks kind=send
	// row retries through the same TaskProcessor drain as other mirrors.
	jobID := h.insertImmediateSendJob(ctx, body, userID, atts)
	if jobID == "" {
		return SendResult{}, &mailActionError{status: http.StatusBadRequest, message: "Failed to queue send"}
	}
	providerMessageID, threadID, sendErr := h.dispatchSend(ctx, account.Provider, account.ID, body, atts)
	if sendErr != nil {
		_ = h.sb.From("mail_send_jobs").Update(map[string]any{
			"status":        "failed",
			"error_message": sendErr.Error(),
		}).Eq("id", jobID).Exec(ctx, nil)
		h.enqueueRemoteTask(ctx, account.ID, userID, "send", syncTaskPayload{SendJobID: jobID}, sendErr.Error())
		return SendResult{}, &mailActionError{status: http.StatusBadRequest, message: sendErr.Error()}
	}
	_ = h.sb.From("mail_send_jobs").Update(map[string]any{
		"status":              "sent",
		"error_message":       nil,
		"provider_message_id": nilIfEmpty(providerMessageID),
		"sent_at":             nowISO(),
	}).Eq("id", jobID).Exec(ctx, nil)

	if body.DraftID != "" {
		_ = h.sb.From("mail_message_bodies").Delete().Eq("message_id", body.DraftID).Exec(ctx, nil)
		_ = h.sb.From("mail_messages").Delete().Eq("id", body.DraftID).Eq("is_draft", "true").Exec(ctx, nil)
	}
	h.persistSentMessage(ctx, account.ID, providerMessageID, threadID, body, len(atts) > 0)

	return SendResult{OK: true, JobID: jobID}, nil
}

type sendAuthFail struct {
	ok      bool
	status  int
	message string
}

type sendableAccount struct {
	ID       string
	Provider string
}

func (h *Handler) loadSendableAccount(ctx context.Context, userID string, body sendRequest) (sendableAccount, sendAuthFail) {
	var account struct {
		ID          string `json:"id"`
		OwnerUserID string `json:"owner_user_id"`
		Provider    string `json:"provider"`
		Email       string `json:"email"`
	}
	found, _ := h.sb.From("mail_accounts").Select("id,owner_user_id,provider,email").Eq("id", body.MailAccountID).MaybeSingle(ctx, &account)
	if !found {
		return sendableAccount{}, sendAuthFail{status: http.StatusNotFound, message: "Account not found"}
	}
	if account.OwnerUserID != userID {
		return sendableAccount{}, sendAuthFail{status: http.StatusForbidden, message: "Access denied"}
	}
	return sendableAccount{ID: account.ID, Provider: account.Provider}, sendAuthFail{ok: true}
}

func decodeSendAttachments(in []sendAttachmentIn) ([]decodedAttachment, error) {
	if len(in) == 0 {
		return nil, nil
	}
	if len(in) > maxSendAttachments {
		return nil, errors.New("too many attachments (max 10)")
	}
	out := make([]decodedAttachment, 0, len(in))
	total := 0
	for _, part := range in {
		raw := strings.TrimSpace(part.DataBase64)
		if raw == "" {
			continue
		}
		data, err := base64.StdEncoding.DecodeString(raw)
		if err != nil {
			return nil, errors.New("invalid attachment encoding")
		}
		if len(data) == 0 || len(data) > maxSendAttachmentBytes {
			return nil, errors.New("attachment too large (25 MB max)")
		}
		total += len(data)
		if total > maxSendAttachmentBytes {
			return nil, errors.New("attachments exceed 25 MB total")
		}
		name := strings.TrimSpace(part.Filename)
		if name == "" {
			name = "attachment"
		}
		ct := strings.TrimSpace(part.ContentType)
		if ct == "" {
			ct = "application/octet-stream"
		}
		out = append(out, decodedAttachment{Filename: name, ContentType: ct, Data: data})
	}
	return out, nil
}

func (h *Handler) dispatchSend(ctx context.Context, provider, accountID string, body sendRequest, atts []decodedAttachment) (providerMessageID, threadID string, err error) {
	switch provider {
	case "gmail":
		return h.gmail.Send(ctx, accountID, gmail.SendOptions{
			From: body.FromAddress, To: toGmailAddrs(body.To), Cc: toGmailAddrs(body.Cc), Bcc: toGmailAddrs(body.Bcc),
			ReplyTo: body.ReplyTo, Subject: body.Subject, BodyHTML: body.BodyHTML, BodyText: body.BodyText,
			InReplyTo: body.InReplyToMessageID, Attachments: toGmailAttachments(atts),
		})
	case alimail.ProviderName, alimail.GenericIMAPProviderName:
		cfg, cerr := h.alimail.LoadConfig(ctx, accountID)
		if cerr != nil {
			return "", "", cerr
		}
		return "", "", alimail.Send(*cfg, alimail.SendOptions{
			From: body.FromAddress, To: toAlimailAddrs(body.To), Cc: toAlimailAddrs(body.Cc), Bcc: toAlimailAddrs(body.Bcc),
			ReplyTo: body.ReplyTo, Subject: body.Subject, BodyHTML: body.BodyHTML, BodyText: body.BodyText,
			InReplyTo: body.InReplyToMessageID, Attachments: toAlimailAttachments(atts),
		})
	default:
		return "", "", errors.New("Unsupported mail provider")
	}
}

func toGmailAddrs(addrs []mailAddr) []gmail.Addr {
	out := make([]gmail.Addr, len(addrs))
	for i, a := range addrs {
		out[i] = gmail.Addr{Email: a.Email, Name: a.Name}
	}
	return out
}

func toAlimailAddrs(addrs []mailAddr) []alimail.Addr {
	out := make([]alimail.Addr, len(addrs))
	for i, a := range addrs {
		out[i] = alimail.Addr{Email: a.Email, Name: a.Name}
	}
	return out
}

func toGmailAttachments(atts []decodedAttachment) []gmail.Attachment {
	out := make([]gmail.Attachment, len(atts))
	for i, a := range atts {
		out[i] = gmail.Attachment{Filename: a.Filename, ContentType: a.ContentType, Data: a.Data}
	}
	return out
}

func toAlimailAttachments(atts []decodedAttachment) []alimail.Attachment {
	out := make([]alimail.Attachment, len(atts))
	for i, a := range atts {
		out[i] = alimail.Attachment{Filename: a.Filename, ContentType: a.ContentType, Data: a.Data}
	}
	return out
}

func attachmentsToJSON(atts []decodedAttachment) []map[string]any {
	out := make([]map[string]any, 0, len(atts))
	for _, a := range atts {
		out = append(out, map[string]any{
			"filename":    a.Filename,
			"contentType": a.ContentType,
			"dataBase64":  base64.StdEncoding.EncodeToString(a.Data),
		})
	}
	return out
}

func attachmentsFromJSON(raw any) []decodedAttachment {
	arr, ok := raw.([]any)
	if !ok {
		return nil
	}
	in := make([]sendAttachmentIn, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		filename, _ := m["filename"].(string)
		ct, _ := m["contentType"].(string)
		data, _ := m["dataBase64"].(string)
		in = append(in, sendAttachmentIn{Filename: filename, ContentType: ct, DataBase64: data})
	}
	out, _ := decodeSendAttachments(in)
	return out
}

func (h *Handler) insertPendingSendJob(ctx context.Context, body sendRequest, userID string, when time.Time, atts []decodedAttachment) string {
	var inserted struct {
		ID string `json:"id"`
	}
	row := map[string]any{
		"mail_account_id":        body.MailAccountID,
		"operator_user_id":       userID,
		"from_address":           body.FromAddress,
		"reply_to":               nilIfEmpty(body.ReplyTo),
		"to_addresses":           body.To,
		"cc_addresses":           body.Cc,
		"bcc_addresses":          body.Bcc,
		"subject":                body.Subject,
		"body_html":              nilIfEmpty(body.BodyHTML),
		"body_text":              nilIfEmpty(body.BodyText),
		"in_reply_to_message_id": nilIfEmpty(body.InReplyToMessageID),
		"status":                 "pending",
		"scheduled_at":           when.UTC().Format(time.RFC3339Nano),
		"attachments":            attachmentsToJSON(atts),
	}
	if err := h.sb.From("mail_send_jobs").Insert(row).Returning().Select("id").Single(ctx, &inserted); err != nil || inserted.ID == "" {
		return ""
	}
	return inserted.ID
}

// insertImmediateSendJob stores a pending send with full MIME payload so a
// failed dispatch can be retried via mail_sync_tasks kind=send.
func (h *Handler) insertImmediateSendJob(ctx context.Context, body sendRequest, userID string, atts []decodedAttachment) string {
	var inserted struct {
		ID string `json:"id"`
	}
	row := map[string]any{
		"mail_account_id":        body.MailAccountID,
		"operator_user_id":       userID,
		"from_address":           body.FromAddress,
		"reply_to":               nilIfEmpty(body.ReplyTo),
		"to_addresses":           body.To,
		"cc_addresses":           body.Cc,
		"bcc_addresses":          body.Bcc,
		"subject":                body.Subject,
		"body_html":              nilIfEmpty(body.BodyHTML),
		"body_text":              nilIfEmpty(body.BodyText),
		"in_reply_to_message_id": nilIfEmpty(body.InReplyToMessageID),
		"status":                 "pending",
		"attachments":            attachmentsToJSON(atts),
	}
	if err := h.sb.From("mail_send_jobs").Insert(row).Returning().Select("id").Single(ctx, &inserted); err != nil || inserted.ID == "" {
		return ""
	}
	return inserted.ID
}

// performSendTask replays a kind=send mail_sync_tasks row against the provider
// using the stored mail_send_jobs payload.
func (h *Handler) performSendTask(ctx context.Context, accountID, provider, jobID string) error {
	if jobID == "" {
		return errors.New("send task missing send_job_id")
	}
	var job map[string]any
	found, _ := h.sb.From("mail_send_jobs").
		Select("id,mail_account_id,from_address,reply_to,to_addresses,cc_addresses,bcc_addresses,subject,body_html,body_text,in_reply_to_message_id,attachments,status").
		Eq("id", jobID).
		MaybeSingle(ctx, &job)
	if !found {
		return errors.New("send job not found")
	}
	if strValue(job["mail_account_id"]) != accountID {
		return errors.New("send job account mismatch")
	}
	if status := strValue(job["status"]); status == "sent" {
		return nil
	}
	body := sendRequest{
		MailAccountID:      accountID,
		FromAddress:        strValue(job["from_address"]),
		ReplyTo:            strValue(job["reply_to"]),
		To:                 addrsFromAny(job["to_addresses"]),
		Cc:                 addrsFromAny(job["cc_addresses"]),
		Bcc:                addrsFromAny(job["bcc_addresses"]),
		Subject:            strValue(job["subject"]),
		BodyHTML:           strValue(job["body_html"]),
		BodyText:           strValue(job["body_text"]),
		InReplyToMessageID: strValue(job["in_reply_to_message_id"]),
	}
	atts := attachmentsFromJSON(job["attachments"])
	providerMessageID, threadID, sendErr := h.dispatchSend(ctx, provider, accountID, body, atts)
	if sendErr != nil {
		_ = h.sb.From("mail_send_jobs").Update(map[string]any{
			"status":        "failed",
			"error_message": sendErr.Error(),
		}).Eq("id", jobID).Exec(ctx, nil)
		return sendErr
	}
	_ = h.sb.From("mail_send_jobs").Update(map[string]any{
		"status":              "sent",
		"error_message":       nil,
		"provider_message_id": nilIfEmpty(providerMessageID),
		"sent_at":             nowISO(),
	}).Eq("id", jobID).Exec(ctx, nil)
	h.persistSentMessage(ctx, accountID, providerMessageID, threadID, body, len(atts) > 0)
	return nil
}

// recordSendJob is kept for tests / legacy call sites; prefer insertImmediateSendJob.
func (h *Handler) recordSendJob(ctx context.Context, body sendRequest, userID string, sendErr error) any {
	status := "sent"
	var errMsg any = nil
	if sendErr != nil {
		status = "failed"
		errMsg = sendErr.Error()
	}
	var inserted struct {
		ID string `json:"id"`
	}
	err := h.sb.From("mail_send_jobs").Insert(map[string]any{
		"mail_account_id":  body.MailAccountID,
		"operator_user_id": userID,
		"from_address":     body.FromAddress,
		"subject":          body.Subject,
		"to_addresses":     body.To,
		"cc_addresses":     body.Cc,
		"bcc_addresses":    body.Bcc,
		"body_html":        nilIfEmpty(body.BodyHTML),
		"body_text":        nilIfEmpty(body.BodyText),
		"status":           status,
		"error_message":    errMsg,
		"sent_at":          nowISO(),
	}).Returning().Select("id").Single(ctx, &inserted)
	if err != nil || inserted.ID == "" {
		return nil
	}
	return inserted.ID
}

// persistSentMessage records the sent message in the mailbox (best-effort).
func (h *Handler) persistSentMessage(ctx context.Context, accountID, providerMessageID, threadID string, body sendRequest, hasAttachments bool) {
	if providerMessageID == "" {
		providerMessageID = "smtp:sent:" + idutil.UUIDv4()
	}
	row := map[string]any{
		"mail_account_id":     accountID,
		"provider_message_id": providerMessageID,
		"subject":             body.Subject,
		"from_address":        body.FromAddress,
		"to_addresses":        body.To,
		"cc_addresses":        body.Cc,
		"bcc_addresses":       body.Bcc,
		"snippet":             draftSnippet(draftBody{BodyHTML: body.BodyHTML, BodyText: body.BodyText}),
		"received_at":         nowISO(),
		"is_read":             true,
		"is_starred":          false,
		"is_sent":             true,
		"is_draft":            false,
		"has_attachments":     hasAttachments,
		"labels":              []string{"SENT"},
	}
	if threadID != "" {
		row["provider_thread_id"] = threadID
	}
	var inserted struct {
		ID string `json:"id"`
	}
	if err := h.sb.From("mail_messages").Insert(row).Returning().Select("id").Single(ctx, &inserted); err == nil && inserted.ID != "" {
		h.upsertBody(ctx, inserted.ID, body.BodyHTML, body.BodyText)
	}
}
