// Package mcp exposes GeoCRM data to external AI agents over the Model
// Context Protocol (Streamable HTTP).
//
// Three audiences share the mount point:
//   - External agents that support a raw Bearer key (Codex, Cursor, Claude
//     Desktop) authenticate on /mcp with a personal key (`gcrm_mcp_…`).
//   - External agents that only support standard OAuth (Gemini) authenticate
//     on /mcp with a short-lived access token minted by /mcp/oauth/* after the
//     user pastes one of their own keys into the consent page.
//   - The Electron Settings UI authenticates with the normal Supabase JWT on
//     /mcp/settings/* to manage its own keys and the master on/off switch.
//
// Authorization for every tool call is re-derived from the Electron desktop
// ACL, so neither a key nor an OAuth token can ever reach data the same
// person could not open in the desktop app. A master "Enable MCP Access"
// switch additionally gates both credential types at once.
package mcp

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/jwt"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// maxRPCBodyBytes caps an MCP request body. Most tool arguments are small,
// but upload_file accepts a base64-encoded image or small document inline
// (data_base64 inflates payloads by roughly 4/3), so the cap is large enough
// for a ~6 MiB source image while still rejecting a client bug or abuse
// attempt. Documents larger than this use prepare_upload/finalize_upload
// instead of a JSON-RPC body.
const maxRPCBodyBytes = 8 << 20

// Handler owns shared dependencies for /mcp routes.
type Handler struct {
	env config.Env
	sb  *supabase.Client
}

// New builds the /mcp router owner.
func New(env config.Env, sb *supabase.Client) *Handler {
	return &Handler{env: env, sb: sb}
}

// Routes returns the /mcp sub-router.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)

	// MCP transport: authenticated by a key or an OAuth access token, not a
	// Supabase session.
	r.Post("/", h.handleRPC)
	r.Get("/", h.handleNoStream)
	r.Delete("/", h.handleEndSession)

	// Public branding for MCP clients (Gemini Apps list, etc.).
	r.Get("/icon.png", h.IconPNG)
	r.Head("/icon.png", h.IconPNG)
	r.Get("/icon-512.png", h.IconLargePNG)
	r.Head("/icon-512.png", h.IconLargePNG)

	// Gemini OAuth 2.0 authorization-code flow. Public, unauthenticated HTTP;
	// identity is bound at consent time by pasting a personal MCP key.
	r.Get("/oauth/authorize", h.oauthAuthorizeGet)
	r.Post("/oauth/authorize", h.oauthAuthorizePost)
	r.Post("/oauth/token", h.oauthToken)

	// Settings: normal app auth so a signed-in user can manage their own keys.
	r.Group(func(pr chi.Router) {
		pr.Use(authmw.RequireUser(h.sb, authmw.DefaultUnauthorized))
		pr.Get("/settings", h.getSettings)
		pr.Post("/settings/enable", h.postEnableMaster)
		pr.Post("/settings/disable", h.postDisableMaster)
		pr.Post("/settings/keys", h.postCreateKey)
		pr.Patch("/settings/keys/{keyID}", h.patchKey)
		pr.Delete("/settings/keys/{keyID}", h.deleteKeyRoute)
		pr.Get("/settings/setup-prompt", h.getSetupPrompt)
	})

	return r
}

// WellKnownMetadata answers RFC 8414 OAuth authorization server discovery at
// the service root (and the path-based /.well-known/.../mcp fallback). It is
// mounted by server.go at the top-level /.well-known/ paths, not under /mcp.
func (h *Handler) WellKnownMetadata(w http.ResponseWriter, r *http.Request) {
	origin := requestOrigin(r)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"issuer":                                origin,
		"authorization_endpoint":                origin + "/mcp/oauth/authorize",
		"token_endpoint":                        origin + "/mcp/oauth/token",
		"response_types_supported":              []string{"code"},
		"grant_types_supported":                 []string{"authorization_code", "refresh_token"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_post", "client_secret_basic"},
		"code_challenge_methods_supported":      []string{"S256", "plain"},
		"scopes_supported":                      []string{"mcp"},
	})
}

// WellKnownProtectedResource answers RFC 9728 OAuth Protected Resource
// Metadata for the /mcp endpoint. Gemini (and other MCP OAuth clients) use
// this document — discovered via WWW-Authenticate resource_metadata or the
// path-based well-known URL — to learn that /mcp is an OAuth resource and
// which authorization server issues its tokens. Without it, Gemini rejects
// the server as "unsupported authentication method" even when Client ID /
// Client Secret are filled in manually.
func (h *Handler) WellKnownProtectedResource(w http.ResponseWriter, r *http.Request) {
	origin := requestOrigin(r)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"resource":                 origin + "/mcp",
		"authorization_servers":    []string{origin},
		"bearer_methods_supported": []string{"header"},
		"scopes_supported":         []string{"mcp"},
		"resource_name":            serverTitle,
		"resource_documentation":   "https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization",
	})
}

// ── MCP transport ────────────────────────────────────────────────────────────

// handleNoStream answers the Streamable HTTP GET probe. This server does not
// push server-initiated messages, and the specification requires 405 in that
// case so clients fall back to request/response only.
func (h *Handler) handleNoStream(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Allow", "POST, DELETE")
	httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{
		"error": "This MCP endpoint does not offer a server-initiated SSE stream; POST JSON-RPC requests instead.",
	})
}

// handleEndSession acknowledges a client session teardown. The server is
// stateless, so there is nothing to release.
func (h *Handler) handleEndSession(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}

// handleRPC authenticates the caller (key or OAuth token) and dispatches one
// JSON-RPC message.
func (h *Handler) handleRPC(w http.ResponseWriter, r *http.Request) {
	token := httpx.BearerToken(r)
	if token == "" {
		h.writeUnauthorized(w, r, "Missing Authorization Bearer token. Use an OAuth access token (Gemini) or a GeoCRM MCP key.")
		return
	}
	userID, keyID, err := h.authenticateMCPRequest(r.Context(), token)
	if err != nil {
		httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "Authentication lookup failed"})
		return
	}
	if userID == "" {
		h.writeUnauthorized(w, r, "Invalid, disabled, or expired MCP credential. Check GeoCRM Settings \u2192 Model Context Protocol.")
		return
	}
	if keyID != "" {
		touchKeyUsage(r.Context(), h.sb, keyID)
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxRPCBodyBytes))
	if err != nil {
		writeRPC(w, newError(nil, codeParseError, "Failed to read request body"))
		return
	}

	trimmed := strings.TrimSpace(string(body))
	if strings.HasPrefix(trimmed, "[") {
		h.dispatchBatch(w, r, userID, body)
		return
	}

	var req rpcRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeRPC(w, newError(nil, codeParseError, "Invalid JSON-RPC payload"))
		return
	}
	resp := h.dispatch(r, userID, &req)
	if resp == nil {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	writeRPC(w, resp)
}

// authenticateMCPRequest resolves either an MCP key (`gcrm_mcp_…`) or an
// OAuth access token to a user id. Both paths additionally require the
// master "Enable MCP Access" switch to be on; keyID is non-empty only for the
// key path, so the caller can update that key's last-used timestamp.
func (h *Handler) authenticateMCPRequest(ctx context.Context, token string) (userID, keyID string, err error) {
	if strings.HasPrefix(token, keyLiteralPrefix) {
		userID, keyID, err = resolveKey(ctx, h.sb, token)
	} else {
		userID = h.resolveOAuthAccessToken(token)
	}
	if err != nil || userID == "" {
		return "", "", err
	}
	enabled, mErr := loadMaster(ctx, h.sb, userID)
	if mErr != nil {
		return "", "", mErr
	}
	if !enabled {
		return "", "", nil
	}
	return userID, keyID, nil
}

// resolveOAuthAccessToken verifies a short-lived OAuth access JWT minted by
// oauthToken and returns its subject, or "" when invalid, expired, or
// wrongly typed.
func (h *Handler) resolveOAuthAccessToken(token string) string {
	if h.env.JWTSecret == "" {
		return ""
	}
	claims, ok := jwt.ParseHS256(token, h.env.JWTSecret)
	if !ok {
		return ""
	}
	if typ, _ := claims["typ"].(string); typ != oauthAccessTokenTyp {
		return ""
	}
	sub, _ := claims["sub"].(string)
	return sub
}

// dispatchBatch handles a JSON-RPC array. Batching was dropped in the current
// MCP revision but older clients still send it, so requests are answered
// individually and notifications are dropped.
func (h *Handler) dispatchBatch(w http.ResponseWriter, r *http.Request, userID string, body []byte) {
	var reqs []rpcRequest
	if err := json.Unmarshal(body, &reqs); err != nil {
		writeRPC(w, newError(nil, codeParseError, "Invalid JSON-RPC batch"))
		return
	}
	responses := make([]*rpcResponse, 0, len(reqs))
	for i := range reqs {
		if resp := h.dispatch(r, userID, &reqs[i]); resp != nil {
			responses = append(responses, resp)
		}
	}
	if len(responses) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, responses)
}

// dispatch routes one JSON-RPC message. It returns nil for notifications.
func (h *Handler) dispatch(r *http.Request, userID string, req *rpcRequest) *rpcResponse {
	isNotification := len(req.ID) == 0
	if strings.HasPrefix(req.Method, "notifications/") || isNotification {
		return nil
	}

	switch req.Method {
	case "initialize":
		origin := requestOrigin(r)
		// Prefer the root /mcp-icon.png path Gemini/docs often expect, then
		// the /mcp/* variants. Absolute https URLs only (no relative paths).
		return newResult(req.ID, map[string]any{
			"protocolVersion": protocolVersion,
			"capabilities":    map[string]any{"tools": map[string]any{"listChanged": false}},
			"serverInfo": map[string]any{
				"name":    serverName,
				"title":   serverTitle,
				"version": serverVersion,
				"icons": []map[string]any{
					{
						"src":      iconDataURI(),
						"mimeType": "image/png",
						"sizes":    []string{"128x128"},
					},
					{
						"src":      origin + "/mcp-icon.png",
						"mimeType": "image/png",
						"sizes":    []string{"512x512"},
					},
					{
						"src":      origin + "/mcp/icon.png",
						"mimeType": "image/png",
						"sizes":    []string{"128x128"},
					},
				},
				"websiteUrl": "https://powersource.app",
			},
			"instructions": "GeoCRM CRM data. Call list_my_access, then list_entities, before reading or writing. get_record id is a UUID only — BillNo, customer codes, and emails need search_records. Use summarize_records for week/month/quarter/half-year/year reports (do not page all orders). For US East/West sales territories use filters.us_region=east|west on customers or customer_id entities such as orders; the complete state lists are in list_entities.us_sales_territories. Prefer the default page size of 25. Results are always limited to this user's groups and desktop permissions.",
		})

	case "ping":
		return newResult(req.ID, map[string]any{})

	case "resources/list":
		return newResult(req.ID, map[string]any{"resources": []any{}})

	case "prompts/list":
		return newResult(req.ID, map[string]any{"prompts": []any{}})

	case "tools/list":
		acc, err := resolveAccess(r.Context(), h.sb, userID)
		if err != nil {
			return newError(req.ID, codeInternalError, "Failed to resolve permissions")
		}
		return newResult(req.ID, map[string]any{"tools": buildTools(acc)})

	case "tools/call":
		var params callArgs
		if len(req.Params) > 0 {
			if err := json.Unmarshal(req.Params, &params); err != nil {
				return newError(req.ID, codeInvalidParams, "Invalid tools/call params")
			}
		}
		if params.Name == "" {
			return newError(req.ID, codeInvalidParams, "Missing tool name")
		}
		acc, err := resolveAccess(r.Context(), h.sb, userID)
		if err != nil {
			return newError(req.ID, codeInternalError, "Failed to resolve permissions")
		}
		if !toolAvailable(acc, params.Name) {
			return newResult(req.ID, errorResult("forbidden: tool "+params.Name+" is not available to this key"))
		}
		return newResult(req.ID, callTool(r.Context(), h.sb, acc, params.Name, params.Arguments))
	}

	return newError(req.ID, codeMethodNotFound, "Unknown method "+req.Method)
}

// toolAvailable guards tools/call with the same catalog tools/list advertises,
// so a hidden tool cannot be invoked by name.
func toolAvailable(acc *access, name string) bool {
	for _, tool := range buildTools(acc) {
		if tool.Name == name {
			return true
		}
	}
	return false
}

// writeUnauthorized answers an unauthenticated MCP request. The
// WWW-Authenticate challenge advertises RFC 9728 resource_metadata so
// OAuth-aware clients (notably Gemini) can discover the authorization server
// instead of treating the endpoint as API-key-only.
func (h *Handler) writeUnauthorized(w http.ResponseWriter, r *http.Request, message string) {
	metadataURL := requestOrigin(r) + "/.well-known/oauth-protected-resource/mcp"
	w.Header().Set(
		"WWW-Authenticate",
		`Bearer realm="geocrm-mcp", resource_metadata="`+metadataURL+`", scope="mcp"`,
	)
	httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"error": message})
}

// writeRPC sends a JSON-RPC response with HTTP 200, as required by the
// Streamable HTTP transport (protocol errors travel inside the envelope).
func writeRPC(w http.ResponseWriter, resp *rpcResponse) {
	httpx.WriteJSON(w, http.StatusOK, resp)
}

// ── Settings (Supabase JWT) ──────────────────────────────────────────────────

// keyView is one row of the Settings key list; never carries a secret.
type keyView struct {
	ID         string  `json:"id"`
	KeyPrefix  string  `json:"keyPrefix"`
	Label      *string `json:"label,omitempty"`
	Enabled    bool    `json:"enabled"`
	CreatedAt  string  `json:"createdAt"`
	LastUsedAt *string `json:"lastUsedAt,omitempty"`
}

// oauthView carries the copyable fields the Gemini "custom app" connector
// form asks for. ClientSecret is one shared value configured once in the
// server environment, not a per-user secret.
type oauthView struct {
	AuthorizeURL string `json:"authorizeUrl"`
	TokenURL     string `json:"tokenUrl"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

// settingsResponse is the payload the Electron Settings page renders.
type settingsResponse struct {
	Enabled     bool       `json:"enabled"`
	Endpoint    string     `json:"endpoint"`
	Keys        []keyView  `json:"keys"`
	MaxKeys     int        `json:"maxKeys"`
	NewKey      string     `json:"newKey,omitempty"`
	SetupPrompt string     `json:"setupPrompt,omitempty"`
	OAuth       *oauthView `json:"oauth,omitempty"`
}

// buildSettingsResponse assembles the full Settings payload. newKey, when
// non-empty, is a plaintext key just minted in this same request and is
// echoed back exactly once.
func (h *Handler) buildSettingsResponse(r *http.Request, userID, newKey string) (settingsResponse, error) {
	enabled, err := loadMaster(r.Context(), h.sb, userID)
	if err != nil {
		return settingsResponse{}, err
	}
	keys, err := listKeys(r.Context(), h.sb, userID)
	if err != nil {
		return settingsResponse{}, err
	}
	endpoint := endpointURL(r)
	resp := settingsResponse{
		Enabled:  enabled,
		Endpoint: endpoint,
		Keys:     make([]keyView, 0, len(keys)),
		MaxKeys:  maxKeysPerUser,
		NewKey:   newKey,
		OAuth:    h.oauthView(r),
	}
	for _, k := range keys {
		resp.Keys = append(resp.Keys, keyView{
			ID:         k.ID,
			KeyPrefix:  k.KeyPrefix,
			Label:      k.Label,
			Enabled:    k.Enabled,
			CreatedAt:  k.CreatedAt,
			LastUsedAt: k.LastUsedAt,
		})
	}
	if enabled {
		resp.SetupPrompt = h.setupPromptFor(r, endpoint, newKey, userID)
	}
	return resp, nil
}

// oauthView returns the Gemini connector fields, or nil when the server has
// no OAuth client configured (MCP_OAUTH_CLIENT_ID / _SECRET unset).
func (h *Handler) oauthView(r *http.Request) *oauthView {
	if h.env.MCPOAuthClientID == "" || h.env.MCPOAuthClientSecret == "" {
		return nil
	}
	origin := requestOrigin(r)
	return &oauthView{
		AuthorizeURL: origin + "/mcp/oauth/authorize",
		TokenURL:     origin + "/mcp/oauth/token",
		ClientID:     h.env.MCPOAuthClientID,
		ClientSecret: h.env.MCPOAuthClientSecret,
	}
}

// writeSettings loads the full settings payload and writes it, or a 500 on
// failure. Used by every settings mutation to return the fresh state.
func (h *Handler) writeSettings(w http.ResponseWriter, r *http.Request, userID, newKey string) {
	resp, err := h.buildSettingsResponse(r, userID, newKey)
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to load MCP settings")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, resp)
}

// getSettings reports the caller's MCP status without revealing any secret.
func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	h.writeSettings(w, r, authmw.UserIDFrom(r), "")
}

// postEnableMaster turns the master "Enable MCP Access" switch on. Individual
// keys are unaffected; a user with no keys yet can enable first, then add one.
func (h *Handler) postEnableMaster(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	if err := setMaster(r.Context(), h.sb, userID, true); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to enable MCP")
		return
	}
	h.writeSettings(w, r, userID, "")
}

// postDisableMaster turns the master switch off. This immediately blocks
// every key and OAuth token for the account without deleting any of them.
func (h *Handler) postDisableMaster(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	if err := setMaster(r.Context(), h.sb, userID, false); err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to disable MCP")
		return
	}
	h.writeSettings(w, r, userID, "")
}

// createKeyBody is the optional JSON body for POST /settings/keys.
type createKeyBody struct {
	Label string `json:"label"`
}

// postCreateKey mints a new key (up to maxKeysPerUser) and returns the
// plaintext exactly once.
func (h *Handler) postCreateKey(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	var body createKeyBody
	_ = httpx.DecodeJSON(r, &body) // label is optional; a missing/empty body is fine

	plaintext, _, err := createKey(r.Context(), h.sb, userID, body.Label)
	if errors.Is(err, errMaxKeysReached) {
		httpx.WriteError(w, http.StatusConflict, "You already have 5 keys. Delete one before adding another.")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to create MCP key")
		return
	}
	h.writeSettings(w, r, userID, plaintext)
}

// patchKeyBody is the JSON body for PATCH /settings/keys/{keyID}.
type patchKeyBody struct {
	Enabled *bool `json:"enabled"`
}

// patchKey toggles one key's enabled flag.
func (h *Handler) patchKey(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	keyID := chi.URLParam(r, "keyID")
	var body patchKeyBody
	if err := httpx.DecodeJSON(r, &body); err != nil || body.Enabled == nil {
		httpx.WriteError(w, http.StatusBadRequest, "Missing enabled field")
		return
	}
	err := setKeyEnabled(r.Context(), h.sb, userID, keyID, *body.Enabled)
	if errors.Is(err, errKeyNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Key not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to update key")
		return
	}
	h.writeSettings(w, r, userID, "")
}

// deleteKeyRoute deletes one key.
func (h *Handler) deleteKeyRoute(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	keyID := chi.URLParam(r, "keyID")
	err := deleteKey(r.Context(), h.sb, userID, keyID)
	if errors.Is(err, errKeyNotFound) {
		httpx.WriteError(w, http.StatusNotFound, "Key not found")
		return
	}
	if err != nil {
		httpx.WriteError(w, http.StatusInternalServerError, "Failed to delete key")
		return
	}
	h.writeSettings(w, r, userID, "")
}

// getSetupPrompt returns the English one-shot setup text without a secret.
func (h *Handler) getSetupPrompt(w http.ResponseWriter, r *http.Request) {
	userID := authmw.UserIDFrom(r)
	endpoint := endpointURL(r)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"endpoint": endpoint,
		"prompt":   h.setupPromptFor(r, endpoint, "", userID),
	})
}

// setupPromptFor renders the prompt, enriching it with the caller's entity list
// when permissions resolve. A permission lookup failure only costs that hint.
func (h *Handler) setupPromptFor(r *http.Request, endpoint, plaintextKey, userID string) string {
	acc, err := resolveAccess(r.Context(), h.sb, userID)
	if err != nil {
		acc = nil
	}
	return buildSetupPrompt(endpoint, plaintextKey, acc)
}

// requestOrigin rebuilds the public scheme://host origin from the incoming
// request, honouring the reverse proxy headers, so no new server environment
// variable is needed.
func requestOrigin(r *http.Request) string {
	scheme := "https"
	if forwarded := r.Header.Get("X-Forwarded-Proto"); forwarded != "" {
		scheme = strings.TrimSpace(strings.Split(forwarded, ",")[0])
	} else if r.TLS == nil && isLocalHost(r.Host) {
		scheme = "http"
	}
	host := r.Host
	if forwarded := r.Header.Get("X-Forwarded-Host"); forwarded != "" {
		host = strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	return scheme + "://" + host
}

// endpointURL rebuilds the public /mcp URL from the incoming request.
func endpointURL(r *http.Request) string {
	return requestOrigin(r) + "/mcp"
}

// isLocalHost reports whether host points at the developer machine.
func isLocalHost(host string) bool {
	return strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.0.0.1") || strings.HasPrefix(host, "[::1]")
}
