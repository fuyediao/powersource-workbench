package mail

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/alimail"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

const accountListColumns = "id,provider,email,display_name,avatar_url,auth_type,is_primary," +
	"is_auto_linked,status,error_message,last_sync_at,historical_sync_completed_at,created_at"

func (h *Handler) addImap(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	var body struct {
		Provider    string          `json:"provider"`
		Email       string          `json:"email"`
		DisplayName *string         `json:"displayName"`
		Config      *alimail.Config `json:"config"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		mailErr(w, http.StatusBadRequest, "Missing required fields")
		return
	}
	if body.Email == "" || body.Config == nil {
		mailErr(w, http.StatusBadRequest, "Missing required fields")
		return
	}
	if !alimail.IsValidProvider(body.Provider) {
		mailErr(w, http.StatusBadRequest, "Unsupported provider. Use alibaba or imap for IMAP/SMTP accounts.")
		return
	}
	if !alimail.EncryptionKeyValid(h.env.EncryptionKey) {
		mailJSON(w, http.StatusInternalServerError, map[string]any{
			"error": "Mail worker misconfiguration", "detail": "ENCRYPTION_KEY must be a 64-character hex string (256-bit AES-GCM key).",
		})
		return
	}
	test := alimail.TestConnection(*body.Config)
	initialStatus := "active"
	var initialErr any = nil
	if !test.OK {
		initialStatus = "error"
		if test.Error != "" {
			initialErr = test.Error
		} else {
			initialErr = "Connection test failed"
		}
	}

	var account struct {
		ID string `json:"id"`
	}
	err := h.sb.From("mail_accounts").Insert(map[string]any{
		"owner_user_id": userID, "provider": body.Provider,
		"email": body.Email, "display_name": displayNamePtr(body.DisplayName),
		"auth_type": "password", "status": initialStatus, "error_message": initialErr,
	}).Returning().Select("id").Single(r.Context(), &account)
	if err != nil || account.ID == "" {
		if supabase.IsUniqueViolation(err) {
			if resp, handled := h.tryReconnectImap(w, r, userID, body.Provider, body.Email, body.DisplayName, *body.Config, initialStatus, initialErr); handled {
				_ = resp
				return
			}
			mailJSON(w, http.StatusConflict, map[string]any{
				"error": "This email is already added for your account.",
				"hint":  "The mailbox is active or syncing. Remove it first from Admin Mail before re-adding.",
			})
			return
		}
		mailJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to save mail account"})
		return
	}

	if err := h.alimail.SaveConfig(r.Context(), account.ID, *body.Config); err != nil {
		_ = h.sb.From("mail_accounts").Delete().Eq("id", account.ID).Exec(r.Context(), nil)
		mailJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to save mail credentials"})
		return
	}

	mailJSON(w, http.StatusCreated, map[string]any{
		"id": account.ID, "email": body.Email, "provider": body.Provider,
		"status": initialStatus, "connectionTestError": connTestErr(test, initialErr),
	})
}

func (h *Handler) tryReconnectImap(w http.ResponseWriter, r *http.Request, userID, provider, email string, displayName *string, cfg alimail.Config, initialStatus string, initialErr any) (bool, bool) {
	var existing struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	found, _ := h.sb.From("mail_accounts").Select("id,status").Eq("owner_user_id", userID).Eq("email", email).MaybeSingle(r.Context(), &existing)
	if !found || (existing.Status != "error" && existing.Status != "disconnected") {
		return false, false
	}
	if err := h.sb.From("mail_accounts").Update(map[string]any{
		"provider": provider, "display_name": displayNamePtr(displayName), "status": initialStatus, "error_message": initialErr,
	}).Eq("id", existing.ID).Exec(r.Context(), nil); err != nil {
		mailJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to reconnect mail account"})
		return false, true
	}
	if err := h.alimail.ReplaceConfig(r.Context(), existing.ID, cfg); err != nil {
		mailJSON(w, http.StatusInternalServerError, map[string]any{"error": "Failed to save mail credentials"})
		return false, true
	}
	var connErr any = nil
	if !boolFromStatus(initialStatus) {
		connErr = initialErr
	}
	mailJSON(w, http.StatusOK, map[string]any{
		"id": existing.ID, "email": email, "provider": provider, "status": initialStatus,
		"connectionTestError": connErr, "reconnected": true,
	})
	return true, true
}

func (h *Handler) listAccounts(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	ids := h.getUserAccessibleMailAccountIDs(r.Context(), userID)
	if len(ids) == 0 {
		mailJSON(w, http.StatusOK, []any{})
		return
	}
	var out []json.RawMessage
	if err := h.sb.From("mail_accounts").Select(accountListColumns).In("id", ids).Neq("status", "disconnected").Order("created_at", true).Exec(r.Context(), &out); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to load accounts")
		return
	}
	mailJSON(w, http.StatusOK, out)
}

func (h *Handler) deleteAccount(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	if err := h.sb.From("mail_accounts").Delete().Eq("id", chiID(r)).Eq("owner_user_id", userID).Exec(r.Context(), nil); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to delete account")
		return
	}
	mailJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) disconnectAccount(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	accountID := chiID(r)
	var account struct {
		ID string `json:"id"`
	}
	found, _ := h.sb.From("mail_accounts").Select("id,owner_user_id").Eq("id", accountID).Eq("owner_user_id", userID).MaybeSingle(r.Context(), &account)
	if !found {
		mailErr(w, http.StatusNotFound, "Account not found")
		return
	}
	if err := h.sb.From("mail_accounts").Update(map[string]any{"status": "disconnected"}).Eq("id", accountID).Exec(r.Context(), nil); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to disconnect account")
		return
	}
	_ = h.sb.From("mail_account_secrets").Delete().Eq("mail_account_id", accountID).Exec(r.Context(), nil)
	mailJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) updateAccount(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	accountID := chiID(r)
	var body struct {
		DisplayName *string `json:"displayName"`
	}
	_ = httpx.DecodeJSON(r, &body)
	var account struct {
		ID          string `json:"id"`
		OwnerUserID string `json:"owner_user_id"`
		Provider    string `json:"provider"`
		AuthType    string `json:"auth_type"`
	}
	found, _ := h.sb.From("mail_accounts").Select("id,owner_user_id,provider,auth_type").Eq("id", accountID).MaybeSingle(r.Context(), &account)
	if !found {
		mailErr(w, http.StatusNotFound, "Account not found")
		return
	}
	if account.OwnerUserID != userID {
		mailErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	if account.Provider == "gmail" || account.AuthType == "oauth" {
		mailErr(w, http.StatusBadRequest, "Gmail account display name is managed by Google and cannot be edited here.")
		return
	}
	var displayName any = nil
	if body.DisplayName != nil {
		if t := strings.TrimSpace(*body.DisplayName); t != "" {
			if len(t) > 120 {
				t = t[:120]
			}
			displayName = t
		}
	}
	if err := h.sb.From("mail_accounts").Update(map[string]any{"display_name": displayName}).Eq("id", accountID).Eq("owner_user_id", userID).Exec(r.Context(), nil); err != nil {
		mailErr(w, http.StatusBadRequest, "Failed to update account profile")
		return
	}
	mailJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) testAccount(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	accountID := chiID(r)
	var account struct {
		ID       string `json:"id"`
		AuthType string `json:"auth_type"`
		Status   string `json:"status"`
	}
	found, _ := h.sb.From("mail_accounts").Select("id,owner_user_id,auth_type,status").Eq("id", accountID).Eq("owner_user_id", userID).MaybeSingle(r.Context(), &account)
	if !found {
		mailErr(w, http.StatusNotFound, "Account not found")
		return
	}
	if account.AuthType == "oauth" {
		if _, err := h.gmail.GetAccessToken(r.Context(), accountID); err != nil {
			_ = h.sb.From("mail_accounts").Update(map[string]any{"status": "reauth_required"}).Eq("id", accountID).Exec(r.Context(), nil)
			mailJSON(w, http.StatusOK, map[string]any{"ok": false, "error": "Token refresh failed — re-authentication required"})
			return
		}
		mailJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	result := h.alimail.TestAccount(r.Context(), accountID)
	if !result.OK {
		_ = h.sb.From("mail_accounts").Update(map[string]any{"status": "error", "error_message": result.Error}).Eq("id", accountID).Exec(r.Context(), nil)
	} else {
		_ = h.sb.From("mail_accounts").Update(map[string]any{"status": "active", "error_message": nil}).Eq("id", accountID).Exec(r.Context(), nil)
	}
	mailJSON(w, http.StatusOK, map[string]any{"ok": result.OK, "error": nilIfEmpty(result.Error)})
}

func displayNamePtr(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func connTestErr(test alimail.TestResult, initialErr any) any {
	if test.OK {
		return nil
	}
	return initialErr
}

func boolFromStatus(status string) bool { return status == "active" }
