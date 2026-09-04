package authmw

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

func TestRequireGroupOrSystemAdminRejectsOrdinaryUser(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/auth/v1/user":
			_, _ = w.Write([]byte(`{"id":"047988c6-68be-4bf4-a76e-ee07d7d02bee","email":"user@example.com"}`))
		case "/rest/v1/user_roles", "/rest/v1/groups":
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	client := supabase.NewService(server.URL, server.URL, "service-key", "anon-key")
	handler := RequireGroupOrSystemAdmin(
		client,
		DefaultUnauthorized,
		DefaultForbidden,
	)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	request.Header.Set("Authorization", "Bearer user-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", recorder.Code)
	}
}

func TestRequireGroupOrSystemAdminAcceptsGroupOwner(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/auth/v1/user":
			_, _ = w.Write([]byte(`{"id":"047988c6-68be-4bf4-a76e-ee07d7d02bee","email":"admin@example.com"}`))
		case "/rest/v1/user_roles":
			_, _ = w.Write([]byte(`[]`))
		case "/rest/v1/groups":
			if !strings.Contains(r.URL.RawQuery, "group_admin_id") {
				t.Fatalf("group admin filter missing: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`[{"id":"147988c6-68be-4bf4-a76e-ee07d7d02bee"}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	client := supabase.NewService(server.URL, server.URL, "service-key", "anon-key")
	handler := RequireGroupOrSystemAdmin(
		client,
		DefaultUnauthorized,
		DefaultForbidden,
	)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserIDFrom(r) == "" {
			t.Fatal("authenticated user id was not stored")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	request.Header.Set("Authorization", "Bearer admin-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", recorder.Code)
	}
}
