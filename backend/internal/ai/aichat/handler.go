// Package aichat serves Ask-mode chat completions (think / quick).
package aichat

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/catalog"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/location"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/model"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// Completer is the subset of *ai.Client used by this handler.
type Completer interface {
	CompleteWithOptions(ctx context.Context, modelSlug ai.Model, apiKey, systemPrompt, userPrompt string, opts ai.CompleteOptions) (string, error)
	CompleteByProviderModelWithOptions(ctx context.Context, providerID, apiKey, vendorModelID, systemPrompt, userPrompt string, opts ai.CompleteOptions) (string, error)
}

// Handler serves POST /ai/aichat.
type Handler struct {
	sb  *supabase.Client
	aiC Completer
}

// New builds an aichat handler.
func New(sb *supabase.Client, aiC Completer) *Handler {
	return &Handler{sb: sb, aiC: aiC}
}

type historyMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type requestImage struct {
	MIMEType string `json:"mimeType"`
	Data     string `json:"data"`
}

type requestBody struct {
	Model           string           `json:"model"`
	ModelID         string           `json:"modelId"`
	Mode            string           `json:"mode"`
	Prompt          string           `json:"prompt"`
	History         []historyMessage `json:"history"`
	Image           *requestImage    `json:"image"`
	Map             bool             `json:"map"`
	WebSearch       bool             `json:"webSearch"`
	Latitude        *float64         `json:"latitude"`
	Longitude       *float64         `json:"longitude"`
	ReasoningEffort string           `json:"reasoningEffort"`
}

type responseBody struct {
	Content string `json:"content"`
	// Locations are pins parsed from ```mjson when Map is true (never nil).
	Locations []location.Location `json:"locations"`
	// LocationSetID is the persisted `agent_location_sets` id, or null.
	LocationSetID *string `json:"locationSetId"`
}

const maxScreenshotBytes = 2 << 20

// ServeHTTP handles POST /ai/aichat.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var body requestBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_json", "Invalid JSON body.")
		return
	}
	providerID := catalog.NormalizeProvider(body.Model)
	if !catalog.IsKnownProvider(providerID) {
		writeErr(w, http.StatusBadRequest, "invalid_model", "Unknown AI provider.")
		return
	}
	vendorModelID, ok := catalog.ResolveProvider(providerID, body.ModelID)
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid_model_id", "modelId is not allowlisted for this provider.")
		return
	}
	mode := strings.ToLower(strings.TrimSpace(body.Mode))
	if mode == "" {
		mode = "think"
	}
	systemPrompt, ok := SystemPromptForAsk(mode, body.Map, body.WebSearch)
	if !ok {
		writeErr(w, http.StatusBadRequest, "invalid_mode", "Mode must be think or quick.")
		return
	}
	prompt := strings.TrimSpace(body.Prompt)
	if prompt == "" {
		writeErr(w, http.StatusBadRequest, "invalid_prompt", "Prompt is required.")
		return
	}

	images, err := parseAskImage(body.Image)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid_image", err.Error())
		return
	}

	apiKey, err := ai.LoadProviderAPIKey(r.Context(), h.sb, authmw.UserIDFrom(r), providerID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "profile_unavailable", "Could not load your AI provider settings.")
		return
	}
	if apiKey == "" {
		writeErr(w, http.StatusUnprocessableEntity, "missing_api_key",
			"Add your "+ai.ProviderDisplayName(providerID)+" API key in Settings before chatting.")
		return
	}

	userPrompt := BuildUserPrompt(body.History, prompt)
	if body.Map && body.Latitude != nil && body.Longitude != nil {
		userPrompt = fmt.Sprintf(
			"[User Context: My current location is Latitude %g, Longitude %g. Search widely around this area.]\n\n%s",
			*body.Latitude, *body.Longitude, userPrompt,
		)
	}
	if len(images) > 0 {
		userPrompt = ScreenshotUserPrefix + userPrompt
	}
	opts := ai.CompleteOptions{
		VendorModelID:   vendorModelID,
		Images:          images,
		GoogleSearch:    (body.Map || body.WebSearch) && providerID == "gemini",
		ReasoningEffort: catalog.ClampReasoningEffort(providerID, vendorModelID, body.ReasoningEffort),
	}
	var content string
	if modelSlug, legacy := ai.ParseModel(providerID); legacy {
		content, err = h.aiC.CompleteWithOptions(r.Context(), modelSlug, apiKey, systemPrompt, userPrompt, opts)
	} else {
		content, err = h.aiC.CompleteByProviderModelWithOptions(r.Context(), providerID, apiKey, vendorModelID, systemPrompt, userPrompt, opts)
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, "ai_provider_error",
			"The AI provider request failed. Check your API key and try again.")
		return
	}

	locations := []location.Location{}
	var locationSetID *string
	if body.Map {
		var prose string
		locations, prose = location.ParseAndStrip(content)
		content = prose
		if len(locations) > 0 {
			if id, persistErr := location.Persist(r.Context(), h.sb, authmw.UserIDFrom(r), "aichat", "map", locations); persistErr == nil && id != "" {
				locationSetID = &id
			}
		}
	}

	httpx.WriteJSON(w, http.StatusOK, responseBody{
		Content:       content,
		Locations:     locations,
		LocationSetID: locationSetID,
	})
}

func parseAskImage(raw *requestImage) ([]model.InlineImage, error) {
	if raw == nil {
		return nil, nil
	}
	mime := strings.ToLower(strings.TrimSpace(raw.MIMEType))
	switch mime {
	case "image/jpeg", "image/jpg":
		mime = "image/jpeg"
	case "image/png", "image/webp":
		// keep
	default:
		return nil, errInvalidImageMIME
	}
	data := strings.TrimSpace(raw.Data)
	if i := strings.Index(data, ","); i >= 0 && strings.Contains(strings.ToLower(data[:i]), "base64") {
		data = data[i+1:]
	}
	data = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == ' ' {
			return -1
		}
		return r
	}, data)
	if data == "" {
		return nil, errEmptyImage
	}
	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(data)
		if err != nil {
			return nil, errInvalidImageData
		}
	}
	if len(decoded) == 0 {
		return nil, errEmptyImage
	}
	if len(decoded) > maxScreenshotBytes {
		return nil, errImageTooLarge
	}
	return []model.InlineImage{{MIMEType: mime, Base64: data}}, nil
}

var (
	errInvalidImageMIME = errors.New("Image mimeType must be image/jpeg, image/png, or image/webp.")
	errEmptyImage       = errors.New("Image data is empty.")
	errInvalidImageData = errors.New("Image data is not valid base64.")
	errImageTooLarge    = errors.New("Image is too large (max 2 MB).")
)

func writeErr(w http.ResponseWriter, status int, code, message string) {
	httpx.WriteJSON(w, status, map[string]any{"error": message, "code": code})
}
