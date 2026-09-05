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
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/oajwt"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Handler serves /auth/* routes.
type Handler struct {
	jwtSecret []byte
	oaURL     string
	sb        *supabase.Client
}

type workProfile struct {
	ID          string `json:"id"`
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

// SessionSecret returns the HMAC key for OA employee sessions.
func SessionSecret(env config.Env) []byte {
	secret := []byte(strings.TrimSpace(env.EncryptionKey))
	if len(secret) == 0 {
		secret = []byte(strings.TrimSpace(env.JWTSecret))
	}
	return secret
}

// New constructs an auth handler.
func New(sb *supabase.Client, env config.Env) *Handler {
	oaURL := strings.TrimSpace(env.OAVerifyURL)
	if oaURL == "" {
		oaURL = "http://61.29.250.144:86/"
	}
	return &Handler{jwtSecret: SessionSecret(env), oaURL: oaURL, sb: sb}
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
	username := NormalizeUsername(body.Username)
	if !ValidUsername(username) {
		httpx.WriteCode(w, http.StatusBadRequest, "invalid_username")
		return
	}
	if strings.TrimSpace(body.Password) == "" {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	profile, err := h.loadProfileByUsername(r.Context(), username)
	if err != nil {
		writeSupabase(w, err, "internal_error")
		return
	}
	if profile != nil && IsPlatformAdmin(profile.Role) {
		if profile.Status == "disabled" {
			httpx.WriteCode(w, http.StatusForbidden, "account_disabled")
			return
		}
		h.loginLocalAdmin(w, r, *profile, body.Password)
		return
	}
	h.loginOAEmployee(w, username, body.Password)
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
	if oajwt.IsRefreshToken(body.RefreshToken) {
		h.refreshOAEmployee(w, body.RefreshToken)
		return
	}
	session, err := h.sb.RefreshSession(r.Context(), body.RefreshToken)
	if err != nil {
		writeSupabase(w, err, "invalid_session")
		return
	}
	if session == nil || session.User == nil || session.User.ID == "" {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_session")
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
		if _, err := oajwt.ParseAccess(h.jwtSecret, token); err == nil {
			httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
			return
		}
		_ = h.sb.Logout(r.Context(), token)
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Me handles GET /auth/me.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	if claims, ok := h.oaAccess(r); ok {
		httpx.WriteJSON(w, http.StatusOK, oaPublicUser(claims.Subject))
		return
	}
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
	}).Exec(r.Context(), nil)
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

func (h *Handler) loginLocalAdmin(w http.ResponseWriter, r *http.Request, profile workProfile, password string) {
	authUser, err := h.sb.GetAdminUser(r.Context(), profile.ID)
	if err != nil || authUser == nil || strings.TrimSpace(authUser.Email) == "" {
		writeSupabase(w, err, "internal_error")
		return
	}
	session, err := h.sb.SignInPassword(r.Context(), authUser.Email, password)
	if err != nil {
		writeSupabase(w, err, "invalid_credentials")
		return
	}
	if session == nil || session.User == nil || session.User.ID == "" {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	writeSession(w, session, profile)
}

func (h *Handler) loginOAEmployee(w http.ResponseWriter, username, password string) {
	ok, err := VerifyOA(h.oaURL, username, password)
	if err != nil {
		httpx.WriteCode(w, http.StatusServiceUnavailable, "network_error")
		return
	}
	if !ok {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_credentials")
		return
	}
	h.writeOASession(w, username)
}

func (h *Handler) refreshOAEmployee(w http.ResponseWriter, refreshToken string) {
	claims, err := oajwt.ParseRefresh(h.jwtSecret, refreshToken)
	if err != nil {
		httpx.WriteCode(w, http.StatusUnauthorized, "invalid_session")
		return
	}
	h.writeOASession(w, claims.Subject)
}

func (h *Handler) writeOASession(w http.ResponseWriter, username string) {
	pair, err := oajwt.IssuePair(h.jwtSecret, username)
	if err != nil {
		httpx.WriteCode(w, http.StatusInternalServerError, "internal_error")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, sessionResponse{
		AccessToken:  pair.AccessToken,
		RefreshToken: pair.RefreshToken,
		ExpiresIn:    pair.ExpiresIn,
		User:         oaPublicUser(username),
	})
}

func (h *Handler) oaAccess(r *http.Request) (*oajwt.Claims, bool) {
	claims, err := oajwt.ParseAccess(h.jwtSecret, httpx.BearerToken(r))
	if err != nil {
		return nil, false
	}
	return claims, true
}

func oaPublicUser(username string) publicUser {
	return publicUser{
		ID:          oajwt.UserID(username),
		Username:    username,
		DisplayName: username,
		Role:        "member",
	}
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
		Select("id,username,display_name,role,status").
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

func (h *Handler) loadProfileByUsername(ctx context.Context, username string) (*workProfile, error) {
	var profile workProfile
	found, err := h.sb.From("work_profiles").
		Select("id,username,display_name,role,status").
		Eq("username", username).
		MaybeSingle(ctx, &profile)
	if err != nil {
		return nil, err
	}
	if !found {
		return nil, nil
	}
	return &profile, nil
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
