package harness

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWebSearchPrefersPerplexityAndReturnsSources(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer pplx-test" {
			t.Fatalf("unexpected authorization header")
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"search_domain_filter":["example.com"]`) {
			t.Fatalf("domain filter missing from payload: %s", body)
		}
		_, _ = io.WriteString(w, `{
			"choices":[{"message":{"content":"Grounded answer."}}],
			"search_results":[{"title":"Primary","url":"https://example.com/a"}],
			"citations":["https://example.com/a","https://example.org/b"]
		}`)
	}))
	defer server.Close()

	h := &Handler{
		modelHTTP:           server.Client(),
		perplexitySearchURL: server.URL,
		loadProviderKeysFn: func(context.Context, string) (map[string]string, error) {
			return map[string]string{"perplexity": "pplx-test", "gemini": "gemini-test"}, nil
		},
	}
	result, err := h.runWebSearch(context.Background(), "user-1", json.RawMessage(`{
		"query":"latest test query","limit":2,"domains":["https://www.example.com/path"]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Provider != "perplexity" || result.Answer != "Grounded answer." || len(result.Sources) != 2 {
		t.Fatalf("unexpected result: %+v", result)
	}
	if result.Sources[0].URL != "https://example.com/a" || result.Sources[1].URL != "https://example.org/b" {
		t.Fatalf("unexpected sources: %+v", result.Sources)
	}
}

func TestWebSearchFallsBackToGeminiGrounding(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-2.5-flash:generateContent" || r.Header.Get("x-goog-api-key") != "gemini-test" {
			t.Fatalf("unexpected Gemini request: %s", r.URL.String())
		}
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"google_search":{}`) {
			t.Fatalf("Google Search grounding missing from payload: %s", body)
		}
		_, _ = io.WriteString(w, `{
			"candidates":[{
				"content":{"parts":[{"text":"Current answer."}]},
				"groundingMetadata":{"groundingChunks":[
					{"web":{"uri":"https://example.com/current","title":"Current source"}}
				]}
			}]
		}`)
	}))
	defer server.Close()

	h := &Handler{
		modelHTTP:           server.Client(),
		geminiSearchBaseURL: server.URL,
		loadProviderKeysFn: func(context.Context, string) (map[string]string, error) {
			return map[string]string{"gemini": "gemini-test"}, nil
		},
	}
	result, err := h.runWebSearch(context.Background(), "user-1", json.RawMessage(`{"query":"current facts"}`))
	if err != nil {
		t.Fatal(err)
	}
	if result.Provider != "gemini" || result.Answer != "Current answer." || len(result.Sources) != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestWebSearchRequiresConfiguredBackend(t *testing.T) {
	h := &Handler{
		loadProviderKeysFn: func(context.Context, string) (map[string]string, error) {
			return map[string]string{}, nil
		},
	}
	_, err := h.runWebSearch(context.Background(), "user-1", json.RawMessage(`{"query":"current facts"}`))
	if err == nil || !strings.Contains(err.Error(), "Perplexity or Gemini") {
		t.Fatalf("unexpected error: %v", err)
	}
}
