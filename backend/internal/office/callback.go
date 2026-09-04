package office

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// Document Server callback status codes (api.onlyoffice.com/docs/docs-api/usage-api/callback-handler).
const (
	statusEditing        = 1
	statusMustSave       = 2
	statusSavingError    = 3
	statusClosedNoEdits  = 4
	statusMustForceSave  = 6
	statusForceSaveError = 7
)

// callbackBody is the subset of the Document Server callback payload needed
// to persist an edited file. Unknown fields (history, actions, users, ...)
// are ignored by json.Unmarshal.
type callbackBody struct {
	Key    string `json:"key"`
	Status int    `json:"status"`
	URL    string `json:"url"`
}

// callbackHTTPClient fetches the edited document from the Document Server's
// temporary URL. A generous timeout accommodates larger presentations.
var callbackHTTPClient = &http.Client{Timeout: 60 * time.Second}

// callback receives Document Server save notifications and persists the
// edited bytes back to Storage. Always responds {"error":0} on success per
// the OnlyOffice contract; the Document Server retries and eventually shows
// a "could not be saved" error to the user when this returns non-zero.
//
//	POST /office/callback?token=...
func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	fileID, userID, ok := h.verifyOfficeTokenClaims(r.URL.Query().Get("token"), "callback")
	if !ok {
		officeJSON(w, http.StatusOK, map[string]any{"error": 1})
		return
	}

	var body callbackBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		officeJSON(w, http.StatusOK, map[string]any{"error": 1})
		return
	}

	if body.Status != statusMustSave && body.Status != statusMustForceSave {
		// Editing / closed-with-no-changes / error statuses need no action;
		// acking keeps the Document Server from retrying.
		officeJSON(w, http.StatusOK, map[string]any{"error": 0})
		return
	}
	if body.URL == "" {
		officeJSON(w, http.StatusOK, map[string]any{"error": 1})
		return
	}

	row, err := h.loadFile(r.Context(), fileID)
	if err != nil || row == nil {
		officeJSON(w, http.StatusOK, map[string]any{"error": 1})
		return
	}

	// The callback token only proves the caller once held a valid /session
	// for this file (minted for every viewer, not just editors, and valid
	// for up to callbackTokenTTLSeconds). Re-resolve ACL against the current
	// grants so a read-only viewer — or a since-revoked editor — cannot
	// persist bytes.
	acl := h.resolveAccess(r.Context(), userID, row)
	if !acl.CanEdit {
		officeJSON(w, http.StatusOK, map[string]any{"error": 1})
		return
	}

	data, err := h.fetchEditedDocument(body.URL)
	if err != nil || len(data) == 0 {
		officeJSON(w, http.StatusOK, map[string]any{"error": 1})
		return
	}

	contentType := contentTypeForKind(row.Kind)
	if err := h.sb.StorageUpload(r.Context(), officeFilesBucket, row.StoragePath, data, contentType, true); err != nil {
		officeJSON(w, http.StatusOK, map[string]any{"error": 1})
		return
	}
	updates := map[string]any{"updated_at": time.Now().UTC().Format(time.RFC3339)}
	if userID != "" {
		updates["updated_by"] = userID
	}
	_ = h.sb.From("office_files").
		Update(updates).
		Eq("id", row.ID).
		Exec(r.Context(), nil)

	officeJSON(w, http.StatusOK, map[string]any{"error": 0})
}

// fetchEditedDocument downloads the Document Server's temporary edited-file
// URL (a plain, unauthenticated HTTPS link scoped to one save event). The
// caller (the Document Server) is only weakly authenticated by the callback
// token, so body.url is effectively attacker-reachable; without a host
// allowlist this would be SSRF that lets any URL be fetched and its bytes
// written into the office-files bucket.
func (h *Handler) fetchEditedDocument(rawURL string) ([]byte, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("office: callback url scheme %q is not allowed", parsed.Scheme)
	}
	if parsed.Hostname() == "" || !h.allowedCallbackHosts()[strings.ToLower(parsed.Hostname())] {
		return nil, fmt.Errorf("office: callback url host %q is not the configured Document Server", parsed.Hostname())
	}

	resp, err := callbackHTTPClient.Get(rawURL)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, io.ErrUnexpectedEOF
	}
	return io.ReadAll(io.LimitReader(resp.Body, 50<<20+1))
}

// allowedCallbackHosts is the set of hostnames fetchEditedDocument may
// contact: the public Document Server origin handed to Electron
// (OnlyOfficeDSURL) and its Docker-network alias
// (ResolvedOnlyOfficeDSInternalURL). Document Server may build the callback
// body.url from either origin depending on deployment; nothing else should
// ever be a legitimate value.
func (h *Handler) allowedCallbackHosts() map[string]bool {
	hosts := make(map[string]bool, 2)
	for _, raw := range []string{h.env.OnlyOfficeDSURL, h.env.ResolvedOnlyOfficeDSInternalURL()} {
		if parsed, err := url.Parse(raw); err == nil && parsed.Hostname() != "" {
			hosts[strings.ToLower(parsed.Hostname())] = true
		}
	}
	return hosts
}
