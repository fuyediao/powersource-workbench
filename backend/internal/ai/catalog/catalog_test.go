package catalog

import (
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/model"
)

// TestListWebReturnsFlagshipsOnly verifies client=web exposes one default per provider.
func TestListWebReturnsFlagshipsOnly(t *testing.T) {
	list := List(ClientWeb)
	if len(list) != 4 {
		t.Fatalf("web list len = %d, want 4", len(list))
	}
	seen := map[string]bool{}
	for _, e := range list {
		if !e.Default {
			t.Errorf("web entry %q should be default", e.ID)
		}
		seen[e.Provider] = true
	}
	for _, p := range []string{"gemini", "chatgpt", "claude", "grok"} {
		if !seen[p] {
			t.Errorf("missing provider %q in web list", p)
		}
	}
}

// TestListElectronIncludesMultiModels verifies Electron sees the full allowlist.
func TestListElectronIncludesMultiModels(t *testing.T) {
	list := List(ClientElectron)
	if len(list) < 80 {
		t.Fatalf("electron list len = %d, want >= 80", len(list))
	}
	want := map[string]bool{
		"gpt-5.6-terra":          false,
		"gpt-5.5-pro":            false,
		"gemini-3.7-flash":       false,
		"gemini-3.6-flash":       false,
		"claude-fable-5-1":       false,
		"claude-fable-5":         false,
		"grok-4.6":               false,
		"grok-4.20":              false,
		"deepseek-v4-flash":      false,
		"kimi-k3":                false,
		"mistral-large-latest":   false,
		model.GeminiDefaultModel: false,
		model.OpenAIDefaultModel: false,
	}
	for _, e := range list {
		if _, ok := want[e.ID]; ok {
			want[e.ID] = true
		}
	}
	for id, found := range want {
		if !found {
			t.Errorf("missing electron model %q", id)
		}
	}
}

// TestComputerUseCapabilities verifies only declared visual models reach the picker.
func TestComputerUseCapabilities(t *testing.T) {
	var found bool
	for _, entry := range List(ClientElectron) {
		if entry.ComputerUse && !entry.Vision {
			t.Errorf("computer-use model %q must support vision", entry.ID)
		}
		if entry.ID == "gemini-3.7-flash" {
			found = entry.ComputerUse && entry.Vision
		}
	}
	if !found {
		t.Error("Gemini 3.7 Flash should be available for computer use")
	}
}

// TestResolveAllowlist verifies empty default and reject unknown ids.
func TestResolveAllowlist(t *testing.T) {
	id, ok := Resolve(ai.ModelChatGPT, "")
	if !ok || id != model.OpenAIDefaultModel {
		t.Errorf("default chatgpt = (%q, %v), want %q", id, ok, model.OpenAIDefaultModel)
	}
	id, ok = Resolve(ai.ModelChatGPT, "gpt-5.6-luna")
	if !ok || id != "gpt-5.6-luna" {
		t.Errorf("resolve luna = (%q, %v)", id, ok)
	}
	if _, ok := Resolve(ai.ModelChatGPT, "gpt-not-real"); ok {
		t.Error("expected reject unknown model id")
	}
	if _, ok := Resolve(ai.ModelGemini, "gpt-5.6-sol"); ok {
		t.Error("expected reject cross-provider model id")
	}
	id, ok = ResolveProvider("deepseek", "deepseek-v4-pro")
	if !ok || id != "deepseek-v4-pro" {
		t.Errorf("resolve deepseek pro = (%q, %v)", id, ok)
	}
	if !IsKnownProvider("openai") {
		t.Error("openai alias should map to chatgpt catalog")
	}
}

// TestParseClient defaults to web.
func TestParseClient(t *testing.T) {
	if ParseClient("") != ClientWeb {
		t.Error("empty should be web")
	}
	if ParseClient("electron") != ClientElectron {
		t.Error("electron expected")
	}
}

// TestReasoningEffortsMatchVendorDocs verifies catalog depth lists, not a universal ladder.
func TestReasoningEffortsMatchVendorDocs(t *testing.T) {
	tests := []struct {
		provider string
		id       string
		want     []string
		def      string
	}{
		{"chatgpt", "gpt-5.6-sol", []string{"low", "medium", "high", "xhigh"}, "low"},
		{"chatgpt", "gpt-5.6-luna", []string{"low", "medium", "high", "xhigh"}, "medium"},
		{"chatgpt", "gpt-5.5", []string{"low", "medium", "high", "xhigh"}, "medium"},
		{"chatgpt", "gpt-5.1", []string{"none", "low", "medium", "high", "xhigh"}, "none"},
		{"chatgpt", "gpt-5", []string{"minimal", "low", "medium", "high"}, "medium"},
		{"chatgpt", "gpt-5-pro", []string{"high"}, "high"},
		{"chatgpt", "gpt-4o", nil, ""},
		{"gemini", "gemini-3.1-pro-preview", []string{"low", "medium", "high"}, "high"},
		{"gemini", "gemini-3.7-flash", []string{"low", "medium", "high"}, "medium"},
		{"gemini", "gemini-3.6-flash", []string{"minimal", "low", "medium", "high"}, "medium"},
		{"claude", "claude-opus-5", []string{"low", "medium", "high", "xhigh", "max"}, "high"},
		{"claude", "claude-haiku-4-5-20251001", nil, ""},
		{"grok", "grok-4.6", []string{"low", "medium", "high", "xhigh"}, "high"},
		{"grok", "grok-4.5", []string{"low", "medium", "high"}, "high"},
		{"grok", "grok-4.3", []string{"none", "low", "medium", "high"}, "low"},
		{"grok", "grok-4.20-0309-non-reasoning", nil, ""},
		{"grok", "grok-4.20-0309-reasoning", nil, ""},
		{"deepseek", "deepseek-v4-pro", nil, ""},
	}
	for _, tc := range tests {
		got, def := ReasoningFor(tc.provider, tc.id)
		if !equalStrings(got, tc.want) || def != tc.def {
			t.Errorf("%s/%s = (%v, %q), want (%v, %q)", tc.provider, tc.id, got, def, tc.want, tc.def)
		}
	}
	if ClampReasoningEffort("chatgpt", "gpt-5.6-sol", "ultra") != "xhigh" {
		t.Error("sol should coerce Codex ultra to OpenAI xhigh")
	}
	if ClampReasoningEffort("chatgpt", "gpt-5.6-luna", "max") != "xhigh" {
		t.Error("luna should coerce Codex max to OpenAI xhigh")
	}
	if ClampReasoningEffort("chatgpt", "gpt-5.6-luna", "ultra") != "xhigh" {
		t.Error("luna should coerce Codex ultra to OpenAI xhigh")
	}
	if ClampReasoningEffort("chatgpt", "gpt-4o", "high") != "" {
		t.Error("gpt-4o has no reasoning depth")
	}
	if OpenAIWireEffort("ultra") != "xhigh" {
		t.Error("OpenAI wire maps ultra to xhigh")
	}
	if OpenAIWireEffort("max") != "xhigh" {
		t.Error("OpenAI wire maps max to xhigh")
	}
	cfg := GeminiThinkingConfig("low")
	if cfg["thinkingLevel"] != "LOW" {
		t.Errorf("gemini thinkingLevel = %#v", cfg)
	}
	off := GeminiThinkingConfig("none")
	if off["thinkingBudget"] != 0 {
		t.Errorf("gemini none = %#v", off)
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
