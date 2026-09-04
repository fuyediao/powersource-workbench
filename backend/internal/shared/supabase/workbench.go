package supabase

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
)

// New builds a service-role client. Prefer NewService when SUPABASE_PUBLIC_URL
// is set so OAuth redirects and public object URLs use the browser origin.
func New(baseURL, anonKey, serviceKey string) *Client {
	return NewService(baseURL, "", serviceKey, anonKey)
}

// SignInPassword performs a GoTrue password grant with the publishable key.
func (c *Client) SignInPassword(ctx context.Context, email, password string) (*Session, error) {
	return c.AuthSignInPassword(ctx, email, password)
}

// RefreshSession exchanges a refresh token for a new session.
func (c *Client) RefreshSession(ctx context.Context, refreshToken string) (*Session, error) {
	payload, err := json.Marshal(map[string]string{"refresh_token": refreshToken})
	if err != nil {
		return nil, err
	}
	body, err := c.authRequest(ctx, http.MethodPost, "/auth/v1/token?grant_type=refresh_token", c.anonKey, "", payload)
	if err != nil {
		return nil, err
	}
	var session Session
	if err := json.Unmarshal(body, &session); err != nil {
		return nil, err
	}
	if session.AccessToken == "" || session.User == nil || session.User.ID == "" {
		return nil, &APIError{Status: http.StatusUnauthorized, Code: "invalid_credentials"}
	}
	return &session, nil
}

// Logout revokes the current local GoTrue session.
func (c *Client) Logout(ctx context.Context, accessToken string) error {
	_, err := c.authRequest(ctx, http.MethodPost, "/auth/v1/logout?scope=local", c.anonKey, accessToken, []byte("{}"))
	return err
}

// GetAdminUser loads an Auth user by id. The email field is only used to
// complete GoTrue's password grant; Workbench never treats it as a login id.
func (c *Client) GetAdminUser(ctx context.Context, userID string) (*User, error) {
	body, err := c.AuthAdminGetUser(ctx, url.PathEscape(userID))
	if err != nil {
		return nil, err
	}
	var user User
	if err := json.Unmarshal(body, &user); err != nil || user.ID == "" {
		return nil, &APIError{Status: http.StatusNotFound, Code: "invalid_credentials"}
	}
	return &user, nil
}
