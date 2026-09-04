package gmail

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

var gmailScopes = strings.Join([]string{
	"https://www.googleapis.com/auth/gmail.readonly",
	"https://www.googleapis.com/auth/gmail.send",
	"https://www.googleapis.com/auth/gmail.modify",
	"email",
	"profile",
}, " ")

// Tokens holds the OAuth tokens returned by Google's token endpoint.
type Tokens struct {
	AccessToken  string
	RefreshToken string
	Scope        string
	TokenType    string
	ExpiryDate   int64
}

// UserInfo is the Google userinfo profile used to link a mail account.
type UserInfo struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

// BuildAuthURL builds the Google OAuth authorization URL for linking a mailbox.
func (c *Client) BuildAuthURL(state, loginHint string) string {
	params := url.Values{}
	params.Set("client_id", c.env.GoogleClientID)
	params.Set("redirect_uri", c.env.GoogleRedirectURI)
	params.Set("response_type", "code")
	params.Set("scope", gmailScopes)
	params.Set("access_type", "offline")
	params.Set("prompt", "consent")
	params.Set("state", state)
	if loginHint != "" {
		params.Set("login_hint", loginHint)
	}
	return "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode()
}

// ExchangeCode exchanges an OAuth authorization code for tokens.
func (c *Client) ExchangeCode(ctx context.Context, code string) (*Tokens, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", c.env.GoogleClientID)
	form.Set("client_secret", c.env.GoogleClientSecret)
	form.Set("redirect_uri", c.env.GoogleRedirectURI)
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

// refreshToken exchanges a refresh token for a new access token.
func (c *Client) refreshToken(ctx context.Context, refreshToken string) (string, int64, error) {
	form := url.Values{}
	form.Set("refresh_token", refreshToken)
	form.Set("client_id", c.env.GoogleClientID)
	form.Set("client_secret", c.env.GoogleClientSecret)
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
func (c *Client) GetUserInfo(ctx context.Context, accessToken string) (*UserInfo, error) {
	var out UserInfo
	if err := gmailGet(ctx, accessToken, "https://www.googleapis.com/oauth2/v3/userinfo", &out); err != nil {
		return nil, errors.New("get google user info")
	}
	return &out, nil
}

// SaveTokens encrypts and upserts the OAuth refresh/access token secret for a
// mail account (secret_type = oauth_refresh_token).
func (c *Client) SaveTokens(ctx context.Context, accountID string, tokens *Tokens) error {
	payload, err := json.Marshal(map[string]any{
		"refresh_token": tokens.RefreshToken,
		"expiry_date":   tokens.ExpiryDate,
	})
	if err != nil {
		return err
	}
	encrypted, err := crypto.Encrypt(string(payload), c.env.EncryptionKey)
	if err != nil {
		return err
	}
	return c.sb.From("mail_account_secrets").Upsert(map[string]any{
		"mail_account_id": accountID, "secret_type": "oauth_refresh_token", "encrypted_secret": encrypted,
	}, "mail_account_id").Exec(ctx, nil)
}
