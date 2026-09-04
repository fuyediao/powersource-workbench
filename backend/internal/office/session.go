package office

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/jwt"
)

// downloadTokenTTL and callbackTokenTTL bound how long the Document Server
// may call back into geocrm-api for one editing session. Callback needs the
// longer window: OnlyOffice posts MustSave ~10s after the document is closed,
// which can be hours after /session minted the token for a long edit.
const (
	downloadTokenTTLSeconds = 15 * 60
	callbackTokenTTLSeconds = 12 * 60 * 60
)

// supportedOfficeLangs are the OnlyOffice editorConfig.lang values the
// Electron chrome may request; anything else falls back to "en". Per
// api.onlyoffice.com/docs/docs-api/usage-api/config/editor (lang), Simplified
// Chinese is the two-letter code "zh" — "zh-CN" is only valid for the
// unrelated editorConfig.region parameter and is not a recognized lang value.
// Keep in sync with backend/onlyoffice-overlay/apply_overlay.py
// KEEP_LOCALE_FILES and geocrm-electron officeLangFromAppLanguage.
var supportedOfficeLangs = map[string]bool{
	"en": true, "zh": true, "zh-TW": true,
}

type sessionRequest struct {
	FileID string `json:"file_id"`
	Lang   string `json:"lang"`
}

// session resolves ACL for one office_files row and mints an OnlyOffice
// editorConfig (JWT-signed) for the Electron host to hand to DocsAPI.DocEditor.
//
//	POST /office/session
func (h *Handler) session(w http.ResponseWriter, r *http.Request) {
	var req sessionRequest
	if err := httpx.DecodeJSON(r, &req); err != nil || strings.TrimSpace(req.FileID) == "" {
		officeErr(w, http.StatusBadRequest, "file_id is required")
		return
	}
	userID := authmw.UserIDFrom(r)

	row, err := h.loadFile(r.Context(), req.FileID)
	if err != nil {
		officeErr(w, http.StatusBadGateway, "Failed to load file")
		return
	}
	if row == nil {
		officeErr(w, http.StatusNotFound, "File not found")
		return
	}
	acl := h.resolveAccess(r.Context(), userID, row)
	if !acl.CanView {
		officeErr(w, http.StatusForbidden, "Forbidden")
		return
	}
	if h.env.OnlyOfficeJWTSecret == "" || h.env.OnlyOfficeDSURL == "" {
		officeErr(w, http.StatusServiceUnavailable, "Office editor is not configured")
		return
	}

	lang := strings.TrimSpace(req.Lang)
	if !supportedOfficeLangs[lang] {
		lang = "en"
	}

	now := time.Now().Unix()
	downloadToken, err := jwt.SignHS256(map[string]any{
		"file_id": row.ID,
		"aud":     "download",
		"iat":     now,
		"exp":     now + downloadTokenTTLSeconds,
	}, h.env.OnlyOfficeJWTSecret)
	if err != nil {
		officeErr(w, http.StatusInternalServerError, "Failed to mint download token")
		return
	}
	callbackToken, err := jwt.SignHS256(map[string]any{
		"file_id": row.ID,
		"aud":     "callback",
		"uid":     userID,
		"iat":     now,
		"exp":     now + callbackTokenTTLSeconds,
	}, h.env.OnlyOfficeJWTSecret)
	if err != nil {
		officeErr(w, http.StatusInternalServerError, "Failed to mint callback token")
		return
	}

	base := h.internalAPIBase()
	downloadURL := base + "/office/download?" + url.Values{"token": {downloadToken}}.Encode()
	callbackURL := base + "/office/callback?" + url.Values{"token": {callbackToken}}.Encode()

	document := map[string]any{
		"fileType": fileExtension(row.Kind),
		"key":      documentKey(row),
		"title":    displayFilename(row),
		"url":      downloadURL,
		"permissions": map[string]any{
			"edit":                 acl.CanEdit,
			"download":             true,
			"print":                true,
			"copy":                 true,
			"comment":              acl.CanEdit,
			"review":               false,
			"fillForms":            false,
			"modifyFilter":         true,
			"modifyContentControl": acl.CanEdit,
		},
	}
	editorConfig := map[string]any{
		"callbackUrl": callbackURL,
		"lang":        lang,
		"mode":        map[bool]string{true: "edit", false: "view"}[acl.CanEdit],
		"user": map[string]any{
			"id":   userID,
			"name": displayUserName(userID),
		},
		"customization": map[string]any{
			"autosave":  true,
			"forcesave": false,
		},
	}

	token, err := jwt.SignHS256(map[string]any{
		"document":     document,
		"editorConfig": editorConfig,
	}, h.env.OnlyOfficeJWTSecret)
	if err != nil {
		officeErr(w, http.StatusInternalServerError, "Failed to sign editor config")
		return
	}

	officeJSON(w, http.StatusOK, map[string]any{
		"docServerUrl": strings.TrimRight(h.env.OnlyOfficeDSURL, "/") + "/web-apps/apps/api/documents/api.js",
		"config": map[string]any{
			"documentType": documentServerType(row.Kind),
			"document":     document,
			"editorConfig": editorConfig,
			"token":        token,
		},
	})
}

// documentKey derives a stable-until-edited OnlyOffice document key. It must
// change whenever the underlying bytes change so the Document Server does
// not serve a stale cached copy after a save made outside an active session.
func documentKey(row *fileRow) string {
	sum := sha1.Sum([]byte(row.ID + "|" + row.UpdatedAt))
	return hex.EncodeToString(sum[:])
}

// displayUserName is a minimal editorConfig.user.name fallback; the co-editing
// presence UI only needs a stable, human-distinguishable label.
func displayUserName(userID string) string {
	if len(userID) < 8 {
		return "User"
	}
	return fmt.Sprintf("User %s", userID[:8])
}
