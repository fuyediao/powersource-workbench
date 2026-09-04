package settings

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/ai"
	"github.com/fuyediao/powersource-workbench/backend/internal/ai/providers"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/authmw"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

const (
	modelsProbeTimeout = 12 * time.Second
	maxModelsBodyBytes = 1 << 20
)

// ConnectivityHandler serves POST /ai/settings/connectivity — server egress IP
// plus a GET /models key probe for every configured cloud provider (no Completer
// chat calls).
type ConnectivityHandler struct {
	sb    *supabase.Client
	httpc *http.Client
}

// NewConnectivity builds the dual-path connectivity diagnostic handler.
func NewConnectivity(sb *supabase.Client) *ConnectivityHandler {
	return &ConnectivityHandler{
		sb: sb,
		httpc: &http.Client{
			Timeout: modelsProbeTimeout,
		},
	}
}

// ModelResult is one provider's server-side models-list probe outcome.
type ModelResult struct {
	Model   string `json:"model"`
	OK      bool   `json:"ok"`
	Message string `json:"message"`
	Skipped bool   `json:"skipped"`
}

type connectivityResponse struct {
	Egress EgressInfo    `json:"egress"`
	Models []ModelResult `json:"models"`
}

// ServeHTTP handles POST /ai/settings/connectivity.
func (h *ConnectivityHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := authmw.UserIDFrom(r)

	egress := LookupEgress(ctx)

	keys, err := ai.LoadAllProviderAPIKeys(ctx, h.sb, userID)
	if err != nil {
		httpx.WriteJSON(w, http.StatusInternalServerError, map[string]any{
			"error": "Could not load your AI provider settings.",
			"code":  "profile_unavailable",
		})
		return
	}

	catalog := providers.List()
	type job struct {
		idx int
		p   providers.Provider
		key string
	}
	jobs := make([]job, 0, len(catalog))
	for _, p := range catalog {
		apiKey := strings.TrimSpace(keys[p.ID])
		if apiKey == "" {
			switch p.ID {
			case "openai":
				apiKey = strings.TrimSpace(keys["chatgpt"])
			case "anthropic":
				apiKey = strings.TrimSpace(keys["claude"])
			}
		}
		if apiKey == "" {
			continue
		}
		jobs = append(jobs, job{idx: len(jobs), p: p, key: apiKey})
	}

	results := make([]ModelResult, len(jobs))
	var wg sync.WaitGroup
	for _, j := range jobs {
		wg.Add(1)
		go func(j job) {
			defer wg.Done()
			results[j.idx] = h.probeModels(ctx, j.p, j.key)
		}(j)
	}
	wg.Wait()

	httpx.WriteJSON(w, http.StatusOK, connectivityResponse{
		Egress: egress,
		Models: results,
	})
}

// probeModels hits the vendor models-list endpoint with the BYOK key (no chat).
func (h *ConnectivityHandler) probeModels(ctx context.Context, p providers.Provider, apiKey string) ModelResult {
	if p.APIStyle == providers.StyleUnsupported {
		return ModelResult{
			Model:   p.ID,
			OK:      false,
			Message: "Provider requires additional configuration beyond an API key.",
			Skipped: true,
		}
	}

	modelsURL, err := modelsListURL(p)
	if err != nil {
		return ModelResult{
			Model:   p.ID,
			OK:      false,
			Message: sanitizeProviderError(err, apiKey),
			Skipped: false,
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, modelsURL, nil)
	if err != nil {
		return ModelResult{
			Model:   p.ID,
			OK:      false,
			Message: sanitizeProviderError(err, apiKey),
			Skipped: false,
		}
	}

	switch p.APIStyle {
	case providers.StyleAnthropic:
		req.Header.Set("x-api-key", apiKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	case providers.StyleGemini:
		q := req.URL.Query()
		q.Set("key", apiKey)
		req.URL.RawQuery = q.Encode()
	case providers.StyleOpenAI:
		req.Header.Set("Authorization", "Bearer "+apiKey)
	default:
		return ModelResult{
			Model:   p.ID,
			OK:      false,
			Message: "Provider requires additional configuration beyond an API key.",
			Skipped: true,
		}
	}

	client := h.httpc
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return ModelResult{
			Model:   p.ID,
			OK:      false,
			Message: sanitizeProviderError(err, apiKey),
			Skipped: false,
		}
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, maxModelsBodyBytes))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		} else {
			msg = fmt.Sprintf("HTTP %d: %s", resp.StatusCode, msg)
		}
		return ModelResult{
			Model:   p.ID,
			OK:      false,
			Message: sanitizeProviderError(fmt.Errorf("%s", msg), apiKey),
			Skipped: false,
		}
	}
	return ModelResult{
		Model:   p.ID,
		OK:      true,
		Message: "ok",
		Skipped: false,
	}
}

// modelsListURL builds the absolute models-list URL for a registry provider.
func modelsListURL(p providers.Provider) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(p.BaseURL), "/")
	path := strings.TrimSpace(p.ModelsPath)
	if base == "" || path == "" {
		return "", fmt.Errorf("missing models URL")
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u, err := url.Parse(base + path)
	if err != nil {
		return "", err
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return "", fmt.Errorf("invalid models URL scheme")
	}
	return u.String(), nil
}
