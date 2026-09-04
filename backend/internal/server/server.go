// Package server wires HTTP routes for workbench-api.
package server

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/aihttp"
	"github.com/fuyediao/powersource-workbench/backend/internal/auth"
	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
	"github.com/fuyediao/powersource-workbench/backend/internal/start"
)

// New builds the Workbench API handler and starts background workers.
func New(ctx context.Context, env config.Env) http.Handler {
	sb := supabase.NewService(env.SupabaseURL, env.ResolvedSupabasePublicURL(), env.SupabaseServiceRoleKey, env.SupabaseAnonKey)
	authHandler := auth.New(sb)

	r := chi.NewRouter()
	r.Use(httpx.CORS)
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	r.Post("/auth/login", authHandler.Login)
	r.Post("/auth/refresh", authHandler.Refresh)
	r.Post("/auth/logout", authHandler.Logout)
	r.Get("/auth/me", authHandler.Me)
	r.Post("/auth/invitations", authHandler.CreateInvitation)
	r.Mount("/start", start.New().Routes())

	aiHandler := aihttp.New(env, sb)
	r.Mount("/ai", aiHandler.Routes())
	aiHandler.StartWorkers(ctx)

	return r
}
