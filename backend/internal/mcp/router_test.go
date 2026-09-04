package mcp

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// sha256HexRawURL computes the PKCE S256 code_challenge for a verifier.
func sha256HexRawURL(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// fakeRest stands in for PostgREST so scoping can be asserted from the query
// string without a live Supabase project. It is keyed by table name only, so
// a test's canned body answers every request against that table regardless
// of method — fine for the write-then-discard, read-then-assert patterns
// used below.
type fakeRest struct {
	mu       sync.Mutex
	requests []*url.URL
	bodies   map[string]string
	server   *httptest.Server
}

// newFakeRest starts a PostgREST stub. bodies maps a table name to the JSON
// array it should return; tables without an entry return an empty array.
func newFakeRest(t *testing.T, bodies map[string]string) *fakeRest {
	t.Helper()
	fake := &fakeRest{bodies: bodies}
	fake.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fake.mu.Lock()
		fake.requests = append(fake.requests, r.URL)
		fake.mu.Unlock()

		w.Header().Set("Content-Type", "application/json")

		// Storage sign endpoints are not PostgREST tables; answer them with a
		// stub payload shaped like Supabase's response so upload tests that
		// exercise signed URLs do not need a real Storage backend.
		switch {
		case strings.Contains(r.URL.Path, "/storage/v1/object/upload/sign/"):
			_, _ = w.Write([]byte(`{"url":"/object/upload/sign/stub?token=stub-token","token":"stub-token"}`))
			return
		case strings.Contains(r.URL.Path, "/storage/v1/object/sign/"):
			_, _ = w.Write([]byte(`{"signedURL":"/object/sign/stub?token=stub-token"}`))
			return
		}

		table := strings.TrimPrefix(r.URL.Path, "/rest/v1/")
		body, ok := fake.bodies[table]
		if !ok {
			body = "[]"
		}
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(fake.server.Close)
	return fake
}

// client builds a service-role Supabase client pointed at the stub.
func (f *fakeRest) client() *supabase.Client {
	return supabase.NewService(f.server.URL, f.server.URL, "service-key", "anon-key")
}

// queryFor returns the first captured query string for a table.
func (f *fakeRest) queryFor(table string) string {
	f.mu.Lock()
	defer f.mu.Unlock()
	for _, u := range f.requests {
		if strings.TrimPrefix(u.Path, "/rest/v1/") == table {
			decoded, err := url.QueryUnescape(u.RawQuery)
			if err != nil {
				return u.RawQuery
			}
			return decoded
		}
	}
	return ""
}

const stubUserID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"

// masterEnabledRow is the canned mcp_user_settings response for a caller
// whose master "Enable MCP Access" switch is on.
func masterEnabledRow(userID string) string {
	row, _ := json.Marshal([]map[string]any{{"user_id": userID, "enabled": true}})
	return string(row)
}

func TestSearchRecordsScopesToCallerGroups(t *testing.T) {
	fake := newFakeRest(t, nil)
	acc := memberAccess("desktop_admin")
	acc.GroupIDs = append(acc.GroupIDs, "66666666-7777-8888-9999-000000000000")

	if _, err := searchRecords(context.Background(), fake.client(), acc, lookupEntity("customers"), "acme", nil, "", false, 10, 0); err != nil {
		t.Fatalf("searchRecords: %v", err)
	}

	query := fake.queryFor("customers")
	for _, groupID := range acc.GroupIDs {
		if !strings.Contains(query, groupID) {
			t.Fatalf("query %q does not scope to group %s", query, groupID)
		}
	}
	if !strings.Contains(query, "group_id.in.") && !strings.Contains(query, "group_id=in.") {
		t.Fatalf("query %q is missing the group_id scope filter", query)
	}
	if !strings.Contains(query, "owner_user_id.eq."+acc.UserID) {
		t.Fatalf("query %q is missing the personal owner scope", query)
	}
	if !strings.Contains(query, "company_name.ilike.*acme*") {
		t.Fatalf("query %q is missing the free-text search clause", query)
	}
	if !strings.Contains(query, "limit=10") {
		t.Fatalf("query %q ignored the requested limit", query)
	}
}

func TestSearchRecordsScopesPersonalCustomersWithoutGroups(t *testing.T) {
	fake := newFakeRest(t, nil)
	acc := memberAccess("desktop_admin")
	acc.GroupIDs = nil

	if _, err := searchRecords(context.Background(), fake.client(), acc, lookupEntity("customers"), "", nil, "", false, 10, 0); err != nil {
		t.Fatalf("searchRecords: %v", err)
	}
	query := fake.queryFor("customers")
	if !strings.Contains(query, "owner_user_id.eq."+acc.UserID) {
		t.Fatalf("query %q is not scoped to the caller", query)
	}
}

func TestSearchRecordsRejectsUndeclaredFilter(t *testing.T) {
	fake := newFakeRest(t, nil)
	acc := memberAccess("desktop_admin")

	_, err := searchRecords(context.Background(), fake.client(), acc, lookupEntity("customers"), "", map[string]string{"note": "x"}, "", false, 10, 0)
	if err == nil {
		t.Fatal("undeclared filter column was accepted")
	}
	if !strings.Contains(err.Error(), "not supported") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSearchRecordsAppliesDateRange(t *testing.T) {
	fake := newFakeRest(t, nil)
	acc := memberAccess("desktop_admin")

	_, err := searchRecords(context.Background(), fake.client(), acc, lookupEntity("customers"), "", map[string]string{
		"created_at_gte": "2026-07-01T00:00:00Z",
		"created_at_lt":  "2026-08-01T00:00:00Z",
		"category":       "retail",
	}, "", false, 10, 0)
	if err != nil {
		t.Fatalf("searchRecords: %v", err)
	}
	query := fake.queryFor("customers")
	if !strings.Contains(query, "created_at=gte.2026-07-01T00:00:00Z") {
		t.Fatalf("missing gte: %s", query)
	}
	if !strings.Contains(query, "created_at=lt.2026-08-01T00:00:00Z") {
		t.Fatalf("missing lt: %s", query)
	}
	if !strings.Contains(query, "category=eq.retail") {
		t.Fatalf("missing exact category: %s", query)
	}
}

func TestSearchRecordsRejectsRangeOnUnrangeableColumn(t *testing.T) {
	fake := newFakeRest(t, nil)
	acc := memberAccess("desktop_admin")

	_, err := searchRecords(context.Background(), fake.client(), acc, lookupEntity("customers"), "", map[string]string{"category_gte": "A"}, "", false, 10, 0)
	if err == nil {
		t.Fatal("range on a non-rangeable column was accepted")
	}
}

func TestSummarizeRecordsAggregatesCustomers(t *testing.T) {
	fake := newFakeRest(t, map[string]string{
		"customers": `[
			{"id":"11111111-1111-1111-1111-111111111111","created_at":"2026-07-10T00:00:00+08:00","category":"retail","customer_type":"dealer","customer_level":"A","cooperation_status":"active"},
			{"id":"33333333-3333-3333-3333-333333333333","created_at":"2026-07-20T00:00:00+08:00","category":"retail","customer_type":"dealer","customer_level":"B","cooperation_status":"active"}
		]`,
	})
	acc := memberAccess("desktop_admin")
	payload, err := summarizeRecords(context.Background(), fake.client(), acc, lookupEntity("customers"), summarizeArgs{
		Period: periodArgs{Period: periodMonth, Year: 2026, Month: 7, Timezone: "Asia/Taipei"},
	})
	if err != nil {
		t.Fatalf("summarizeRecords: %v", err)
	}
	totals, _ := payload["totals"].(map[string]any)
	if totals["count"] != 2 {
		t.Fatalf("count = %v", totals["count"])
	}
	query := fake.queryFor("customers")
	if !strings.Contains(query, "created_at=gte.") || !strings.Contains(query, "created_at=lt.") {
		t.Fatalf("summarize did not apply a created_at band: %s", query)
	}
}

func TestSummarizeRecordsAggregatesMail(t *testing.T) {
	fake := newFakeRest(t, map[string]string{
		"mail_messages": `[
			{"id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","received_at":"2026-07-05T00:00:00+08:00","is_read":true,"is_sent":false,"is_draft":false},
			{"id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","received_at":"2026-07-18T00:00:00+08:00","is_read":false,"is_sent":false,"is_draft":false}
		]`,
	})
	acc := memberAccess("desktop_mail")
	acc.Unrestricted = true
	payload, err := summarizeRecords(context.Background(), fake.client(), acc, lookupEntity("mail_messages"), summarizeArgs{
		Period: periodArgs{Period: periodMonth, Year: 2026, Month: 7, Timezone: "Asia/Taipei"},
	})
	if err != nil {
		t.Fatalf("summarizeRecords: %v", err)
	}
	totals, _ := payload["totals"].(map[string]any)
	if totals["count"] != 2 {
		t.Fatalf("count = %v", totals["count"])
	}
}

func TestSelfScopedEntityIgnoresGroups(t *testing.T) {
	fake := newFakeRest(t, nil)
	acc := memberAccess("desktop_mail")

	if _, err := searchRecords(context.Background(), fake.client(), acc, lookupEntity("mail_accounts"), "", nil, "", false, 5, 0); err != nil {
		t.Fatalf("searchRecords: %v", err)
	}
	query := fake.queryFor("mail_accounts")
	if !strings.Contains(query, "owner_user_id=eq."+acc.UserID) {
		t.Fatalf("query %q is not scoped to the caller", query)
	}
}

func TestTransportRejectsMissingKey(t *testing.T) {
	fake := newFakeRest(t, nil)
	handler := New(config.Env{}, fake.client()).Routes()

	req := httptest.NewRequest(http.MethodPost, "http://localhost/", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize"}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	challenge := rec.Header().Get("WWW-Authenticate")
	if challenge == "" {
		t.Fatal("missing WWW-Authenticate challenge")
	}
	if !strings.Contains(challenge, `resource_metadata="`) {
		t.Fatalf("WWW-Authenticate missing resource_metadata: %q", challenge)
	}
	if !strings.Contains(challenge, "/.well-known/oauth-protected-resource/mcp") {
		t.Fatalf("WWW-Authenticate resource_metadata path wrong: %q", challenge)
	}
}

func TestWellKnownProtectedResourceDescribesMCP(t *testing.T) {
	fake := newFakeRest(t, nil)
	h := New(config.Env{}, fake.client())

	req := httptest.NewRequest(http.MethodGet, "http://localhost/.well-known/oauth-protected-resource/mcp", nil)
	rec := httptest.NewRecorder()
	h.WellKnownProtectedResource(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["resource"] != "http://localhost/mcp" {
		t.Fatalf("resource = %v, want http://localhost/mcp", body["resource"])
	}
	if body["resource_name"] != serverTitle {
		t.Fatalf("resource_name = %v, want %s", body["resource_name"], serverTitle)
	}
	servers, _ := body["authorization_servers"].([]any)
	if len(servers) == 0 || servers[0] != "http://localhost" {
		t.Fatalf("authorization_servers = %v", body["authorization_servers"])
	}
}

func TestTransportRejectsGetStream(t *testing.T) {
	fake := newFakeRest(t, nil)
	handler := New(config.Env{}, fake.client()).Routes()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestTransportInitializeAndToolsListWithValidKey(t *testing.T) {
	const plaintext = "gcrm_mcp_0123456789abcdef0123456789abcdef0123456789abcdef"

	keyRow, err := json.Marshal([]map[string]any{{
		"id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "user_id": stubUserID, "key_hash": hashKey(plaintext), "enabled": true,
	}})
	if err != nil {
		t.Fatalf("marshal key row: %v", err)
	}
	fake := newFakeRest(t, map[string]string{
		"mcp_api_keys":      string(keyRow),
		"mcp_user_settings": masterEnabledRow(stubUserID),
	})
	handler := New(config.Env{}, fake.client()).Routes()

	initialize := postRPC(t, handler, plaintext, `{"jsonrpc":"2.0","id":1,"method":"initialize"}`)
	result, _ := initialize.Result.(map[string]any)
	if result["protocolVersion"] != protocolVersion {
		t.Fatalf("protocolVersion = %v, want %s", result["protocolVersion"], protocolVersion)
	}
	serverInfo, _ := result["serverInfo"].(map[string]any)
	icons, _ := serverInfo["icons"].([]any)
	if len(icons) == 0 {
		t.Fatal("initialize serverInfo.icons missing")
	}
	firstIcon, _ := icons[0].(map[string]any)
	src, _ := firstIcon["src"].(string)
	if !strings.HasPrefix(src, "data:image/png;base64,") &&
		!strings.Contains(src, "/mcp-icon.png") &&
		!strings.Contains(src, "/mcp/icon.png") {
		t.Fatalf("icons[0].src = %q, want data URI or …/mcp-icon.png", src)
	}

	list := postRPC(t, handler, plaintext, `{"jsonrpc":"2.0","id":2,"method":"tools/list"}`)
	listResult, _ := list.Result.(map[string]any)
	tools, _ := listResult["tools"].([]any)
	if len(tools) == 0 {
		t.Fatal("tools/list returned no tools")
	}
	// With no groups and no module grants the stub user still gets the meta
	// tools plus personal-data reads, but never a write tool.
	for _, raw := range tools {
		tool, _ := raw.(map[string]any)
		if name, _ := tool["name"].(string); name == toolCreateRecord || name == toolDeleteRecord {
			t.Fatalf("write tool %s exposed to an ungranted user", name)
		}
	}
}

func TestTransportDisabledKeyIsRejected(t *testing.T) {
	const plaintext = "gcrm_mcp_0123456789abcdef0123456789abcdef0123456789abcdef"
	keyRow, err := json.Marshal([]map[string]any{{
		"id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "user_id": stubUserID, "key_hash": hashKey(plaintext), "enabled": false,
	}})
	if err != nil {
		t.Fatalf("marshal key row: %v", err)
	}
	fake := newFakeRest(t, map[string]string{
		"mcp_api_keys":      string(keyRow),
		"mcp_user_settings": masterEnabledRow(stubUserID),
	})
	handler := New(config.Env{}, fake.client()).Routes()

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize"}`))
	req.Header.Set("Authorization", "Bearer "+plaintext)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("disabled key status = %d, want 401", rec.Code)
	}
}

func TestTransportMasterSwitchOffBlocksAnEnabledKey(t *testing.T) {
	const plaintext = "gcrm_mcp_0123456789abcdef0123456789abcdef0123456789abcdef"
	keyRow, err := json.Marshal([]map[string]any{{
		"id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "user_id": stubUserID, "key_hash": hashKey(plaintext), "enabled": true,
	}})
	if err != nil {
		t.Fatalf("marshal key row: %v", err)
	}
	// No mcp_user_settings row at all: loadMaster must default to disabled.
	fake := newFakeRest(t, map[string]string{"mcp_api_keys": string(keyRow)})
	handler := New(config.Env{}, fake.client()).Routes()

	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"jsonrpc":"2.0","id":1,"method":"initialize"}`))
	req.Header.Set("Authorization", "Bearer "+plaintext)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("master-off status = %d, want 401", rec.Code)
	}
}

func TestTransportDeletedKeyStopsWorking(t *testing.T) {
	const deleted = "gcrm_mcp_2222222222222222222222222222222222222222222222"

	// The stub only knows about a different (still-live) key, matching what
	// deletion leaves behind: the removed plaintext no longer resolves.
	fake := newFakeRest(t, map[string]string{"mcp_api_keys": "[]"})
	client := fake.client()

	userID, keyID, err := resolveKey(context.Background(), client, deleted)
	if err != nil {
		t.Fatalf("resolveKey: %v", err)
	}
	if userID != "" || keyID != "" {
		t.Fatal("a deleted key still resolved to a user")
	}
}

func TestCreateKeyRejectsASixthKey(t *testing.T) {
	rows := make([]map[string]any, 0, maxKeysPerUser)
	for i := 0; i < maxKeysPerUser; i++ {
		rows = append(rows, map[string]any{
			"id":      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee" + string(rune('0'+i)),
			"user_id": stubUserID, "key_prefix": "gcrm_mcp_x", "enabled": true,
		})
	}
	body, err := json.Marshal(rows)
	if err != nil {
		t.Fatalf("marshal rows: %v", err)
	}
	fake := newFakeRest(t, map[string]string{"mcp_api_keys": string(body)})

	_, _, err = createKey(context.Background(), fake.client(), stubUserID, "")
	if err != errMaxKeysReached {
		t.Fatalf("createKey error = %v, want errMaxKeysReached", err)
	}
}

func TestSetKeyEnabledRejectsAnotherUsersKey(t *testing.T) {
	// The stub's UPDATE ... RETURNING affects no rows because the id/user_id
	// pair does not belong to the caller, matching what PostgREST returns for
	// an ownership mismatch.
	fake := newFakeRest(t, map[string]string{"mcp_api_keys": "[]"})
	if err := setKeyEnabled(context.Background(), fake.client(), stubUserID, "not-mine", true); err != errKeyNotFound {
		t.Fatalf("setKeyEnabled error = %v, want errKeyNotFound", err)
	}
}

func TestSettingsRequiresAuth(t *testing.T) {
	fake := newFakeRest(t, nil)
	handler := New(config.Env{}, fake.client()).Routes()

	req := httptest.NewRequest(http.MethodGet, "/settings", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestEndpointURLHonoursProxyHeaders(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/settings", nil)
	req.Host = "internal:3001"
	req.Header.Set("X-Forwarded-Proto", "https")
	req.Header.Set("X-Forwarded-Host", "api.example.com")

	if got := endpointURL(req); got != "https://api.example.com/mcp" {
		t.Fatalf("endpointURL = %q, want https://api.example.com/mcp", got)
	}

	local := httptest.NewRequest(http.MethodGet, "/settings", nil)
	local.Host = "localhost:3001"
	if got := endpointURL(local); got != "http://localhost:3001/mcp" {
		t.Fatalf("local endpointURL = %q, want http://localhost:3001/mcp", got)
	}
}

// ── OAuth ────────────────────────────────────────────────────────────────────

const (
	testOAuthClientID     = "gemini-connector"
	testOAuthClientSecret = "s3cret-shared-app-value"
)

func oauthEnv() config.Env {
	return config.Env{
		JWTSecret:            "test-jwt-secret",
		MCPOAuthClientID:     testOAuthClientID,
		MCPOAuthClientSecret: testOAuthClientSecret,
	}
}

func TestOAuthAuthorizeRejectsUnknownClient(t *testing.T) {
	fake := newFakeRest(t, nil)
	handler := New(oauthEnv(), fake.client()).Routes()

	req := httptest.NewRequest(http.MethodGet, "/oauth/authorize?client_id=wrong&redirect_uri=https://example.com/callback", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "<form") {
		t.Fatal("consent form rendered for an unknown client_id")
	}
}

func TestOAuthAuthorizeRejectsInvalidRedirect(t *testing.T) {
	fake := newFakeRest(t, nil)
	handler := New(oauthEnv(), fake.client()).Routes()

	req := httptest.NewRequest(http.MethodGet, "/oauth/authorize?client_id="+testOAuthClientID+"&redirect_uri=not-a-url", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestOAuthAuthorizeGetRendersEscapedForm(t *testing.T) {
	fake := newFakeRest(t, nil)
	handler := New(oauthEnv(), fake.client()).Routes()

	req := httptest.NewRequest(http.MethodGet, "/oauth/authorize?client_id="+testOAuthClientID+
		"&redirect_uri=https://example.com/cb&state="+url.QueryEscape(`"><script>alert(1)</script>`), nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Contains(body, "<script>alert(1)</script>") {
		t.Fatal("state was rendered unescaped, an XSS hole in the consent page")
	}
	if !strings.Contains(body, `name="key"`) {
		t.Fatal("consent form is missing the key input")
	}
}

func TestOAuthAuthorizePostWithBadKeyReRendersForm(t *testing.T) {
	fake := newFakeRest(t, map[string]string{"mcp_api_keys": "[]"})
	handler := New(oauthEnv(), fake.client()).Routes()

	form := url.Values{
		"client_id":    {testOAuthClientID},
		"redirect_uri": {"https://example.com/cb"},
		"state":        {"xyz"},
		"key":          {"gcrm_mcp_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"},
	}
	req := httptest.NewRequest(http.MethodPost, "/oauth/authorize", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (re-render with inline error)", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "not recognized") {
		t.Fatal("missing inline error for an unrecognized key")
	}
}

func TestOAuthFullAuthorizationCodeAndRefreshFlow(t *testing.T) {
	const plaintext = "gcrm_mcp_0123456789abcdef0123456789abcdef0123456789abcdef"
	keyRow, err := json.Marshal([]map[string]any{{
		"id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "user_id": stubUserID, "key_hash": hashKey(plaintext), "enabled": true,
	}})
	if err != nil {
		t.Fatalf("marshal key row: %v", err)
	}

	const redirectURI = "https://gemini.example.com/oauth/callback"
	fake := newFakeRest(t, map[string]string{
		"mcp_api_keys":      string(keyRow),
		"mcp_user_settings": masterEnabledRow(stubUserID),
	})
	handler := New(oauthEnv(), fake.client()).Routes()

	// 1. Authorize: paste the key, expect a redirect carrying ?code=&state=.
	form := url.Values{
		"client_id":    {testOAuthClientID},
		"redirect_uri": {redirectURI},
		"state":        {"round-trip-state"},
		"key":          {plaintext},
	}
	authReq := httptest.NewRequest(http.MethodPost, "/oauth/authorize", strings.NewReader(form.Encode()))
	authReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	authRec := httptest.NewRecorder()
	handler.ServeHTTP(authRec, authReq)

	if authRec.Code != http.StatusFound {
		t.Fatalf("authorize status = %d, want 302 (body %s)", authRec.Code, authRec.Body.String())
	}
	location, err := url.Parse(authRec.Header().Get("Location"))
	if err != nil {
		t.Fatalf("parse Location: %v", err)
	}
	if location.Query().Get("state") != "round-trip-state" {
		t.Fatalf("state = %q, want round-trip-state", location.Query().Get("state"))
	}
	code := location.Query().Get("code")
	if code == "" {
		t.Fatal("authorize redirect is missing ?code=")
	}

	// The token endpoint's consumeAuthCode reads back what authorize wrote;
	// the fake keys by table name, so point it at a row reflecting that code.
	codeRow, err := json.Marshal([]map[string]any{{
		"id": "cccccccc-cccc-cccc-cccc-cccccccccccc", "user_id": stubUserID,
		"client_id": testOAuthClientID, "redirect_uri": redirectURI,
	}})
	if err != nil {
		t.Fatalf("marshal code row: %v", err)
	}
	fake.bodies["mcp_oauth_codes"] = string(codeRow)

	// 2. Token: authorization_code grant.
	tokenForm := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {code},
		"redirect_uri":  {redirectURI},
		"client_id":     {testOAuthClientID},
		"client_secret": {testOAuthClientSecret},
	}
	tokenReq := httptest.NewRequest(http.MethodPost, "/oauth/token", strings.NewReader(tokenForm.Encode()))
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	tokenRec := httptest.NewRecorder()
	handler.ServeHTTP(tokenRec, tokenReq)

	if tokenRec.Code != http.StatusOK {
		t.Fatalf("token status = %d, want 200 (body %s)", tokenRec.Code, tokenRec.Body.String())
	}
	var tokenResp struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		TokenType    string `json:"token_type"`
	}
	if err := json.Unmarshal(tokenRec.Body.Bytes(), &tokenResp); err != nil {
		t.Fatalf("decode token response: %v", err)
	}
	if tokenResp.AccessToken == "" || tokenResp.RefreshToken == "" {
		t.Fatal("token response is missing access_token or refresh_token")
	}
	if tokenResp.TokenType != "Bearer" {
		t.Fatalf("token_type = %q, want Bearer", tokenResp.TokenType)
	}

	// 3. The minted access token authenticates a normal MCP call.
	mcpResp := postRPC(t, handler, tokenResp.AccessToken, `{"jsonrpc":"2.0","id":1,"method":"initialize"}`)
	result, _ := mcpResp.Result.(map[string]any)
	if result["protocolVersion"] != protocolVersion {
		t.Fatalf("OAuth-authenticated initialize failed: %+v", mcpResp)
	}

	// 4. Refresh grant mints a fresh access token from the same refresh token.
	tokenRow, err := json.Marshal([]map[string]any{{
		"user_id": stubUserID, "client_id": testOAuthClientID, "revoked_at": nil,
	}})
	if err != nil {
		t.Fatalf("marshal token row: %v", err)
	}
	fake.bodies["mcp_oauth_tokens"] = string(tokenRow)

	refreshForm := url.Values{
		"grant_type":    {"refresh_token"},
		"refresh_token": {tokenResp.RefreshToken},
		"client_id":     {testOAuthClientID},
		"client_secret": {testOAuthClientSecret},
	}
	refreshReq := httptest.NewRequest(http.MethodPost, "/oauth/token", strings.NewReader(refreshForm.Encode()))
	refreshReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	refreshRec := httptest.NewRecorder()
	handler.ServeHTTP(refreshRec, refreshReq)

	if refreshRec.Code != http.StatusOK {
		t.Fatalf("refresh status = %d, want 200 (body %s)", refreshRec.Code, refreshRec.Body.String())
	}
}

func TestOAuthTokenRejectsWrongClientSecret(t *testing.T) {
	fake := newFakeRest(t, nil)
	handler := New(oauthEnv(), fake.client()).Routes()

	form := url.Values{
		"grant_type":    {"authorization_code"},
		"code":          {"whatever"},
		"redirect_uri":  {"https://example.com/cb"},
		"client_id":     {testOAuthClientID},
		"client_secret": {"totally-wrong"},
	}
	req := httptest.NewRequest(http.MethodPost, "/oauth/token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error body: %v", err)
	}
	if body["error"] != "invalid_client" {
		t.Fatalf("error = %v, want invalid_client", body["error"])
	}
}

func TestVerifyPKCE(t *testing.T) {
	verifier := "a-random-verifier-value-that-is-long-enough"
	sum := sha256HexRawURL(verifier)
	if !verifyPKCE(sum, "S256", verifier) {
		t.Fatal("S256 challenge did not verify against its own verifier")
	}
	if verifyPKCE(sum, "S256", "wrong-verifier") {
		t.Fatal("S256 challenge verified against a mismatched verifier")
	}
	if !verifyPKCE("plain-value", "plain", "plain-value") {
		t.Fatal("plain challenge did not verify against an identical verifier")
	}
	if verifyPKCE("plain-value", "", "") {
		t.Fatal("empty verifier must never verify")
	}
}

// postRPC sends one JSON-RPC message and decodes the envelope.
func postRPC(t *testing.T, handler http.Handler, key, body string) rpcResponse {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body %s)", rec.Code, rec.Body.String())
	}
	var resp rpcResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.Error != nil {
		t.Fatalf("rpc error: %+v", resp.Error)
	}
	return resp
}
