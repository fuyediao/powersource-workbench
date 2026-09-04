// Package providerhttp holds shared HTTP helpers for AI vendor packages under
// internal/ai (OpenAI, Anthropic, Gemini, xAI).
package providerhttp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ErrEmptyResponse is returned when a provider responds successfully but with
// no usable text content.
var ErrEmptyResponse = errors.New("ai: provider returned an empty response")

// maxResponseBytes caps how much of a provider response body is read into
// memory; trilingual review JSON is at most a few thousand characters.
const maxResponseBytes = 4 << 20

// PostJSON POSTs a JSON-encoded payload with the given extra headers and
// returns the raw response body. Non-2xx responses are mapped to an error
// carrying the provider's own error message when present.
func PostJSON(ctx context.Context, httpc *http.Client, url string, headers map[string]string, payload any) ([]byte, error) {
	if httpc == nil {
		httpc = http.DefaultClient
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ai: provider request failed: status %d: %s", resp.StatusCode, ExtractErrorMessage(respBody))
	}
	return respBody, nil
}

// ExtractErrorMessage reads the conventional {"error": {"message": ...}}
// envelope shared by OpenAI, Anthropic, and xAI, falling back to a truncated
// raw body when the shape does not match (e.g. Gemini errors).
func ExtractErrorMessage(body []byte) string {
	var withNestedError struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &withNestedError) == nil && withNestedError.Error.Message != "" {
		return withNestedError.Error.Message
	}
	trimmed := strings.TrimSpace(string(body))
	const maxLen = 300
	if len(trimmed) > maxLen {
		trimmed = trimmed[:maxLen]
	}
	return trimmed
}

// ExtractChatCompletionText reads the OpenAI-style choices[0].message.content
// shape shared by ChatGPT and Grok.
func ExtractChatCompletionText(body []byte) (string, error) {
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("ai: could not parse chat completion response: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return "", ErrEmptyResponse
	}
	text := strings.TrimSpace(parsed.Choices[0].Message.Content)
	if text == "" {
		return "", ErrEmptyResponse
	}
	return text, nil
}
