package harness

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/catalog"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providerhttp"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

type computerUseRequest struct {
	Provider   string   `json:"provider"`
	Model      string   `json:"model"`
	Task       string   `json:"task"`
	Screenshot string   `json:"screenshot"`
	History    []string `json:"history"`
}

type computerUseAction struct {
	Action    string `json:"action"`
	X         int    `json:"x,omitempty"`
	Y         int    `json:"y,omitempty"`
	EndX      int    `json:"endX,omitempty"`
	EndY      int    `json:"endY,omitempty"`
	Text      string `json:"text,omitempty"`
	Key       string `json:"key,omitempty"`
	Direction string `json:"direction,omitempty"`
	Amount    int    `json:"amount,omitempty"`
	Result    string `json:"result,omitempty"`
	Reason    string `json:"reason,omitempty"`
	Sensitive bool   `json:"sensitive,omitempty"`
}

// computerUseStep asks an allowlisted visual model for exactly one desktop action.
func (h *Handler) computerUseStep(w http.ResponseWriter, r *http.Request) {
	var body computerUseRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid computer-use request.")
		return
	}
	provider := catalog.NormalizeProvider(body.Provider)
	modelID, ok := catalog.ResolveProvider(provider, body.Model)
	if !ok || !isComputerUseModel(provider, modelID) {
		httpx.WriteError(w, http.StatusBadRequest, "The selected model does not support computer use.")
		return
	}
	if strings.TrimSpace(body.Task) == "" || strings.TrimSpace(body.Screenshot) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "Task and screenshot are required.")
		return
	}
	apiKey, err := ai.LoadProviderAPIKey(r.Context(), h.sb, authmw.UserIDFrom(r), provider)
	if err != nil || apiKey == "" {
		httpx.WriteError(w, http.StatusUnprocessableEntity, "The selected provider has no API key.")
		return
	}
	action, err := h.completeComputerUse(r, provider, apiKey, modelID, body)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, err.Error())
		return
	}
	httpx.WriteJSON(w, http.StatusOK, action)
}

// isComputerUseModel checks the catalog capability exposed to Electron.
func isComputerUseModel(provider, modelID string) bool {
	for _, entry := range catalog.List(catalog.ClientElectron) {
		if entry.Provider == provider && entry.ID == modelID {
			return entry.Vision && entry.ComputerUse
		}
	}
	return false
}

// completeComputerUse routes a visual action request to the selected provider adapter.
func (h *Handler) completeComputerUse(
	r *http.Request,
	provider string,
	apiKey string,
	modelID string,
	body computerUseRequest,
) (computerUseAction, error) {
	switch provider {
	case "chatgpt":
		return h.completeOpenAICompatibleComputerUse(r, "https://api.openai.com", apiKey, modelID, body)
	case "claude":
		return h.completeAnthropicComputerUse(r, "https://api.anthropic.com", apiKey, modelID, body)
	case "gemini":
		return h.completeGeminiComputerUse(r, "https://generativelanguage.googleapis.com", apiKey, modelID, body)
	case "grok":
		return h.completeOpenAICompatibleComputerUse(r, "https://api.x.ai", apiKey, modelID, body)
	default:
		return computerUseAction{}, fmt.Errorf("provider %s does not support computer use", provider)
	}
}

// computerUsePrompt builds the provider-neutral instruction for one visual step.
func computerUsePrompt(body computerUseRequest) string {
	history := strings.Join(body.History, "\n")
	prompt := `You control a Windows desktop. Inspect the screenshot and choose exactly one next action that advances the task. Coordinates use the screenshot's actual pixel dimensions. Never type secrets. Set sensitive=true before an action that submits, purchases, deletes, sends a message, changes permissions, or has another external side effect. Use done only when the task is complete. Task: ` + body.Task
	if history != "" {
		prompt += "\nActions already taken:\n" + history
	}
	return prompt
}

// parseComputerUseAction validates one provider's structured action payload.
func parseComputerUseAction(raw []byte) (computerUseAction, error) {
	var action computerUseAction
	if err := json.Unmarshal(raw, &action); err != nil {
		return computerUseAction{}, fmt.Errorf("could not parse computer-use action")
	}
	if !validComputerUseAction(action.Action) {
		return computerUseAction{}, fmt.Errorf("model returned an unsupported computer-use action")
	}
	return action, nil
}

// completeOpenAICompatibleComputerUse calls OpenAI or xAI Chat Completions with image input and strict JSON output.
func (h *Handler) completeOpenAICompatibleComputerUse(
	r *http.Request,
	baseURL string,
	apiKey string,
	modelID string,
	body computerUseRequest,
) (computerUseAction, error) {
	payload := map[string]any{
		"model": modelID,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{"type": "text", "text": computerUsePrompt(body)},
				{"type": "image_url", "image_url": map[string]any{
					"url": "data:image/png;base64," + body.Screenshot,
				}},
			},
		}},
		"response_format": map[string]any{
			"type": "json_schema",
			"json_schema": map[string]any{
				"name":   "computer_use_action",
				"strict": true,
				"schema": strictComputerUseSchema(),
			},
		},
	}
	raw, err := providerhttp.PostJSON(
		r.Context(),
		h.modelHTTP,
		strings.TrimRight(baseURL, "/")+"/v1/chat/completions",
		map[string]string{"Authorization": "Bearer " + apiKey},
		payload,
	)
	if err != nil {
		return computerUseAction{}, err
	}
	var response struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if json.Unmarshal(raw, &response) != nil || len(response.Choices) == 0 {
		return computerUseAction{}, fmt.Errorf("could not parse provider computer-use response")
	}
	return parseComputerUseAction([]byte(response.Choices[0].Message.Content))
}

// completeAnthropicComputerUse calls Claude Messages with a forced structured desktop-action tool.
func (h *Handler) completeAnthropicComputerUse(
	r *http.Request,
	baseURL string,
	apiKey string,
	modelID string,
	body computerUseRequest,
) (computerUseAction, error) {
	payload := map[string]any{
		"model":      modelID,
		"max_tokens": 2048,
		"messages": []map[string]any{{
			"role": "user",
			"content": []map[string]any{
				{"type": "image", "source": map[string]any{
					"type":       "base64",
					"media_type": "image/png",
					"data":       body.Screenshot,
				}},
				{"type": "text", "text": computerUsePrompt(body)},
			},
		}},
		"tools": []map[string]any{{
			"name":         "desktop_action",
			"description":  "Return exactly one safe, auditable desktop action.",
			"input_schema": computerUseSchema(),
		}},
		"tool_choice": map[string]any{
			"type": "tool",
			"name": "desktop_action",
		},
	}
	raw, err := providerhttp.PostJSON(
		r.Context(),
		h.modelHTTP,
		strings.TrimRight(baseURL, "/")+"/v1/messages",
		map[string]string{
			"x-api-key":         apiKey,
			"anthropic-version": "2023-06-01",
		},
		payload,
	)
	if err != nil {
		return computerUseAction{}, err
	}
	var response struct {
		Content []struct {
			Type  string          `json:"type"`
			Name  string          `json:"name"`
			Input json.RawMessage `json:"input"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		return computerUseAction{}, fmt.Errorf("could not parse Anthropic computer-use response")
	}
	for _, block := range response.Content {
		if block.Type == "tool_use" && block.Name == "desktop_action" {
			return parseComputerUseAction(block.Input)
		}
	}
	return computerUseAction{}, fmt.Errorf("Anthropic returned no desktop action")
}

// completeGeminiComputerUse returns a normalized action using a fresh screenshot.
func (h *Handler) completeGeminiComputerUse(
	r *http.Request,
	baseURL string,
	apiKey string,
	modelID string,
	body computerUseRequest,
) (computerUseAction, error) {
	payload := map[string]any{
		"contents": []map[string]any{{
			"role": "user",
			"parts": []map[string]any{
				{"text": computerUsePrompt(body)},
				{"inlineData": map[string]any{"mimeType": "image/png", "data": body.Screenshot}},
			},
		}},
		"generationConfig": map[string]any{
			"responseMimeType":   "application/json",
			"responseJsonSchema": computerUseSchema(),
		},
	}
	url := strings.TrimRight(baseURL, "/") + "/v1beta/models/" + modelID + ":generateContent"
	raw, err := providerhttp.PostJSON(r.Context(), h.modelHTTP, url, map[string]string{
		"x-goog-api-key": apiKey,
	}, payload)
	if err != nil {
		return computerUseAction{}, err
	}
	var response struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if json.Unmarshal(raw, &response) != nil || len(response.Candidates) == 0 || len(response.Candidates[0].Content.Parts) == 0 {
		return computerUseAction{}, fmt.Errorf("could not parse computer-use response")
	}
	return parseComputerUseAction([]byte(response.Candidates[0].Content.Parts[0].Text))
}

// validComputerUseAction limits the local executor to a small auditable set.
func validComputerUseAction(action string) bool {
	switch action {
	case "click", "double_click", "right_click", "type", "press_key", "scroll", "drag", "wait", "done":
		return true
	default:
		return false
	}
}

// computerUseSchema constrains model output to one local desktop action.
func computerUseSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action": map[string]any{"type": "string", "enum": []string{"click", "double_click", "right_click", "type", "press_key", "scroll", "drag", "wait", "done"}},
			"x":      map[string]any{"type": "integer"}, "y": map[string]any{"type": "integer"},
			"endX": map[string]any{"type": "integer"}, "endY": map[string]any{"type": "integer"},
			"text": map[string]any{"type": "string"}, "key": map[string]any{"type": "string"},
			"direction": map[string]any{"type": "string", "enum": []string{"up", "down", "left", "right"}},
			"amount":    map[string]any{"type": "integer"}, "result": map[string]any{"type": "string"},
			"reason": map[string]any{"type": "string"}, "sensitive": map[string]any{"type": "boolean"},
		},
		"required":             []string{"action", "reason", "sensitive"},
		"additionalProperties": false,
	}
}

// strictComputerUseSchema returns the fully required nullable schema expected by strict OpenAI-style outputs.
func strictComputerUseSchema() map[string]any {
	nullable := func(valueType string) map[string]any {
		return map[string]any{"type": []string{valueType, "null"}}
	}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action":    map[string]any{"type": "string", "enum": []string{"click", "double_click", "right_click", "type", "press_key", "scroll", "drag", "wait", "done"}},
			"x":         nullable("integer"),
			"y":         nullable("integer"),
			"endX":      nullable("integer"),
			"endY":      nullable("integer"),
			"text":      nullable("string"),
			"key":       nullable("string"),
			"direction": map[string]any{"anyOf": []map[string]any{{"type": "string", "enum": []string{"up", "down", "left", "right"}}, {"type": "null"}}},
			"amount":    nullable("integer"),
			"result":    nullable("string"),
			"reason":    map[string]any{"type": "string"},
			"sensitive": map[string]any{"type": "boolean"},
		},
		"required":             []string{"action", "x", "y", "endX", "endY", "text", "key", "direction", "amount", "result", "reason", "sensitive"},
		"additionalProperties": false,
	}
}
