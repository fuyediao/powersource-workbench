package settings

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providers"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Completer is the subset of *ai.Client used by this handler.
type Completer interface {
	Complete(ctx context.Context, model ai.Model, apiKey, systemPrompt, userPrompt string) (string, error)
	CompleteByProvider(ctx context.Context, providerID, apiKey, systemPrompt, userPrompt string) (string, error)
}

// Handler serves POST /ai/settings/ping.
type Handler struct {
	sb  *supabase.Client
	aiC Completer
}

// New builds a settings ping handler.
func New(sb *supabase.Client, aiC Completer) *Handler {
	return &Handler{sb: sb, aiC: aiC}
}

type requestBody struct {
	Model    string `json:"model"`
	Provider string `json:"provider"`
}

type responseBody struct {
	OK       bool   `json:"ok"`
	Model    string `json:"model,omitempty"`
	Provider string `json:"provider,omitempty"`
}

// ServeHTTP handles POST /ai/settings/ping.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var body requestBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_json", "Invalid JSON body.")
		return
	}

	providerID := strings.ToLower(strings.TrimSpace(body.Provider))
	if providerID == "" {
		providerID = strings.ToLower(strings.TrimSpace(body.Model))
	}
	if providerID == "" {
		writeErr(w, http.StatusBadRequest, "invalid_provider", "Provide provider (or legacy model) id.")
		return
	}

	switch providerID {
	case "chatgpt":
		providerID = "openai"
	case "claude":
		providerID = "anthropic"
	}

	p, ok := providers.Get(providerID)
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid_provider", "Unknown AI provider.")
		return
	}

	apiKey, err := ai.LoadProviderAPIKey(r.Context(), h.sb, authmw.UserIDFrom(r), providerID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "profile_unavailable", "Could not load your AI provider settings.")
		return
	}
	if apiKey == "" {
		label := p.NameEn
		if label == "" {
			label = providerID
		}
		writeErr(w, http.StatusUnprocessableEntity, "missing_api_key",
			"Add your "+label+" API key in Settings before testing.")
		return
	}

	_, err = h.aiC.CompleteByProvider(r.Context(), providerID, apiKey, "Reply with OK only.", "ping")
	if err != nil {
		if errors.Is(err, ai.ErrUnsupportedProvider) {
			writeErr(w, http.StatusUnprocessableEntity, "unsupported_provider",
				"This provider needs extra configuration beyond an API key.")
			return
		}
		writeErr(w, http.StatusBadGateway, "ai_provider_error", sanitizeProviderError(err, apiKey))
		return
	}
	httpx.WriteJSON(w, http.StatusOK, responseBody{OK: true, Provider: providerID, Model: providerID})
}

func writeErr(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": message, "code": code})
}
