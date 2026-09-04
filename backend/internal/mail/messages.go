package mail

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
	"github.com/fuyediao/powersource-workbench/backend/internal/mail/gmail"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/crmadmin"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

const listMsgColumns = "id,mail_account_id,thread_id,folder_id,provider_message_id,subject,from_address,from_name,to_addresses,snippet,received_at,is_read,is_starred,is_sent,is_draft,has_attachments,labels"

const pageSize = 50

var virtualLabels = map[string]bool{
	"INBOX": true, "UNREAD": true, "IMPORTANT": true, "ALI_IMPORTANT": true,
	"ALI_FOLLOWUP": true, "ALI_COMPLETED": true, "DRAFT": true, "SENT": true,
	"TRASH": true, "SPAM": true, "ARCHIVE": true, "STARRED": true,
	"ALL": true, "SNOOZED": true,
}

var categoryLabel = map[string]string{
	"promotions": "CATEGORY_PROMOTIONS", "social": "CATEGORY_SOCIAL",
	"updates": "CATEGORY_UPDATES", "forums": "CATEGORY_FORUMS",
}

// applyMessageFilters applies folder/label/category/q filters to a query.
func applyMessageFilters(q *supabase.Query, folderID, label, category, search string) *supabase.Query {
	parsed := parseMailSearch(search)
	switch {
	case parsed.HasInToken:
		if mapped := inTokenToLabel(parsed.In); mapped != "" {
			if virtualLabels[mapped] {
				q = applyVirtualLabel(q, mapped)
			} else {
				q = q.Contains("labels", "{"+mapped+"}")
			}
		}
	case folderID != "":
		q = q.Eq("folder_id", folderID)
	case label != "":
		up := strings.ToUpper(label)
		if virtualLabels[up] {
			q = applyVirtualLabel(q, up)
		} else {
			q = q.Contains("labels", "{"+label+"}")
		}
	}
	if category == "primary" {
		q = q.Not("labels", "cs.{CATEGORY_PROMOTIONS}").
			Not("labels", "cs.{CATEGORY_SOCIAL}").
			Not("labels", "cs.{CATEGORY_UPDATES}").
			Not("labels", "cs.{CATEGORY_FORUMS}")
	} else if lbl, ok := categoryLabel[category]; ok {
		q = q.Contains("labels", "{"+lbl+"}")
	}
	return applyParsedSearch(q, parsed)
}

func applyVirtualLabel(q *supabase.Query, label string) *supabase.Query {
	switch label {
	case "INBOX":
		return q.Contains("labels", "{INBOX}").Not("labels", "cs.{TRASH}").Not("labels", "cs.{SPAM}")
	case "UNREAD":
		return q.Contains("labels", "{INBOX}").Eq("is_read", "false").Eq("is_draft", "false")
	case "IMPORTANT":
		return q.Contains("labels", "{IMPORTANT}")
	case "ALI_IMPORTANT":
		return q.Contains("labels", "{INBOX}").Eq("is_starred", "true")
	case "ALI_FOLLOWUP":
		return q.Contains("labels", "{INBOX}").Eq("is_starred", "true").Eq("is_read", "false")
	case "ALI_COMPLETED":
		return q.Contains("labels", "{INBOX}").Eq("is_starred", "true").Eq("is_read", "true")
	case "DRAFT":
		return q.Or("is_draft.eq.true,labels.cs.{DRAFT}")
	case "SENT":
		return q.Or("is_sent.eq.true,labels.cs.{SENT}")
	case "TRASH":
		return q.Or(`labels.cs.{TRASH},labels.cs.{\Deleted}`)
	case "SPAM":
		return q.Contains("labels", "{SPAM}").Not("labels", "cs.{TRASH}").Not("labels", `cs.{\Deleted}`)
	case "ARCHIVE":
		return q.Contains("labels", "{ARCHIVE}")
	case "STARRED":
		return q.Contains("labels", "{STARRED}")
	case "ALL":
		return q.Not("labels", "cs.{TRASH}").Not("labels", "cs.{SPAM}").Eq("is_draft", "false")
	case "SNOOZED":
		return q.Contains("labels", "{SNOOZED}")
	}
	return q
}

func (h *Handler) listMessages(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	userID := authmw.UserIDFrom(r)
	accountID := q.Get("accountId")
	threadID := strings.TrimSpace(q.Get("threadId"))
	folderID := q.Get("folderId")
	label := q.Get("label")
	category := q.Get("category")
	search := q.Get("q")
	page := 0
	if p, err := strconv.Atoi(q.Get("page")); err == nil && p > 0 {
		page = p
	}

	accessible := h.getUserAccessibleMailAccountIDs(r.Context(), userID)
	if len(accessible) == 0 {
		mailJSON(w, http.StatusOK, map[string]any{
			"items": []any{}, "page": page, "pageSize": pageSize, "total": 0, "hasMore": false, "unreadInboxCount": 0,
		})
		return
	}

	dataQ := h.sb.From("mail_messages").Select(listMsgColumns)
	if threadID != "" {
		dataQ = dataQ.Eq("thread_id", threadID)
	}
	unified := accountID == "" || strings.EqualFold(accountID, "all")
	if unified {
		dataQ = dataQ.In("mail_account_id", accessible)
	} else {
		if !containsStr(accessible, accountID) {
			mailErr(w, http.StatusForbidden, "Forbidden")
			return
		}
		dataQ = dataQ.Eq("mail_account_id", accountID)
	}
	if threadID == "" {
		dataQ = applyMessageFilters(dataQ, folderID, label, category, search)
	}
	limit := pageSize
	if threadID != "" {
		limit = 200
	}
	parsed := parseMailSearch(search)
	fetchLimit := limit
	if parsed.To != "" && threadID == "" {
		fetchLimit = pageSize * 4
	}
	dataQ = dataQ.Order("received_at", false).Offset(page * pageSize).Limit(fetchLimit)

	var rows []map[string]any
	total, err := dataQ.ExecWithCount(r.Context(), &rows)
	if err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to load messages")
		return
	}
	if parsed.To != "" && threadID == "" {
		filtered := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			if messageMatchesToToken(row, parsed.To) {
				filtered = append(filtered, row)
			}
		}
		rows = filtered
		if len(rows) > limit {
			rows = rows[:limit]
		}
	}
	for _, row := range rows {
		healHeaders(row)
	}

	unreadInbox := 0
	if !unified {
		unreadInbox = h.countUnreadInbox(r.Context(), accountID)
	}

	mailJSON(w, http.StatusOK, map[string]any{
		"items":            nonNilRows(rows),
		"page":             page,
		"pageSize":         pageSize,
		"total":            total,
		"hasMore":          (page+1)*pageSize < total,
		"unreadInboxCount": unreadInbox,
	})
}

func (h *Handler) countUnreadInbox(ctx context.Context, accountID string) int {
	var rows []json.RawMessage
	total, _ := h.sb.From("mail_messages").
		Select("id").
		Eq("mail_account_id", accountID).
		Eq("is_read", "false").
		Eq("is_draft", "false").
		Contains("labels", "{INBOX}").
		Not("labels", "cs.{TRASH}").
		Not("labels", "cs.{SPAM}").
		Limit(1).
		ExecWithCount(ctx, &rows)
	return total
}

func (h *Handler) messageDetail(w http.ResponseWriter, r *http.Request) {
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

	bodyHTML := strPtrValue(body.BodyHTML)
	bodyText := strPtrValue(body.BodyText)
	accountID, _ := msg["mail_account_id"].(string)
	providerID, _ := msg["provider_message_id"].(string)

	hasUnresolvedCid := strings.Contains(strings.ToLower(bodyHTML), "cid:")
	needsAliHydrate := alimail.IsAlimailProviderMessageID(providerID) &&
		((bodyHTML == "" && bodyText == "") ||
			!messageHasLabel(msg["labels"], "ATTACHMENTS_SCANNED") ||
			(hasUnresolvedCid && !messageHasLabel(msg["labels"], "CID_INLINE_TRIED")))
	if needsAliHydrate {
		// Missing body, first attachment scan, or one-shot cid: inline rewrite.
		if hydrated := h.alimail.HydrateBody(r.Context(), accountID, messageID, providerID); hydrated != nil {
			if hydrated.BodyHTML != "" {
				bodyHTML = hydrated.BodyHTML
			}
			if hydrated.BodyText != "" {
				bodyText = hydrated.BodyText
			}
			h.storeAliMailAttachments(r.Context(), accountID, messageID, hydrated)
		}
		labels := stringSliceFromAny(msg["labels"])
		labels = appendLabelOnce(labels, "ATTACHMENTS_SCANNED")
		if hasUnresolvedCid {
			labels = appendLabelOnce(labels, "CID_INLINE_TRIED")
		}
		h.setMessageLabels(r.Context(), messageID, labels)
	}

	attachments := h.listAttachmentMeta(r.Context(), messageID)
	healHeaders(msg)
	msg["body_html"] = nilIfEmpty(bodyHTML)
	msg["body_text"] = nilIfEmpty(bodyText)
	msg["attachments"] = attachments
	mailJSON(w, http.StatusOK, msg)
}

// storeAliMailAttachments persists IMAP-decoded attachment bytes to Storage.
func (h *Handler) storeAliMailAttachments(ctx context.Context, accountID, messageID string, hydrated *alimail.FetchedBody) {
	if hydrated == nil || len(hydrated.Attachments) == 0 {
		return
	}
	parts := make([]StoredAttachment, 0, len(hydrated.Attachments))
	for _, att := range hydrated.Attachments {
		parts = append(parts, StoredAttachment{
			Filename:    att.Filename,
			ContentType: att.ContentType,
			SizeBytes:   len(att.Data),
			Data:        att.Data,
		})
	}
	h.storeAttachments(ctx, accountID, messageID, parts)
}

// markAttachmentsScanned records that AliMail attachment extraction ran once.
func (h *Handler) markAttachmentsScanned(ctx context.Context, messageID string, labelsAny any) {
	labels := appendLabelOnce(stringSliceFromAny(labelsAny), "ATTACHMENTS_SCANNED")
	h.setMessageLabels(ctx, messageID, labels)
}

// setMessageLabels replaces the label array on a message row.
func (h *Handler) setMessageLabels(ctx context.Context, messageID string, labels []string) {
	_ = h.sb.From("mail_messages").
		Update(map[string]any{"labels": labels}).
		Eq("id", messageID).
		Exec(ctx, nil)
}

// appendLabelOnce adds label when missing.
func appendLabelOnce(labels []string, label string) []string {
	if containsStr(labels, label) {
		return labels
	}
	return append(labels, label)
}

// messageHasLabel reports whether labels (json array / []any / []string) contains label.
func messageHasLabel(labelsAny any, label string) bool {
	return containsStr(stringSliceFromAny(labelsAny), label)
}

// stringSliceFromAny coerces a JSON array of strings into []string.
func stringSliceFromAny(v any) []string {
	switch arr := v.(type) {
	case []string:
		return arr
	case []any:
		out := make([]string, 0, len(arr))
		for _, item := range arr {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func (h *Handler) listFolders(w http.ResponseWriter, r *http.Request) {
	accountID := r.URL.Query().Get("accountId")
	if accountID == "" {
		mailErr(w, http.StatusBadRequest, "accountId required")
		return
	}
	var rows []json.RawMessage
	if err := h.sb.From("mail_folders").Select("id,provider_id,name,role,unread_count,total_count").Eq("mail_account_id", accountID).Order("role", true).Exec(r.Context(), &rows); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to load folders")
		return
	}
	mailJSON(w, http.StatusOK, nonNilRaw(rows))
}

func (h *Handler) listLabels(w http.ResponseWriter, r *http.Request) {
	accountID := r.URL.Query().Get("accountId")
	if accountID == "" {
		mailErr(w, http.StatusBadRequest, "accountId required")
		return
	}
	if !containsStr(h.getUserAccessibleMailAccountIDs(r.Context(), authmw.UserIDFrom(r)), accountID) {
		mailJSON(w, http.StatusOK, []any{})
		return
	}
	var account struct {
		Provider string `json:"provider"`
		Status   string `json:"status"`
	}
	found, _ := h.sb.From("mail_accounts").Select("id,provider,status").Eq("id", accountID).MaybeSingle(r.Context(), &account)
	if !found || account.Provider != "gmail" || account.Status != "active" {
		mailJSON(w, http.StatusOK, []any{})
		return
	}
	labels, err := h.gmail.ListLabels(r.Context(), accountID)
	if err != nil {
		mailJSON(w, http.StatusOK, []any{})
		return
	}
	var out []map[string]any
	for _, l := range labels {
		if l.Type == "user" {
			out = append(out, map[string]any{"id": l.ID, "name": l.Name})
		}
	}
	mailJSON(w, http.StatusOK, out)
}

func (h *Handler) createLabel(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AccountID string `json:"accountId"`
		Name      string `json:"name"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		mailErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	name := strings.TrimSpace(body.Name)
	if body.AccountID == "" || name == "" {
		mailErr(w, http.StatusBadRequest, "accountId and name required")
		return
	}
	if !containsStr(h.getUserAccessibleMailAccountIDs(r.Context(), authmw.UserIDFrom(r)), body.AccountID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	created, err := h.gmail.CreateLabel(r.Context(), body.AccountID, name)
	if err != nil || created == nil || created.ID == "" {
		mailErr(w, http.StatusBadRequest, "Failed to create label")
		return
	}
	mailJSON(w, http.StatusOK, map[string]any{"id": created.ID, "name": created.Name})
}

func (h *Handler) updateLabel(w http.ResponseWriter, r *http.Request) {
	labelID := chiID(r)
	var body struct {
		AccountID string `json:"accountId"`
		Name      string `json:"name"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		mailErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	name := strings.TrimSpace(body.Name)
	if body.AccountID == "" || labelID == "" || name == "" {
		mailErr(w, http.StatusBadRequest, "accountId, id, and name required")
		return
	}
	if !containsStr(h.getUserAccessibleMailAccountIDs(r.Context(), authmw.UserIDFrom(r)), body.AccountID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	updated, err := h.gmail.RenameLabel(r.Context(), body.AccountID, labelID, name)
	if err != nil || updated == nil {
		mailErr(w, http.StatusBadRequest, "Failed to rename label")
		return
	}
	mailJSON(w, http.StatusOK, map[string]any{"id": updated.ID, "name": updated.Name})
}

func (h *Handler) deleteLabel(w http.ResponseWriter, r *http.Request) {
	labelID := chiID(r)
	accountID := r.URL.Query().Get("accountId")
	if accountID == "" || labelID == "" {
		mailErr(w, http.StatusBadRequest, "accountId and id required")
		return
	}
	if !containsStr(h.getUserAccessibleMailAccountIDs(r.Context(), authmw.UserIDFrom(r)), accountID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	if err := h.gmail.DeleteLabel(r.Context(), accountID, labelID); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to delete label")
		return
	}
	mailJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) emptyFolder(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AccountID string `json:"accountId"`
		Role      string `json:"role"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		mailErr(w, http.StatusBadRequest, "Invalid JSON")
		return
	}
	role := strings.ToLower(strings.TrimSpace(body.Role))
	if body.AccountID == "" || (role != "trash" && role != "spam") {
		mailErr(w, http.StatusBadRequest, "accountId and role (trash|spam) required")
		return
	}
	if !containsStr(h.getUserAccessibleMailAccountIDs(r.Context(), authmw.UserIDFrom(r)), body.AccountID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	label := "TRASH"
	if role == "spam" {
		label = "SPAM"
	}
	var roleFolders []struct {
		ID string `json:"id"`
	}
	_ = h.sb.From("mail_folders").Select("id").Eq("mail_account_id", body.AccountID).Eq("role", role).Exec(r.Context(), &roleFolders)
	folderIDs := make([]string, 0, len(roleFolders))
	for _, folder := range roleFolders {
		if folder.ID != "" {
			folderIDs = append(folderIDs, folder.ID)
		}
	}
	updated := 0
	for {
		var rows []gmail.MirrorRow
		q := h.sb.From("mail_messages").
			Select("id,mail_account_id,provider_message_id,labels").
			Eq("mail_account_id", body.AccountID).
			Limit(500)
		if len(folderIDs) > 0 {
			q = q.In("folder_id", folderIDs)
		} else if role == "trash" {
			q = q.Or(`labels.cs.{TRASH},labels.cs.{\Deleted}`)
		} else {
			q = q.Contains("labels", "{"+label+"}")
		}
		if err := q.Exec(r.Context(), &rows); err != nil || len(rows) == 0 {
			break
		}
		for _, row := range rows {
			h.deleteMailMessageLocally(r.Context(), row.ID)
			updated++
		}
		h.deleteBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), rows)
		if len(rows) < 500 {
			break
		}
	}
	mailJSON(w, http.StatusOK, map[string]any{"ok": true, "updated": updated})
}

func (h *Handler) unreadSummary(w http.ResponseWriter, r *http.Request) {
	ids := h.getUserAccessibleMailAccountIDs(r.Context(), authmw.UserIDFrom(r))
	if len(ids) == 0 {
		mailJSON(w, http.StatusOK, map[string]any{"totalUnread": 0})
		return
	}
	var rows []json.RawMessage
	total, err := h.sb.From("mail_messages").
		Select("id").
		In("mail_account_id", ids).
		Eq("is_read", "false").
		Eq("is_draft", "false").
		Contains("labels", "{INBOX}").
		Limit(1).
		ExecWithCount(r.Context(), &rows)
	if err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to count unread")
		return
	}
	mailJSON(w, http.StatusOK, map[string]any{"totalUnread": total})
}

func (h *Handler) markRead(w http.ResponseWriter, r *http.Request) {
	messageID := chiID(r)
	var body struct {
		IsRead bool `json:"isRead"`
	}
	_ = httpx.DecodeJSON(r, &body)
	var msg struct {
		ID                string `json:"id"`
		MailAccountID     string `json:"mail_account_id"`
		ProviderMessageID string `json:"provider_message_id"`
	}
	found, _ := h.sb.From("mail_messages").Select("id,mail_account_id,provider_message_id").Eq("id", messageID).MaybeSingle(r.Context(), &msg)
	if !found {
		mailErr(w, http.StatusNotFound, "Message not found")
		return
	}
	if err := h.sb.From("mail_messages").Update(map[string]any{"is_read": body.IsRead}).Eq("id", messageID).Exec(r.Context(), nil); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to update message")
		return
	}
	if err := h.mirrorRead(r.Context(), msg.MailAccountID, msg.ProviderMessageID, body.IsRead); err != nil {
		kind := "unread"
		if body.IsRead {
			kind = "read"
		}
		h.enqueueRemoteTask(r.Context(), msg.MailAccountID, authmw.UserIDFrom(r), kind, syncTaskPayload{MessageIDs: []string{messageID}}, err.Error())
	}
	mailJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) toggleStar(w http.ResponseWriter, r *http.Request) {
	messageID := chiID(r)
	var body struct {
		Starred bool `json:"starred"`
	}
	_ = httpx.DecodeJSON(r, &body)
	if !h.messageInAccessibleAccount(r.Context(), authmw.UserIDFrom(r), messageID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	var msg struct {
		ID                string   `json:"id"`
		MailAccountID     string   `json:"mail_account_id"`
		ProviderMessageID string   `json:"provider_message_id"`
		Labels            []string `json:"labels"`
	}
	found, _ := h.sb.From("mail_messages").Select("id,mail_account_id,provider_message_id,labels").Eq("id", messageID).MaybeSingle(r.Context(), &msg)
	if !found {
		mailErr(w, http.StatusNotFound, "Message not found")
		return
	}
	labels := toggleLabel(msg.Labels, "STARRED", body.Starred)
	if err := h.sb.From("mail_messages").Update(map[string]any{"is_starred": body.Starred, "labels": labels}).Eq("id", messageID).Exec(r.Context(), nil); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to update message")
		return
	}
	if err := h.mirrorStar(r.Context(), msg.MailAccountID, msg.ProviderMessageID, body.Starred); err != nil {
		kind := "unstar"
		if body.Starred {
			kind = "star"
		}
		h.enqueueRemoteTask(r.Context(), msg.MailAccountID, authmw.UserIDFrom(r), kind, syncTaskPayload{MessageIDs: []string{messageID}}, err.Error())
	}
	mailJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) bulkMessages(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MessageIDs  []string `json:"messageIds"`
		Action      string   `json:"action"`
		Label       string   `json:"label"`
		SnoozeUntil string   `json:"snoozeUntil"`
	}
	_ = httpx.DecodeJSON(r, &body)
	if len(body.MessageIDs) == 0 {
		mailErr(w, http.StatusBadRequest, "messageIds required")
		return
	}
	valid := map[string]bool{
		"read": true, "unread": true, "star": true, "unstar": true,
		"trash": true, "untrash": true, "delete_forever": true,
		"archive": true, "unarchive": true, "spam": true, "unspam": true,
		"important": true, "unimportant": true,
		"apply_label": true, "remove_label": true,
		"snooze": true, "unsnooze": true,
	}
	if !valid[body.Action] {
		mailErr(w, http.StatusBadRequest, "invalid action")
		return
	}
	if (body.Action == "apply_label" || body.Action == "remove_label") && strings.TrimSpace(body.Label) == "" {
		mailErr(w, http.StatusBadRequest, "label required")
		return
	}

	accessible := h.getUserAccessibleMailAccountIDs(r.Context(), authmw.UserIDFrom(r))
	if len(accessible) == 0 {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	var rows []gmail.MirrorRow
	_ = h.sb.From("mail_messages").Select("id,mail_account_id,provider_message_id,labels").In("id", body.MessageIDs).In("mail_account_id", accessible).Exec(r.Context(), &rows)
	if len(rows) == 0 {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}

	updated := 0
	switch body.Action {
	case "read", "unread":
		isRead := body.Action == "read"
		ids := make([]string, 0, len(rows))
		for _, row := range rows {
			ids = append(ids, row.ID)
		}
		if err := h.sb.From("mail_messages").Update(map[string]any{"is_read": isRead}).In("id", ids).Exec(r.Context(), nil); err == nil {
			updated = len(ids)
		}
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), body.Action, rows, gmail.LabelOp{Read: &isRead}, "")
	case "star", "unstar":
		starred := body.Action == "star"
		for _, row := range rows {
			labels := toggleLabel(row.Labels, "STARRED", starred)
			if err := h.sb.From("mail_messages").Update(map[string]any{"is_starred": starred, "labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err == nil {
				updated++
			}
		}
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), body.Action, rows, gmail.LabelOp{Star: &starred}, "")
	case "trash":
		for _, row := range rows {
			labels := applyTrashLabels(row.Labels)
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err == nil {
				updated++
			}
		}
		trash := true
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), "trash", rows, gmail.LabelOp{Trash: &trash}, "")
	case "untrash":
		for _, row := range rows {
			labels := applyUntrashLabels(row.Labels)
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err == nil {
				updated++
			}
		}
		untrash := false
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), "untrash", rows, gmail.LabelOp{Trash: &untrash}, "")
	case "archive":
		for _, row := range rows {
			labels := applyArchiveLabels(row.Labels)
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err == nil {
				updated++
			}
		}
		archive := true
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), "archive", rows, gmail.LabelOp{Archive: &archive}, "")
	case "unarchive":
		for _, row := range rows {
			labels := applyUnarchiveLabels(row.Labels)
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err == nil {
				updated++
			}
		}
		unarchive := false
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), "unarchive", rows, gmail.LabelOp{Archive: &unarchive}, "")
	case "spam", "unspam":
		asSpam := body.Action == "spam"
		for _, row := range rows {
			var labels []string
			if asSpam {
				labels = applySpamLabels(row.Labels)
			} else {
				labels = applyNotSpamLabels(row.Labels)
			}
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err == nil {
				updated++
			}
		}
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), body.Action, rows, gmail.LabelOp{Spam: &asSpam}, "")
	case "important", "unimportant":
		important := body.Action == "important"
		for _, row := range rows {
			labels := toggleLabel(row.Labels, "IMPORTANT", important)
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err == nil {
				updated++
			}
		}
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), body.Action, rows, gmail.LabelOp{Important: &important}, "")
	case "apply_label", "remove_label":
		add := body.Action == "apply_label"
		label := strings.TrimSpace(body.Label)
		for _, row := range rows {
			labels := toggleLabel(row.Labels, label, add)
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err == nil {
				updated++
			}
		}
		if add {
			h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), "apply_label", rows, gmail.LabelOp{AddLabels: []string{label}}, label)
		} else {
			h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), "remove_label", rows, gmail.LabelOp{RemoveLabels: []string{label}}, label)
		}
	case "snooze":
		until, ok := parseISOTimestamp(strings.TrimSpace(body.SnoozeUntil))
		if !ok {
			mailErr(w, http.StatusBadRequest, "snoozeUntil required (ISO timestamp)")
			return
		}
		untilISO := until.UTC().Format(time.RFC3339Nano)
		for _, row := range rows {
			labels := applySnoozeLabels(row.Labels)
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err != nil {
				continue
			}
			_ = h.sb.From("mail_message_snoozes").Upsert(map[string]any{
				"message_id":      row.ID,
				"mail_account_id": row.MailAccountID,
				"snoozed_until":   untilISO,
			}, "message_id").Exec(r.Context(), nil)
			updated++
		}
		archive := true
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), "snooze", rows, gmail.LabelOp{Archive: &archive}, "")
	case "unsnooze":
		for _, row := range rows {
			labels := applyUnsnoozeLabels(row.Labels)
			if err := h.sb.From("mail_messages").Update(map[string]any{"labels": labels}).Eq("id", row.ID).Exec(r.Context(), nil); err != nil {
				continue
			}
			_ = h.sb.From("mail_message_snoozes").Delete().Eq("message_id", row.ID).Exec(r.Context(), nil)
			updated++
		}
		spamFalse := false
		h.mirrorBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), "unsnooze", rows, gmail.LabelOp{Spam: &spamFalse, AddLabels: []string{"INBOX"}}, "")
	case "delete_forever":
		for _, row := range rows {
			h.deleteMailMessageLocally(r.Context(), row.ID)
			updated++
		}
		h.deleteBulkAndEnqueue(r.Context(), authmw.UserIDFrom(r), rows)
	}
	mailJSON(w, http.StatusOK, map[string]any{"ok": true, "updated": updated})
}

func (h *Handler) listMessagesByCustomer(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	customerID := q.Get("customerId")
	if customerID == "" {
		mailErr(w, http.StatusBadRequest, "customerId required")
		return
	}
	box := q.Get("box")
	if box == "" {
		box = "inbox"
	}
	if box != "inbox" && box != "sent" {
		mailErr(w, http.StatusBadRequest, "box must be inbox or sent")
		return
	}
	limit := 50
	if v, err := strconv.Atoi(q.Get("limit")); err == nil {
		limit = v
	}
	if limit < 1 {
		limit = 1
	}
	if limit > 100 {
		limit = 100
	}

	userID := authmw.UserIDFrom(r)
	var customer struct {
		Email   *string `json:"email"`
		GroupID *string `json:"group_id"`
	}
	found, _ := h.sb.From("customers").Select("email,group_id").Eq("id", customerID).MaybeSingle(r.Context(), &customer)
	if !found {
		mailErr(w, http.StatusNotFound, "Customer not found")
		return
	}
	if !h.customerVisibleToUser(r.Context(), userID, customer.GroupID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}

	targetEmails := map[string]struct{}{}
	addTargetEmail(targetEmails, customer.Email)

	var contacts []struct {
		Email *string `json:"email"`
	}
	_ = h.sb.From("customer_contacts").Select("email").Eq("customer_id", customerID).Exec(r.Context(), &contacts)
	for _, c := range contacts {
		addTargetEmail(targetEmails, c.Email)
	}
	if len(targetEmails) == 0 {
		mailJSON(w, http.StatusOK, []any{})
		return
	}

	// Customer mail visibility is scoped by the caller's permission to view
	// this customer record (checked above), not by which mailboxes they own:
	// any company mailbox that exchanged mail with the customer counts.
	var rows []map[string]any
	_ = h.sb.From("mail_messages").
		Select("id,mail_account_id,thread_id,folder_id,provider_message_id,subject,from_address,from_name,to_addresses,cc_addresses,snippet,received_at,is_read,is_starred,is_sent,is_draft,has_attachments,labels").
		Eq("is_draft", "false").
		Order("received_at", false).
		Limit(800).
		Exec(r.Context(), &rows)

	out := make([]map[string]any, 0)
	for _, row := range rows {
		fromHit, toHit := customerMailHits(row, targetEmails)
		if !keepCustomerMailBox(box, fromHit, toHit) {
			continue
		}
		healHeaders(row)
		out = append(out, row)
		if len(out) >= limit {
			break
		}
	}
	mailJSON(w, http.StatusOK, out)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// customerVisibleToUser reports whether the user may view the customer record
// in this group: system/super admin, group admin of the customer's group, or
// an active member of that group. A customer with no group_id is not scoped
// to any group and stays visible to any authenticated staff member.
func (h *Handler) customerVisibleToUser(ctx context.Context, userID string, groupID *string) bool {
	if crmadmin.IsSystemAdmin(ctx, h.sb, userID) {
		return true
	}
	if groupID == nil || *groupID == "" {
		return true
	}
	gid := *groupID
	if crmadmin.IsAdminOfGroup(ctx, h.sb, userID, gid) {
		return true
	}
	var member struct {
		UserID string `json:"user_id"`
	}
	found, _ := h.sb.From("group_members").
		Select("user_id").
		Eq("group_id", gid).
		Eq("user_id", userID).
		Eq("is_active", "true").
		MaybeSingle(ctx, &member)
	return found && member.UserID != ""
}

// addTargetEmail records a non-empty mailbox in the customer-mail match set.
func addTargetEmail(dst map[string]struct{}, email *string) {
	if email == nil {
		return
	}
	e := strings.ToLower(strings.TrimSpace(*email))
	if e != "" {
		dst[e] = struct{}{}
	}
}

// customerMailHits reports whether the row is from and/or to a customer mailbox.
func customerMailHits(row map[string]any, targets map[string]struct{}) (fromHit, toHit bool) {
	if from, ok := row["from_address"].(string); ok {
		_, fromHit = targets[mailboxAddress(from)]
	}
	for _, key := range []string{"to_addresses", "cc_addresses"} {
		for _, addr := range addressEmails(row[key]) {
			if _, hit := targets[addr]; hit {
				toHit = true
				return fromHit, toHit
			}
		}
	}
	return fromHit, toHit
}

// keepCustomerMailBox keeps Sent when the recipient (To/Cc) is a customer
// mailbox, and Inbox when the sender (From) is a customer mailbox.
func keepCustomerMailBox(box string, fromHit, toHit bool) bool {
	if box == "sent" {
		return toHit
	}
	return fromHit
}

// mailboxAddress lowercases an address and strips an optional display-name wrapper.
func mailboxAddress(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.LastIndex(s, "<"); i >= 0 {
		if j := strings.Index(s[i:], ">"); j > 1 {
			s = strings.TrimSpace(s[i+1 : i+j])
		}
	}
	return strings.ToLower(s)
}

// addressEmails extracts lowercased mailboxes from a JSON address list.
func addressEmails(v any) []string {
	switch typed := v.(type) {
	case []any:
		return emailsFromAnySlice(typed)
	case []map[string]any:
		out := make([]string, 0, len(typed))
		for _, item := range typed {
			if addr := mailboxAddress(strValue(item["email"])); addr != "" {
				out = append(out, addr)
			}
		}
		return out
	case json.RawMessage:
		var parsed any
		if json.Unmarshal(typed, &parsed) == nil {
			return addressEmails(parsed)
		}
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return nil
		}
		var parsed any
		if json.Unmarshal([]byte(trimmed), &parsed) == nil {
			return addressEmails(parsed)
		}
	}
	return nil
}

// emailsFromAnySlice reads email fields from a decoded JSON array.
func emailsFromAnySlice(arr []any) []string {
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if m, ok := item.(map[string]any); ok {
			if addr := mailboxAddress(strValue(m["email"])); addr != "" {
				out = append(out, addr)
			}
		}
	}
	return out
}

// messageInAccessibleAccount reports whether the caller may read this message:
// either they own the mailbox it lives in, or the message's From/To/Cc hits a
// customer/contact email and the caller may view that customer record (same
// rule as GET /mail/messages/by-customer). The second branch is what lets the
// Customer detail Mail tab open messages that live in a teammate's mailbox
// without granting general access to that teammate's whole inbox.
func (h *Handler) messageInAccessibleAccount(ctx context.Context, userID, messageID string) bool {
	var msg struct {
		MailAccountID string `json:"mail_account_id"`
	}
	found, _ := h.sb.From("mail_messages").Select("mail_account_id").Eq("id", messageID).MaybeSingle(ctx, &msg)
	if !found {
		return false
	}
	if containsStr(h.getUserAccessibleMailAccountIDs(ctx, userID), msg.MailAccountID) {
		return true
	}
	return h.messageMatchesVisibleCustomer(ctx, userID, messageID)
}

// messageMatchesVisibleCustomer reports whether messageID's From/To/Cc hits a
// customer or customer_contacts email, and the caller may view at least one
// matching customer record (system/super admin, group admin of that
// customer's group, or an active member of that group).
func (h *Handler) messageMatchesVisibleCustomer(ctx context.Context, userID, messageID string) bool {
	var msg struct {
		FromAddress string `json:"from_address"`
		ToAddresses any    `json:"to_addresses"`
		CcAddresses any    `json:"cc_addresses"`
	}
	found, _ := h.sb.From("mail_messages").
		Select("from_address,to_addresses,cc_addresses").
		Eq("id", messageID).
		MaybeSingle(ctx, &msg)
	if !found {
		return false
	}

	emailSet := map[string]struct{}{}
	if addr := mailboxAddress(msg.FromAddress); addr != "" {
		emailSet[addr] = struct{}{}
	}
	for _, addr := range addressEmails(msg.ToAddresses) {
		emailSet[addr] = struct{}{}
	}
	for _, addr := range addressEmails(msg.CcAddresses) {
		emailSet[addr] = struct{}{}
	}
	if len(emailSet) == 0 {
		return false
	}
	emails := make([]string, 0, len(emailSet))
	for e := range emailSet {
		emails = append(emails, e)
	}

	visited := map[string]struct{}{}
	var directHits []struct {
		ID      string  `json:"id"`
		GroupID *string `json:"group_id"`
	}
	_ = h.sb.From("customers").Select("id,group_id").In("email", emails).Exec(ctx, &directHits)
	for _, c := range directHits {
		visited[c.ID] = struct{}{}
		if h.customerVisibleToUser(ctx, userID, c.GroupID) {
			return true
		}
	}

	var contactHits []struct {
		CustomerID string `json:"customer_id"`
	}
	_ = h.sb.From("customer_contacts").Select("customer_id").In("email", emails).Exec(ctx, &contactHits)
	contactCustomerIDs := make([]string, 0, len(contactHits))
	for _, c := range contactHits {
		if _, ok := visited[c.CustomerID]; ok {
			continue
		}
		visited[c.CustomerID] = struct{}{}
		contactCustomerIDs = append(contactCustomerIDs, c.CustomerID)
	}
	if len(contactCustomerIDs) == 0 {
		return false
	}
	var contactCustomers []struct {
		GroupID *string `json:"group_id"`
	}
	_ = h.sb.From("customers").Select("group_id").In("id", contactCustomerIDs).Exec(ctx, &contactCustomers)
	for _, c := range contactCustomers {
		if h.customerVisibleToUser(ctx, userID, c.GroupID) {
			return true
		}
	}
	return false
}

func toggleLabel(labels []string, label string, add bool) []string {
	out := make([]string, 0, len(labels)+1)
	present := false
	for _, l := range labels {
		if l == label {
			present = true
			if add {
				out = append(out, l)
			}
			continue
		}
		out = append(out, l)
	}
	if add && !present {
		out = append(out, label)
	}
	return out
}

// applyTrashLabels updates the label set when moving messages to trash.
func applyTrashLabels(labels []string) []string {
	labels = toggleLabel(labels, "INBOX", false)
	labels = toggleLabel(labels, "SPAM", false)
	return toggleLabel(labels, "TRASH", true)
}

func nonNilRows(rows []map[string]any) []map[string]any {
	if rows == nil {
		return []map[string]any{}
	}
	return rows
}

func nonNilRaw(rows []json.RawMessage) []json.RawMessage {
	if rows == nil {
		return []json.RawMessage{}
	}
	return rows
}
