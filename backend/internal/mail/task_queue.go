package mail

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
	"github.com/fuyediao/powersource-workbench/backend/internal/mail/gmail"
)

// maxSyncTaskAttempts bounds retries for one pending_remote mail_sync_tasks
// row before it is marked failed and stops being retried automatically
// (mirrors Mailspring-Sync's TaskProcessor giving up after a bounded number
// of performRemote attempts).
const maxSyncTaskAttempts = 8

// syncTaskPayload is the jsonb payload shape stored on mail_sync_tasks. Only
// the fields relevant to a given kind are populated; message_ids are internal
// mail_messages.id values (not provider ids) so a retry can re-resolve the
// current provider id even if the message was re-synced in the meantime.
type syncTaskPayload struct {
	MessageIDs []string `json:"message_ids,omitempty"`
	// ProviderMessageIDs backs "delete_forever" retries: the local
	// mail_messages row is already gone by the time this task is queued, so
	// message_ids can't be re-resolved — the provider id captured at enqueue
	// time is the only way to replay the remote delete.
	ProviderMessageIDs []string `json:"provider_message_ids,omitempty"`
	Label              string   `json:"label,omitempty"`
	// SendJobID points at mail_send_jobs for kind=send retries (payload stays
	// small; the job row holds MIME + attachments).
	SendJobID string `json:"send_job_id,omitempty"`
}

// enqueueRemoteTask records a durable retry for a remote mirror mutation that
// just failed inline. The local Supabase write already succeeded by the time
// this is called, so the UI is never blocked on provider availability — the
// scheduler's drainPendingSyncTasks tick replays it later.
func (h *Handler) enqueueRemoteTask(ctx context.Context, accountID, operatorUserID, kind string, payload syncTaskPayload, errMessage string) {
	_ = h.sb.From("mail_sync_tasks").Insert(map[string]any{
		"mail_account_id":  accountID,
		"operator_user_id": nilIfEmpty(operatorUserID),
		"kind":             kind,
		"payload":          payload,
		"status":           "pending_remote",
		"attempts":         1,
		"error_message":    nilIfEmpty(errMessage),
	}).Exec(ctx, nil)
}

// mirrorRead mirrors a single message's read state to its provider (Gmail
// label or AliMail \Seen flag), returning any error so the caller can enqueue
// a durable retry.
func (h *Handler) mirrorRead(ctx context.Context, accountID, providerMessageID string, isRead bool) error {
	if gmail.IsGmailProviderMessageID(providerMessageID) {
		return h.gmail.MirrorLabel(ctx, accountID, providerMessageID, gmail.LabelOp{Read: &isRead})
	}
	return h.alimail.MirrorRead(ctx, accountID, []string{providerMessageID}, isRead)
}

// mirrorStar mirrors a single message's starred state to its provider.
func (h *Handler) mirrorStar(ctx context.Context, accountID, providerMessageID string, starred bool) error {
	if gmail.IsGmailProviderMessageID(providerMessageID) {
		return h.gmail.MirrorLabel(ctx, accountID, providerMessageID, gmail.LabelOp{Star: &starred})
	}
	return h.alimail.MirrorStar(ctx, accountID, []string{providerMessageID}, starred)
}

// splitMirrorRows partitions rows by provider so bulk mutations can use each
// provider's own API shape (Gmail batchModify vs. AliMail per-mailbox UID
// STORE).
func splitMirrorRows(rows []gmail.MirrorRow) (gmailRows, aliRows []gmail.MirrorRow) {
	for _, row := range rows {
		if gmail.IsGmailProviderMessageID(row.ProviderMessageID) {
			gmailRows = append(gmailRows, row)
		} else {
			aliRows = append(aliRows, row)
		}
	}
	return
}

// mirrorBulkAndEnqueue mirrors a label/flag mutation to every row's provider
// and enqueues a durable mail_sync_tasks retry for any account whose mirror
// call failed. AliMail mirrors read/star flags plus trash/archive/spam folder
// moves (IMAP MOVE); custom Gmail-only labels are still skipped for AliMail.
func (h *Handler) mirrorBulkAndEnqueue(ctx context.Context, userID, kind string, rows []gmail.MirrorRow, op gmail.LabelOp, label string) {
	gmailRows, aliRows := splitMirrorRows(rows)
	if len(gmailRows) > 0 {
		if errs := h.gmail.MirrorBulk(ctx, gmailRows, op); len(errs) > 0 {
			h.enqueueMirrorFailures(ctx, userID, kind, gmailRows, errs, label)
		}
	}
	h.mirrorAliRowsBestEffort(ctx, userID, kind, aliRows, op)
}

// deleteBulkAndEnqueue permanently deletes messages on each provider and
// enqueues retries for accounts whose remote delete failed. Local rows are
// expected to already be gone (caller deletes first).
func (h *Handler) deleteBulkAndEnqueue(ctx context.Context, userID string, rows []gmail.MirrorRow) {
	gmailRows, aliRows := splitMirrorRows(rows)
	if len(gmailRows) > 0 {
		if errs := h.gmail.DeleteBulk(ctx, gmailRows); len(errs) > 0 {
			h.enqueueMirrorFailures(ctx, userID, "delete_forever", gmailRows, errs, "")
		}
	}
	if len(aliRows) == 0 {
		return
	}
	byAccount := map[string][]string{}
	idsByAccount := map[string][]string{}
	for _, row := range aliRows {
		byAccount[row.MailAccountID] = append(byAccount[row.MailAccountID], row.ProviderMessageID)
		idsByAccount[row.MailAccountID] = append(idsByAccount[row.MailAccountID], row.ID)
	}
	for accountID, providerIDs := range byAccount {
		if err := h.alimail.MirrorDelete(ctx, accountID, providerIDs); err != nil {
			h.enqueueRemoteTask(ctx, accountID, userID, "delete_forever", syncTaskPayload{
				MessageIDs:         idsByAccount[accountID],
				ProviderMessageIDs: providerIDs,
			}, err.Error())
		}
	}
}

// enqueueMirrorFailures enqueues one retry task per account present in errs,
// using the message ids from rows that belong to that account.
func (h *Handler) enqueueMirrorFailures(ctx context.Context, userID, kind string, rows []gmail.MirrorRow, errs map[string]error, label string) {
	if len(errs) == 0 {
		return
	}
	msgIDs := map[string][]string{}
	providerIDs := map[string][]string{}
	for _, row := range rows {
		msgIDs[row.MailAccountID] = append(msgIDs[row.MailAccountID], row.ID)
		providerIDs[row.MailAccountID] = append(providerIDs[row.MailAccountID], row.ProviderMessageID)
	}
	for accountID, err := range errs {
		h.enqueueRemoteTask(ctx, accountID, userID, kind, syncTaskPayload{
			MessageIDs:         msgIDs[accountID],
			ProviderMessageIDs: providerIDs[accountID],
			Label:              label,
		}, err.Error())
	}
}

// mirrorAliRowsBestEffort mirrors read/star flags and trash/archive/spam
// folder moves to AliMail, grouping by account so a failure enqueues one
// retry task with that account's message ids.
func (h *Handler) mirrorAliRowsBestEffort(ctx context.Context, userID, kind string, rows []gmail.MirrorRow, op gmail.LabelOp) {
	if len(rows) == 0 {
		return
	}
	byAccount := map[string][]gmail.MirrorRow{}
	for _, row := range rows {
		byAccount[row.MailAccountID] = append(byAccount[row.MailAccountID], row)
	}
	for accountID, accountRows := range byAccount {
		providerIDs := make([]string, 0, len(accountRows))
		msgIDs := make([]string, 0, len(accountRows))
		aliMsgs := make([]alimail.MirrorMessage, 0, len(accountRows))
		for _, row := range accountRows {
			providerIDs = append(providerIDs, row.ProviderMessageID)
			msgIDs = append(msgIDs, row.ID)
			aliMsgs = append(aliMsgs, alimail.MirrorMessage{ID: row.ID, ProviderMessageID: row.ProviderMessageID})
		}
		err := h.performAliMirrorOp(ctx, accountID, kind, op, providerIDs, aliMsgs)
		if err != nil {
			// Missing Archive folder is a permanent account limitation — do
			// not enqueue endless retries for every archive action.
			if errors.Is(err, alimail.ErrNoArchiveMailbox) {
				continue
			}
			h.enqueueRemoteTask(ctx, accountID, userID, kind, syncTaskPayload{
				MessageIDs:         msgIDs,
				ProviderMessageIDs: providerIDs,
			}, err.Error())
		}
	}
}

// performAliMirrorOp dispatches one AliMail mirror mutation from either an
// inline LabelOp (HTTP path) or a durable task kind (retry path).
func (h *Handler) performAliMirrorOp(ctx context.Context, accountID, kind string, op gmail.LabelOp, providerIDs []string, messages []alimail.MirrorMessage) error {
	switch {
	case op.Read != nil:
		return h.alimail.MirrorRead(ctx, accountID, providerIDs, *op.Read)
	case op.Star != nil:
		return h.alimail.MirrorStar(ctx, accountID, providerIDs, *op.Star)
	case op.Trash != nil:
		if *op.Trash {
			return h.alimail.MirrorTrash(ctx, accountID, messages)
		}
		return h.alimail.MirrorUntrash(ctx, accountID, messages)
	case op.Archive != nil:
		if *op.Archive {
			return h.alimail.MirrorArchive(ctx, accountID, messages)
		}
		return h.alimail.MirrorUnarchive(ctx, accountID, messages)
	case op.Spam != nil:
		if *op.Spam {
			return h.alimail.MirrorSpam(ctx, accountID, messages)
		}
		return h.alimail.MirrorUnspam(ctx, accountID, messages)
	default:
		// Kind-driven path used by performAliRemoteTask (and snooze/unsnooze
		// which do not map cleanly onto a single LabelOp field).
		return h.performAliKind(ctx, accountID, kind, providerIDs, messages)
	}
}

// performAliKind replays a mail_sync_tasks kind against AliMail.
func (h *Handler) performAliKind(ctx context.Context, accountID, kind string, providerIDs []string, messages []alimail.MirrorMessage) error {
	switch kind {
	case "read":
		return h.alimail.MirrorRead(ctx, accountID, providerIDs, true)
	case "unread":
		return h.alimail.MirrorRead(ctx, accountID, providerIDs, false)
	case "star":
		return h.alimail.MirrorStar(ctx, accountID, providerIDs, true)
	case "unstar":
		return h.alimail.MirrorStar(ctx, accountID, providerIDs, false)
	case "trash":
		return h.alimail.MirrorTrash(ctx, accountID, messages)
	case "untrash":
		return h.alimail.MirrorUntrash(ctx, accountID, messages)
	case "archive", "snooze":
		return h.alimail.MirrorArchive(ctx, accountID, messages)
	case "unarchive", "unsnooze":
		return h.alimail.MirrorUnarchive(ctx, accountID, messages)
	case "spam":
		return h.alimail.MirrorSpam(ctx, accountID, messages)
	case "unspam":
		return h.alimail.MirrorUnspam(ctx, accountID, messages)
	case "delete_forever":
		return h.alimail.MirrorDelete(ctx, accountID, providerIDs)
	default:
		return nil // apply_label / important / etc. have no IMAP equivalent here.
	}
}

// syncTaskRow is the subset of mail_sync_tasks needed to replay a task.
type syncTaskRow struct {
	ID            string          `json:"id"`
	MailAccountID string          `json:"mail_account_id"`
	Kind          string          `json:"kind"`
	Payload       json.RawMessage `json:"payload"`
	Attempts      int             `json:"attempts"`
}

// drainPendingSyncTasks retries a bounded batch of pending_remote
// mail_sync_tasks rows (oldest first), mirroring the write to each message's
// provider. A failure increments attempts and leaves the row pending_remote
// for the next tick; after maxSyncTaskAttempts the row is marked failed.
func (h *Handler) drainPendingSyncTasks(ctx context.Context) {
	var tasks []syncTaskRow
	if err := h.sb.From("mail_sync_tasks").
		Select("id,mail_account_id,kind,payload,attempts").
		Eq("status", "pending_remote").
		Order("created_at", true).
		Limit(20).
		Exec(ctx, &tasks); err != nil {
		return
	}
	for _, task := range tasks {
		h.retrySyncTask(ctx, task)
	}
}

func (h *Handler) retrySyncTask(ctx context.Context, task syncTaskRow) {
	var account struct {
		Provider string `json:"provider"`
	}
	found, _ := h.sb.From("mail_accounts").Select("provider").Eq("id", task.MailAccountID).MaybeSingle(ctx, &account)
	if !found {
		h.finishSyncTask(ctx, task.ID, "failed", "Account no longer exists")
		return
	}
	err := h.performRemoteTask(ctx, task.MailAccountID, account.Provider, task)
	if err == nil {
		h.finishSyncTask(ctx, task.ID, "done", "")
		return
	}
	attempts := task.Attempts + 1
	if attempts >= maxSyncTaskAttempts {
		h.finishSyncTask(ctx, task.ID, "failed", err.Error())
		return
	}
	_ = h.sb.From("mail_sync_tasks").Update(map[string]any{
		"attempts":      attempts,
		"error_message": err.Error(),
	}).Eq("id", task.ID).Exec(ctx, nil)
}

func (h *Handler) finishSyncTask(ctx context.Context, taskID, status, errMessage string) {
	_ = h.sb.From("mail_sync_tasks").Update(map[string]any{
		"status":        status,
		"error_message": nilIfEmpty(errMessage),
	}).Eq("id", taskID).Exec(ctx, nil)
}

// performRemoteTask re-resolves the current provider message ids for the
// task's message_ids (a message may have been re-synced since the task was
// queued) and replays the mutation against the right provider.
func (h *Handler) performRemoteTask(ctx context.Context, accountID, provider string, task syncTaskRow) error {
	var payload syncTaskPayload
	_ = json.Unmarshal(task.Payload, &payload)

	if task.Kind == "send" {
		return h.performSendTask(ctx, accountID, provider, payload.SendJobID)
	}

	if task.Kind == "delete_forever" {
		return h.performDeleteForeverTask(ctx, accountID, provider, payload)
	}

	if len(payload.MessageIDs) == 0 {
		return nil
	}
	var rows []gmail.MirrorRow
	_ = h.sb.From("mail_messages").
		Select("id,mail_account_id,provider_message_id,labels").
		In("id", payload.MessageIDs).
		Eq("mail_account_id", accountID).
		Exec(ctx, &rows)
	if len(rows) == 0 {
		return nil // messages were deleted locally since the task was queued; nothing to mirror.
	}

	switch provider {
	case "gmail":
		return h.performGmailRemoteTask(ctx, task.Kind, rows, payload)
	case alimail.ProviderName, alimail.GenericIMAPProviderName:
		return h.performAliRemoteTask(ctx, accountID, task.Kind, rows)
	default:
		return nil
	}
}

// performDeleteForeverTask replays a permanent delete using the provider ids
// captured at enqueue time, since the local mail_messages row is already gone
// by the time this retry runs (delete_forever removes it immediately).
func (h *Handler) performDeleteForeverTask(ctx context.Context, accountID, provider string, payload syncTaskPayload) error {
	if len(payload.ProviderMessageIDs) == 0 {
		return nil
	}
	switch provider {
	case "gmail":
		rows := make([]gmail.MirrorRow, 0, len(payload.ProviderMessageIDs))
		for _, providerID := range payload.ProviderMessageIDs {
			rows = append(rows, gmail.MirrorRow{MailAccountID: accountID, ProviderMessageID: providerID})
		}
		return firstErr(h.gmail.DeleteBulk(ctx, rows))
	case alimail.ProviderName, alimail.GenericIMAPProviderName:
		return h.alimail.MirrorDelete(ctx, accountID, payload.ProviderMessageIDs)
	default:
		return nil
	}
}

// performGmailRemoteTask reproduces the exact Gmail mutation bulkMessages
// applies for kind, so a retried task has the same effect as the original
// inline mirror attempt.
func (h *Handler) performGmailRemoteTask(ctx context.Context, kind string, rows []gmail.MirrorRow, payload syncTaskPayload) error {
	yes, no := true, false
	switch kind {
	case "read":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Read: &yes}))
	case "unread":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Read: &no}))
	case "star":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Star: &yes}))
	case "unstar":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Star: &no}))
	case "trash":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Trash: &yes}))
	case "untrash":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Trash: &no}))
	case "archive":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Archive: &yes}))
	case "unarchive":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Archive: &no}))
	case "spam":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Spam: &yes}))
	case "unspam":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Spam: &no}))
	case "important":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Important: &yes}))
	case "unimportant":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Important: &no}))
	case "apply_label":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{AddLabels: []string{payload.Label}}))
	case "remove_label":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{RemoveLabels: []string{payload.Label}}))
	case "snooze":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Archive: &yes}))
	case "unsnooze":
		return firstErr(h.gmail.MirrorBulk(ctx, rows, gmail.LabelOp{Spam: &no, AddLabels: []string{"INBOX"}}))
	default:
		return nil
	}
}

// performAliRemoteTask replays an AliMail flag or folder-move mutation for a
// durable mail_sync_tasks retry.
func (h *Handler) performAliRemoteTask(ctx context.Context, accountID, kind string, rows []gmail.MirrorRow) error {
	ids := make([]string, 0, len(rows))
	msgs := make([]alimail.MirrorMessage, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ProviderMessageID)
		msgs = append(msgs, alimail.MirrorMessage{ID: row.ID, ProviderMessageID: row.ProviderMessageID})
	}
	return h.performAliKind(ctx, accountID, kind, ids, msgs)
}

func firstErr(errs map[string]error) error {
	for _, err := range errs {
		return err
	}
	return nil
}
