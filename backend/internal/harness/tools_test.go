package harness

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestOfficeToolDoesNotRequireHarnessProfileStorage(t *testing.T) {
	h := &Handler{
		hasModuleFn: func(context.Context, string, string) (bool, error) { return true, nil },
	}
	rec := expertRequest(
		t,
		h.Routes(),
		http.MethodPost,
		"/tools/list_office_files",
		`{"arguments":{"kind":"pdf"}}`,
	)
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"isError":true`) || !strings.Contains(rec.Body.String(), "invalid Office kind") {
		t.Fatalf("unexpected body=%s", rec.Body.String())
	}
}

func TestMailToolsRefuseWithoutDesktopMail(t *testing.T) {
	h := &Handler{
		hasModuleFn: func(_ context.Context, _ string, key string) (bool, error) {
			return key == "desktop_agent", nil
		},
	}
	for _, tool := range []string{"send_mail", "save_mail_draft"} {
		rec := expertRequest(
			t,
			h.Routes(),
			http.MethodPost,
			"/tools/"+tool,
			`{"arguments":{"mailAccountId":"mailbox"}}`,
		)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s status=%d body=%s", tool, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), `"isError":true`) || !strings.Contains(rec.Body.String(), "Mail is not enabled") {
			t.Fatalf("%s unexpected body=%s", tool, rec.Body.String())
		}
	}
}
