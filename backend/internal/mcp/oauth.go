// OAuth 2.0 authorization-code support for /mcp, added for Gemini: it is the
// only supported MCP client that cannot send a raw Bearer key and requires a
// standard authorization-code + refresh-token flow. Identity is bound at
// consent time by asking the user to paste one of their own MCP keys, so no
// second login system is introduced.
package mcp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"html/template"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/jwt"
)

const (
	// oauthAccessTokenTTL is how long a minted access JWT is valid. Gemini is
	// expected to use the refresh token to mint a new one afterwards.
	oauthAccessTokenTTL = time.Hour
	// oauthCodeTTL is how long an authorization code may be redeemed for.
	oauthCodeTTL = 5 * time.Minute
	// oauthAccessTokenTyp distinguishes an MCP OAuth access token from other
	// HS256 JWTs signed with the same JWT_SECRET (proxy agent tokens, etc.).
	oauthAccessTokenTyp = "mcp_oauth_access"
	// oauthOpaqueBytes is the entropy behind authorization codes and refresh
	// tokens; both are hashed at rest exactly like an MCP key.
	oauthOpaqueBytes = 32
)

// randomOpaqueToken returns a high-entropy hex string suitable for an
// authorization code or refresh token.
func randomOpaqueToken() (string, error) {
	buf := make([]byte, oauthOpaqueBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// oauthRequestParams is the subset of an authorize request both the GET
// (initial visit) and POST (form submit) handlers need.
type oauthRequestParams struct {
	ClientID            string
	RedirectURI         string
	State               string
	CodeChallenge       string
	CodeChallengeMethod string
}

// parseOAuthRequestParams reads the shared fields from either a query string
// or a submitted form.
func parseOAuthRequestParams(values url.Values) oauthRequestParams {
	return oauthRequestParams{
		ClientID:            strings.TrimSpace(values.Get("client_id")),
		RedirectURI:         strings.TrimSpace(values.Get("redirect_uri")),
		State:               values.Get("state"),
		CodeChallenge:       strings.TrimSpace(values.Get("code_challenge")),
		CodeChallengeMethod: strings.TrimSpace(values.Get("code_challenge_method")),
	}
}

// validateClientAndRedirect checks the shared OAuth client id and that
// redirect_uri is an absolute http(s) URL. There is no redirect_uri
// allowlist beyond that: this deployment has exactly one configured client,
// and an issued code cannot be redeemed for tokens without that client's
// secret, which only the real Gemini connector configuration holds.
func (h *Handler) validateClientAndRedirect(p oauthRequestParams) (message string, ok bool) {
	if h.env.MCPOAuthClientID == "" || h.env.MCPOAuthClientSecret == "" {
		return "OAuth is not configured on this server.", false
	}
	if p.ClientID == "" || p.ClientID != h.env.MCPOAuthClientID {
		return "Unknown client_id.", false
	}
	parsed, err := url.Parse(p.RedirectURI)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return "Missing or invalid redirect_uri.", false
	}
	return "", true
}

// oauthAuthorizeGet renders the consent page for a fresh authorize request.
func (h *Handler) oauthAuthorizeGet(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	if rt := query.Get("response_type"); rt != "" && rt != "code" {
		writeOAuthErrorPage(w, "Only response_type=code is supported.")
		return
	}
	p := parseOAuthRequestParams(query)
	if message, ok := h.validateClientAndRedirect(p); !ok {
		writeOAuthErrorPage(w, message)
		return
	}
	writeOAuthConsentForm(w, p, "")
}

// oauthAuthorizePost verifies the pasted MCP key, mints a one-time
// authorization code, and redirects back to the client with it.
func (h *Handler) oauthAuthorizePost(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeOAuthErrorPage(w, "Invalid form submission.")
		return
	}
	p := parseOAuthRequestParams(r.PostForm)
	if message, ok := h.validateClientAndRedirect(p); !ok {
		writeOAuthErrorPage(w, message)
		return
	}

	key := strings.TrimSpace(r.PostFormValue("key"))
	userID, _, err := resolveKey(r.Context(), h.sb, key)
	if err != nil {
		writeOAuthErrorPage(w, "Could not verify your key. Try again shortly.")
		return
	}
	if userID == "" {
		writeOAuthConsentForm(w, p, "That key was not recognized, is disabled, or has been deleted.")
		return
	}

	codePlain, err := randomOpaqueToken()
	if err != nil {
		writeOAuthErrorPage(w, "Failed to issue an authorization code.")
		return
	}
	row := map[string]any{
		"code_hash":    hashKey(codePlain),
		"user_id":      userID,
		"client_id":    p.ClientID,
		"redirect_uri": p.RedirectURI,
		"expires_at":   time.Now().UTC().Add(oauthCodeTTL).Format(time.RFC3339),
	}
	if p.CodeChallenge != "" {
		row["code_challenge"] = p.CodeChallenge
		row["code_challenge_method"] = p.CodeChallengeMethod
	}
	if err := h.sb.From("mcp_oauth_codes").Insert(row).Exec(r.Context(), nil); err != nil {
		writeOAuthErrorPage(w, "Failed to issue an authorization code.")
		return
	}

	redirectURL, err := url.Parse(p.RedirectURI)
	if err != nil {
		writeOAuthErrorPage(w, "Invalid redirect_uri.")
		return
	}
	q := redirectURL.Query()
	q.Set("code", codePlain)
	if p.State != "" {
		q.Set("state", p.State)
	}
	redirectURL.RawQuery = q.Encode()
	http.Redirect(w, r, redirectURL.String(), http.StatusFound)
}

// oauthErrorResponse writes an OAuth 2.0 error body (RFC 6749 section 5.2).
func oauthErrorResponse(w http.ResponseWriter, status int, code, description string) {
	httpx.WriteJSON(w, status, map[string]any{"error": code, "error_description": description})
}

// oauthClientCredentials reads client_id/client_secret from HTTP Basic auth
// (client_secret_basic) or the POST body (client_secret_post).
func oauthClientCredentials(r *http.Request) (clientID, clientSecret string) {
	if id, secret, ok := r.BasicAuth(); ok {
		return id, secret
	}
	return r.PostFormValue("client_id"), r.PostFormValue("client_secret")
}

// oauthToken implements POST /mcp/oauth/token for both grant types.
func (h *Handler) oauthToken(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		oauthErrorResponse(w, http.StatusBadRequest, "invalid_request", "Could not parse the request body")
		return
	}
	if h.env.MCPOAuthClientID == "" || h.env.MCPOAuthClientSecret == "" {
		oauthErrorResponse(w, http.StatusUnauthorized, "invalid_client", "OAuth is not configured on this server")
		return
	}
	clientID, clientSecret := oauthClientCredentials(r)
	if clientID != h.env.MCPOAuthClientID || clientSecret != h.env.MCPOAuthClientSecret {
		oauthErrorResponse(w, http.StatusUnauthorized, "invalid_client", "Unknown client_id or client_secret")
		return
	}

	switch r.PostFormValue("grant_type") {
	case "authorization_code":
		h.oauthExchangeCode(w, r, clientID)
	case "refresh_token":
		h.oauthExchangeRefreshToken(w, r, clientID)
	default:
		oauthErrorResponse(w, http.StatusBadRequest, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token")
	}
}

// oauthCodeRow is the row read back when an authorization code is consumed.
type oauthCodeRow struct {
	ID                  string  `json:"id"`
	UserID              string  `json:"user_id"`
	ClientID            string  `json:"client_id"`
	RedirectURI         string  `json:"redirect_uri"`
	CodeChallenge       *string `json:"code_challenge"`
	CodeChallengeMethod *string `json:"code_challenge_method"`
}

// consumeAuthCode atomically claims an unused, unexpired code by flipping
// used_at in the same request that reads it, so concurrent redemption
// attempts cannot both succeed. A nil result (no error) means the code is
// unknown, expired, or already used.
func (h *Handler) consumeAuthCode(ctx context.Context, codeHash string) (*oauthCodeRow, error) {
	var rows []oauthCodeRow
	if err := h.sb.From("mcp_oauth_codes").
		Eq("code_hash", codeHash).
		Is("used_at", "null").
		Gt("expires_at", time.Now().UTC().Format(time.RFC3339)).
		Update(map[string]any{"used_at": time.Now().UTC().Format(time.RFC3339)}).
		Returning().
		Select("id,user_id,client_id,redirect_uri,code_challenge,code_challenge_method").
		Exec(ctx, &rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
}

// oauthExchangeCode redeems an authorization code for a token pair.
func (h *Handler) oauthExchangeCode(w http.ResponseWriter, r *http.Request, clientID string) {
	code := r.PostFormValue("code")
	if code == "" {
		oauthErrorResponse(w, http.StatusBadRequest, "invalid_request", "Missing code")
		return
	}
	row, err := h.consumeAuthCode(r.Context(), hashKey(code))
	if err != nil {
		oauthErrorResponse(w, http.StatusInternalServerError, "server_error", "Failed to redeem the authorization code")
		return
	}
	if row == nil {
		oauthErrorResponse(w, http.StatusBadRequest, "invalid_grant", "The authorization code is invalid, expired, or already used")
		return
	}
	if row.ClientID != clientID || row.RedirectURI != r.PostFormValue("redirect_uri") {
		oauthErrorResponse(w, http.StatusBadRequest, "invalid_grant", "client_id or redirect_uri does not match the authorization request")
		return
	}
	if row.CodeChallenge != nil && *row.CodeChallenge != "" {
		method := ""
		if row.CodeChallengeMethod != nil {
			method = *row.CodeChallengeMethod
		}
		if !verifyPKCE(*row.CodeChallenge, method, r.PostFormValue("code_verifier")) {
			oauthErrorResponse(w, http.StatusBadRequest, "invalid_grant", "code_verifier does not match code_challenge")
			return
		}
	}
	h.issueTokenPair(w, r.Context(), row.UserID, clientID)
}

// verifyPKCE checks a PKCE code_verifier against the stored code_challenge.
func verifyPKCE(challenge, method, verifier string) bool {
	if verifier == "" {
		return false
	}
	switch strings.ToUpper(method) {
	case "", "PLAIN":
		return verifier == challenge
	case "S256":
		sum := sha256.Sum256([]byte(verifier))
		return base64.RawURLEncoding.EncodeToString(sum[:]) == challenge
	default:
		return false
	}
}

// oauthExchangeRefreshToken mints a new access token from a stored refresh
// token. The refresh token itself is not rotated.
func (h *Handler) oauthExchangeRefreshToken(w http.ResponseWriter, r *http.Request, clientID string) {
	refreshToken := r.PostFormValue("refresh_token")
	if refreshToken == "" {
		oauthErrorResponse(w, http.StatusBadRequest, "invalid_request", "Missing refresh_token")
		return
	}
	var row struct {
		UserID    string  `json:"user_id"`
		ClientID  string  `json:"client_id"`
		RevokedAt *string `json:"revoked_at"`
	}
	found, err := h.sb.From("mcp_oauth_tokens").
		Select("user_id,client_id,revoked_at").
		Eq("refresh_hash", hashKey(refreshToken)).
		MaybeSingle(r.Context(), &row)
	if err != nil {
		oauthErrorResponse(w, http.StatusInternalServerError, "server_error", "Failed to verify the refresh token")
		return
	}
	if !found || row.RevokedAt != nil || row.ClientID != clientID {
		oauthErrorResponse(w, http.StatusBadRequest, "invalid_grant", "The refresh token is invalid or revoked")
		return
	}

	accessToken, err := signOAuthAccessToken(h.env.JWTSecret, row.UserID)
	if err != nil {
		oauthErrorResponse(w, http.StatusInternalServerError, "server_error", "Failed to issue an access token")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"access_token":  accessToken,
		"token_type":    "Bearer",
		"expires_in":    int(oauthAccessTokenTTL.Seconds()),
		"refresh_token": refreshToken,
		"scope":         "mcp",
	})
}

// issueTokenPair stores a new refresh token and writes the token response
// with a freshly signed access token.
func (h *Handler) issueTokenPair(w http.ResponseWriter, ctx context.Context, userID, clientID string) {
	refreshPlain, err := randomOpaqueToken()
	if err != nil {
		oauthErrorResponse(w, http.StatusInternalServerError, "server_error", "Failed to issue a refresh token")
		return
	}
	if err := h.sb.From("mcp_oauth_tokens").Insert(map[string]any{
		"user_id":      userID,
		"client_id":    clientID,
		"refresh_hash": hashKey(refreshPlain),
	}).Exec(ctx, nil); err != nil {
		oauthErrorResponse(w, http.StatusInternalServerError, "server_error", "Failed to issue a refresh token")
		return
	}

	accessToken, err := signOAuthAccessToken(h.env.JWTSecret, userID)
	if err != nil {
		oauthErrorResponse(w, http.StatusInternalServerError, "server_error", "Failed to issue an access token")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"access_token":  accessToken,
		"token_type":    "Bearer",
		"expires_in":    int(oauthAccessTokenTTL.Seconds()),
		"refresh_token": refreshPlain,
		"scope":         "mcp",
	})
}

// signOAuthAccessToken mints a short-lived HS256 JWT for the MCP OAuth flow.
func signOAuthAccessToken(secret, userID string) (string, error) {
	if secret == "" {
		return "", errors.New("mcp: JWT_SECRET is not configured")
	}
	now := time.Now().UTC()
	return jwt.SignHS256(map[string]any{
		"sub": userID,
		"typ": oauthAccessTokenTyp,
		"aud": "geocrm-mcp",
		"iat": now.Unix(),
		"exp": now.Add(oauthAccessTokenTTL).Unix(),
	}, secret)
}

// ── Consent page rendering ───────────────────────────────────────────────────

// oauthPageData drives oauthPageTemplate. Every field is auto-escaped by
// html/template, so caller-controlled query/form values can never break out
// of their attribute or text context.
type oauthPageData struct {
	Title               string
	ShowForm            bool
	ErrorMessage        string
	ClientID            string
	RedirectURI         string
	State               string
	CodeChallenge       string
	CodeChallengeMethod string
}

var oauthPageTemplate = template.Must(template.New("oauth").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{.Title}}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b0b10;color:#f5f5f7;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
main{max-width:420px;width:100%;padding:32px;background:#16161d;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
h1{font-size:20px;margin:0 0 8px}
p{font-size:14px;line-height:1.5;color:#b6b6c0;margin:0 0 12px}
.hint{font-size:12px;color:#8a8a96}
.error{color:#ff6b6b;font-weight:600}
label{display:block;font-size:13px;margin:18px 0 6px;color:#d6d6db}
input[type=password]{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #2b2b34;background:#0f0f14;color:#f5f5f7;font-size:14px}
button{margin-top:18px;width:100%;padding:11px;border:none;border-radius:10px;background:#4f7cff;color:#fff;font-size:14px;font-weight:600;cursor:pointer}
button:hover{background:#3f68e8}
</style>
</head>
<body>
<main>
<h1>Connect to GeoCRM</h1>
{{if .ShowForm}}
<p>An application is requesting access to your GeoCRM data via the Model Context Protocol (MCP).</p>
{{if .ErrorMessage}}<p class="error">{{.ErrorMessage}}</p>{{end}}
<form method="POST">
<input type="hidden" name="client_id" value="{{.ClientID}}">
<input type="hidden" name="redirect_uri" value="{{.RedirectURI}}">
<input type="hidden" name="state" value="{{.State}}">
<input type="hidden" name="code_challenge" value="{{.CodeChallenge}}">
<input type="hidden" name="code_challenge_method" value="{{.CodeChallengeMethod}}">
<label for="key">Your GeoCRM MCP key</label>
<input id="key" name="key" type="password" placeholder="gcrm_mcp_..." autocomplete="off" autofocus required>
<p class="hint">Find it in GeoCRM &rarr; Settings &rarr; Model Context Protocol. Access is limited to your own permissions.</p>
<button type="submit">Authorize</button>
</form>
{{else}}
<p class="error">{{.ErrorMessage}}</p>
{{end}}
</main>
</body>
</html>`))

// renderOAuthPage executes oauthPageTemplate with the given status.
func renderOAuthPage(w http.ResponseWriter, status int, data oauthPageData) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_ = oauthPageTemplate.Execute(w, data)
}

// writeOAuthErrorPage renders a terminal error (no form to retry, typically a
// misconfigured client_id/redirect_uri that cannot safely redirect back).
func writeOAuthErrorPage(w http.ResponseWriter, message string) {
	renderOAuthPage(w, http.StatusBadRequest, oauthPageData{
		Title:        "GeoCRM MCP \u00b7 Error",
		ShowForm:     false,
		ErrorMessage: message,
	})
}

// writeOAuthConsentForm renders the "paste your key" form, optionally with an
// inline error from a previous failed attempt.
func writeOAuthConsentForm(w http.ResponseWriter, p oauthRequestParams, errMsg string) {
	renderOAuthPage(w, http.StatusOK, oauthPageData{
		Title:               "GeoCRM MCP \u00b7 Authorize",
		ShowForm:            true,
		ErrorMessage:        errMsg,
		ClientID:            p.ClientID,
		RedirectURI:         p.RedirectURI,
		State:               p.State,
		CodeChallenge:       p.CodeChallenge,
		CodeChallengeMethod: p.CodeChallengeMethod,
	})
}
