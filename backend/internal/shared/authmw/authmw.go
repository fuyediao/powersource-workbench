// Package authmw provides chi middleware for Supabase Bearer JWT auth.
package authmw

import (
	"context"
	"net/http"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/crmadmin"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

type contextKey int

const userIDKey contextKey = iota

// UserIDFrom returns the authenticated user id stored by RequireUser.
func UserIDFrom(r *http.Request) string {
	id, _ := r.Context().Value(userIDKey).(string)
	return id
}

// WithUserID returns a context carrying userID as the authenticated caller,
// matching what RequireUser/RequireSystemAdmin/RequireGroupOrSystemAdmin
// store after verifying a Bearer JWT. It exists so handler tests in other
// packages can simulate an authenticated request without a real token.
func WithUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, userIDKey, userID)
}

// DefaultUnauthorized writes the legacy {"error":"Unauthorized"} JSON response.
func DefaultUnauthorized(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"error": "Unauthorized"})
}

// RequireUser verifies the Supabase Bearer JWT and stores the user id in the
// request context. onUnauthorized is called when the token is missing or invalid.
func RequireUser(sb *supabase.Client, onUnauthorized func(http.ResponseWriter)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, err := sb.GetUser(r.Context(), httpx.BearerToken(r))
			if err != nil || user == nil {
				onUnauthorized(w)
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, user.ID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// DefaultForbidden writes the {"error":"Forbidden"} JSON response.
func DefaultForbidden(w http.ResponseWriter) {
	httpx.WriteJSON(w, http.StatusForbidden, map[string]any{"error": "Forbidden"})
}

// RequireSystemAdmin verifies the Supabase Bearer JWT and that the user has the
// system_admin role, storing the user id in the request context. It calls
// onUnauthorized for a missing/invalid token and onForbidden when the user is
// authenticated but not a system admin.
func RequireSystemAdmin(sb *supabase.Client, onUnauthorized, onForbidden func(http.ResponseWriter)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, err := sb.GetUser(r.Context(), httpx.BearerToken(r))
			if err != nil || user == nil {
				onUnauthorized(w)
				return
			}
			if !crmadmin.IsSystemAdmin(r.Context(), sb, user.ID) {
				onForbidden(w)
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, user.ID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireSuperAdmin verifies the Supabase Bearer JWT and that the user has the
// super_admin role, storing the user id in the request context. Use for
// mutations restricted to the single super_admin account (e.g. the
// system_admin roster), per the RBAC rewrite
// (.cursor/documents/group-user-rbac-rewrite-zh-TW.md).
func RequireSuperAdmin(sb *supabase.Client, onUnauthorized, onForbidden func(http.ResponseWriter)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, err := sb.GetUser(r.Context(), httpx.BearerToken(r))
			if err != nil || user == nil {
				onUnauthorized(w)
				return
			}
			if !crmadmin.IsSuperAdmin(r.Context(), sb, user.ID) {
				onForbidden(w)
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, user.ID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireGroupOrSystemAdmin verifies a Supabase JWT and permits only users who
// own a CRM group or hold the system_admin role.
func RequireGroupOrSystemAdmin(
	sb *supabase.Client,
	onUnauthorized,
	onForbidden func(http.ResponseWriter),
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, err := sb.GetUser(r.Context(), httpx.BearerToken(r))
			if err != nil || user == nil {
				onUnauthorized(w)
				return
			}
			if !crmadmin.IsGroupOrSystemAdmin(r.Context(), sb, user.ID) {
				onForbidden(w)
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, user.ID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
