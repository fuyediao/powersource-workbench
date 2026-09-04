package mcp

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

const (
	mcpFaviconFilename = "mcp/favicon.ico"
	mcpIconFilename    = "mcp/icon-128.png"
	mcpIconLargeFile   = "mcp/icon.png"
	mcpIconPublicFile  = "mcp/mcp-icon.png"
)

// Favicon serves the GeoCRM icon as /favicon.ico so Gemini (and other clients
// that resolve a connector avatar from the API host favicon) can load it.
func (h *Handler) Favicon(w http.ResponseWriter, r *http.Request) {
	serveAsset(w, r, mcpFaviconFilename, "image/x-icon")
}

// IconPNG serves a square GeoCRM PNG for MCP serverInfo.icons and deep links.
func (h *Handler) IconPNG(w http.ResponseWriter, r *http.Request) {
	serveAsset(w, r, mcpIconFilename, "image/png")
}

// IconLargePNG serves a larger GeoCRM PNG (512×512) for clients that prefer it.
func (h *Handler) IconLargePNG(w http.ResponseWriter, r *http.Request) {
	serveAsset(w, r, mcpIconLargeFile, "image/png")
}

// McpIconPNG serves GET /mcp-icon.png (root path some Gemini docs expect).
func (h *Handler) McpIconPNG(w http.ResponseWriter, r *http.Request) {
	serveAsset(w, r, mcpIconPublicFile, "image/png")
}

// serveAsset writes a file under assets/ with a long public cache.
func serveAsset(w http.ResponseWriter, r *http.Request, relativePath, contentType string) {
	data, err := os.ReadFile(filepath.Join("assets", relativePath))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.WriteHeader(http.StatusOK)
	if r.Method == http.MethodHead {
		return
	}
	_, _ = w.Write(data)
}
