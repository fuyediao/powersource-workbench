package model

import (
	"context"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providerhttp"
)

// OpenAIDefaultBaseURL is the production OpenAI API host.
const OpenAIDefaultBaseURL = "https://api.openai.com"

// OpenAIDefaultModel is the chat model id used by GeoCRM (GPT-5.6 Sol).
const OpenAIDefaultModel = "gpt-5.6-sol"

// CompleteOpenAI sends systemPrompt + userPrompt to OpenAI Chat Completions,
// matching geocrm-web/src/services/chatgptService.ts.
//
// GPT-5.x reasoning models reject `max_tokens` (use `max_completion_tokens`)
// and non-default `temperature`; sending those yields HTTP 400 even with a
// valid API key. Empty vendorModelID uses OpenAIDefaultModel.
func CompleteOpenAI(ctx context.Context, httpc *http.Client, baseURL, apiKey, vendorModelID, systemPrompt, userPrompt, reasoningEffort string, images ...InlineImage) (string, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" {
		baseURL = OpenAIDefaultBaseURL
	}
	if strings.TrimSpace(vendorModelID) == "" {
		vendorModelID = OpenAIDefaultModel
	}
	url := baseURL + "/v1/chat/completions"
	headers := map[string]string{"Authorization": "Bearer " + apiKey}
	payload := map[string]any{
		"model": vendorModelID,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": openaiUserContent(userPrompt, images)},
		},
		"max_completion_tokens": 8000,
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
