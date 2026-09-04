package office

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

func TestListAccessibleFilesScopesServiceRoleQuery(t *testing.T) {
	var officeQuery url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/rest/v1/group_members"):
			_, _ = w.Write([]byte(`[{"group_id":"group-1"}]`))
		case strings.HasSuffix(r.URL.Path, "/rest/v1/user_roles"):
			_, _ = w.Write([]byte(`[]`))
		case strings.HasSuffix(r.URL.Path, "/rest/v1/global_leaders"):
			_, _ = w.Write([]byte(`[]`))
		case strings.HasSuffix(r.URL.Path, "/rest/v1/office_files"):
			officeQuery = r.URL.Query()
			_, _ = w.Write([]byte(`[{"id":"file-1","kind":"docs","name":"Plan","owner_user_id":"user-1","group_id":null,"updated_at":"2026-09-01T00:00:00Z"}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	handler := New(config.Env{}, supabase.NewService(server.URL, server.URL, "service", "anon"))
	files, err := handler.ListAccessibleFiles(context.Background(), "user-1", "docs", "Plan", 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].ID != "file-1" {
		t.Fatalf("unexpected files: %#v", files)
	}
	filter := officeQuery.Get("or")
	if !strings.Contains(filter, "owner_user_id.eq.user-1") || !strings.Contains(filter, "group_id.in.(group-1)") {
		t.Fatalf("missing ACL filter: %s", filter)
	}
	if officeQuery.Get("kind") != "eq.docs" || officeQuery.Get("name") != "ilike.%Plan%" {
		t.Fatalf("unexpected Office query: %s", officeQuery.Encode())
	}
}

func TestOpenAccessibleFileReturnsShortLivedSignedURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/rest/v1/office_files"):
			_, _ = w.Write([]byte(`[{"id":"file-1","kind":"sheets","name":"Forecast","storage_path":"file-1/file.xlsx","owner_user_id":"user-1","group_id":null,"updated_at":"2026-09-01T00:00:00Z"}]`))
		case strings.Contains(r.URL.Path, "/storage/v1/object/sign/office-files/file-1/file.xlsx"):
			var body map[string]int
			_ = json.NewDecoder(r.Body).Decode(&body)
			if body["expiresIn"] != 300 {
				t.Fatalf("unexpected expiry: %#v", body)
			}
			_, _ = w.Write([]byte(`{"signedURL":"/object/sign/office-files/file-1/file.xlsx?token=test"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	handler := New(config.Env{}, supabase.NewService(server.URL, server.URL, "service", "anon"))
	opened, err := handler.OpenAccessibleFile(context.Background(), "user-1", "file-1")
	if err != nil {
		t.Fatal(err)
	}
	if opened == nil || opened.FileName != "Forecast.xlsx" || opened.ExpiresIn != 300 {
		t.Fatalf("unexpected result: %#v", opened)
	}
	if !strings.Contains(opened.DownloadURL, "token=test") {
		t.Fatalf("unexpected signed URL: %s", opened.DownloadURL)
	}
}
