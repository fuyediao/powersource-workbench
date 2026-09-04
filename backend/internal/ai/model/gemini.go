package model

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providerhttp"
)

// GeminiDefaultBaseURL is the production Generative Language API host.
const GeminiDefaultBaseURL = "https://generativelanguage.googleapis.com"

// GeminiDefaultModel is the Gemini model id used by GeoCRM (3.1 Pro preview).
const GeminiDefaultModel = "gemini-3.1-pro-preview"

// CompleteGeminiOpts configures optional Gemini generateContent features.
type CompleteGeminiOpts struct {
	// GoogleSearch enables the google_search grounding tool (map chat and Ask web search).
	GoogleSearch bool
	// VendorModelID overrides GeminiDefaultModel when non-empty.
	VendorModelID string
	// Images are optional inline images on the user turn (Ask screenshot).
	Images []InlineImage
	// ReasoningEffort controls Gemini thinking when the selected model supports it.
	ReasoningEffort string
}

// CompleteGemini sends systemPrompt + userPrompt to Gemini generateContent,
// matching geocrm-web/src/services/geminiService.ts (without grounding).
func CompleteGemini(ctx context.Context, httpc *http.Client, baseURL, apiKey, systemPrompt, userPrompt string) (string, error) {
	return CompleteGeminiWithOptions(ctx, httpc, baseURL, apiKey, systemPrompt, userPrompt, CompleteGeminiOpts{})
}

// CompleteGeminiWithOptions is CompleteGemini with optional Google Search grounding.
func CompleteGeminiWithOptions(
	ctx context.Context,
	httpc *http.Client,
	baseURL, apiKey, systemPrompt, userPrompt string,
	opts CompleteGeminiOpts,
) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = GeminiDefaultBaseURL
	}
	vendorModelID := strings.TrimSpace(opts.VendorModelID)
	if vendorModelID == "" {
		vendorModelID = GeminiDefaultModel
	}
	url := baseURL + "/v1beta/models/" + vendorModelID + ":generateContent?key=" + apiKey
	payload := map[string]any{
		"contents": []map[string]any{
			{"role": "user", "parts": geminiUserParts(userPrompt, opts.Images)},
		},
		"systemInstruction": map[string]any{
			"parts": []map[string]any{{"text": systemPrompt}},
		},
	}
	if opts.GoogleSearch {
		payload["tools"] = []map[string]any{{"google_search": map[string]any{}}}
	}
	if thinkingConfig := geminiThinkingConfig(opts.ReasoningEffort); thinkingConfig != nil {
		payload["generationConfig"] = map[string]any{"thinkingConfig": thinkingConfig}
	}
	body, err := providerhttp.PostJSON(ctx, httpc, url, nil, payload)
	if err != nil {
		return "", err
	}
	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("ai: could not parse Gemini response: %w", err)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return "", providerhttp.ErrEmptyResponse
	}
	text := strings.TrimSpace(parsed.Candidates[0].Content.Parts[0].Text)
	if text == "" {
		return "", providerhttp.ErrEmptyResponse
	}
	return text, nil
}

// geminiThinkingConfig maps a validated catalog effort to Gemini wire fields.
func geminiThinkingConfig(effort string) map[string]any {
	effort = strings.ToLower(strings.TrimSpace(effort))
	if effort == "" {
		return nil
	}
	if effort == "none" {
		return map[string]any{"thinkingBudget": 0}
	}
	return map[string]any{"thinkingLevel": strings.ToUpper(effort)}
}
