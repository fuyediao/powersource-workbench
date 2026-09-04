package calendar

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/crypto"
)

var calendarScopes = strings.Join([]string{
	"https://www.googleapis.com/auth/calendar",
	"email",
	"profile",
}, " ")

// hasCalendarWriteScope reports whether the granted OAuth scope can mutate events.
func hasCalendarWriteScope(scope string) bool {
	for _, part := range strings.Fields(scope) {
		if part == "https://www.googleapis.com/auth/calendar" {
			return true
		}
	}
	return false
}

// BuildAuthURL builds the Google OAuth authorization URL for Calendar read/write.

// Tokens holds OAuth tokens from Google's token endpoint.
type Tokens struct {
	AccessToken  string
	RefreshToken string
	Scope        string
	TokenType    string
	ExpiryDate   int64
}

// UserInfo is the Google userinfo profile used to link a calendar account.
type UserInfo struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

// calendarRedirectURI returns the Calendar OAuth redirect, falling back to the
// Mail Gmail redirect only when GOOGLE_CALENDAR_REDIRECT_URI is unset (dev).
func (h *Handler) calendarRedirectURI() string {
	if strings.TrimSpace(h.env.GoogleCalendarRedirectURI) != "" {
		return h.env.GoogleCalendarRedirectURI
	}
	return h.env.GoogleRedirectURI
}

// BuildAuthURL builds the Google OAuth authorization URL for Calendar read/write.
func (h *Handler) BuildAuthURL(state, loginHint string) string {
	params := url.Values{}
	params.Set("client_id", h.env.GoogleClientID)
	params.Set("redirect_uri", h.calendarRedirectURI())
	params.Set("response_type", "code")
	params.Set("scope", calendarScopes)
	params.Set("access_type", "offline")
	params.Set("prompt", "consent")
	params.Set("state", state)
	if loginHint != "" {
		params.Set("login_hint", loginHint)
	}
	return "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
}

// ExchangeCode exchanges an OAuth authorization code for tokens.
func (h *Handler) ExchangeCode(ctx context.Context, code string) (*Tokens, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", h.env.GoogleClientID)
	form.Set("client_secret", h.env.GoogleClientSecret)
	form.Set("redirect_uri", h.calendarRedirectURI())
	form.Set("grant_type", "authorization_code")
	body, err := postForm(ctx, "https://oauth2.googleapis.com/token", form)
	if err != nil {
		return nil, fmt.Errorf("google token exchange failed: %w", err)
	}
	var data struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		Scope        string `json:"scope"`
		TokenType    string `json:"token_type"`
		ExpiresIn    int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return nil, err
	}
	return &Tokens{
		AccessToken:  data.AccessToken,
		RefreshToken: data.RefreshToken,
		Scope:        data.Scope,
		TokenType:    data.TokenType,
		ExpiryDate:   time.Now().UnixMilli() + data.ExpiresIn*1000,
	}, nil
}

func (h *Handler) refreshToken(ctx context.Context, refreshToken string) (string, int64, error) {
	form := url.Values{}
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", h.env.GoogleClientID)
	form.Set("client_secret", h.env.GoogleClientSecret)
	form.Set("grant_type", "refresh_token")
	body, err := postForm(ctx, "https://oauth2.googleapis.com/token", form)
	if err != nil {
		return "", 0, err
	}
	var data struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &data); err != nil {
		return "", 0, err
	}
	return data.AccessToken, time.Now().UnixMilli() + data.ExpiresIn*1000, nil
}

// GetUserInfo fetches the authenticated user's Google profile.
func (h *Handler) GetUserInfo(ctx context.Context, accessToken string) (*UserInfo, error) {
	var out UserInfo
	if err := googleGet(ctx, accessToken, "https://www.googleapis.com/oauth2/v3/userinfo", &out); err != nil {
		return nil, errors.New("get google user info")
	}
	return &out, nil
}

// SaveTokens encrypts and upserts the OAuth refresh token secret for an account.
func (h *Handler) SaveTokens(ctx context.Context, accountID string, tokens *Tokens) error {
	payload, err := json.Marshal(map[string]any{
		"refresh_token": tokens.RefreshToken,
		"access_token":  tokens.AccessToken,
		"expiry_date":   tokens.ExpiryDate,
	})
	if err != nil {
		return err
	}
	encrypted, err := crypto.Encrypt(string(payload), h.env.EncryptionKey)
	if err != nil {
		return err
	}
	return h.sb.From("calendar_google_account_secrets").Upsert(map[string]any{
		"account_id": accountID, "secret_type": "oauth_refresh_token", "encrypted_secret": encrypted,
	}, "account_id,secret_type").Exec(ctx, nil)
}

// GetAccessToken returns a valid Google access token for the account, refreshing if needed.
func (h *Handler) GetAccessToken(ctx context.Context, accountID string) (string, error) {
	var secret struct {
		EncryptedSecret string `json:"encrypted_secret"`
	}
	found, _ := h.sb.From("calendar_google_account_secrets").
		Select("encrypted_secret").
		Eq("account_id", accountID).
		Eq("secret_type", "oauth_refresh_token").
		MaybeSingle(ctx, &secret)
	if !found {
		return "", errors.New("No OAuth secret found")
	}
	plain, err := crypto.Decrypt(secret.EncryptedSecret, h.env.EncryptionKey)
	if err != nil {
		return "", err
	}
	var data struct {
		RefreshToken string `json:"refresh_token"`
		AccessToken  string `json:"access_token"`
		ExpiryDate   int64  `json:"expiry_date"`
	}
	if err := json.Unmarshal([]byte(plain), &data); err != nil {
		return "", err
	}
	if data.AccessToken != "" && data.ExpiryDate > time.Now().UnixMilli()+5*60*1000 {
		return data.AccessToken, nil
	}
	if data.RefreshToken == "" {
		return "", errors.New("missing refresh token")
	}
	newToken, expiry, err := h.refreshToken(ctx, data.RefreshToken)
	if err != nil {
		return "", err
	}
	updated, _ := json.Marshal(map[string]any{
		"refresh_token": data.RefreshToken, "access_token": newToken, "expiry_date": expiry,
	})
	if enc, encErr := crypto.Encrypt(string(updated), h.env.EncryptionKey); encErr == nil {
		_ = h.sb.From("calendar_google_account_secrets").
			Update(map[string]any{"encrypted_secret": enc}).
			Eq("account_id", accountID).
			Eq("secret_type", "oauth_refresh_token").
			Exec(ctx, nil)
	}
	return newToken, nil
}
