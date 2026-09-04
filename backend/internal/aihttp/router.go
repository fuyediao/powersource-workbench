// Package aihttp mounts JWT-authenticated /ai/* feature routes.
// Business prompts live in sibling packages under internal/ai/<feature>/;
// this package only wires HTTP.
package aihttp

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/aichat"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/customer"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/kol"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/mapchat"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/models"
	providershttp "github.com/fuyediao/powersource-workbench/backend/internal/ai/providershttp"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/settings"
	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/harness"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Handler owns shared deps for /ai routes.
type Handler struct {
	sb      *supabase.Client
	aiC     *ai.Client
	harness *harness.Handler
}

// New builds the /ai router owner.
func New(env config.Env, sb *supabase.Client) *Handler {
	aiC := ai.NewClient()
	return &Handler{
		sb:      sb,
		aiC:     aiC,
		harness: harness.New(env, sb),
	}
}

// StartWorkers starts the Harness cron ticker.
func (h *Handler) StartWorkers(ctx context.Context) {
	h.harness.StartWorkers(ctx)
}

// Routes returns the /ai sub-router (all routes require a Supabase user JWT).
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(middleware.Recoverer)
	r.NotFound(func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"error": "Not found", "code": "not_found"})
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusMethodNotAllowed, map[string]any{"error": "Method not allowed", "code": "method_not_allowed"})
	})

	r.Group(func(pr chi.Router) {
		pr.Use(authmw.RequireUser(h.sb, authmw.DefaultUnauthorized))
		pr.Method(http.MethodPost, "/aichat", aichat.New(h.sb, h.aiC))
		pr.Method(http.MethodPost, "/mapchat", mapchat.New(h.sb, h.aiC))
		pr.Method(http.MethodPost, "/customer/summary", customer.New(h.sb, h.aiC))
		pr.Method(http.MethodPost, "/kol/summary", kol.New(h.sb, h.aiC))
		pr.Method(http.MethodPost, "/settings/ping", settings.New(h.sb, h.aiC))
		pr.Method(http.MethodPost, "/settings/connectivity", settings.NewConnectivity(h.sb))
		pr.Method(http.MethodGet, "/providers", providershttp.New())
		pr.Method(http.MethodGet, "/models", models.New())
		// Desktop Harness: slim VPS profile, scheduled tasks, and
		// first-party CRM tools. Never the public /mcp transport.
		pr.Mount("/harness", h.harness.Routes())
	})

	return r
}
