// Package supabase is a minimal Supabase client for workbench-api.
//
// It wraps the PostgREST data API, the GoTrue auth user endpoint, and the
// Storage object API using the service-role key (RLS bypass), mirroring the
// subset of @supabase/supabase-js behaviour the legacy handlers rely on.
package supabase

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Client talks to a Supabase project's REST, Auth, and Storage endpoints.
type Client struct {
	baseURL    string
	browserURL string
	serviceKey string
	anonKey    string
	httpc      *http.Client
	streamHTTP *http.Client
}

// NewService builds a service-role client that bypasses RLS. It must only be
// used server-side; the service key is never exposed to clients.
//
// publicURL is the browser-facing Supabase origin (OAuth redirects, public
// object URLs). When empty, baseURL is used for both server and browser paths.
func NewService(baseURL, publicURL, serviceKey, anonKey string) *Client {
	baseURL = strings.TrimRight(baseURL, "/")
	publicURL = strings.TrimRight(publicURL, "/")
	if publicURL == "" {
		publicURL = baseURL
	}
	return &Client{
		baseURL:    baseURL,
		browserURL: publicURL,
		serviceKey: serviceKey,
		anonKey:    anonKey,
		httpc:      &http.Client{Timeout: 30 * time.Second},
		// Installer streams can legitimately run for many minutes. Request
		// cancellation still propagates through the request context.
		streamHTTP: &http.Client{},
	}
}

// APIError is returned for non-2xx PostgREST/Storage responses.
type APIError struct {
	Status  int
	Message string
	Code    string
	Body    string
}

// Error implements the error interface.
func (e *APIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("supabase: status %d: %s", e.Status, e.Message)
	}
	return fmt.Sprintf("supabase: status %d: %s", e.Status, e.Body)
}

// newAPIError parses a PostgREST/GoTrue error body into an *APIError.
func newAPIError(status int, body []byte) *APIError {
	return &APIError{Status: status, Message: extractMessage(body), Code: extractCode(body), Body: string(body)}
}

// IsUniqueViolation reports whether err is a Postgres unique-constraint
// violation (SQLSTATE 23505), matching the legacy isUniqueViolation check.
func IsUniqueViolation(err error) bool {
	apiErr, ok := errors.AsType[*APIError](err)
	if !ok {
		return false
	}
	if apiErr.Code == "23505" {
		return true
	}
	body := strings.ToLower(apiErr.Body)
	return strings.Contains(body, "duplicate") || strings.Contains(body, "unique")
}

// ── PostgREST query builder ──────────────────────────────────────────────────

// Query is a chainable PostgREST request builder.
type Query struct {
	c      *Client
	table  string
	method string
	params url.Values
	body   []byte
	prefer []string
	accept string
	err    error
}

// From starts a query against the given table.
func (c *Client) From(table string) *Query {
	return &Query{
		c:      c,
		table:  table,
		method: http.MethodGet,
		params: url.Values{},
		accept: "application/json",
	}
}

// Select sets the column projection (PostgREST `select`).
func (q *Query) Select(columns string) *Query {
	q.params.Set("select", columns)
	return q
}

// Eq adds an equality filter.
func (q *Query) Eq(column, value string) *Query {
	q.params.Add(column, "eq."+value)
	return q
}

// Neq adds an inequality filter.
func (q *Query) Neq(column, value string) *Query {
	q.params.Add(column, "neq."+value)
	return q
}

// Gt adds a greater-than filter.
func (q *Query) Gt(column, value string) *Query {
	q.params.Add(column, "gt."+value)
	return q
}

// Gte adds a greater-than-or-equal filter.
func (q *Query) Gte(column, value string) *Query {
	q.params.Add(column, "gte."+value)
	return q
}

// Lt adds a less-than filter.
func (q *Query) Lt(column, value string) *Query {
	q.params.Add(column, "lt."+value)
	return q
}

// Lte adds a less-than-or-equal filter.
func (q *Query) Lte(column, value string) *Query {
	q.params.Add(column, "lte."+value)
	return q
}

// Is adds an `is` filter (e.g. value "null", "true", "false").
func (q *Query) Is(column, value string) *Query {
	q.params.Add(column, "is."+value)
	return q
}

// Not adds a negated filter, e.g. Not("tracking_number", "is.null").
func (q *Query) Not(column, operatorValue string) *Query {
	q.params.Add(column, "not."+operatorValue)
	return q
}

// Like adds a case-sensitive pattern filter.
func (q *Query) Like(column, pattern string) *Query {
	q.params.Add(column, "like."+pattern)
	return q
}

// Ilike adds a case-insensitive pattern filter.
func (q *Query) Ilike(column, pattern string) *Query {
	q.params.Add(column, "ilike."+pattern)
	return q
}

// In adds an `in` filter for the provided values.
func (q *Query) In(column string, values []string) *Query {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = `"` + strings.ReplaceAll(v, `"`, `\"`) + `"`
	}
	q.params.Add(column, "in.("+strings.Join(quoted, ",")+")")
	return q
}

// Contains adds a `cs` (contains) filter, used for array/json columns.
func (q *Query) Contains(column, value string) *Query {
	q.params.Add(column, "cs."+value)
	return q
}

// Or adds an `or` filter group, e.g. Or("a.eq.1,b.eq.2").
func (q *Query) Or(expr string) *Query {
	q.params.Add("or", "("+expr+")")
	return q
}

// Order appends an ordering clause.
func (q *Query) Order(column string, ascending bool) *Query {
	dir := "desc"
	if ascending {
		dir = "asc"
	}
	clause := column + "." + dir
	if existing := q.params.Get("order"); existing != "" {
		clause = existing + "," + clause
	}
	q.params.Set("order", clause)
	return q
}

// OrderNullsLast appends an ordering clause that explicitly places NULLs
// last. Postgres defaults to NULLS FIRST for descending order, which is the
// opposite of what "pin active rows first" sorting needs, so callers that
// want non-null values ahead of nulls in a descending sort must use this
// instead of Order.
func (q *Query) OrderNullsLast(column string, ascending bool) *Query {
	dir := "desc"
	if ascending {
		dir = "asc"
	}
	clause := column + "." + dir + ".nullslast"
	if existing := q.params.Get("order"); existing != "" {
		clause = existing + "," + clause
	}
	q.params.Set("order", clause)
	return q
}

// Limit caps the number of returned rows.
func (q *Query) Limit(n int) *Query {
	q.params.Set("limit", strconv.Itoa(n))
	return q
}

// Offset skips the first n rows.
func (q *Query) Offset(n int) *Query {
	q.params.Set("offset", strconv.Itoa(n))
	return q
}

// Prefer appends a Prefer header value.
func (q *Query) Prefer(value string) *Query {
	q.prefer = append(q.prefer, value)
	return q
}

// Insert sets the request to POST the given rows.
func (q *Query) Insert(rows any) *Query {
	q.method = http.MethodPost
	q.encodeBody(rows)
	return q
}

// Upsert sets the request to POST with merge-duplicates resolution.
func (q *Query) Upsert(rows any, onConflict string) *Query {
	q.method = http.MethodPost
	q.prefer = append(q.prefer, "resolution=merge-duplicates")
	if onConflict != "" {
		q.params.Set("on_conflict", onConflict)
	}
	q.encodeBody(rows)
	return q
}

// Update sets the request to PATCH the matched rows with the given values.
func (q *Query) Update(values any) *Query {
	q.method = http.MethodPatch
	q.encodeBody(values)
	return q
}

// Delete sets the request to DELETE the matched rows.
func (q *Query) Delete() *Query {
	q.method = http.MethodDelete
	return q
}

// Returning requests that the affected rows be returned (return=representation).
func (q *Query) Returning() *Query {
	q.prefer = append(q.prefer, "return=representation")
	return q
}

func (q *Query) encodeBody(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		q.err = err
		return
	}
	q.body = b
}

// Exec runs the query and decodes the JSON array response into dest (which may
// be nil to discard the body).
func (q *Query) Exec(ctx context.Context, dest any) error {
	body, _, err := q.do(ctx)
	if err != nil {
		return err
	}
	if dest == nil || len(body) == 0 {
		return nil
	}
	return json.Unmarshal(body, dest)
}

// Single runs the query expecting exactly one row, decoding it into dest.
func (q *Query) Single(ctx context.Context, dest any) error {
	q.accept = "application/vnd.pgrst.object+json"
	body, _, err := q.do(ctx)
	if err != nil {
		return err
	}
	if dest == nil || len(body) == 0 {
		return nil
	}
	return json.Unmarshal(body, dest)
}

// MaybeSingle runs the query returning at most one row. found is false when no
// row matched; dest is left untouched in that case.
func (q *Query) MaybeSingle(ctx context.Context, dest any) (found bool, err error) {
	body, _, err := q.do(ctx)
	if err != nil {
		return false, err
	}
	var raw []json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return false, err
	}
	if len(raw) == 0 {
		return false, nil
	}
	if dest != nil {
		if err := json.Unmarshal(raw[0], dest); err != nil {
			return false, err
		}
	}
	return true, nil
}

// ExecWithCount runs the query requesting an exact count and decodes rows into
// dest. The total count is parsed from the Content-Range header.
func (q *Query) ExecWithCount(ctx context.Context, dest any) (int, error) {
	q.prefer = append(q.prefer, "count=exact")
	body, header, err := q.do(ctx)
	if err != nil {
		return 0, err
	}
	if dest != nil && len(body) > 0 {
		if err := json.Unmarshal(body, dest); err != nil {
			return 0, err
		}
	}
	return parseContentRangeCount(header.Get("Content-Range")), nil
}

func (q *Query) do(ctx context.Context) ([]byte, http.Header, error) {
	if q.err != nil {
		return nil, nil, q.err
	}
	endpoint := q.c.baseURL + "/rest/v1/" + q.table
	if encoded := q.params.Encode(); encoded != "" {
		endpoint += "?" + encoded
	}
	var bodyReader io.Reader
	if q.body != nil {
		bodyReader = bytes.NewReader(q.body)
	}
	req, err := http.NewRequestWithContext(ctx, q.method, endpoint, bodyReader)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("apikey", q.c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+q.c.serviceKey)
	req.Header.Set("Accept", q.accept)
	if q.body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, p := range q.prefer {
		req.Header.Add("Prefer", p)
	}

	resp, err := q.c.httpc.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, nil, newAPIError(resp.StatusCode, respBody)
	}
	return respBody, resp.Header, nil
}

func parseContentRangeCount(header string) int {
	// Format: "0-9/100" or "*/100"
	slash := strings.LastIndex(header, "/")
	if slash < 0 {
		return 0
	}
	total := header[slash+1:]
	if total == "*" {
		return 0
	}
	n, _ := strconv.Atoi(total)
	return n
}

func extractMessage(body []byte) string {
	var obj struct {
		Message          string `json:"message"`
		Msg              string `json:"msg"`
		ErrorDescription string `json:"error_description"`
		Error            string `json:"error"`
	}
	if json.Unmarshal(body, &obj) != nil {
		return ""
	}
	switch {
	case obj.Message != "":
		return obj.Message
	case obj.Msg != "":
		return obj.Msg
	case obj.ErrorDescription != "":
		return obj.ErrorDescription
	case obj.Error != "":
		return obj.Error
	}
	return ""
}

// extractCode reads a PostgREST SQLSTATE error code from a response body.
func extractCode(body []byte) string {
	var obj struct {
		Code string `json:"code"`
	}
	if json.Unmarshal(body, &obj) == nil {
		return obj.Code
	}
	return ""
}

// ── Auth ─────────────────────────────────────────────────────────────────────

// AuthUser is the subset of the GoTrue user object the service relies on.
type AuthUser struct {
	ID           string         `json:"id"`
	Email        string         `json:"email"`
	AppMetadata  map[string]any `json:"app_metadata"`
	UserMetadata map[string]any `json:"user_metadata"`
}

// User is the Workbench login alias for a GoTrue user.
type User = AuthUser

// fetchAuthUser reads the GoTrue /user endpoint for a bearer token. It returns
// a nil body (no error) when the token is missing or invalid, matching the
// legacy getUserId() contract used by GetUser and GetUserRaw.
func (c *Client) fetchAuthUser(ctx context.Context, token string) ([]byte, error) {
	if token == "" {
		return nil, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/auth/v1/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := c.httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, nil
	}
	return body, nil
}

// GetUser verifies a user access token against GoTrue and returns the user.
// It returns nil (no error) when the token is missing or invalid, matching the
// legacy getUserId() contract.
func (c *Client) GetUser(ctx context.Context, token string) (*AuthUser, error) {
	body, err := c.fetchAuthUser(ctx, token)
	if err != nil || body == nil {
		return nil, err
	}
	var user AuthUser
	if err := json.Unmarshal(body, &user); err != nil {
		return nil, nil
	}
	if user.ID == "" {
		return nil, nil
	}
	return &user, nil
}

// GetUserRaw verifies a token and returns the full GoTrue user object as raw
// JSON, or nil when the token is missing or invalid.
func (c *Client) GetUserRaw(ctx context.Context, token string) (json.RawMessage, error) {
	body, err := c.fetchAuthUser(ctx, token)
	if err != nil || body == nil {
		return nil, err
	}
	return body, nil
}

// AuthorizeURL builds the GoTrue OAuth authorize URL for a provider. It mirrors
// the URL that supabase-js signInWithOAuth({ skipBrowserRedirect }) returns, so
// no network round-trip is needed.
func (c *Client) AuthorizeURL(provider, redirectTo string) string {
	params := url.Values{}
	params.Set("provider", provider)
	params.Set("redirect_to", redirectTo)
	return c.browserURL + "/auth/v1/authorize?" + params.Encode()
}

// Session is the subset of a GoTrue token response the service relies on.
type Session struct {
	AccessToken  string        `json:"access_token"`
	RefreshToken string        `json:"refresh_token"`
	ExpiresIn    int           `json:"expires_in"`
	ExpiresAt    int64         `json:"expires_at"`
	User         *AuthUserFull `json:"user"`
}

// AuthUserFull carries the user fields read after password sign-in.
type AuthUserFull struct {
	ID           string         `json:"id"`
	Email        string         `json:"email"`
	UserMetadata map[string]any `json:"user_metadata"`
}

// AuthSignInPassword performs an email + password sign-in via GoTrue using the
// anon key. On failure it returns an *APIError carrying the GoTrue message.
func (c *Client) AuthSignInPassword(ctx context.Context, email, password string) (*Session, error) {
	payload, _ := json.Marshal(map[string]string{"email": email, "password": password})
	body, err := c.authRequest(ctx, http.MethodPost, "/auth/v1/token?grant_type=password", c.anonKey, "", payload)
	if err != nil {
		return nil, err
	}
	var session Session
	if err := json.Unmarshal(body, &session); err != nil {
		return nil, err
	}
	return &session, nil
}

// AuthSignInOTP sends an email OTP / magic link via GoTrue using the anon key.
// redirectTo is optional.
func (c *Client) AuthSignInOTP(ctx context.Context, email, redirectTo string) error {
	path := "/auth/v1/otp"
	if redirectTo != "" {
		path += "?redirect_to=" + url.QueryEscape(redirectTo)
	}
	payload, _ := json.Marshal(map[string]any{"email": email, "create_user": true})
	_, err := c.authRequest(ctx, http.MethodPost, path, c.anonKey, "", payload)
	return err
}

// AuthAdminUpdateUser updates a user's password and metadata via the GoTrue
// admin API using the service role.
func (c *Client) AuthAdminUpdateUser(ctx context.Context, userID, password string, userMetadata map[string]any) error {
	payload, _ := json.Marshal(map[string]any{"password": password, "user_metadata": userMetadata})
	_, err := c.authRequest(ctx, http.MethodPut, "/auth/v1/admin/users/"+userID, c.serviceKey, c.serviceKey, payload)
	return err
}

// AuthAdminListUsers lists GoTrue users (service role). page is 1-based and
// perPage caps the page size. The raw user objects are returned unmodified so
// callers can pass them straight through to the client.
func (c *Client) AuthAdminListUsers(ctx context.Context, page, perPage int) ([]json.RawMessage, error) {
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 50
	}
	path := fmt.Sprintf("/auth/v1/admin/users?page=%d&per_page=%d", page, perPage)
	body, err := c.authRequest(ctx, http.MethodGet, path, c.serviceKey, c.serviceKey, nil)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Users []json.RawMessage `json:"users"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	return resp.Users, nil
}

// AuthAdminGetUser fetches a single GoTrue user by id (service role) and
// returns the raw user object.
func (c *Client) AuthAdminGetUser(ctx context.Context, userID string) (json.RawMessage, error) {
	return c.authRequest(ctx, http.MethodGet, "/auth/v1/admin/users/"+userID, c.serviceKey, c.serviceKey, nil)
}

// AuthAdminCreateUser creates a GoTrue user from the given admin payload
// (email, password, email_confirm, user_metadata, ...) and returns the created
// user as raw JSON.
func (c *Client) AuthAdminCreateUser(ctx context.Context, payload map[string]any) (json.RawMessage, error) {
	body, _ := json.Marshal(payload)
	return c.authRequest(ctx, http.MethodPost, "/auth/v1/admin/users", c.serviceKey, c.serviceKey, body)
}

// AuthAdminUpdateUserFields updates arbitrary admin-editable fields (email,
// ban_duration, user_metadata, password, ...) on a GoTrue user and returns the
// updated user as raw JSON.
func (c *Client) AuthAdminUpdateUserFields(ctx context.Context, userID string, fields map[string]any) (json.RawMessage, error) {
	body, _ := json.Marshal(fields)
	return c.authRequest(ctx, http.MethodPut, "/auth/v1/admin/users/"+userID, c.serviceKey, c.serviceKey, body)
}

// AuthAdminDeleteUser deletes a GoTrue user by id (service role).
func (c *Client) AuthAdminDeleteUser(ctx context.Context, userID string) error {
	_, err := c.authRequest(ctx, http.MethodDelete, "/auth/v1/admin/users/"+userID, c.serviceKey, c.serviceKey, nil)
	return err
}

// AuthAdminInvite sends a GoTrue invite email (service role) that provisions
// the user if needed. redirectTo and data are optional.
func (c *Client) AuthAdminInvite(ctx context.Context, email, redirectTo string, data map[string]any) (json.RawMessage, error) {
	path := "/auth/v1/invite"
	if redirectTo != "" {
		path += "?redirect_to=" + url.QueryEscape(redirectTo)
	}
	payload := map[string]any{"email": email}
	if len(data) > 0 {
		payload["data"] = data
	}
	body, _ := json.Marshal(payload)
	return c.authRequest(ctx, http.MethodPost, path, c.serviceKey, c.serviceKey, body)
}

// authRequest performs a GoTrue request. apiKey sets the apikey header; when
// bearer is non-empty it sets the Authorization header. Non-2xx responses are
// returned as *APIError with the GoTrue message extracted.
func (c *Client) authRequest(ctx context.Context, method, path, apiKey, bearer string, body []byte) ([]byte, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", apiKey)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, newAPIError(resp.StatusCode, respBody)
	}
	return respBody, nil
}

// execServiceRole sends req with service-role credentials. Callers set the
// method, URL, body, and any extra headers (Content-Type, x-upsert, etc.).
func (c *Client) execServiceRole(req *http.Request) error {
	_, err := c.execServiceRoleBody(req)
	return err
}

// execServiceRoleBody sends req with service-role credentials and returns the
// response body on success.
func (c *Client) execServiceRoleBody(req *http.Request) ([]byte, error) {
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
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
		return nil, newAPIError(resp.StatusCode, body)
	}
	return body, nil
}

// ── Storage ──────────────────────────────────────────────────────────────────

// StorageUpload uploads bytes to a Storage bucket path using the service role.
func (c *Client) StorageUpload(ctx context.Context, bucket, path string, data []byte, contentType string, upsert bool) error {
	endpoint := c.baseURL + "/storage/v1/object/" + bucket + "/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", contentType)
	if upsert {
		req.Header.Set("x-upsert", "true")
	}
	return c.execServiceRole(req)
}

// StorageDownload downloads an object from a Storage bucket using the service role.
//
// It returns the raw bytes and the response Content-Type (empty when absent).
func (c *Client) StorageDownload(ctx context.Context, bucket, path string) ([]byte, string, error) {
	endpoint := c.baseURL + "/storage/v1/object/" + bucket + "/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	resp, err := c.httpc.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20+1))
	if err != nil {
		return nil, "", err
	}
	if len(body) > 32<<20 {
		return nil, "", errors.New("supabase: storage object too large")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", newAPIError(resp.StatusCode, body)
	}
	return body, resp.Header.Get("Content-Type"), nil
}

// StorageOpen opens a Storage object as a streaming service-role response.
// The caller must close the returned body. Range and If-Range are forwarded
// so large public downloads can be resumed without buffering the full object.
func (c *Client) StorageOpen(ctx context.Context, bucket, path, byteRange, ifRange string) (*http.Response, error) {
	endpoint := c.baseURL + "/storage/v1/object/" + bucket + "/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	if byteRange != "" {
		req.Header.Set("Range", byteRange)
	}
	if ifRange != "" {
		req.Header.Set("If-Range", ifRange)
	}
	return c.streamHTTP.Do(req)
}

// StorageRemove deletes the given object paths from a Storage bucket.
func (c *Client) StorageRemove(ctx context.Context, bucket string, paths []string) error {
	endpoint := c.baseURL + "/storage/v1/object/" + bucket
	payload, _ := json.Marshal(map[string][]string{"prefixes": paths})
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	return c.execServiceRole(req)
}

// StorageObject is one entry from StorageList (file or prefix/folder).
type StorageObject struct {
	Name     string          `json:"name"`
	ID       *string         `json:"id"`
	Metadata json.RawMessage `json:"metadata"`
}

// IsFolder reports whether the entry is a prefix rather than an object.
func (o StorageObject) IsFolder() bool {
	return o.ID == nil || strings.TrimSpace(*o.ID) == ""
}

// SizeBytes returns the object size from metadata when present.
func (o StorageObject) SizeBytes() int64 {
	if len(o.Metadata) == 0 || string(o.Metadata) == "null" {
		return 0
	}
	var meta struct {
		Size json.Number `json:"size"`
	}
	if err := json.Unmarshal(o.Metadata, &meta); err != nil {
		return 0
	}
	n, err := meta.Size.Int64()
	if err != nil {
		return 0
	}
	return n
}

// StorageList lists objects under prefix in a Storage bucket (service role).
func (c *Client) StorageList(ctx context.Context, bucket, prefix string, limit int) ([]StorageObject, error) {
	if limit <= 0 {
		limit = 100
	}
	endpoint := c.baseURL + "/storage/v1/object/list/" + bucket
	payload, err := json.Marshal(map[string]any{
		"prefix": strings.Trim(prefix, "/"),
		"limit":  limit,
		"offset": 0,
		"sortBy": map[string]string{"column": "name", "order": "asc"},
	})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	resp, err := c.httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20+1))
	if err != nil {
		return nil, err
	}
	if len(body) > 2<<20 {
		return nil, errors.New("supabase: storage list response too large")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, newAPIError(resp.StatusCode, body)
	}
	var objects []StorageObject
	if err := json.Unmarshal(body, &objects); err != nil {
		return nil, err
	}
	return objects, nil
}

// PublicURL builds the public object URL for a bucket path.
func (c *Client) PublicURL(bucket, path string) string {
	return c.browserURL + "/storage/v1/object/public/" + bucket + "/" + path
}

// StorageCreateSignedURL mints a time-limited signed GET URL for an object in
// a private bucket, using the service role. expiresInSeconds is the TTL.
func (c *Client) StorageCreateSignedURL(ctx context.Context, bucket, path string, expiresInSeconds int) (string, error) {
	endpoint := c.baseURL + "/storage/v1/object/sign/" + bucket + "/" + path
	payload, _ := json.Marshal(map[string]int{"expiresIn": expiresInSeconds})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	body, err := c.execServiceRoleBody(req)
	if err != nil {
		return "", err
	}
	var resp struct {
		SignedURL string `json:"signedURL"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", err
	}
	if resp.SignedURL == "" {
		return "", errors.New("supabase: empty signed URL")
	}
	return c.browserURL + "/storage/v1" + resp.SignedURL, nil
}

// StorageCreateSignedUploadURL mints a one-time signed upload URL for an
// object, letting a client PUT bytes directly to Storage without holding the
// service key. The returned URL is absolute and browser-facing; the caller
// PUTs the raw file bytes to it (Content-Type header optional but
// recommended) and does not need any additional Authorization header.
func (c *Client) StorageCreateSignedUploadURL(ctx context.Context, bucket, path string) (uploadURL, token string, err error) {
	endpoint := c.baseURL + "/storage/v1/object/upload/sign/" + bucket + "/" + path
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return "", "", err
	}
	body, err := c.execServiceRoleBody(req)
	if err != nil {
		return "", "", err
	}
	var resp struct {
		URL   string `json:"url"`
		Token string `json:"token"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", "", err
	}
	if resp.URL == "" {
		return "", "", errors.New("supabase: empty signed upload URL")
	}
	return c.browserURL + "/storage/v1" + resp.URL, resp.Token, nil
}

// RPC calls a PostgREST stored function with the given JSON params.
func (c *Client) RPC(ctx context.Context, fn string, params any) error {
	return c.RPCResult(ctx, fn, params, nil)
}

// RPCResult calls a PostgREST stored function and decodes its JSON response.
func (c *Client) RPCResult(ctx context.Context, fn string, params, dest any) error {
	payload, err := json.Marshal(params)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/rest/v1/rpc/"+fn, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	resp, err := c.httpc.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024+1))
	if err != nil || len(body) > 1024*1024 {
		return errors.New("supabase: invalid RPC response")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return newAPIError(resp.StatusCode, body)
	}
	if dest == nil || len(body) == 0 {
		return nil
	}
	return json.Unmarshal(body, dest)
}
