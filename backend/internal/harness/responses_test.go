package harness

import "testing"

func TestGeminiFunctionDeclarationsUseFullJSONSchema(t *testing.T) {
	tools := []map[string]any{{
		"type": "function",
		"name": "search_records",
		"parameters": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"filters": map[string]any{
					"type":                 "object",
					"additionalProperties": map[string]any{"type": "string"},
				},
				"ids": map[string]any{
					"type":  "array",
					"items": map[string]any{"type": "string"},
				},
			},
		},
	}}

	declarations := geminiFunctionDeclarations(tools)
	if len(declarations) != 1 {
		t.Fatalf("declaration count = %d", len(declarations))
	}
	if _, ok := declarations[0]["parameters"]; ok {
		t.Fatal("legacy parameters field must not be used for full JSON Schema")
	}
	if schema, ok := declarations[0]["parametersJsonSchema"].(map[string]any); !ok {
		t.Fatal("parametersJsonSchema is missing")
	} else {
		properties, ok := schema["properties"].(map[string]any)
		if !ok || len(properties) != 2 {
			t.Fatalf("schema properties = %#v", schema["properties"])
		}
	}
}

func TestApplyCatalogReasoningUsesVendorFields(t *testing.T) {
	openai := map[string]any{}
	applyCatalogReasoning(openai, "chatgpt", "gpt-5.6-sol", responsesRequest{
		Reasoning: &responsesReasoning{Effort: "ultra"},
	})
	if openai["reasoning_effort"] != "xhigh" {
		t.Fatalf("openai ultra wire = %#v", openai["reasoning_effort"])
	}

	gemini := map[string]any{}
	applyCatalogReasoning(gemini, "gemini", "gemini-3.1-pro-preview", responsesRequest{
		Reasoning: &responsesReasoning{Effort: "low"},
	})
	cfg, _ := gemini["generationConfig"].(map[string]any)
	thinking, _ := cfg["thinkingConfig"].(map[string]any)
	if thinking["thinkingLevel"] != "LOW" {
		t.Fatalf("gemini thinking = %#v", thinking)
	}

	claude := map[string]any{}
	applyCatalogReasoning(claude, "claude", "claude-opus-5", responsesRequest{
		Reasoning: &responsesReasoning{Effort: "max"},
	})
	out, _ := claude["output_config"].(map[string]any)
	if out["effort"] != "max" {
		t.Fatalf("claude effort = %#v", out)
	}

	skip := map[string]any{"model": "gpt-4o"}
	applyCatalogReasoning(skip, "chatgpt", "gpt-4o", responsesRequest{
		Reasoning: &responsesReasoning{Effort: "high"},
	})
	if _, ok := skip["reasoning_effort"]; ok {
		t.Fatal("gpt-4o must not receive reasoning_effort")
	}

	grokSkip := map[string]any{}
	applyCatalogReasoning(grokSkip, "grok", "grok-4.20-0309-non-reasoning", responsesRequest{
		Reasoning: &responsesReasoning{Effort: "high"},
	})
	if _, ok := grokSkip["reasoning_effort"]; ok {
		t.Fatal("non-reasoning Grok snapshot must not receive reasoning_effort")
	}
}
