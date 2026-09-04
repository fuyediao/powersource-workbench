package mail

import (
	"context"
	"log"
	"time"
)

// StartScheduler runs send-later, snooze wake, background account sync,
// pending remote-task retry, and AliMail INBOX IDLE loops until ctx is cancelled.
func (h *Handler) StartScheduler(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		h.runScheduledWork(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.runScheduledWork(ctx)
			}
		}
	}()
	go func() {
		ticker := time.NewTicker(backgroundSyncInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.runBackgroundSyncTick(ctx)
			}
		}
	}()
	go h.runAliMailIdleSupervisor(ctx)
}

func (h *Handler) runScheduledWork(ctx context.Context) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("mail scheduler panic: %v", rec)
		}
	}()
	h.flushScheduledSends(ctx)
	h.wakeSnoozedMessages(ctx)
	h.drainPendingSyncTasks(ctx)
}

func (h *Handler) runBackgroundSyncTick(ctx context.Context) {
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("mail background sync panic: %v", rec)
		}
	}()
	h.nudgeActiveAccounts(ctx)
}

func (h *Handler) flushScheduledSends(ctx context.Context) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	var jobs []map[string]any
	_ = h.sb.From("mail_send_jobs").
		Select("id,mail_account_id,operator_user_id,from_address,reply_to,to_addresses,cc_addresses,bcc_addresses,subject,body_html,body_text,in_reply_to_message_id,attachments").
		Eq("status", "pending").
		Lte("scheduled_at", now).
		Limit(20).
		Exec(ctx, &jobs)
	for _, job := range jobs {
		h.dispatchScheduledJob(ctx, job)
	}
}

func (h *Handler) dispatchScheduledJob(ctx context.Context, job map[string]any) {
	jobID, _ := job["id"].(string)
	accountID, _ := job["mail_account_id"].(string)
	if jobID == "" || accountID == "" {
		return
	}
	var account struct {
		Provider string `json:"provider"`
	}
	found, _ := h.sb.From("mail_accounts").Select("provider").Eq("id", accountID).MaybeSingle(ctx, &account)
	if !found {
		_ = h.sb.From("mail_send_jobs").Update(map[string]any{"status": "failed", "error_message": "Account not found"}).Eq("id", jobID).Exec(ctx, nil)
		return
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
	providerMessageID, threadID, sendErr := h.dispatchSend(ctx, account.Provider, accountID, body, atts)
	if sendErr != nil {
		_ = h.sb.From("mail_send_jobs").Update(map[string]any{
			"status":        "failed",
			"error_message": sendErr.Error(),
		}).Eq("id", jobID).Exec(ctx, nil)
		operatorID := strValue(job["operator_user_id"])
		h.enqueueRemoteTask(ctx, accountID, operatorID, "send", syncTaskPayload{SendJobID: jobID}, sendErr.Error())
		return
	}
	_ = h.sb.From("mail_send_jobs").Update(map[string]any{
		"status":              "sent",
		"error_message":       nil,
		"provider_message_id": nilIfEmpty(providerMessageID),
		"sent_at":             nowISO(),
	}).Eq("id", jobID).Exec(ctx, nil)
	h.persistSentMessage(ctx, accountID, providerMessageID, threadID, body, len(atts) > 0)
}

func (h *Handler) wakeSnoozedMessages(ctx context.Context) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	var rows []struct {
		MessageID     string `json:"message_id"`
		MailAccountID string `json:"mail_account_id"`
	}
	_ = h.sb.From("mail_message_snoozes").
		Select("message_id,mail_account_id").
		Lte("snoozed_until", now).
		Limit(50).
		Exec(ctx, &rows)
	if len(rows) == 0 {
		return
	}
	ids := make([]string, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.MessageID)
	}
	var messages []struct {
		ID     string   `json:"id"`
		Labels []string `json:"labels"`
	}
	_ = h.sb.From("mail_messages").Select("id,labels").In("id", ids).Exec(ctx, &messages)
	for _, msg := range messages {
		labels := applyUnsnoozeLabels(msg.Labels)
		_ = h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", msg.ID).Exec(ctx, nil)
		_ = h.sb.From("mail_message_snoozes").Delete().Eq("message_id", msg.ID).Exec(ctx, nil)
	}
}

func addrsFromAny(v any) []mailAddr {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]mailAddr, 0, len(arr))
	for _, item := range arr {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		email, _ := m["email"].(string)
		name, _ := m["name"].(string)
		if email == "" {
			continue
		}
		out = append(out, mailAddr{Email: email, Name: name})
	}
	return out
}
