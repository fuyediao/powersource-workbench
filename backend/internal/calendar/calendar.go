// Package calendar implements /calendar/* routes for Google Calendar sync
// (multi-calendar selection, bidirectional LWW, personal calendar_events,
// and Google push/watch channels).
package calendar

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

// Handler serves the /calendar sub-app.
type Handler struct {
	env     config.Env
	sb      *supabase.Client
	pushSem chan struct{}
}

// New builds a calendar Google-sync handler.
func New(env config.Env, sb *supabase.Client) *Handler {
	return &Handler{
		env:     env,
		sb:      sb,
		pushSem: make(chan struct{}, pushSyncWorkers),
	}
}

// Routes returns the /calendar router.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.recoverJSON)
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) { calErr(w, http.StatusNotFound, "Not found") })
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) { calErr(w, http.StatusNotFound, "Not found") })

	r.Get("/oauth/google/callback", h.googleCallback)
	r.Post("/webhooks/google", h.googleWebhook)

	r.Group(func(pr chi.Router) {
		pr.Use(authmw.RequireUser(h.sb, authmw.DefaultUnauthorized))
		pr.Post("/google/link", h.googleLink)
		pr.Get("/google/account", h.getAccount)
		pr.Delete("/google/account", h.deleteAccount)
		pr.Get("/google/calendars", h.listGoogleCalendars)
		pr.Put("/google/selection", h.setGoogleSelection)
		pr.Post("/google/sync", h.syncGoogle)
		pr.Post("/google/events/{eventId}/push", h.pushGoogleEvent)
		pr.Delete("/google/events/{eventId}", h.deleteGoogleEvent)
	})

	return r
}

func calJSON(w http.ResponseWriter, status int, v any) { httpx.WriteJSON(w, status, v) }

func calErr(w http.ResponseWriter, status int, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": message})
}

func (h *Handler) recoverJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("calendar: panic on %s %s: %v\n%s", r.Method, r.URL.Path, rec, debug.Stack())
				httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{"error": "Internal server error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
