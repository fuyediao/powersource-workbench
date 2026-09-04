package model

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providerhttp"
)

// CompleteOpenAICompatible sends systemPrompt + userPrompt to an
// OpenAI-compatible Chat Completions endpoint (DeepSeek, OpenRouter, etc.).
// modelsPath from the registry decides whether the chat URL is
// `{base}/v1/chat/completions` or `{base}/chat/completions`.
// Empty vendorModelID uses "gpt-4o-mini" as a cheap connectivity default.
func CompleteOpenAICompatible(
	ctx context.Context,
	httpc *http.Client,
	baseURL, modelsPath, apiKey, vendorModelID, systemPrompt, userPrompt string,
	images ...InlineImage,
) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		return "", fmt.Errorf("ai: empty OpenAI-compatible base URL")
	}
	if strings.TrimSpace(vendorModelID) == "" {
		vendorModelID = "gpt-4o-mini"
	}
	url := chatCompletionsURL(baseURL, modelsPath)
	headers := map[string]string{"Authorization": "Bearer " + apiKey}
	payload := map[string]any{
		"model": vendorModelID,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": openaiUserContent(userPrompt, images)},
		},
		"max_tokens": 64,
	}
	body, err := providerhttp.PostJSON(ctx, httpc, url, headers, payload)
	if err != nil {
		return "", err
	}
	return providerhttp.ExtractChatCompletionText(body)
}

// chatCompletionsURL builds the Chat Completions URL from registry base + modelsPath.
func chatCompletionsURL(baseURL, modelsPath string) string {
	modelsPath = strings.TrimSpace(modelsPath)
	switch {
	case modelsPath == "/models" || strings.HasSuffix(modelsPath, "/models") && !strings.Contains(modelsPath, "/v1/"):
		return baseURL + "/chat/completions"
	case strings.HasSuffix(modelsPath, "/v1/models") || modelsPath == "/v1/models":
		return baseURL + "/v1/chat/completions"
	default:
		// Fallback: most hosts expect /v1/chat/completions under the API root.
		if strings.HasSuffix(baseURL, "/v1") || strings.Contains(baseURL, "/compatible-mode/v1") {
			return baseURL + "/chat/completions"
		}
		return baseURL + "/v1/chat/completions"
	}
}
