package mail

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// sidebarCountLabels are virtual mailbox rows shown in the mail sidebar.
var sidebarCountLabels = []string{
	"IMPORTANT",
	"INBOX",
	"DRAFT",
	"SENT",
	"ALL_MAIL",
	"SPAM",
	"TRASH",
	"ARCHIVE",
	"UNREAD",
	"STARRED",
	"SNOOZED",
	"ALI_IMPORTANT",
	"ALI_FOLLOWUP",
	"ALI_COMPLETED",
}

func (h *Handler) folderCounts(w http.ResponseWriter, r *http.Request) {
	accountID := r.URL.Query().Get("accountId")
	if accountID == "" {
		mailErr(w, http.StatusBadRequest, "accountId required")
		return
	}
	userID := authmw.UserIDFrom(r)
	if !containsStr(h.getUserAccessibleMailAccountIDs(r.Context(), userID), accountID) {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}

	counts := h.countSidebarLabels(r.Context(), accountID)
	labelCounts := h.countGmailUserLabelCounts(r.Context(), accountID)
	folderIDCounts := h.countCustomFolderCounts(r.Context(), accountID)

	mailJSON(w, http.StatusOK, map[string]any{
		"counts":         counts,
		"labelCounts":    labelCounts,
		"folderIdCounts": folderIDCounts,
	})
}

func (h *Handler) countSidebarLabels(ctx context.Context, accountID string) map[string]int {
	out := make(map[string]int, len(sidebarCountLabels))
	for _, label := range sidebarCountLabels {
		out[label] = h.countMessagesForSidebarLabel(ctx, accountID, label)
	}
	return out
}

func (h *Handler) countMessagesForSidebarLabel(ctx context.Context, accountID, label string) int {
	q := h.sb.From("mail_messages").
		Select("id").
		Eq("mail_account_id", accountID)
	q = applySidebarCountFilter(q, label)
	var rows []json.RawMessage
	total, err := q.Limit(1).ExecWithCount(ctx, &rows)
	if err != nil {
		return 0
	}
	return total
}

func applySidebarCountFilter(q *supabase.Query, label string) *supabase.Query {
	switch label {
	case "ALL_MAIL":
		q = q.Not("labels", "cs.{TRASH}").Not("labels", "cs.{SPAM}")
	default:
		up := strings.ToUpper(label)
		if virtualLabels[up] {
			q = applyVirtualLabel(q, up)
		} else {
			// Gmail user label ids (e.g. Label_123) are not virtual mailbox rows.
			q = q.Contains("labels", "{"+label+"}")
		}
	}
	return applySidebarUnreadFilter(q, label)
}

// applySidebarUnreadFilter scopes sidebar badges to unread messages. Virtual rows
// that already encode read state (UNREAD, ALI_FOLLOWUP, ALI_COMPLETED) are left
// as-is; drafts count unread draft rows only.
func applySidebarUnreadFilter(q *supabase.Query, label string) *supabase.Query {
	switch label {
	case "UNREAD", "ALI_FOLLOWUP", "ALI_COMPLETED":
		return q
	case "DRAFT":
		return q.Eq("is_read", "false")
	default:
		return q.Eq("is_read", "false").Eq("is_draft", "false")
	}
}

func (h *Handler) countGmailUserLabelCounts(ctx context.Context, accountID string) map[string]int {
	var account struct {
		Provider string `json:"provider"`
		Status   string `json:"status"`
	}
	found, _ := h.sb.From("mail_accounts").Select("id,provider,status").Eq("id", accountID).MaybeSingle(ctx, &account)
	if !found || account.Provider != "gmail" || account.Status != "active" {
		return map[string]int{}
	}
	labels, err := h.gmail.ListLabels(ctx, accountID)
	if err != nil {
		return map[string]int{}
	}
	out := make(map[string]int)
	for _, l := range labels {
		if l.Type != "user" {
			continue
		}
		out[l.ID] = h.countMessagesForSidebarLabel(ctx, accountID, l.ID)
	}
	return out
}

func (h *Handler) countCustomFolderCounts(ctx context.Context, accountID string) map[string]int {
	var folders []struct {
		ID string `json:"id"`
	}
	if err := h.sb.From("mail_folders").
		Select("id").
		Eq("mail_account_id", accountID).
		Exec(ctx, &folders); err != nil {
		return map[string]int{}
	}
	out := make(map[string]int, len(folders))
	for _, folder := range folders {
		var rows []json.RawMessage
		total, err := h.sb.From("mail_messages").
			Select("id").
			Eq("mail_account_id", accountID).
			Eq("folder_id", folder.ID).
			Eq("is_read", "false").
			Limit(1).
			ExecWithCount(ctx, &rows)
		if err != nil || total <= 0 {
			continue
		}
		out[folder.ID] = total
	}
	return out
}
