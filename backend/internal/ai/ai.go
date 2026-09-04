// Package ai is a minimal server-side client for the AI vendors also used from
// the browser in geocrm-web (Gemini, ChatGPT, Claude, Grok). It exists so
// geocrm-api can generate AI content (e.g. the T&E application review
// suggestion) using an admin's own provider API key without shipping that
// key, or the prompt, through the browser. It never logs API keys, prompts,
// or raw provider responses.
//
// Vendor HTTP calls live in internal/ai/model (one file per provider) so new
// models can be added without growing the Client facade:
//
//	internal/ai/model/openai.go     — OpenAI Chat Completions
//	internal/ai/model/anthropic.go  — Anthropic Messages
//	internal/ai/model/gemini.go     — Gemini generateContent
//	internal/ai/model/xai.go        — xAI Chat Completions
//
// Allowlisted vendor model ids live in internal/ai/catalog (GET /ai/models).
package ai

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/model"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providerhttp"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providers"
)

// Model identifies one of the supported AI provider slugs, matching the
// frontend model ids (geminiService.ts, chatgptService.ts, claudeService.ts,
// grokService.ts) and the profiles.*_api_key column each one reads.
type Model string

const (
	// ModelGemini calls Google Gemini via the Generative Language API.
	ModelGemini Model = "gemini"
	// ModelChatGPT calls OpenAI's Chat Completions API.
	ModelChatGPT Model = "chatgpt"
	// ModelClaude calls Anthropic's Messages API.
	ModelClaude Model = "claude"
	// ModelGrok calls xAI's Chat Completions API.
	ModelGrok Model = "grok"
)

// ParseModel validates a model slug from a request body, defaulting to
// ModelGemini when raw is empty. ok is false for any other non-empty value.
func ParseModel(raw string) (modelSlug Model, ok bool) {
	raw = strings.ToLower(strings.TrimSpace(raw))
	if raw == "" {
		return ModelGemini, true
	}
	switch Model(raw) {
	case ModelGemini, ModelChatGPT, ModelClaude, ModelGrok:
		return Model(raw), true
	default:
		return "", false
	}
}

// ErrMissingAPIKey is returned by Complete when apiKey is empty.
var ErrMissingAPIKey = errors.New("ai: missing API key")

// ErrEmptyResponse is returned when a provider responds successfully but with
// no usable text content.
var ErrEmptyResponse = providerhttp.ErrEmptyResponse

// Client calls the supported AI vendors with a caller-supplied API key. The
// base URLs are fixed in production; tests override them to point at an
// httptest server.
type Client struct {
	httpc         *http.Client
	geminiBaseURL string
	openaiBaseURL string
	claudeBaseURL string
	grokBaseURL   string
}

// NewClient builds an ai.Client pointed at the production provider endpoints
// with a timeout suitable for an admin-triggered, on-demand generation call.
func NewClient() *Client {
	return &Client{
		httpc:         &http.Client{Timeout: 60 * time.Second},
		geminiBaseURL: model.GeminiDefaultBaseURL,
		openaiBaseURL: model.OpenAIDefaultBaseURL,
		claudeBaseURL: model.AnthropicDefaultBaseURL,
		grokBaseURL:   model.XAIDefaultBaseURL,
	}
}

// CompleteOptions configures optional provider features for a completion call.
type CompleteOptions struct {
	// GoogleSearch enables Gemini google_search grounding (map chat and Ask web search).
	GoogleSearch bool
	// VendorModelID is an allowlisted provider API model id; empty uses the default.
	VendorModelID string
	// Images are optional inline images on the user turn (Ask sidebar screenshot).
	Images []model.InlineImage
	// ReasoningEffort is a catalog-clamped vendor-native depth value.
	ReasoningEffort string
}

// Complete sends systemPrompt + userPrompt to the given provider using the
// caller's own apiKey and returns the raw assistant text. Callers are
// responsible for parsing structured content (e.g. trilingual JSON) out of
// the returned string; see ParseTrilingual.
func (c *Client) Complete(ctx context.Context, modelSlug Model, apiKey, systemPrompt, userPrompt string) (string, error) {
	return c.CompleteWithOptions(ctx, modelSlug, apiKey, systemPrompt, userPrompt, CompleteOptions{})
}

// CompleteWithOptions is Complete with optional provider features (e.g. Gemini grounding).
func (c *Client) CompleteWithOptions(
	ctx context.Context,
	modelSlug Model,
	apiKey, systemPrompt, userPrompt string,
	opts CompleteOptions,
) (string, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return "", ErrMissingAPIKey
	}
	vendorModelID := strings.TrimSpace(opts.VendorModelID)
	switch modelSlug {
	case ModelGemini:
		return model.CompleteGeminiWithOptions(ctx, c.httpc, c.geminiBaseURL, apiKey, systemPrompt, userPrompt, model.CompleteGeminiOpts{
			GoogleSearch:    opts.GoogleSearch,
			VendorModelID:   vendorModelID,
			Images:          opts.Images,
			ReasoningEffort: opts.ReasoningEffort,
		})
	case ModelChatGPT:
		return model.CompleteOpenAI(ctx, c.httpc, c.openaiBaseURL, apiKey, vendorModelID, systemPrompt, userPrompt, opts.ReasoningEffort, opts.Images...)
	case ModelClaude:
		return model.CompleteAnthropic(ctx, c.httpc, c.claudeBaseURL, apiKey, vendorModelID, systemPrompt, userPrompt, opts.ReasoningEffort, opts.Images...)
	case ModelGrok:
		return model.CompleteXAI(ctx, c.httpc, c.grokBaseURL, apiKey, vendorModelID, systemPrompt, userPrompt, opts.ReasoningEffort, opts.Images...)
	default:
		return "", fmt.Errorf("ai: unknown model %q", modelSlug)
	}
}

// ErrUnsupportedProvider is returned when a registry entry cannot be pinged
// with only an API key (Azure / Vertex / Bedrock).
var ErrUnsupportedProvider = errors.New("ai: provider requires additional configuration")

// CompleteByProvider runs a short completion against a Cherry-style provider id
// using the registry base URL and API style (settings connectivity / ping).
func (c *Client) CompleteByProvider(ctx context.Context, providerID, apiKey, systemPrompt, userPrompt string) (string, error) {
	return c.CompleteByProviderModel(ctx, providerID, apiKey, "", systemPrompt, userPrompt)
}

// CompleteByProviderModel is CompleteByProvider with an explicit vendor model id.
// Empty vendorModelID uses the registry ping model.
func (c *Client) CompleteByProviderModel(
	ctx context.Context,
	providerID, apiKey, vendorModelID, systemPrompt, userPrompt string,
) (string, error) {
	return c.CompleteByProviderModelWithOptions(ctx, providerID, apiKey, vendorModelID, systemPrompt, userPrompt, CompleteOptions{})
}

// CompleteByProviderModelWithOptions is CompleteByProviderModel with optional
// inline images (Ask screenshot) and other CompleteOptions.
func (c *Client) CompleteByProviderModelWithOptions(
	ctx context.Context,
	providerID, apiKey, vendorModelID, systemPrompt, userPrompt string,
	opts CompleteOptions,
) (string, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return "", ErrMissingAPIKey
	}
	providerID = strings.ToLower(strings.TrimSpace(providerID))
	// Accept chat slugs as aliases.
	switch providerID {
	case "chatgpt":
		providerID = "openai"
	case "claude":
		providerID = "anthropic"
	}
	p, ok := providers.Get(providerID)
	if !ok {
		return "", fmt.Errorf("ai: unknown provider %q", providerID)
	}
	if p.APIStyle == providers.StyleUnsupported {
		return "", ErrUnsupportedProvider
	}
	modelID := strings.TrimSpace(vendorModelID)
	if modelID == "" {
		modelID = strings.TrimSpace(p.PingModelID)
	}
	if modelID == "" {
		return "", fmt.Errorf("ai: missing model id for provider %q", providerID)
	}

	switch p.APIStyle {
	case providers.StyleAnthropic:
		base := p.BaseURL
		if base == "" {
			base = c.claudeBaseURL
		}
		return model.CompleteAnthropic(ctx, c.httpc, base, apiKey, modelID, systemPrompt, userPrompt, opts.ReasoningEffort, opts.Images...)
	case providers.StyleGemini:
		base := p.BaseURL
		if base == "" {
			base = c.geminiBaseURL
		}
		return model.CompleteGeminiWithOptions(ctx, c.httpc, base, apiKey, systemPrompt, userPrompt, model.CompleteGeminiOpts{
			GoogleSearch:    opts.GoogleSearch,
			VendorModelID:   modelID,
			Images:          opts.Images,
			ReasoningEffort: opts.ReasoningEffort,
		})
	case providers.StyleOpenAI:
		// Prefer dedicated xAI path for Grok (reasoning_effort quirks).
		if providerID == "grok" {
			return model.CompleteXAI(ctx, c.httpc, c.grokBaseURL, apiKey, modelID, systemPrompt, userPrompt, opts.ReasoningEffort, opts.Images...)
		}
		if providerID == "openai" {
			return model.CompleteOpenAI(ctx, c.httpc, c.openaiBaseURL, apiKey, modelID, systemPrompt, userPrompt, opts.ReasoningEffort, opts.Images...)
		}
		return model.CompleteOpenAICompatible(ctx, c.httpc, p.BaseURL, p.ModelsPath, apiKey, modelID, systemPrompt, userPrompt, opts.Images...)
	default:
		return "", fmt.Errorf("ai: unsupported API style %q", p.APIStyle)
	}
}
