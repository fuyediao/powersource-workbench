package office

import (
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/jwt"
)

// download streams the current OOXML bytes for one office_files row to the
// Document Server. Authenticated by a short-lived token minted by /session
// (query param `token`), not a Supabase session — the Document Server has no
// user credentials of its own.
//
//	GET /office/download?token=...
func (h *Handler) download(w http.ResponseWriter, r *http.Request) {
	fileID, ok := h.verifyOfficeToken(r.URL.Query().Get("token"), "download")
	if !ok {
		officeErr(w, http.StatusUnauthorized, "Invalid or expired token")
		return
	}

	row, err := h.loadFile(r.Context(), fileID)
	if err != nil || row == nil || row.StoragePath == "" {
		officeErr(w, http.StatusNotFound, "File not found")
		return
	}

	data, contentType, err := h.sb.StorageDownload(r.Context(), officeFilesBucket, row.StoragePath)
	if err != nil {
		officeErr(w, http.StatusBadGateway, "Failed to load file bytes")
		return
	}
	if strings.TrimSpace(contentType) == "" {
		contentType = contentTypeForKind(row.Kind)
	}

	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// verifyOfficeToken validates a query-string token minted by /session,
// checking both the signature and the expected `aud` claim.
func (h *Handler) verifyOfficeToken(token, wantAud string) (fileID string, ok bool) {
	fileID, _, ok = h.verifyOfficeTokenClaims(token, wantAud)
	return fileID, ok
}

// verifyOfficeTokenClaims validates a query-string token and also returns the
// `uid` claim (present on callback tokens; empty on download tokens).
func (h *Handler) verifyOfficeTokenClaims(token, wantAud string) (fileID, userID string, ok bool) {
	if token == "" || h.env.OnlyOfficeJWTSecret == "" {
		return "", "", false
	}
	claims, valid := jwt.ParseHS256(token, h.env.OnlyOfficeJWTSecret)
	if !valid {
		return "", "", false
	}
	if aud, _ := claims["aud"].(string); aud != wantAud {
		return "", "", false
	}
	fileID, _ = claims["file_id"].(string)
	if fileID == "" {
		return "", "", false
	}
	userID, _ = claims["uid"].(string)
	return fileID, userID, true
}
