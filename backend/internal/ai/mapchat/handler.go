// Package mapchat serves map floating-chat completions with optional Gemini grounding.
package mapchat

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/catalog"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/location"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Completer supports CompleteWithOptions for Gemini Google Search.
type Completer interface {
	CompleteWithOptions(ctx context.Context, model ai.Model, apiKey, systemPrompt, userPrompt string, opts ai.CompleteOptions) (string, error)
}

// Handler serves POST /ai/mapchat.
type Handler struct {
	sb  *supabase.Client
	aiC Completer
}

// New builds a mapchat handler.
func New(sb *supabase.Client, aiC Completer) *Handler {
	return &Handler{sb: sb, aiC: aiC}
}

type requestBody struct {
	Model     string   `json:"model"`
	ModelID   string   `json:"modelId"`
	Prompt    string   `json:"prompt"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

type responseBody struct {
	Content string `json:"content"`
	// Locations are pins parsed server-side from the response (never nil; empty when there are none).
	Locations []location.Location `json:"locations"`
	// LocationSetID is the id of the persisted `agent_location_sets` row, or null when Locations is empty.
	LocationSetID *string `json:"locationSetId"`
}

// ServeHTTP handles POST /ai/mapchat.
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
	prompt := strings.TrimSpace(body.Prompt)
	if prompt == "" {
		writeErr(w, http.StatusBadRequest, "invalid_prompt", "Prompt is required.")
		return
	}

	apiKey, err := ai.LoadProfileAPIKey(r.Context(), h.sb, authmw.UserIDFrom(r), modelSlug)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "profile_unavailable", "Could not load your AI provider settings.")
		return
	}
	if apiKey == "" {
		writeErr(w, http.StatusUnprocessableEntity, "missing_api_key",
			"Add your "+ai.ProviderLabel(modelSlug)+" API key in Settings before chatting.")
		return
	}

	userPrompt := prompt
	if body.Latitude != nil && body.Longitude != nil {
		userPrompt = fmt.Sprintf(
			"[User Context: My current location is Latitude %g, Longitude %g. Search widely around this area.]\n\n%s",
			*body.Latitude, *body.Longitude, prompt,
		)
	}

	opts := ai.CompleteOptions{VendorModelID: vendorModelID}
	if modelSlug == ai.ModelGemini {
		opts.GoogleSearch = true
	}
	content, err := h.aiC.CompleteWithOptions(r.Context(), modelSlug, apiKey, SystemPrompt, userPrompt, opts)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "ai_provider_error",
			"The AI provider request failed. Check your API key and try again.")
		return
	}

	userID := authmw.UserIDFrom(r)
	locations, prose := location.ParseAndStrip(content)
	var locationSetID *string
	if len(locations) > 0 {
		if id, persistErr := location.Persist(r.Context(), h.sb, userID, "mapchat", "", locations); persistErr == nil && id != "" {
			locationSetID = &id
		}
	}

	httpx.WriteJSON(w, http.StatusOK, responseBody{
		Content:       prose,
		Locations:     locations,
		LocationSetID: locationSetID,
	})
}

func writeErr(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": message, "code": code})
}
