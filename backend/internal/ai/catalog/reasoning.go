package catalog

import "strings"

// Vendor-native reasoning / thinking effort ids (Codex wire values).
// Empty catalog rows mean the model has no adjustable depth — the Agent picker
// hides, and /ai/harness omits vendor reasoning fields.
var (
	// OpenAI public Chat Completions / Responses accept none|low|medium|high|xhigh
	// only. Codex ChatGPT extras (max, ultra) are coerced to xhigh on the wire.
	effGPT56        = []string{"low", "medium", "high", "xhigh"}
	effGPT54        = []string{"low", "medium", "high", "xhigh"}
	effGPT51        = []string{"none", "low", "medium", "high", "xhigh"}
	effGPT5         = []string{"minimal", "low", "medium", "high"}
	effO3           = []string{"low", "medium", "high"}
	effHighOnly     = []string{"high"}
	effGemini37     = []string{"low", "medium", "high"}
	effGemini3      = []string{"minimal", "low", "medium", "high"}
	effGemini31Pro  = []string{"low", "medium", "high"}
	effGemini25     = []string{"low", "medium", "high"}
	effGemini25Lite = []string{"none", "low", "medium", "high"}
	effClaude5      = []string{"low", "medium", "high", "xhigh", "max"}
	effClaude46     = []string{"low", "medium", "high", "max"}
	effClaude45     = []string{"low", "medium", "high"}
	effGrok46       = []string{"low", "medium", "high", "xhigh"}
	effGrok45       = []string{"low", "medium", "high"}
	effGrok43       = []string{"none", "low", "medium", "high"}
)

type reasoningProfile struct {
	Efforts []string
	Default string
}

// reasoningByKey is keyed by provider:id for rows in `all`.
// Sources: Codex models.json (overlapping GPT-5.6/5.5/5.4/5.2 slugs),
// OpenAI reasoning docs, Gemini thinking_level tables, Anthropic output_config.effort,
// xAI reasoning_effort. Models not listed have no adjustable depth.
var reasoningByKey = map[string]reasoningProfile{
	// OpenAI — Codex models.json for slugs Codex actually ships.
	"chatgpt:gpt-5.6-sol":   {effGPT56, "low"},
	"chatgpt:gpt-5.6-terra": {effGPT56, "medium"},
	"chatgpt:gpt-5.6-luna":  {effGPT56, "medium"},
	"chatgpt:gpt-5.5":       {effGPT54, "medium"},
	"chatgpt:gpt-5.5-pro":   {effHighOnly, "high"},
	"chatgpt:gpt-5.4":       {effGPT54, "medium"},
	"chatgpt:gpt-5.4-pro":   {effHighOnly, "high"},
	"chatgpt:gpt-5.4-mini":  {effGPT54, "medium"},
	"chatgpt:gpt-5.4-nano":  {effGPT54, "medium"},
	"chatgpt:gpt-5.3-codex": {effGPT54, "medium"},
	"chatgpt:gpt-5.2":       {effGPT54, "medium"},
	"chatgpt:gpt-5.2-pro":   {effHighOnly, "high"},
	"chatgpt:gpt-5.1":       {effGPT51, "none"},
	"chatgpt:gpt-5":         {effGPT5, "medium"},
	"chatgpt:gpt-5-mini":    {effGPT5, "medium"},
	"chatgpt:gpt-5-nano":    {effGPT5, "medium"},
	"chatgpt:gpt-5-pro":     {effHighOnly, "high"},
	"chatgpt:o3":            {effO3, "medium"},
	"chatgpt:o3-pro":        {effHighOnly, "high"},

	// Gemini — thinking_level (3.x) / thinkingConfig (2.5).
	"gemini:gemini-3.7-flash":       {effGemini37, "medium"},
	"gemini:gemini-3.6-flash":       {effGemini3, "medium"},
	"gemini:gemini-3.5-flash":       {effGemini3, "medium"},
	"gemini:gemini-3.5-flash-lite":  {effGemini3, "minimal"},
	"gemini:gemini-3.1-flash-lite":  {effGemini3, "minimal"},
	"gemini:gemini-3.1-pro-preview": {effGemini31Pro, "high"},
	"gemini:gemini-3-flash-preview": {effGemini3, "high"},
	"gemini:gemini-2.5-pro":         {effGemini25, "medium"},
	"gemini:gemini-2.5-flash":       {effGemini25, "medium"},
	"gemini:gemini-2.5-flash-lite":  {effGemini25Lite, "none"},

	// Anthropic — output_config.effort on adaptive-thinking models.
	// Sonnet 4.5 / Haiku 4.5 are budget_tokens only (no discrete effort picker).
	"claude:claude-opus-5":            {effClaude5, "high"},
	"claude:claude-fable-5-1":         {effClaude5, "high"},
	"claude:claude-fable-5":           {effClaude5, "high"},
	"claude:claude-sonnet-5":          {effClaude5, "high"},
	"claude:claude-opus-4-8":          {effClaude5, "high"},
	"claude:claude-opus-4-7":          {effClaude5, "high"},
	"claude:claude-opus-4-6":          {effClaude46, "high"},
	"claude:claude-opus-4-5-20251101": {effClaude45, "high"},
	"claude:claude-sonnet-4-6":        {effClaude46, "high"},

	// xAI — pinned 4.20 snapshots and Grok Build reject reasoning_effort.
	"grok:grok-4.6": {effGrok46, "high"},
	"grok:grok-4.5": {effGrok45, "high"},
	"grok:grok-4.3": {effGrok43, "low"},
}

// ReasoningFor returns a copy of the vendor effort list and default for one catalog row.
// Unknown ids or models without adjustable depth return a nil slice.
func ReasoningFor(provider, modelID string) (efforts []string, defaultEffort string) {
	key := NormalizeProvider(provider) + ":" + strings.TrimSpace(modelID)
	profile, ok := reasoningByKey[key]
	if !ok || len(profile.Efforts) == 0 {
		return nil, ""
	}
	return append([]string(nil), profile.Efforts...), profile.Default
}

// ClampReasoningEffort returns a catalog-allowed effort for the model.
// Empty requested uses the catalog default. Unknown or unsupported values
// fall back to the default. Codex extras `max` / `ultra` that a ChatGPT
// model no longer lists coerce to `xhigh` (then `high`) when those exist.
// Models with no profile return "".
func ClampReasoningEffort(provider, modelID, requested string) string {
	efforts, defaultEffort := ReasoningFor(provider, modelID)
	if len(efforts) == 0 {
		return ""
	}
	requested = strings.ToLower(strings.TrimSpace(requested))
	if requested == "" {
		return defaultEffort
	}
	for _, allowed := range efforts {
		if allowed == requested {
			return requested
		}
	}
	if requested == "max" || requested == "ultra" {
		for _, candidate := range []string{"xhigh", "high"} {
			for _, allowed := range efforts {
				if allowed == candidate {
					return candidate
				}
			}
		}
	}
	return defaultEffort
}

// OpenAIWireEffort maps Codex extras onto OpenAI Responses / Chat Completions.
// OpenAI rejects `max` and `ultra`; the highest public value is `xhigh`.
func OpenAIWireEffort(effort string) string {
	switch strings.ToLower(strings.TrimSpace(effort)) {
	case "ultra", "max":
		return "xhigh"
	default:
		return effort
	}
}

// GeminiThinkingConfig returns generateContent thinkingConfig for a clamped effort.
// none disables thinking via a zero budget; other levels use thinkingLevel.
func GeminiThinkingConfig(effort string) map[string]any {
	effort = strings.ToLower(strings.TrimSpace(effort))
	if effort == "" {
		return nil
	}
	if effort == "none" {
		return map[string]any{"thinkingBudget": 0}
	}
	return map[string]any{"thinkingLevel": strings.ToUpper(effort)}
}
