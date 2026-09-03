// Package supabase is a small GoTrue + PostgREST client for workbench-api.
package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client talks to Supabase Auth and PostgREST with the service role for data
// writes and the publishable key for password grants.
type Client struct {
	baseURL    string
	anonKey    string
	serviceKey string
	httpc      *http.Client
}

// APIError is a non-2xx Auth or PostgREST response.
type APIError struct {
	Status  int
	Code    string
	Message string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("supabase status %d", e.Status)
}

// Session is the GoTrue token payload returned to the desktop.
type Session struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
	User         User   `json:"user"`
}

// User is the subset of a GoTrue user needed for Workbench login.
type User struct {
	ID          string         `json:"id"`
	Email       string         `json:"email"`
	AppMetadata map[string]any `json:"app_metadata"`
}

// New builds a server-side Supabase client.
func New(baseURL, anonKey, serviceKey string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		anonKey:    anonKey,
		serviceKey: serviceKey,
		httpc:      &http.Client{Timeout: 30 * time.Second},
	}
}

// SignInPassword performs a GoTrue password grant with the publishable key.
func (c *Client) SignInPassword(ctx context.Context, email, password string) (*Session, error) {
	return c.token(ctx, map[string]string{"email": email, "password": password}, "password", c.anonKey)
}

// RefreshSession exchanges a refresh token for a new session.
func (c *Client) RefreshSession(ctx context.Context, refreshToken string) (*Session, error) {
	return c.token(ctx, map[string]string{"refresh_token": refreshToken}, "refresh_token", c.anonKey)
}

func (c *Client) token(ctx context.Context, payload any, grant, apiKey string) (*Session, error) {
	body, err := c.doJSON(ctx, http.MethodPost, "/auth/v1/token?grant_type="+grant, apiKey, "", payload)
	if err != nil {
		return nil, err
	}
	var session Session
	if err := json.Unmarshal(body, &session); err != nil {
		return nil, err
	}
	if session.AccessToken == "" || session.User.ID == "" {
		return nil, &APIError{Status: http.StatusUnauthorized, Code: "invalid_credentials"}
	}
	return &session, nil
}

// Logout revokes the current local GoTrue session.
func (c *Client) Logout(ctx context.Context, accessToken string) error {
	_, err := c.doJSON(ctx, http.MethodPost, "/auth/v1/logout?scope=local", c.anonKey, accessToken, map[string]string{})
	return err
}

// GetUser validates a user access token against GoTrue.
func (c *Client) GetUser(ctx context.Context, accessToken string) (*User, error) {
	body, err := c.doJSON(ctx, http.MethodGet, "/auth/v1/user", c.serviceKey, accessToken, nil)
	if err != nil {
		return nil, err
	}
	var user User
	if err := json.Unmarshal(body, &user); err != nil || user.ID == "" {
		return nil, &APIError{Status: http.StatusUnauthorized, Code: "invalid_session"}
	}
	return &user, nil
}

// GetAdminUser loads an Auth user by id. The email field is only used to
// complete GoTrue's password grant; Workbench never treats it as a login id.
func (c *Client) GetAdminUser(ctx context.Context, userID string) (*User, error) {
	body, err := c.doJSON(ctx, http.MethodGet, "/auth/v1/admin/users/"+url.PathEscape(userID), c.serviceKey, c.serviceKey, nil)
	if err != nil {
		return nil, err
	}
	var user User
	if err := json.Unmarshal(body, &user); err != nil || user.ID == "" {
		return nil, &APIError{Status: http.StatusNotFound, Code: "invalid_credentials"}
	}
	return &user, nil
}

func (c *Client) doJSON(ctx context.Context, method, path, apiKey, bearer string, payload any) ([]byte, error) {
	var reader io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", apiKey)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	} else {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, parseAPIError(resp.StatusCode, body)
	}
	return body, nil
}

func parseAPIError(status int, body []byte) *APIError {
	var obj struct {
		Code             string `json:"code"`
		Error            string `json:"error"`
		ErrorCode        string `json:"error_code"`
		ErrorDescription string `json:"error_description"`
		Message          string `json:"message"`
	}
	_ = json.Unmarshal(body, &obj)
	code := obj.Code
	if code == "" {
		code = obj.ErrorCode
	}
	if code == "" {
		code = obj.Error
	}
	if status == http.StatusUnauthorized || code == "invalid_grant" {
		code = "invalid_credentials"
	}
	msg := obj.Message
	if msg == "" {
		msg = obj.ErrorDescription
	}
	return &APIError{Status: status, Code: code, Message: msg}
}

// Query is a small PostgREST builder used with the service role.
type Query struct {
	c      *Client
	table  string
	method string
	params url.Values
	body   []byte
	prefer []string
	err    error
}

// From starts a PostgREST query.
func (c *Client) From(table string) *Query {
	return &Query{c: c, table: table, method: http.MethodGet, params: url.Values{}}
}

// Select sets the column list.
func (q *Query) Select(columns string) *Query {
	q.params.Set("select", columns)
	return q
}

// Eq adds an equality filter.
func (q *Query) Eq(column, value string) *Query {
	q.params.Add(column, "eq."+value)
	return q
}

// Insert POSTs rows.
func (q *Query) Insert(rows any) *Query {
	q.method = http.MethodPost
	q.encode(rows)
	q.prefer = append(q.prefer, "return=minimal")
	return q
}

// Upsert POSTs with merge-duplicates on the primary key.
func (q *Query) Upsert(rows any, onConflict string) *Query {
	q.method = http.MethodPost
	q.prefer = append(q.prefer, "resolution=merge-duplicates", "return=minimal")
	if onConflict != "" {
		q.params.Set("on_conflict", onConflict)
	}
	q.encode(rows)
	return q
}

func (q *Query) encode(v any) {
	raw, err := json.Marshal(v)
	if err != nil {
		q.err = err
		return
	}
	q.body = raw
}

// MaybeSingle returns at most one row.
func (q *Query) MaybeSingle(ctx context.Context, dest any) (bool, error) {
	body, err := q.do(ctx)
	if err != nil {
		return false, err
	}
	var rows []json.RawMessage
	if err := json.Unmarshal(body, &rows); err != nil {
		return false, err
	}
	if len(rows) == 0 {
		return false, nil
	}
	if dest != nil {
		if err := json.Unmarshal(rows[0], dest); err != nil {
			return false, err
		}
	}
	return true, nil
}

// Exec runs the query and discards the body.
func (q *Query) Exec(ctx context.Context) error {
	_, err := q.do(ctx)
	return err
}

func (q *Query) do(ctx context.Context) ([]byte, error) {
	if q.err != nil {
		return nil, q.err
	}
	endpoint := q.c.baseURL + "/rest/v1/" + q.table
	if encoded := q.params.Encode(); encoded != "" {
		endpoint += "?" + encoded
	}
	var reader io.Reader
	if q.body != nil {
		reader = bytes.NewReader(q.body)
	}
	req, err := http.NewRequestWithContext(ctx, q.method, endpoint, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", q.c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+q.c.serviceKey)
	req.Header.Set("Accept", "application/json")
	if q.body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, prefer := range q.prefer {
		req.Header.Add("Prefer", prefer)
	}
	resp, err := q.c.httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, parseAPIError(resp.StatusCode, body)
	}
	return body, nil
}
