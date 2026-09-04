package harness

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestValidComputerUseAction rejects actions outside the local executor contract.
func TestValidComputerUseAction(t *testing.T) {
	for _, action := range []string{"click", "type", "press_key", "scroll", "drag", "wait", "done"} {
		if !validComputerUseAction(action) {
			t.Errorf("expected %q to be valid", action)
		}
	}
	if validComputerUseAction("run_command") {
		t.Error("run_command must not be accepted as a desktop action")
	}
}

// TestIsComputerUseModel enforces the catalog capability flag.
func TestIsComputerUseModel(t *testing.T) {
	models := []struct {
		provider string
		modelID  string
	}{
		{provider: "chatgpt", modelID: "gpt-5.6-luna"},
		{provider: "gemini", modelID: "gemini-3.7-flash"},
		{provider: "claude", modelID: "claude-opus-5"},
		{provider: "grok", modelID: "grok-4.6"},
	}
	for _, model := range models {
		if !isComputerUseModel(model.provider, model.modelID) {
			t.Errorf("expected %s/%s to support computer use", model.provider, model.modelID)
		}
	}
	if isComputerUseModel("chatgpt", "gpt-4.1") {
		t.Error("unmarked vision models must not reach the executor")
	}
}

// TestCompleteOpenAICompatibleComputerUse verifies the shared OpenAI and xAI wire format.
func TestCompleteOpenAICompatibleComputerUse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("unexpected authorization header %q", r.Header.Get("Authorization"))
		}
		payload := decodeTestPayload(t, r)
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Errorf("marshal request payload: %v", err)
			return
		}
		body := string(encoded)
		if !strings.Contains(body, "data:image/png;base64,c2NyZWVuc2hvdA==") {
			t.Error("request must include the screenshot data URL")
		}
		if !strings.Contains(body, `"type":"json_schema"`) {
			t.Error("request must enforce JSON schema output")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"action\":\"done\",\"reason\":\"complete\",\"sensitive\":false}"}}]}`))
	}))
	defer server.Close()

	handler := &Handler{modelHTTP: server.Client()}
	action, err := handler.completeOpenAICompatibleComputerUse(
		httptest.NewRequest(http.MethodPost, "/", nil),
		server.URL,
		"test-key",
		"gpt-5.6-luna",
		testComputerUseRequest(),
	)
	if err != nil {
		t.Fatalf("complete OpenAI-compatible computer use: %v", err)
	}
	if action.Action != "done" {
		t.Errorf("unexpected action %q", action.Action)
	}
}

// TestCompleteAnthropicComputerUse verifies Claude image input and forced tool output.
func TestCompleteAnthropicComputerUse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		if r.Header.Get("x-api-key") != "test-key" {
			t.Errorf("unexpected API key header %q", r.Header.Get("x-api-key"))
		}
		if r.Header.Get("anthropic-version") == "" {
			t.Error("Anthropic version header is required")
		}
		payload := decodeTestPayload(t, r)
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Errorf("marshal request payload: %v", err)
			return
		}
		body := string(encoded)
		if !strings.Contains(body, `"media_type":"image/png"`) {
			t.Error("request must include a PNG image source")
		}
		if !strings.Contains(body, `"name":"desktop_action"`) {
			t.Error("request must force the desktop action tool")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"content":[{"type":"tool_use","name":"desktop_action","input":{"action":"done","reason":"complete","sensitive":false}}]}`))
	}))
	defer server.Close()

	handler := &Handler{modelHTTP: server.Client()}
	action, err := handler.completeAnthropicComputerUse(
		httptest.NewRequest(http.MethodPost, "/", nil),
		server.URL,
		"test-key",
		"claude-opus-5",
		testComputerUseRequest(),
	)
	if err != nil {
		t.Fatalf("complete Anthropic computer use: %v", err)
	}
	if action.Action != "done" {
		t.Errorf("unexpected action %q", action.Action)
	}
}

// TestCompleteGeminiComputerUse verifies Gemini image input and header-based authentication.
func TestCompleteGeminiComputerUse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1beta/models/gemini-3.7-flash:generateContent" {
			t.Errorf("unexpected path %q", r.URL.Path)
		}
		if r.Header.Get("x-goog-api-key") != "test-key" {
			t.Errorf("unexpected API key header %q", r.Header.Get("x-goog-api-key"))
		}
		if r.URL.Query().Has("key") {
			t.Error("API keys must not be placed in the request URL")
		}
		payload := decodeTestPayload(t, r)
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Errorf("marshal request payload: %v", err)
			return
		}
		body := string(encoded)
		if !strings.Contains(body, `"mimeType":"image/png"`) {
			t.Error("request must include a PNG inline image")
		}
		if !strings.Contains(body, `"responseJsonSchema"`) {
			t.Error("request must enforce structured output")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":"{\"action\":\"done\",\"reason\":\"complete\",\"sensitive\":false}"}]}}]}`))
	}))
	defer server.Close()

	handler := &Handler{modelHTTP: server.Client()}
	action, err := handler.completeGeminiComputerUse(
		httptest.NewRequest(http.MethodPost, "/", nil),
		server.URL,
		"test-key",
		"gemini-3.7-flash",
		testComputerUseRequest(),
	)
	if err != nil {
		t.Fatalf("complete Gemini computer use: %v", err)
	}
	if action.Action != "done" {
		t.Errorf("unexpected action %q", action.Action)
	}
}

// decodeTestPayload parses one provider request body for wire-format assertions.
func decodeTestPayload(t *testing.T, r *http.Request) map[string]any {
	t.Helper()
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		t.Errorf("decode request payload: %v", err)
		return map[string]any{}
	}
	return payload
}

// testComputerUseRequest returns a minimal deterministic screenshot request.
func testComputerUseRequest() computerUseRequest {
	return computerUseRequest{
		Task:       "Inspect the desktop.",
		Screenshot: "c2NyZWVuc2hvdA==",
		History:    []string{"wait"},
	}
}
