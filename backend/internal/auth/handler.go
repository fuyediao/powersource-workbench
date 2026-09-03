// Package auth implements Workbench login through Go and invitation creation.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Handler serves /auth/* routes.
type Handler struct {
	env config.Env
	sb  *supabase.Client
}

type workProfile struct {
	DisplayName string `json:"display_name"`
	Role        string `json:"role"`
	Status      string `json:"status"`
	Username    string `json:"username"`
}

type publicUser struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
}

type sessionResponse struct {
	AccessToken  string     `json:"accessToken"`
	RefreshToken string     `json:"refreshToken"`
	ExpiresIn    int        `json:"expiresIn"`
	User         publicUser `json:"user"`
}

// New constructs an auth handler.
func New(env config.Env, sb *supabase.Client) *Handler {
	return &Handler{env: env, sb: sb}
}

// Login handles POST /auth/login.
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
		Username string `json:"username"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteCode(w, http.StatusBadRequest, "invalid_username")
		return
	}
	email, code := ResolveSignInEmail(body.Username, h.env.SuperAdminEmail, h.env.AccountEmailDomain)
	if code != "" {
		httpx.WriteCode(w, http.StatusBadRequest, code)
		return
	}
	if strings.TrimSpace(body.Password) == "" {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	session, err := h.sb.SignInPassword(r.Context(), email, body.Password)
	if err != nil {
		writeSupabase(w, err, "invalid_credentials")
		return
	}
	profile, err := h.ensureProfile(r.Context(), session.User)
	if err != nil {
		writeSupabase(w, err, "internal_error")
		return
	}
	if profile == nil {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	if profile.Status == "disabled" {
		httpx.WriteCode(w, http.StatusForbidden, "account_disabled")
		return
	}
	writeSession(w, session, *profile)
}

// Refresh handles POST /auth/refresh.
func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil || strings.TrimSpace(body.RefreshToken) == "" {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_session")
		return
	}
	session, err := h.sb.RefreshSession(r.Context(), body.RefreshToken)
	if err != nil {
		writeSupabase(w, err, "invalid_session")
		return
	}
	profile, err := h.loadProfile(r.Context(), session.User.ID)
	if err != nil {
		writeSupabase(w, err, "internal_error")
		return
	}
	if profile == nil || profile.Status == "disabled" {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_session")
		return
	}
	writeSession(w, session, *profile)
}

// Logout handles POST /auth/logout.
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	token := httpx.BearerToken(r)
	if token != "" {
		_ = h.sb.Logout(r.Context(), token)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Me handles GET /auth/me.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user, profile, ok := h.requireProfile(w, r)
	if !ok {
		return
	}
	httpx.WriteJSON(w, http.StatusOK, mapPublicUser(user.ID, *profile))
}

// CreateInvitation handles POST /auth/invitations.
func (h *Handler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	user, profile, ok := h.requireProfile(w, r)
	if !ok {
		return
	}
	if !IsPlatformAdmin(profile.Role) {
		httpx.WriteCode(w, http.StatusForbidden, "forbidden")
		return
	}
	var body struct {
		DisplayName string `json:"displayName"`
		Username    string `json:"username"`
	}
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteCode(w, http.StatusBadRequest, "invalid_username")
		return
	}
	username := NormalizeUsername(body.Username)
	if !ValidUsername(username) {
		httpx.WriteCode(w, http.StatusBadRequest, "invalid_username")
		return
	}
	var existing workProfile
	found, err := h.sb.From("work_profiles").Select("id").Eq("username", username).MaybeSingle(r.Context(), &existing)
	if err != nil {
		writeSupabase(w, err, "internal_error")
		return
	}
	if found {
		httpx.WriteCode(w, http.StatusConflict, "username_unavailable")
		return
	}
	code, err := newInvitationCode()
	if err != nil {
		httpx.WriteCode(w, http.StatusInternalServerError, "internal_error")
		return
	}
	expiresAt := time.Now().UTC().Add(7 * 24 * time.Hour).Format(time.RFC3339)
	err = h.sb.From("work_invitations").Insert(map[string]any{
		"created_by":   user.ID,
		"display_name": strings.TrimSpace(body.DisplayName),
		"expires_at":   expiresAt,
		"token_hash":   hashInvitationCode(code),
		"username":     username,
	}).Exec(r.Context())
	if err != nil {
		if apiErr, ok := err.(*supabase.APIError); ok && apiErr.Code == "23505" {
			httpx.WriteCode(w, http.StatusConflict, "username_unavailable")
			return
		}
		writeSupabase(w, err, "internal_error")
		return
	}
	httpx.WriteJSON(w, http.StatusCreated, map[string]string{
		"invitationCode": code,
		"expiresAt":      expiresAt,
		"username":       username,
	})
}

func (h *Handler) requireProfile(w http.ResponseWriter, r *http.Request) (*supabase.User, *workProfile, bool) {
	token := httpx.BearerToken(r)
	if token == "" {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_session")
		return nil, nil, false
	}
	user, err := h.sb.GetUser(r.Context(), token)
	if err != nil || user == nil {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_session")
		return nil, nil, false
	}
	profile, err := h.loadProfile(r.Context(), user.ID)
	if err != nil {
		writeSupabase(w, err, "internal_error")
		return nil, nil, false
	}
	if profile == nil || profile.Status == "disabled" {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_session")
		return nil, nil, false
	}
	return user, profile, true
}

func (h *Handler) loadProfile(ctx context.Context, userID string) (*workProfile, error) {
	var profile workProfile
	found, err := h.sb.From("work_profiles").
		Select("username,display_name,role,status").
		Eq("id", userID).
		MaybeSingle(ctx, &profile)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	return &profile, nil
}

func (h *Handler) ensureProfile(ctx context.Context, user supabase.User) (*workProfile, error) {
	profile, err := h.loadProfile(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	if profile != nil {
		return profile, nil
	}
	if strings.ToLower(strings.TrimSpace(user.Email)) != h.env.SuperAdminEmail {
		return nil, nil
	}
	username := UsernameFromEmail(user.Email)
	row := map[string]any{
		"id":           user.ID,
		"username":     username,
		"display_name": "Super Administrator",
		"role":         "super_admin",
		"status":       "active",
	}
	if err := h.sb.From("work_profiles").Upsert(row, "id").Exec(ctx); err != nil {
		return nil, err
	}
	metadata := user.AppMetadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	metadata["role"] = "super_admin"
	metadata["username"] = username
	metadata["display_name"] = "Super Administrator"
	if err := h.sb.PatchAppMetadata(ctx, user.ID, metadata); err != nil {
		return nil, err
	}
	return h.loadProfile(ctx, user.ID)
}

func writeSession(w http.ResponseWriter, session *supabase.Session, profile workProfile) {
	expiresIn := session.ExpiresIn
	if expiresIn <= 0 {
		expiresIn = 3600
	}
	httpx.WriteJSON(w, http.StatusOK, sessionResponse{
		AccessToken:  session.AccessToken,
		RefreshToken: session.RefreshToken,
		ExpiresIn:    expiresIn,
		User:         mapPublicUser(session.User.ID, profile),
	})
}

func mapPublicUser(id string, profile workProfile) publicUser {
	return publicUser{
		ID:          id,
		Username:    profile.Username,
		DisplayName: profile.DisplayName,
		Role:        profile.Role,
	}
}

func writeSupabase(w http.ResponseWriter, err error, fallback string) {
	if apiErr, ok := err.(*supabase.APIError); ok && apiErr.Code != "" {
		status := apiErr.Status
		if status < 400 {
			status = http.StatusInternalServerError
		}
		code := apiErr.Code
		if code == "invalid_grant" || code == "" {
			code = fallback
		}
		httpx.WriteCode(w, status, code)
		return
	}
	httpx.WriteCode(w, http.StatusInternalServerError, fallback)
}

func newInvitationCode() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return strings.TrimRight(base64.RawURLEncoding.EncodeToString(raw), "="), nil
}

func hashInvitationCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}
