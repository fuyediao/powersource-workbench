// Package httpx provides JSON responses and CORS for workbench-api.
package httpx

import (
	"encoding/json"
	"io"
	"net/http"
)

// MaxBodyBytes caps JSON request bodies at 1 MiB.
const MaxBodyBytes = 1 << 20

// CORS allows the Electron renderer to call the API from localhost or workbench://.
func CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Access-Control-Allow-Origin", "*")
		h.Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		h.Set("Access-Control-Allow-Headers", "Accept, Content-Type, Authorization")
		h.Set("Access-Control-Max-Age", "86400")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// WriteJSON writes v as JSON with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteCode writes a stable {"code":...} error body.
func WriteCode(w http.ResponseWriter, status int, code string) {
	WriteJSON(w, status, map[string]string{"code": code})
}

// WriteError writes a {"error": message} JSON body with the given status.
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}

// WriteText writes a plain-text response with the given status.
func WriteText(w http.ResponseWriter, status int, text string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(text))
}

// DecodeJSON reads a JSON object from the request body.
func DecodeJSON(r *http.Request, v any) error {
	defer func() { _, _ = io.Copy(io.Discard, r.Body) }()
	return json.NewDecoder(io.LimitReader(r.Body, MaxBodyBytes)).Decode(v)
}

// BearerToken returns the Authorization Bearer token, or empty.
func BearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	const prefix = "Bearer "
	if len(auth) > len(prefix) && auth[:len(prefix)] == prefix {
		return auth[len(prefix):]
	}
	return ""
}
