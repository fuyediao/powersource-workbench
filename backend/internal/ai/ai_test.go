package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestParseModel verifies the request-body model slug default and rejection.
func TestParseModel(t *testing.T) {
	cases := []struct {
		raw    string
		want   Model
		wantOK bool
	}{
		{"", ModelGemini, true},
		{"gemini", ModelGemini, true},
		{"chatgpt", ModelChatGPT, true},
		{"CLAUDE", ModelClaude, true},
		{"grok", ModelGrok, true},
		{"unknown", "", false},
	}
	for _, tc := range cases {
		got, ok := ParseModel(tc.raw)
		if ok != tc.wantOK || (ok && got != tc.want) {
			t.Errorf("ParseModel(%q) = (%q, %v), want (%q, %v)", tc.raw, got, ok, tc.want, tc.wantOK)
		}
	}
}

// TestCompleteMissingAPIKey verifies Complete rejects an empty key before
// making any network call.
func TestCompleteMissingAPIKey(t *testing.T) {
	c := NewClient()
	_, err := c.Complete(context.Background(), ModelGemini, "  ", "system", "user")
	if err != ErrMissingAPIKey {
		t.Fatalf("err = %v, want ErrMissingAPIKey", err)
	}
}

// TestCompleteGemini verifies the request shape (API key on the query
// string, system instruction + user content in the body) and response
// extraction against a fake Gemini endpoint.
func TestCompleteGemini(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("key") != "test-key" {
			t.Errorf("query key = %q, want test-key", r.URL.Query().Get("key"))
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if _, ok := body["systemInstruction"]; !ok {
			t.Error("request body missing systemInstruction")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"candidates": []map[string]any{
				{"content": map[string]any{"parts": []map[string]any{{"text": "  hello  "}}}},
			},
		})
	}))
	defer server.Close()

	c := NewClient()
	c.geminiBaseURL = server.URL
	text, err := c.Complete(context.Background(), ModelGemini, "test-key", "system", "user")
	if err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if text != "hello" {
		t.Errorf("text = %q, want %q", text, "hello")
	}
}

// TestCompleteChatGPTRequestShape verifies GPT-5.x-compatible Chat Completions
// parameters (model id, max_completion_tokens, no temperature / max_tokens).
func TestCompleteChatGPTRequestShape(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if got, _ := body["model"].(string); got != "gpt-5.6-sol" {
			t.Errorf("model = %q, want gpt-5.6-sol", got)
		}
		if _, ok := body["temperature"]; ok {
			t.Error("request must not send temperature for GPT-5.x")
		}
		if _, ok := body["max_tokens"]; ok {
			t.Error("request must not send max_tokens for GPT-5.x")
		}
		if _, ok := body["max_completion_tokens"]; !ok {
			t.Error("request missing max_completion_tokens")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]any{"content": "ok"}},
			},
		})
	}))
	defer server.Close()

	c := NewClient()
	c.openaiBaseURL = server.URL
	text, err := c.Complete(context.Background(), ModelChatGPT, "test-key", "system", "user")
	if err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if text != "ok" {
		t.Errorf("text = %q, want ok", text)
	}
}

// TestCompleteChatGPTProviderError verifies a non-2xx response is surfaced
// with the provider's error message.
func TestCompleteChatGPTProviderError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization = %q, want Bearer test-key", got)
		}
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": map[string]any{"message": "Invalid API key"},
		})
	}))
	defer server.Close()

	c := NewClient()
	c.openaiBaseURL = server.URL
	_, err := c.Complete(context.Background(), ModelChatGPT, "test-key", "system", "user")
	if err == nil {
		t.Fatal("expected an error")
	}
	if got := err.Error(); !contains(got, "Invalid API key") {
		t.Errorf("error = %q, want it to contain %q", got, "Invalid API key")
	}
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}

// TestParseTrilingual covers the plain, fenced, and invalid response shapes.
func TestParseTrilingual(t *testing.T) {
	valid := `{"en_us":"a","zh_cn":"b","zh_tw":"c"}`
	got, err := ParseTrilingual(valid)
	if err != nil || got.EnUs != "a" || got.ZhCn != "b" || got.ZhTw != "c" {
		t.Fatalf("ParseTrilingual(valid) = %+v, err = %v", got, err)
	}

	fenced := "```json\n" + valid + "\n```"
	got, err = ParseTrilingual(fenced)
	if err != nil || got.EnUs != "a" {
		t.Fatalf("ParseTrilingual(fenced) = %+v, err = %v", got, err)
	}

	withCommentary := "Here you go:\n" + valid + "\nHope that helps."
	got, err = ParseTrilingual(withCommentary)
	if err != nil || got.ZhTw != "c" {
		t.Fatalf("ParseTrilingual(withCommentary) = %+v, err = %v", got, err)
	}

	if _, err := ParseTrilingual("not json at all"); err != ErrInvalidTrilingualResponse {
		t.Errorf("err = %v, want ErrInvalidTrilingualResponse", err)
	}

	if _, err := ParseTrilingual(`{"en_us":"a","zh_cn":""}`); err != ErrInvalidTrilingualResponse {
		t.Errorf("err = %v, want ErrInvalidTrilingualResponse for missing keys", err)
	}
}
