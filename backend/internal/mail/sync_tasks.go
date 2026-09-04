package mail

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
)

// listSyncTasks returns pending_remote / failed mail_sync_tasks for accounts
// the caller can access (Outbox surface for Electron).
//
// Query: status (comma list, default pending_remote,failed), accountId, limit (max 100).
func (h *Handler) listSyncTasks(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	accessible := h.getUserAccessibleMailAccountIDs(r.Context(), userID)
	if len(accessible) == 0 {
		mailJSON(w, http.StatusOK, map[string]any{"items": []any{}, "total": 0})
		return
	}

	accountFilter := strings.TrimSpace(r.URL.Query().Get("accountId"))
	if accountFilter != "" {
		if !containsStr(accessible, accountFilter) {
			mailErr(w, http.StatusForbidden, "Access denied")
			return
		}
		accessible = []string{accountFilter}
	}

	statusParam := strings.TrimSpace(r.URL.Query().Get("status"))
	if statusParam == "" {
		statusParam = "pending_remote,failed"
	}
	statuses := make([]string, 0, 4)
	for _, part := range strings.Split(statusParam, ",") {
		s := strings.TrimSpace(part)
		switch s {
		case "pending_remote", "failed", "done", "cancelled":
			statuses = append(statuses, s)
		}
	}
	if len(statuses) == 0 {
		statuses = []string{"pending_remote", "failed"}
	}

	limit := 50
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > 100 {
		limit = 100
	}

	var rows []struct {
		ID            string          `json:"id"`
		MailAccountID string          `json:"mail_account_id"`
		Kind          string          `json:"kind"`
		Payload       json.RawMessage `json:"payload"`
		Status        string          `json:"status"`
		Attempts      int             `json:"attempts"`
		ErrorMessage  *string         `json:"error_message"`
		CreatedAt     string          `json:"created_at"`
		UpdatedAt     string          `json:"updated_at"`
	}
	q := h.sb.From("mail_sync_tasks").
		Select("id,mail_account_id,kind,payload,status,attempts,error_message,created_at,updated_at").
		In("mail_account_id", accessible).
		In("status", statuses).
		Order("created_at", false).
		Limit(limit)
	if err := q.Exec(r.Context(), &rows); err != nil {
		mailErr(w, http.StatusInternalServerError, "Failed to list sync tasks")
		return
	}

	sendJobIDs := make([]string, 0)
	for _, row := range rows {
		if row.Kind != "send" {
			continue
		}
		var payload syncTaskPayload
		_ = json.Unmarshal(row.Payload, &payload)
		if payload.SendJobID != "" {
			sendJobIDs = append(sendJobIDs, payload.SendJobID)
		}
	}
	subjects := map[string]string{}
	if len(sendJobIDs) > 0 {
		var jobs []struct {
			ID      string `json:"id"`
			Subject string `json:"subject"`
		}
		_ = h.sb.From("mail_send_jobs").Select("id,subject").In("id", sendJobIDs).Exec(r.Context(), &jobs)
		for _, job := range jobs {
			subjects[job.ID] = job.Subject
		}
	}

	items := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		var payload syncTaskPayload
		_ = json.Unmarshal(row.Payload, &payload)
		item := map[string]any{
			"id":            row.ID,
			"mailAccountId": row.MailAccountID,
			"kind":          row.Kind,
			"status":        row.Status,
			"attempts":      row.Attempts,
			"errorMessage":  row.ErrorMessage,
			"createdAt":     row.CreatedAt,
			"updatedAt":     row.UpdatedAt,
			"messageCount":  len(payload.MessageIDs),
			"label":         nilIfEmpty(payload.Label),
			"sendJobId":     nilIfEmpty(payload.SendJobID),
		}
		if payload.SendJobID != "" {
			if subj, ok := subjects[payload.SendJobID]; ok {
				item["subject"] = subj
			}
		}
		items = append(items, item)
	}
	mailJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}
