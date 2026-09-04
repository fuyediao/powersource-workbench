package harness

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/catalog"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providerhttp"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providers"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

type responsesRequest struct {
	Model          string              `json:"model"`
	Instructions   string              `json:"instructions"`
	Input          []map[string]any    `json:"input"`
	Tools          []map[string]any    `json:"tools"`
	PromptCacheKey string              `json:"prompt_cache_key"`
	Reasoning      *responsesReasoning `json:"reasoning"`
}

type responsesReasoning struct {
	Effort string `json:"effort"`
}

type geminiTurnState struct {
	Contents []map[string]any
	Calls    map[string]string
	Seen     map[string]bool
}

type modelOutput struct {
	Text      string
	CallID    string
	ToolName  string
	Arguments string
	Custom    bool
}

// createModelResponse translates the Codex Responses wire format to the
// selected provider while keeping local tool execution inside Codex.
func (h *Handler) createModelResponse(w http.ResponseWriter, r *http.Request) {
	var body responsesRequest
	if err := httpx.DecodeJSON(r, &body); err != nil {
		harnessResponseError(w, http.StatusBadRequest, "invalid_json", "Invalid Responses request.")
		return
	}
	provider := catalog.NormalizeProvider(r.Header.Get("x-geocrm-provider"))
	if !catalog.IsKnownProvider(provider) {
		harnessResponseError(w, http.StatusBadRequest, "invalid_provider", "Unknown AI provider.")
		return
	}
	modelID, ok := catalog.ResolveProvider(provider, body.Model)
	if !ok {
		harnessResponseError(w, http.StatusBadRequest, "invalid_model", "The selected model is not allowlisted for this provider.")
		return
	}
	apiKey, err := ai.LoadProviderAPIKey(r.Context(), h.sb, authmw.UserIDFrom(r), provider)
	if err != nil {
		harnessResponseError(w, http.StatusInternalServerError, "profile_unavailable", "Could not load AI provider settings.")
		return
	}
	if apiKey == "" {
		harnessResponseError(w, http.StatusUnprocessableEntity, "missing_api_key", "The selected provider has no API key.")
		return
	}

	var output modelOutput
	switch provider {
	case "gemini":
		output, err = h.completeGeminiResponse(r, apiKey, modelID, body)
	default:
		output, err = h.completeCatalogResponse(r, provider, apiKey, modelID, body)
	}
	if err != nil {
		harnessResponseError(w, http.StatusBadGateway, "provider_error", err.Error())
		return
	}
	writeResponsesSSE(w, output)
}

// completeCatalogResponse calls Anthropic or an OpenAI-compatible provider.
func (h *Handler) completeCatalogResponse(
	r *http.Request,
	providerID string,
	apiKey string,
	modelID string,
	body responsesRequest,
) (modelOutput, error) {
	registryID := providerID
	if registryID == "chatgpt" {
		registryID = "openai"
	} else if registryID == "claude" {
		registryID = "anthropic"
	}
	provider, ok := providers.Get(registryID)
	if !ok {
		return modelOutput{}, fmt.Errorf("unknown provider %s", providerID)
	}
	if provider.APIStyle == providers.StyleAnthropic {
		return h.completeAnthropicResponse(r, provider.BaseURL, apiKey, modelID, body)
	}
	if provider.APIStyle != providers.StyleOpenAI {
		return modelOutput{}, fmt.Errorf("provider %s does not support Harness tool calls", providerID)
	}
	baseURL := strings.TrimRight(provider.BaseURL, "/")
	if registryID == "openai" {
		baseURL = "https://api.openai.com"
	} else if registryID == "grok" {
		baseURL = "https://api.x.ai"
	}
	url := baseURL + "/v1/chat/completions"
	if strings.HasSuffix(baseURL, "/v1") {
		url = baseURL + "/chat/completions"
	}
	payload := map[string]any{
		"model":       modelID,
		"messages":    openAIWorkflowMessages(body),
		"tools":       openAIWorkflowTools(body.Tools),
		"tool_choice": "auto",
	}
	applyCatalogReasoning(payload, providerID, modelID, body)
	raw, err := providerhttp.PostJSON(r.Context(), h.modelHTTP, url, map[string]string{
		"Authorization": "Bearer " + apiKey,
	}, payload)
	if err != nil {
		return modelOutput{}, err
	}
	var response struct {
		Choices []struct {
			Message struct {
				Content   string `json:"content"`
				ToolCalls []struct {
					ID       string `json:"id"`
					Function struct {
						Name      string `json:"name"`
						Arguments string `json:"arguments"`
					} `json:"function"`
				} `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(raw, &response); err != nil || len(response.Choices) == 0 {
		return modelOutput{}, fmt.Errorf("could not parse provider workflow response")
	}
	message := response.Choices[0].Message
	if len(message.ToolCalls) > 0 {
		call := message.ToolCalls[0]
		custom := isCustomTool(body.Tools, call.Function.Name)
		arguments := call.Function.Arguments
		if custom {
			var parsed map[string]any
			if json.Unmarshal([]byte(arguments), &parsed) == nil {
				if input, ok := parsed["input"].(string); ok {
					arguments = input
				}
			}
		}
		return modelOutput{CallID: call.ID, ToolName: call.Function.Name, Arguments: arguments, Custom: custom}, nil
	}
	if strings.TrimSpace(message.Content) == "" {
		return modelOutput{}, fmt.Errorf("provider returned no usable workflow output")
	}
	return modelOutput{Text: message.Content}, nil
}

// completeAnthropicResponse calls the Messages API with Codex function tools.
func (h *Handler) completeAnthropicResponse(
	r *http.Request,
	baseURL string,
	apiKey string,
	modelID string,
	body responsesRequest,
) (modelOutput, error) {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.anthropic.com"
	}
	payload := map[string]any{
		"model":      modelID,
		"max_tokens": 8192,
		"system":     body.Instructions,
		"messages":   anthropicWorkflowMessages(body.Input),
		"tools":      anthropicWorkflowTools(body.Tools),
	}
	applyCatalogReasoning(payload, "claude", modelID, body)
	raw, err := providerhttp.PostJSON(r.Context(), h.modelHTTP, strings.TrimRight(baseURL, "/")+"/v1/messages", map[string]string{
		"x-api-key":         apiKey,
		"anthropic-version": "2023-06-01",
	}, payload)
	if err != nil {
		return modelOutput{}, err
	}
	var response struct {
		Content []struct {
			Type  string         `json:"type"`
			Text  string         `json:"text"`
			ID    string         `json:"id"`
			Name  string         `json:"name"`
			Input map[string]any `json:"input"`
		} `json:"content"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		return modelOutput{}, fmt.Errorf("could not parse Anthropic workflow response")
	}
	var text strings.Builder
	for _, block := range response.Content {
		if block.Type == "tool_use" {
			arguments, _ := json.Marshal(block.Input)
			custom := isCustomTool(body.Tools, block.Name)
			argumentText := string(arguments)
			if custom {
				if input, ok := block.Input["input"].(string); ok {
					argumentText = input
				}
			}
			return modelOutput{CallID: block.ID, ToolName: block.Name, Arguments: argumentText, Custom: custom}, nil
		}
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}
	if strings.TrimSpace(text.String()) == "" {
		return modelOutput{}, fmt.Errorf("Anthropic returned no usable workflow output")
	}
	return modelOutput{Text: text.String()}, nil
}

func (h *Handler) completeGeminiResponse(
	r *http.Request,
	apiKey string,
	modelID string,
	body responsesRequest,
) (modelOutput, error) {
	key := strings.TrimSpace(body.PromptCacheKey)
	if key == "" {
		key = authmw.UserIDFrom(r) + ":default"
	}
	h.modelMu.Lock()
	state := h.modelTurns[key]
	if state == nil {
		state = &geminiTurnState{Calls: make(map[string]string), Seen: make(map[string]bool)}
		h.modelTurns[key] = state
	}
	appendGeminiInputs(state, body.Input)
	contents := append([]map[string]any(nil), state.Contents...)
	h.modelMu.Unlock()

	payload := map[string]any{
		"contents": contents,
		"systemInstruction": map[string]any{
			"parts": []map[string]any{{"text": body.Instructions}},
		},
	}
	applyCatalogReasoning(payload, "gemini", modelID, body)
	if declarations := geminiFunctionDeclarations(body.Tools); len(declarations) > 0 {
		payload["tools"] = []map[string]any{{"functionDeclarations": declarations}}
	}
	url := "https://generativelanguage.googleapis.com/v1beta/models/" + modelID + ":generateContent?key=" + apiKey
	raw, err := providerhttp.PostJSON(r.Context(), h.modelHTTP, url, nil, payload)
	if err != nil {
		return modelOutput{}, err
	}
	var response struct {
		Candidates []struct {
			Content map[string]any `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(raw, &response); err != nil || len(response.Candidates) == 0 {
		return modelOutput{}, fmt.Errorf("could not parse Gemini workflow response")
	}
	content := response.Candidates[0].Content
	parts, _ := content["parts"].([]any)
	result := modelOutput{}
	for _, value := range parts {
		part, _ := value.(map[string]any)
		if text, _ := part["text"].(string); strings.TrimSpace(text) != "" {
			result.Text += text
		}
		call, _ := part["functionCall"].(map[string]any)
		if len(call) == 0 {
			continue
		}
		result.ToolName, _ = call["name"].(string)
		args, _ := json.Marshal(call["args"])
		result.Arguments = string(args)
		result.CallID = fmt.Sprintf("call_%d", time.Now().UnixNano())
		result.Custom = isCustomTool(body.Tools, result.ToolName)
		if result.Custom {
			if callArgs, ok := call["args"].(map[string]any); ok {
				if input, ok := callArgs["input"].(string); ok {
					result.Arguments = input
				}
			}
		}
	}
	if result.Text == "" && result.ToolName == "" {
		return modelOutput{}, fmt.Errorf("Gemini returned no usable workflow output")
	}
	h.modelMu.Lock()
	state.Contents = append(state.Contents, content)
	if result.CallID != "" {
		state.Calls[result.CallID] = result.ToolName
	}
	h.modelMu.Unlock()
	return result, nil
}

func appendGeminiInputs(state *geminiTurnState, input []map[string]any) {
	for _, item := range input {
		encoded, _ := json.Marshal(item)
		fingerprint := string(encoded)
		if state.Seen[fingerprint] {
			continue
		}
		state.Seen[fingerprint] = true
		typeName, _ := item["type"].(string)
		switch typeName {
		case "message":
			role, _ := item["role"].(string)
			if role != "assistant" && role != "user" {
				continue
			}
			text := responseMessageText(item["content"])
			if text != "" {
				geminiRole := "user"
				if role == "assistant" {
					geminiRole = "model"
				}
				state.Contents = append(state.Contents, map[string]any{"role": geminiRole, "parts": []map[string]any{{"text": text}}})
			}
		case "function_call_output", "custom_tool_call_output":
			callID, _ := item["call_id"].(string)
			name := state.Calls[callID]
			if name == "" {
				continue
			}
			state.Contents = append(state.Contents, map[string]any{
				"role": "user",
				"parts": []map[string]any{{"functionResponse": map[string]any{
					"name":     name,
					"response": map[string]any{"output": item["output"]},
				}}},
			})
		}
	}
}

func responseMessageText(raw any) string {
	content, _ := raw.([]any)
	var parts []string
	for _, value := range content {
		entry, _ := value.(map[string]any)
		text, _ := entry["text"].(string)
		if strings.TrimSpace(text) != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n")
}

func geminiFunctionDeclarations(tools []map[string]any) []map[string]any {
	declarations := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		typeName, _ := tool["type"].(string)
		name, _ := tool["name"].(string)
		if (typeName != "function" && typeName != "custom") || name == "" {
			continue
		}
		declaration := map[string]any{"name": name}
		if description, _ := tool["description"].(string); description != "" {
			declaration["description"] = description
		}
		if typeName == "custom" {
			declaration["parametersJsonSchema"] = map[string]any{
				"type":       "object",
				"properties": map[string]any{"input": map[string]any{"type": "string"}},
				"required":   []string{"input"},
			}
		} else if parameters := tool["parameters"]; parameters != nil {
			declaration["parametersJsonSchema"] = parameters
		} else if parameters := tool["input_schema"]; parameters != nil {
			declaration["parametersJsonSchema"] = parameters
		}
		declarations = append(declarations, declaration)
	}
	return declarations
}

// isCustomTool reports whether name is a Responses free-form tool.
func isCustomTool(tools []map[string]any, name string) bool {
	for _, tool := range tools {
		toolName, _ := tool["name"].(string)
		toolType, _ := tool["type"].(string)
		if toolName == name {
			return toolType == "custom"
		}
	}
	return false
}

// openAIWorkflowMessages converts Responses input into Chat Completions messages.
func openAIWorkflowMessages(body responsesRequest) []map[string]any {
	messages := []map[string]any{{"role": "system", "content": body.Instructions}}
	for _, item := range body.Input {
		typeName, _ := item["type"].(string)
		switch typeName {
		case "message":
			role, _ := item["role"].(string)
			text := responseMessageText(item["content"])
			if (role == "user" || role == "assistant") && text != "" {
				messages = append(messages, map[string]any{"role": role, "content": text})
			}
		case "function_call", "custom_tool_call":
			name, _ := item["name"].(string)
			callID, _ := item["call_id"].(string)
			arguments, _ := item["arguments"].(string)
			if typeName == "custom_tool_call" {
				input, _ := item["input"].(string)
				encoded, _ := json.Marshal(map[string]any{"input": input})
				arguments = string(encoded)
			}
			messages = append(messages, map[string]any{
				"role": "assistant", "content": nil,
				"tool_calls": []map[string]any{{
					"id": callID, "type": "function",
					"function": map[string]any{"name": name, "arguments": arguments},
				}},
			})
		case "function_call_output", "custom_tool_call_output":
			messages = append(messages, map[string]any{
				"role": "tool", "tool_call_id": item["call_id"], "content": fmt.Sprint(item["output"]),
			})
		}
	}
	return messages
}

// openAIWorkflowTools converts Responses function definitions to Chat tools.
func openAIWorkflowTools(tools []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		typeName, _ := tool["type"].(string)
		if typeName != "function" && typeName != "custom" {
			continue
		}
		name, _ := tool["name"].(string)
		if name == "" {
			continue
		}
		function := map[string]any{"name": name}
		function["description"] = tool["description"]
		if typeName == "custom" {
			function["parameters"] = map[string]any{
				"type": "object", "properties": map[string]any{"input": map[string]any{"type": "string"}},
				"required": []string{"input"},
			}
		} else {
			function["parameters"] = tool["parameters"]
		}
		if function["parameters"] == nil {
			function["parameters"] = tool["input_schema"]
		}
		out = append(out, map[string]any{"type": "function", "function": function})
	}
	return out
}

// anthropicWorkflowMessages converts Responses input into Messages API turns.
func anthropicWorkflowMessages(input []map[string]any) []map[string]any {
	messages := make([]map[string]any, 0, len(input))
	for _, item := range input {
		typeName, _ := item["type"].(string)
		switch typeName {
		case "message":
			role, _ := item["role"].(string)
			text := responseMessageText(item["content"])
			if (role == "user" || role == "assistant") && text != "" {
				messages = append(messages, map[string]any{"role": role, "content": text})
			}
		case "function_call", "custom_tool_call":
			arguments := map[string]any{}
			if raw, _ := item["arguments"].(string); raw != "" {
				_ = json.Unmarshal([]byte(raw), &arguments)
			}
			if typeName == "custom_tool_call" {
				arguments["input"], _ = item["input"].(string)
			}
			messages = append(messages, map[string]any{
				"role": "assistant",
				"content": []map[string]any{{
					"type": "tool_use", "id": item["call_id"], "name": item["name"], "input": arguments,
				}},
			})
		case "function_call_output", "custom_tool_call_output":
			messages = append(messages, map[string]any{
				"role": "user",
				"content": []map[string]any{{
					"type": "tool_result", "tool_use_id": item["call_id"], "content": fmt.Sprint(item["output"]),
				}},
			})
		}
	}
	return messages
}

// anthropicWorkflowTools converts Responses functions to Anthropic tools.
func anthropicWorkflowTools(tools []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		typeName, _ := tool["type"].(string)
		if typeName != "function" && typeName != "custom" {
			continue
		}
		name, _ := tool["name"].(string)
		if name == "" {
			continue
		}
		var schema any = tool["parameters"]
		if typeName == "custom" {
			schema = map[string]any{
				"type": "object", "properties": map[string]any{"input": map[string]any{"type": "string"}},
				"required": []string{"input"},
			}
		}
		if schema == nil {
			schema = tool["input_schema"]
		}
		out = append(out, map[string]any{
			"name": name, "description": tool["description"], "input_schema": schema,
		})
	}
	return out
}

func writeResponsesSSE(w http.ResponseWriter, output modelOutput) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)
	writeEvent := func(value map[string]any) {
		encoded, _ := json.Marshal(value)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", encoded)
	}
	responseID := fmt.Sprintf("resp_%d", time.Now().UnixNano())
	writeEvent(map[string]any{"type": "response.created", "response": map[string]any{"id": responseID}})
	if output.ToolName != "" {
		if output.Custom {
			writeEvent(map[string]any{"type": "response.output_item.done", "item": map[string]any{
				"type": "custom_tool_call", "call_id": output.CallID, "name": output.ToolName, "input": output.Arguments,
			}})
		} else {
			writeEvent(map[string]any{"type": "response.output_item.done", "item": map[string]any{
				"type": "function_call", "call_id": output.CallID, "name": output.ToolName, "arguments": output.Arguments,
			}})
		}
	} else {
		itemID := fmt.Sprintf("msg_%d", time.Now().UnixNano())
		writeEvent(map[string]any{"type": "response.output_item.done", "item": map[string]any{
			"type": "message", "role": "assistant", "id": itemID,
			"content": []map[string]any{{"type": "output_text", "text": output.Text}},
		}})
	}
	writeEvent(map[string]any{"type": "response.completed", "response": map[string]any{
		"id":    responseID,
		"usage": map[string]any{"input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
	}})
	_, _ = fmt.Fprint(w, "data: [DONE]\n\n")
}

func harnessResponseError(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": map[string]any{"message": message, "type": code}, "code": code})
}
