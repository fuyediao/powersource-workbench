// Package server wires HTTP routes for workbench-api.
package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/auth"
	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
	"github.com/fuyediao/powersource-workbench/backend/internal/start"
)

// New builds the Workbench API handler.
func New(env config.Env) http.Handler {
	sb := supabase.New(env.SupabaseURL, env.SupabaseAnonKey, env.SupabaseServiceRoleKey)
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
	return r
}
