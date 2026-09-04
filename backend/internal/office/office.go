// Package office implements the /office/* routes bridging Electron and the
// OnlyOffice Document Server for the Docs/Sheets/Slides library. Files are
// personal (owner_user_id) XOR group (group_id) rows in Supabase table
// office_files, with native OOXML bytes in the private office-files Storage
// bucket (see supabase/sql/migrations/20260828_office_files.sql).
//
// Three endpoints only — file CRUD (create/rename/delete/list) is handled by
// Electron directly against Supabase (RLS already enforces the same rules
// mirrored here in Go for defense in depth against the service-role bypass):
//
//   - POST /office/session  — resolve ACL, mint an editorConfig for the
//     Document Server (JWT-signed per api.onlyoffice.com/docs/docs-api).
//   - GET  /office/download — the Document Server fetches the OOXML bytes
//     using the scoped download token minted by /session.
//   - POST /office/callback — the Document Server reports save-ready status
//     (MustSave / MustForceSave) and geocrm-api persists the edited bytes.
package office

import (
	"log"
	"net/http"
	"runtime/debug"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// officeFilesBucket is the private Storage bucket holding OOXML bytes,
// object-keyed as {office_files.id}/{filename}.
const officeFilesBucket = "office-files"

// Handler serves the /office sub-app.
type Handler struct {
	env config.Env
	sb  *supabase.Client
}

// New builds an office handler.
func New(env config.Env, sb *supabase.Client) *Handler {
	return &Handler{env: env, sb: sb}
}

// Routes returns the /office router.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.recoverJSON)
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) { officeErr(w, http.StatusNotFound, "Not found") })
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) { officeErr(w, http.StatusNotFound, "Not found") })

	// Called by the Document Server (signed with ONLYOFFICE_JWT_SECRET, not
	// a Supabase session) — must stay outside the RequireUser group.
	r.Get("/download", h.download)
	r.Post("/callback", h.callback)

	r.Group(func(pr chi.Router) {
		pr.Use(authmw.RequireUser(h.sb, authmw.DefaultUnauthorized))
		pr.Post("/session", h.session)
	})

	return r
}

// internalAPIBase returns the Docker-network address the OnlyOffice Document
// Server uses to reach this service directly for /office/download and
// /office/callback (the `geocrm-api` alias joined on supabase_default; see
// docker-compose.api.yml.example), avoiding a public round trip through the
// nginx-fronted api.{domain} host.
func (h *Handler) internalAPIBase() string {
	port := h.env.Port
	if port == "" {
		port = "3001"
	}
	return "http://geocrm-api:" + port
}

func officeJSON(w http.ResponseWriter, status int, v any) { httpx.WriteJSON(w, status, v) }

func officeErr(w http.ResponseWriter, status int, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": message})
}

func (h *Handler) recoverJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("office: panic on %s %s: %v\n%s", r.Method, r.URL.Path, rec, debug.Stack())
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "Internal server error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
