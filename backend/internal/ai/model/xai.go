package model

import (
	"context"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providerhttp"
)

// XAIDefaultBaseURL is the production xAI API host.
const XAIDefaultBaseURL = "https://api.x.ai"

// XAIDefaultModel is the Grok model id used by GeoCRM (Grok 4.5).
const XAIDefaultModel = "grok-4.5"

// CompleteXAI sends systemPrompt + userPrompt to xAI Chat Completions,
// matching geocrm-web/src/services/grokService.ts.
// Empty vendorModelID uses XAIDefaultModel.
func CompleteXAI(ctx context.Context, httpc *http.Client, baseURL, apiKey, vendorModelID, systemPrompt, userPrompt, reasoningEffort string, images ...InlineImage) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = XAIDefaultBaseURL
	}
	if strings.TrimSpace(vendorModelID) == "" {
		vendorModelID = XAIDefaultModel
	}
	url := baseURL + "/v1/chat/completions"
	headers := map[string]string{"Authorization": "Bearer " + apiKey}
	payload := map[string]any{
		"model": vendorModelID,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": openaiUserContent(userPrompt, images)},
		},
		"temperature": 0.7,
		"max_tokens":  3000,
	}
	if effort := strings.TrimSpace(reasoningEffort); effort != "" {
		payload["reasoning_effort"] = effort
	}
	body, err := providerhttp.PostJSON(ctx, httpc, url, headers, payload)
	if err != nil {
		return "", err
	}
	return providerhttp.ExtractChatCompletionText(body)
}
