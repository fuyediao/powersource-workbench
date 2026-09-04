package harness

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
)

func expertRequest(t *testing.T, handler http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(authmw.WithUserID(req.Context(), testUserID))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func TestExpertCloudRoundTrip(t *testing.T) {
	h := &Handler{
		env:         config.Env{HermesProfilesRoot: t.TempDir()},
		hasModuleFn: func(context.Context, string, string) (bool, error) { return true, nil },
	}
	payload := `{
		"id":"custom-research",
		"name":"Research tool",
		"description":"Builds verified prospect briefs.",
		"category":"salesBusiness",
		"createdAt":"2026-08-27T00:00:00Z",
		"instructions":"Use verified sources and identify missing evidence.",
		"allowedTools":["list_entities","search_records"],
		"requiredConnectors":["Google Drive"],
		"outputMode":"document"
	}`
	put := expertRequest(t, h.Routes(), http.MethodPut, "/experts/custom-research", payload)
	if put.Code != http.StatusOK {
		t.Fatalf("put status=%d body=%s", put.Code, put.Body.String())
	}
	list := expertRequest(t, h.Routes(), http.MethodGet, "/experts", "")
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), "custom-research") {
		t.Fatalf("list status=%d body=%s", list.Code, list.Body.String())
	}
	remove := expertRequest(t, h.Routes(), http.MethodDelete, "/experts/custom-research", "")
	if remove.Code != http.StatusNoContent {
		t.Fatalf("delete status=%d body=%s", remove.Code, remove.Body.String())
	}
}

func TestExpertCloudRejectsUnknownCapability(t *testing.T) {
	h := &Handler{
		env:         config.Env{HermesProfilesRoot: t.TempDir()},
		hasModuleFn: func(context.Context, string, string) (bool, error) { return true, nil },
	}
	payload := `{"id":"unsafe","name":"Unsafe","description":"Invalid","category":"salesBusiness","createdAt":"2026-08-27T00:00:00Z","instructions":"Test.","allowedTools":["shell_everything"],"requiredConnectors":[],"outputMode":"table"}`
	rec := expertRequest(t, h.Routes(), http.MethodPut, "/experts/unsafe", payload)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
}
