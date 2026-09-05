// Package catalog is the allowlisted AI vendor model registry for geocrm-api.
// Web clients receive one flagship per provider; Electron receives the full list.
//
// Official chat IDs only — image generation, audio, live, TTS, video,
// embeddings, and local runtimes (Ollama / LM Studio / llama.cpp) are omitted.
// First-party lists follow vendor docs (OpenAI, Gemini, Anthropic, xAI, DeepSeek,
// Mistral, Moonshot, Zhipu/Z.AI, DashScope, Doubao, MiniMax, Groq, Perplexity,
// StepFun). Aggregators expose the Settings ping model as a single chat option.
package catalog

import (
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/model"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providers"
)

// ClientFilter selects which catalog rows a caller may see.
type ClientFilter string

const (
	// ClientWeb is the Vue / shared web surface (flagship defaults only).
	ClientWeb ClientFilter = "web"
	// ClientElectron is the Electron desktop client (full multi-model list).
	ClientElectron ClientFilter = "electron"
)

// Entry is one allowlisted vendor model.
type Entry struct {
	// ID is the vendor API model id (sent as modelId from Electron).
	ID string `json:"id"`
	// Provider is the GeoCRM provider slug (chatgpt | gemini | claude | grok | Settings id).
	Provider string `json:"provider"`
	// LabelEn is the English display name for UIs without a locale key.
	LabelEn string `json:"labelEn"`
	// Default is true when this id is used when modelId is omitted for the provider.
	Default bool `json:"default,omitempty"`
	// Vision is true when the model accepts screenshots.
	Vision bool `json:"vision,omitempty"`
	// ComputerUse is true when the model supports desktop control.
	ComputerUse bool `json:"computerUse,omitempty"`
	// ReasoningEfforts is the vendor-native depth list this model accepts.
	// Empty means the model has no adjustable reasoning depth.
	ReasoningEfforts []string `json:"reasoningEfforts,omitempty"`
	// DefaultReasoningEffort is used when the client omits or sends an invalid level.
	DefaultReasoningEffort string `json:"defaultReasoningEffort,omitempty"`
}

type entryDef struct {
	ID       string
	Provider string
	LabelEn  string
	// Web exposes the model on client=web (flagship defaults).
	Web bool
	// Electron exposes the model on client=electron.
	Electron bool
	// IsDefault marks the provider default when modelId is empty.
	IsDefault   bool
	Vision      bool
	ComputerUse bool
}

// Official IDs only — see vendor docs cited in CHANGELOG.
var all = []entryDef{
	// OpenAI — https://developers.openai.com/api/docs/models/all (chat text; skip image/audio/realtime/embeddings/deprecated)
	{ID: "gpt-5.6-sol", Provider: "chatgpt", LabelEn: "GPT-5.6 Sol", Web: true, Electron: true, IsDefault: true, Vision: true, ComputerUse: true},
	{ID: "gpt-5.6-terra", Provider: "chatgpt", LabelEn: "GPT-5.6 Terra", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gpt-5.6-luna", Provider: "chatgpt", LabelEn: "GPT-5.6 Luna", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gpt-5.5", Provider: "chatgpt", LabelEn: "GPT-5.5", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gpt-5.5-pro", Provider: "chatgpt", LabelEn: "GPT-5.5 Pro", Electron: true},
	{ID: "gpt-5.4", Provider: "chatgpt", LabelEn: "GPT-5.4", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gpt-5.4-pro", Provider: "chatgpt", LabelEn: "GPT-5.4 Pro", Electron: true},
	{ID: "gpt-5.4-mini", Provider: "chatgpt", LabelEn: "GPT-5.4 Mini", Electron: true},
	{ID: "gpt-5.4-nano", Provider: "chatgpt", LabelEn: "GPT-5.4 Nano", Electron: true},
	{ID: "gpt-5.3-codex", Provider: "chatgpt", LabelEn: "GPT-5.3 Codex", Electron: true},
	{ID: "gpt-5.2", Provider: "chatgpt", LabelEn: "GPT-5.2", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gpt-5.2-pro", Provider: "chatgpt", LabelEn: "GPT-5.2 Pro", Electron: true},
	{ID: "gpt-5.1", Provider: "chatgpt", LabelEn: "GPT-5.1", Electron: true},
	{ID: "gpt-5", Provider: "chatgpt", LabelEn: "GPT-5", Electron: true},
	{ID: "gpt-5-mini", Provider: "chatgpt", LabelEn: "GPT-5 Mini", Electron: true},
	{ID: "gpt-5-nano", Provider: "chatgpt", LabelEn: "GPT-5 Nano", Electron: true},
	{ID: "gpt-5-pro", Provider: "chatgpt", LabelEn: "GPT-5 Pro", Electron: true},
	{ID: "o3-pro", Provider: "chatgpt", LabelEn: "o3 Pro", Electron: true},
	{ID: "o3", Provider: "chatgpt", LabelEn: "o3", Electron: true},
	{ID: "gpt-4.1", Provider: "chatgpt", LabelEn: "GPT-4.1", Electron: true},
	{ID: "gpt-4.1-mini", Provider: "chatgpt", LabelEn: "GPT-4.1 Mini", Electron: true},
	{ID: "gpt-4o", Provider: "chatgpt", LabelEn: "GPT-4o", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gpt-4o-mini", Provider: "chatgpt", LabelEn: "GPT-4o Mini", Electron: true, Vision: true, ComputerUse: true},

	// Google Gemini — https://ai.google.dev/gemini-api/docs/models (text chat; skip Nano Banana / Live / TTS / image / video)
	{ID: "gemini-3.7-flash", Provider: "gemini", LabelEn: "Gemini 3.7 Flash", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gemini-3.6-flash", Provider: "gemini", LabelEn: "Gemini 3.6 Flash", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gemini-3.5-flash", Provider: "gemini", LabelEn: "Gemini 3.5 Flash", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gemini-3.5-flash-lite", Provider: "gemini", LabelEn: "Gemini 3.5 Flash-Lite", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gemini-3.1-flash-lite", Provider: "gemini", LabelEn: "Gemini 3.1 Flash-Lite", Electron: true, Vision: true, ComputerUse: true},
	{ID: model.GeminiDefaultModel, Provider: "gemini", LabelEn: "Gemini 3.1 Pro", Web: true, Electron: true, IsDefault: true, Vision: true, ComputerUse: true},
	{ID: "gemini-3-flash-preview", Provider: "gemini", LabelEn: "Gemini 3 Flash", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gemini-2.5-pro", Provider: "gemini", LabelEn: "Gemini 2.5 Pro", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gemini-2.5-flash", Provider: "gemini", LabelEn: "Gemini 2.5 Flash", Electron: true, Vision: true, ComputerUse: true},
	{ID: "gemini-2.5-flash-lite", Provider: "gemini", LabelEn: "Gemini 2.5 Flash-Lite", Electron: true, Vision: true, ComputerUse: true},

	// Anthropic — https://platform.claude.com/docs/en/about-claude/models/overview
	{ID: "claude-opus-5", Provider: "claude", LabelEn: "Opus 5", Web: true, Electron: true, IsDefault: true, Vision: true, ComputerUse: true},
	{ID: "claude-fable-5-1", Provider: "claude", LabelEn: "Fable 5.1", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-fable-5", Provider: "claude", LabelEn: "Fable 5", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-sonnet-5", Provider: "claude", LabelEn: "Sonnet 5", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-opus-4-8", Provider: "claude", LabelEn: "Opus 4.8", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-opus-4-7", Provider: "claude", LabelEn: "Opus 4.7", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-opus-4-6", Provider: "claude", LabelEn: "Opus 4.6", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-opus-4-5-20251101", Provider: "claude", LabelEn: "Opus 4.5", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-sonnet-4-6", Provider: "claude", LabelEn: "Sonnet 4.6", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-sonnet-4-5-20250929", Provider: "claude", LabelEn: "Sonnet 4.5", Electron: true, Vision: true, ComputerUse: true},
	{ID: "claude-haiku-4-5-20251001", Provider: "claude", LabelEn: "Haiku 4.5", Electron: true, Vision: true, ComputerUse: true},

	// xAI — https://docs.x.ai/developers/models (text; skip Imagine / Voice / multi-agent)
	{ID: "grok-4.6", Provider: "grok", LabelEn: "Grok 4.6", Electron: true, Vision: true, ComputerUse: true},
	{ID: "grok-4.5", Provider: "grok", LabelEn: "Grok 4.5", Web: true, Electron: true, IsDefault: true, Vision: true, ComputerUse: true},
	{ID: "grok-4.3", Provider: "grok", LabelEn: "Grok 4.3", Electron: true, Vision: true, ComputerUse: true},
	{ID: "grok-4.20", Provider: "grok", LabelEn: "Grok 4.20", Electron: true, Vision: true, ComputerUse: true},
	{ID: "grok-4.20-0309-reasoning", Provider: "grok", LabelEn: "Grok 4.20 Reasoning", Electron: true, Vision: true, ComputerUse: true},
	{ID: "grok-4.20-0309-non-reasoning", Provider: "grok", LabelEn: "Grok 4.20 Non-reasoning", Electron: true, Vision: true, ComputerUse: true},
	{ID: "grok-build-0.1", Provider: "grok", LabelEn: "Grok Build 0.1", Electron: true, Vision: true, ComputerUse: true},

	// DeepSeek — https://api-docs.deepseek.com/quick_start/pricing/ (deepseek-chat retired 2026-07-24)
	{ID: "deepseek-v4-flash", Provider: "deepseek", LabelEn: "DeepSeek V4 Flash", Electron: true, IsDefault: true},
	{ID: "deepseek-v4-pro", Provider: "deepseek", LabelEn: "DeepSeek V4 Pro", Electron: true},

	// Mistral — https://mistral.ai/models/
	{ID: "mistral-large-latest", Provider: "mistral", LabelEn: "Mistral Large", Electron: true, IsDefault: true},
	{ID: "mistral-medium-latest", Provider: "mistral", LabelEn: "Mistral Medium", Electron: true},
	{ID: "mistral-small-latest", Provider: "mistral", LabelEn: "Mistral Small", Electron: true},

	// Moonshot / Kimi — https://platform.kimi.ai/docs/models
	{ID: "kimi-k3", Provider: "moonshot", LabelEn: "Kimi K3", Electron: true, IsDefault: true},
	{ID: "kimi-k2.6", Provider: "moonshot", LabelEn: "Kimi K2.6", Electron: true},
	{ID: "kimi-k2.7-code-highspeed", Provider: "moonshot", LabelEn: "Kimi K2.7 Code Highspeed", Electron: true},

	// Zhipu BigModel — glm-5.2 flagship (open.bigmodel.cn)
	{ID: "glm-5.2", Provider: "zhipu", LabelEn: "GLM-5.2", Electron: true, IsDefault: true},
	{ID: "glm-5.1", Provider: "zhipu", LabelEn: "GLM-5.1", Electron: true},
	{ID: "glm-5", Provider: "zhipu", LabelEn: "GLM-5", Electron: true},
	{ID: "glm-5-turbo", Provider: "zhipu", LabelEn: "GLM-5 Turbo", Electron: true},
	{ID: "glm-4.7", Provider: "zhipu", LabelEn: "GLM-4.7", Electron: true},

	// Z.AI international — same GLM chat ids on api.z.ai
	{ID: "glm-5.2", Provider: "zai", LabelEn: "GLM-5.2", Electron: true, IsDefault: true},
	{ID: "glm-5.1", Provider: "zai", LabelEn: "GLM-5.1", Electron: true},
	{ID: "glm-5", Provider: "zai", LabelEn: "GLM-5", Electron: true},
	{ID: "glm-5-turbo", Provider: "zai", LabelEn: "GLM-5 Turbo", Electron: true},
	{ID: "glm-4.7", Provider: "zai", LabelEn: "GLM-4.7", Electron: true},

	// Alibaba DashScope / Bailian — Qwen commercial chat ids
	{ID: "qwen3.8-max", Provider: "dashscope", LabelEn: "Qwen 3.8 Max", Electron: true, IsDefault: true},
	{ID: "qwen3.7-max", Provider: "dashscope", LabelEn: "Qwen 3.7 Max", Electron: true},
	{ID: "qwen3.7-plus", Provider: "dashscope", LabelEn: "Qwen 3.7 Plus", Electron: true},
	{ID: "qwen3.6-flash", Provider: "dashscope", LabelEn: "Qwen 3.6 Flash", Electron: true},
	{ID: "qwen-plus", Provider: "dashscope", LabelEn: "Qwen Plus", Electron: true},
	{ID: "qwen-turbo", Provider: "dashscope", LabelEn: "Qwen Turbo", Electron: true},

	// ByteDance Doubao / Volcengine Ark
	{ID: "doubao-seed-2-0-pro-260215", Provider: "doubao", LabelEn: "Doubao Seed 2.0 Pro", Electron: true, IsDefault: true},
	{ID: "doubao-seed-2-0-lite-260215", Provider: "doubao", LabelEn: "Doubao Seed 2.0 Lite", Electron: true},
	{ID: "doubao-seed-2-0-mini-260215", Provider: "doubao", LabelEn: "Doubao Seed 2.0 Mini", Electron: true},
	{ID: "doubao-1-5-lite-32k", Provider: "doubao", LabelEn: "Doubao 1.5 Lite 32K", Electron: true},

	// MiniMax China — https://platform.minimax.io/docs/api-reference/api-overview
	{ID: "MiniMax-M3", Provider: "minimax", LabelEn: "MiniMax M3", Electron: true, IsDefault: true},
	{ID: "MiniMax-M2.7", Provider: "minimax", LabelEn: "MiniMax M2.7", Electron: true},
	{ID: "MiniMax-M2.7-highspeed", Provider: "minimax", LabelEn: "MiniMax M2.7 Highspeed", Electron: true},
	{ID: "MiniMax-M2.5", Provider: "minimax", LabelEn: "MiniMax M2.5", Electron: true},
	{ID: "MiniMax-M2.5-highspeed", Provider: "minimax", LabelEn: "MiniMax M2.5 Highspeed", Electron: true},
	{ID: "MiniMax-M2.1", Provider: "minimax", LabelEn: "MiniMax M2.1", Electron: true},
	{ID: "MiniMax-M2.1-highspeed", Provider: "minimax", LabelEn: "MiniMax M2.1 Highspeed", Electron: true},
	{ID: "MiniMax-M2", Provider: "minimax", LabelEn: "MiniMax M2", Electron: true},

	// MiniMax global (api.minimax.io) — same official chat ids
	{ID: "MiniMax-M3", Provider: "minimax-global", LabelEn: "MiniMax M3", Electron: true, IsDefault: true},
	{ID: "MiniMax-M2.7", Provider: "minimax-global", LabelEn: "MiniMax M2.7", Electron: true},
	{ID: "MiniMax-M2.7-highspeed", Provider: "minimax-global", LabelEn: "MiniMax M2.7 Highspeed", Electron: true},
	{ID: "MiniMax-M2.5", Provider: "minimax-global", LabelEn: "MiniMax M2.5", Electron: true},
	{ID: "MiniMax-M2.5-highspeed", Provider: "minimax-global", LabelEn: "MiniMax M2.5 Highspeed", Electron: true},
	{ID: "MiniMax-M2.1", Provider: "minimax-global", LabelEn: "MiniMax M2.1", Electron: true},
	{ID: "MiniMax-M2.1-highspeed", Provider: "minimax-global", LabelEn: "MiniMax M2.1 Highspeed", Electron: true},
	{ID: "MiniMax-M2", Provider: "minimax-global", LabelEn: "MiniMax M2", Electron: true},

	// Groq — https://console.groq.com/docs/models (chat; skip Whisper / TTS / prompt-guard)
	{ID: "openai/gpt-oss-120b", Provider: "groq", LabelEn: "GPT OSS 120B", Electron: true, IsDefault: true},
	{ID: "openai/gpt-oss-20b", Provider: "groq", LabelEn: "GPT OSS 20B", Electron: true},
	{ID: "llama-3.3-70b-versatile", Provider: "groq", LabelEn: "Llama 3.3 70B", Electron: true},
	{ID: "llama-3.1-8b-instant", Provider: "groq", LabelEn: "Llama 3.1 8B Instant", Electron: true},

	// Perplexity Sonar — https://docs.perplexity.ai/api-reference/sonar-post
	{ID: "sonar", Provider: "perplexity", LabelEn: "Sonar", Electron: true, IsDefault: true},
	{ID: "sonar-pro", Provider: "perplexity", LabelEn: "Sonar Pro", Electron: true},
	{ID: "sonar-reasoning-pro", Provider: "perplexity", LabelEn: "Sonar Reasoning Pro", Electron: true},
	{ID: "sonar-deep-research", Provider: "perplexity", LabelEn: "Sonar Deep Research", Electron: true},

	// StepFun — https://platform.stepfun.ai/docs/en/guides/models/step-3.5-flash
	{ID: "step-3.7-flash", Provider: "stepfun", LabelEn: "Step 3.7 Flash", Electron: true, IsDefault: true},
	{ID: "step-3.5-flash", Provider: "stepfun", LabelEn: "Step 3.5 Flash", Electron: true},
	{ID: "step-3.5-flash-2603", Provider: "stepfun", LabelEn: "Step 3.5 Flash 2603", Electron: true},

	// LongCat, Xiaomi MiMo, Baichuan, Cerebras, GitHub, Copilot, NVIDIA
	{ID: "LongCat-Flash-Chat", Provider: "longcat", LabelEn: "LongCat Flash Chat", Electron: true, IsDefault: true},
	{ID: "mimo-v2-flash", Provider: "mimo", LabelEn: "MiMo V2 Flash", Electron: true, IsDefault: true},
	{ID: "Baichuan4-Turbo", Provider: "baichuan", LabelEn: "Baichuan 4 Turbo", Electron: true, IsDefault: true},
	{ID: "llama3.1-8b", Provider: "cerebras", LabelEn: "Llama 3.1 8B", Electron: true, IsDefault: true},
	{ID: "openai/gpt-4o-mini", Provider: "github", LabelEn: "GPT-4o Mini", Electron: true, IsDefault: true},
	{ID: "gpt-4o-mini", Provider: "copilot", LabelEn: "GPT-4o Mini", Electron: true, IsDefault: true},
	{ID: "meta/llama-3.1-8b-instruct", Provider: "nvidia", LabelEn: "Llama 3.1 8B Instruct", Electron: true, IsDefault: true},
}

func init() {
	// Aggregators / gateways: one documented ping model each (not hundreds of routed ids).
	seen := map[string]struct{}{}
	for _, e := range all {
		seen[e.Provider] = struct{}{}
	}
	skip := map[string]struct{}{
		"openai": {}, "anthropic": {}, "gemini": {}, "grok": {},
		"azure-openai": {}, "vertexai": {}, "aws-bedrock": {},
		"jina": {}, "voyageai": {},
	}
	for _, p := range providers.All {
		if _, dup := seen[p.ID]; dup {
			continue
		}
		if _, omit := skip[p.ID]; omit {
			continue
		}
		if p.APIStyle == providers.StyleUnsupported {
			continue
		}
		id := strings.TrimSpace(p.PingModelID)
		if id == "" {
			continue
		}
		all = append(all, entryDef{
			ID:        id,
			Provider:  p.ID,
			LabelEn:   p.NameEn + " (" + id + ")",
			Electron:  true,
			IsDefault: true,
		})
	}
}

// ParseClient maps a query string to a ClientFilter (default web).
func ParseClient(raw string) ClientFilter {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case string(ClientElectron):
		return ClientElectron
	default:
		return ClientWeb
	}
}

// NormalizeProvider maps request aliases onto catalog provider slugs.
func NormalizeProvider(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "gemini":
		return "gemini"
	case "openai":
		return "chatgpt"
	case "anthropic":
		return "claude"
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

// IsKnownProvider reports whether the slug has at least one catalog row.
func IsKnownProvider(raw string) bool {
	provider := NormalizeProvider(raw)
	for _, e := range all {
		if e.Provider == provider {
			return true
		}
	}
	return false
}

// List returns catalog entries visible to the given client filter.
func List(client ClientFilter) []Entry {
	out := make([]Entry, 0, len(all))
	for _, e := range all {
		if client == ClientElectron && !e.Electron {
			continue
		}
		if client == ClientWeb && !e.Web {
			continue
		}
		efforts, defaultEffort := ReasoningFor(e.Provider, e.ID)
		out = append(out, Entry{
			ID:                     e.ID,
			Provider:               e.Provider,
			LabelEn:                e.LabelEn,
			Default:                e.IsDefault,
			Vision:                 e.Vision,
			ComputerUse:            e.ComputerUse,
			ReasoningEfforts:       efforts,
			DefaultReasoningEffort: defaultEffort,
		})
	}
	return out
}

// DefaultID returns the flagship vendor model id for a legacy chat slug.
func DefaultID(provider ai.Model) string {
	return DefaultIDFor(string(provider))
}

// DefaultIDFor returns the default vendor model id for a catalog provider slug.
func DefaultIDFor(provider string) string {
	provider = NormalizeProvider(provider)
	for _, e := range all {
		if e.Provider == provider && e.IsDefault {
			return e.ID
		}
	}
	for _, e := range all {
		if e.Provider == provider {
			return e.ID
		}
	}
	switch provider {
	case "chatgpt":
		return model.OpenAIDefaultModel
	case "claude":
		return model.AnthropicDefaultModel
	case "grok":
		return model.XAIDefaultModel
	default:
		return model.GeminiDefaultModel
	}
}

// Resolve returns the vendor API model id for a legacy chat slug + optional modelId.
func Resolve(provider ai.Model, modelID string) (vendorModelID string, ok bool) {
	return ResolveProvider(string(provider), modelID)
}

// ResolveProvider returns the vendor API model id for provider + optional modelId.
// Empty modelId uses the provider default. Non-empty modelId must be in the
// catalog for that provider (any client visibility) or ok is false.
func ResolveProvider(provider, modelID string) (vendorModelID string, ok bool) {
	provider = NormalizeProvider(provider)
	if !IsKnownProvider(provider) {
		return "", false
	}
	modelID = strings.TrimSpace(modelID)
	if modelID == "" {
		return DefaultIDFor(provider), true
	}
	for _, e := range all {
		if e.Provider == provider && e.ID == modelID {
			return e.ID, true
		}
	}
	return "", false
}
