package customer

import (
	"context"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/catalog"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Completer is the subset of *ai.Client used by this handler.
type Completer interface {
	CompleteWithOptions(ctx context.Context, model ai.Model, apiKey, systemPrompt, userPrompt string, opts ai.CompleteOptions) (string, error)
}

// Handler serves POST /ai/customer/summary.
type Handler struct {
	sb  *supabase.Client
	aiC Completer
}

// New builds a customer summary handler.
func New(sb *supabase.Client, aiC Completer) *Handler {
	return &Handler{sb: sb, aiC: aiC}
}

type requestBody struct {
	Model   string `json:"model"`
	ModelID string `json:"modelId"`
	Context string `json:"context"`
}

type responseBody struct {
	EnUs  string `json:"enUs"`
	ZhCn  string `json:"zhCn"`
	ZhTw  string `json:"zhTw"`
	Model string `json:"model"`
}

// ServeHTTP handles POST /ai/customer/summary.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var body requestBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_json", "Invalid JSON body.")
		return
	}
	modelSlug, ok := ai.ParseModel(body.Model)
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid_model", "Model must be gemini, chatgpt, claude, or grok.")
		return
	}
	vendorModelID, ok := catalog.Resolve(modelSlug, body.ModelID)
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid_model_id", "modelId is not allowlisted for this provider.")
		return
	}
	ctxText := strings.TrimSpace(body.Context)
	if ctxText == "" {
		writeErr(w, http.StatusBadRequest, "invalid_context", "Context is required.")
		return
	}

	apiKey, err := ai.LoadProfileAPIKey(r.Context(), h.sb, authmw.UserIDFrom(r), modelSlug)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "profile_unavailable", "Could not load your AI provider settings.")
		return
	}
	if apiKey == "" {
		writeErr(w, http.StatusUnprocessableEntity, "missing_api_key",
			"Add your "+ai.ProviderLabel(modelSlug)+" API key in Settings before generating a summary.")
		return
	}

	raw, err := h.aiC.CompleteWithOptions(r.Context(), modelSlug, apiKey, SystemPrompt, ctxText, ai.CompleteOptions{VendorModelID: vendorModelID})
	if err != nil {
		writeErr(w, http.StatusBadGateway, "ai_provider_error",
			"The AI provider request failed. Check your API key and try again.")
		return
	}
	result, err := ai.ParseTrilingual(raw)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "ai_invalid_response",
			"The AI provider returned an unexpected response. Please try again.")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, responseBody{
		EnUs:  result.EnUs,
		ZhCn:  result.ZhCn,
		ZhTw:  result.ZhTw,
		Model: vendorModelID,
	})
}

func writeErr(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": message, "code": code})
}
