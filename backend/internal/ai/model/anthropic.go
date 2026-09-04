package model

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providerhttp"
)

// AnthropicDefaultBaseURL is the production Anthropic API host.
const AnthropicDefaultBaseURL = "https://api.anthropic.com"

// AnthropicDefaultModel is the Messages API model id used by GeoCRM (Claude Opus 5).
const AnthropicDefaultModel = "claude-opus-5"

// CompleteAnthropic sends systemPrompt + userPrompt to Anthropic Messages,
// matching geocrm-web/src/services/claudeService.ts.
// Empty vendorModelID uses AnthropicDefaultModel.
func CompleteAnthropic(ctx context.Context, httpc *http.Client, baseURL, apiKey, vendorModelID, systemPrompt, userPrompt, reasoningEffort string, images ...InlineImage) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = AnthropicDefaultBaseURL
	}
	if strings.TrimSpace(vendorModelID) == "" {
		vendorModelID = AnthropicDefaultModel
	}
	url := baseURL + "/v1/messages"
	headers := map[string]string{
		"x-api-key":         apiKey,
		"anthropic-version": "2023-06-01",
	}
	payload := map[string]any{
		"model":      vendorModelID,
		"max_tokens": 3000,
		"system":     systemPrompt,
		"messages": []map[string]any{
			{"role": "user", "content": anthropicUserContent(userPrompt, images)},
		},
	}
	if effort := strings.TrimSpace(reasoningEffort); effort != "" {
		payload["output_config"] = map[string]any{"effort": effort}
	}
	body, err := providerhttp.PostJSON(ctx, httpc, url, headers, payload)
	if err != nil {
		return "", err
	}
	var parsed struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("ai: could not parse Claude response: %w", err)
	}
	if len(parsed.Content) == 0 {
		return "", providerhttp.ErrEmptyResponse
	}
	text := strings.TrimSpace(parsed.Content[0].Text)
	if text == "" {
		return "", providerhttp.ErrEmptyResponse
	}
	return text, nil
}
