package ai

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providers"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// profileAPIKeys is the subset of profiles columns holding each user's own
// AI provider API keys (never geocrm-api's own credentials).
type profileAPIKeys struct {
	AIProviderKeys  json.RawMessage `json:"ai_provider_keys"`
	GeminiAPIKey    string          `json:"gemini_api_key"`
	OpenAIAPIKey    string          `json:"openai_api_key"`
	AnthropicAPIKey string          `json:"anthropic_api_key"`
	GrokAPIKey      string          `json:"grok_api_key"`
}

// forModel returns the API key column matching model (legacy columns).
func (p profileAPIKeys) forModel(modelSlug Model) string {
	switch modelSlug {
	case ModelChatGPT:
		return p.OpenAIAPIKey
	case ModelClaude:
		return p.AnthropicAPIKey
	case ModelGrok:
		return p.GrokAPIKey
	default:
		return p.GeminiAPIKey
	}
}

// providerBag maps Cherry-style provider ids and chat slugs into JSON bag keys.
func providerBag(providerID string) map[string]struct{} {
	id := strings.ToLower(strings.TrimSpace(providerID))
	keys := map[string]struct{}{id: {}}
	switch id {
	case "chatgpt", "openai":
		keys["openai"] = struct{}{}
		keys["chatgpt"] = struct{}{}
	case "claude", "anthropic":
		keys["anthropic"] = struct{}{}
		keys["claude"] = struct{}{}
	case "gemini":
		keys["gemini"] = struct{}{}
	case "grok":
		keys["grok"] = struct{}{}
	}
	return keys
}

// parseProviderKeysMap decodes ai_provider_keys JSON into a string map.
func parseProviderKeysMap(raw json.RawMessage) map[string]string {
	out := map[string]string{}
	if len(raw) == 0 || string(raw) == "null" {
		return out
	}
	var asMap map[string]any
	if err := json.Unmarshal(raw, &asMap); err != nil {
		return out
	}
	for k, v := range asMap {
		switch t := v.(type) {
		case string:
			if s := strings.TrimSpace(t); s != "" {
				out[k] = s
			}
		}
	}
	return out
}

// keyFromBag returns the first non-empty key matching provider aliases.
func keyFromBag(bag map[string]string, providerID string) string {
	for alias := range providerBag(providerID) {
		if v := strings.TrimSpace(bag[alias]); v != "" {
			return v
		}
	}
	return ""
}

// LoadProviderAPIKey returns the caller's API key for a Cherry-style provider id
// (or chat slug chatgpt/claude) from profiles.ai_provider_keys, falling back to
// the four legacy text columns.
func LoadProviderAPIKey(ctx context.Context, sb *supabase.Client, userID, providerID string) (string, error) {
	if userID == "" || sb == nil {
		return "", nil
	}
	providerID = strings.ToLower(strings.TrimSpace(providerID))
	if providerID == "" {
		return "", nil
	}

	var row profileAPIKeys
	found, err := sb.From("profiles").
		Select("ai_provider_keys,gemini_api_key,openai_api_key,anthropic_api_key,grok_api_key").
		Eq("id", userID).
		MaybeSingle(ctx, &row)
	if err != nil {
		return "", err
	}
	if !found {
		return "", nil
	}

	if key := keyFromBag(parseProviderKeysMap(row.AIProviderKeys), providerID); key != "" {
		return key, nil
	}

	// Legacy column fallback for the four chat providers.
	switch providerID {
	case "openai", "chatgpt":
		return strings.TrimSpace(row.OpenAIAPIKey), nil
	case "anthropic", "claude":
		return strings.TrimSpace(row.AnthropicAPIKey), nil
	case "gemini":
		return strings.TrimSpace(row.GeminiAPIKey), nil
	case "grok":
		return strings.TrimSpace(row.GrokAPIKey), nil
	default:
		return "", nil
	}
}

// LoadProfileAPIKey returns the caller's own API key for a chat model slug from
// profiles, or "" when the profile row or that specific key is missing.
func LoadProfileAPIKey(ctx context.Context, sb *supabase.Client, userID string, modelSlug Model) (string, error) {
	providerID := string(modelSlug)
	switch modelSlug {
	case ModelChatGPT:
		providerID = "openai"
	case ModelClaude:
		providerID = "anthropic"
	}
	return LoadProviderAPIKey(ctx, sb, userID, providerID)
}

// LoadAllProviderAPIKeys returns the caller's full BYOK bag (JSON + legacy
// columns merged). Empty when the profile is missing.
func LoadAllProviderAPIKeys(ctx context.Context, sb *supabase.Client, userID string) (map[string]string, error) {
	out := map[string]string{}
	if userID == "" || sb == nil {
		return out, nil
	}
	var row profileAPIKeys
	found, err := sb.From("profiles").
		Select("ai_provider_keys,gemini_api_key,openai_api_key,anthropic_api_key,grok_api_key").
		Eq("id", userID).
		MaybeSingle(ctx, &row)
	if err != nil {
		return nil, err
	}
	if !found {
		return out, nil
	}
	for k, v := range parseProviderKeysMap(row.AIProviderKeys) {
		out[k] = v
	}
	if v := strings.TrimSpace(row.OpenAIAPIKey); v != "" {
		if _, ok := out["openai"]; !ok {
			out["openai"] = v
		}
	}
	if v := strings.TrimSpace(row.AnthropicAPIKey); v != "" {
		if _, ok := out["anthropic"]; !ok {
			out["anthropic"] = v
		}
	}
	if v := strings.TrimSpace(row.GeminiAPIKey); v != "" {
		if _, ok := out["gemini"]; !ok {
			out["gemini"] = v
		}
	}
	if v := strings.TrimSpace(row.GrokAPIKey); v != "" {
		if _, ok := out["grok"]; !ok {
			out["grok"] = v
		}
	}
	return out, nil
}

// ProviderLabel returns a human-readable provider name for error messages.
func ProviderLabel(modelSlug Model) string {
	return ProviderDisplayName(string(modelSlug))
}

// ProviderDisplayName returns a human-readable name for a chat slug or Settings id.
func ProviderDisplayName(providerID string) string {
	switch strings.ToLower(strings.TrimSpace(providerID)) {
	case "chatgpt", "openai":
		return "OpenAI"
	case "claude", "anthropic":
		return "Anthropic"
	case "grok":
		return "xAI (Grok)"
	case "gemini", "":
		return "Google Gemini"
	}
	if p, ok := providers.Get(strings.ToLower(strings.TrimSpace(providerID))); ok {
		return p.NameEn
	}
	return strings.TrimSpace(providerID)
}
