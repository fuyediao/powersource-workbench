package harness

import (
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/catalog"
)

// applyCatalogReasoning writes the catalog-clamped effort onto a vendor payload.
// Models without a reasoning profile are left unchanged.
func applyCatalogReasoning(payload map[string]any, provider, modelID string, body responsesRequest) {
	requested := ""
	if body.Reasoning != nil {
		requested = body.Reasoning.Effort
	}
	effort := catalog.ClampReasoningEffort(provider, modelID, requested)
	if effort == "" {
		return
	}
	switch catalog.NormalizeProvider(provider) {
	case "chatgpt", "openai":
		payload["reasoning_effort"] = catalog.OpenAIWireEffort(effort)
	case "grok":
		payload["reasoning_effort"] = effort
	case "claude", "anthropic":
		payload["output_config"] = map[string]any{"effort": effort}
	case "gemini":
		cfg, _ := payload["generationConfig"].(map[string]any)
		if cfg == nil {
			cfg = map[string]any{}
			payload["generationConfig"] = cfg
		}
		if thinking := catalog.GeminiThinkingConfig(effort); thinking != nil {
			cfg["thinkingConfig"] = thinking
		}
	default:
		if strings.TrimSpace(effort) != "" {
			payload["reasoning_effort"] = effort
		}
	}
}
