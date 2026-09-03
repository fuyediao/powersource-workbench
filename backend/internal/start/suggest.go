package start

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	maxSuggestions   = 8
	suggestTimeout   = 1800 * time.Millisecond
	browserUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)

// fetchSuggestions races public autocomplete providers and returns up to eight
// unique suggestion strings. Failures return an empty list.
func fetchSuggestions(ctx context.Context, engine, query string) []string {
	normalized := strings.TrimSpace(query)
	if normalized == "" {
		return []string{}
	}

	var providers []func(context.Context, string) []string
	switch engine {
	case "Bing":
		providers = []func(context.Context, string) []string{fetchBingSuggestions, fetchDuckDuckGoSuggestions}
	case "Yahoo":
		providers = []func(context.Context, string) []string{
			fetchYahooSuggestions,
			fetchBingSuggestions,
			fetchDuckDuckGoSuggestions,
		}
	default:
		// Google engine: skip Google's endpoint (often empty/slow from server IPs).
		providers = []func(context.Context, string) []string{fetchBingSuggestions, fetchDuckDuckGoSuggestions}
	}

	return firstNonEmptySuggestions(ctx, normalized, providers)
}

// firstNonEmptySuggestions races providers and returns the first non-empty list.
func firstNonEmptySuggestions(
	ctx context.Context,
	query string,
	providers []func(context.Context, string) []string,
) []string {
	if len(providers) == 0 {
		return []string{}
	}

	type result struct {
		items []string
	}
	ch := make(chan result, len(providers))
	var wg sync.WaitGroup
	for _, provider := range providers {
		wg.Add(1)
		go func(fn func(context.Context, string) []string) {
			defer wg.Done()
			items := fn(ctx, query)
			if len(items) > 0 {
				ch <- result{items: items}
			}
		}(provider)
	}
	go func() {
		wg.Wait()
		close(ch)
	}()

	for res := range ch {
		if len(res.items) > 0 {
			return uniqueSuggestions(res.items)
		}
	}
	return []string{}
}

func uniqueSuggestions(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	out := make([]string, 0, maxSuggestions)
	for _, item := range items {
		if item == "" {
			continue
		}
		if _, ok := seen[item]; ok {
			continue
		}
		seen[item] = struct{}{}
		out = append(out, item)
		if len(out) >= maxSuggestions {
			break
		}
	}
	return out
}

func fetchBingSuggestions(ctx context.Context, query string) []string {
	u, err := url.Parse("https://api.bing.com/osjson.aspx")
	if err != nil {
		return nil
	}
	q := u.Query()
	q.Set("query", query)
	u.RawQuery = q.Encode()

	body, err := httpGetJSON(ctx, u.String(), suggestTimeout, map[string]string{
		"Accept":     "application/json",
		"User-Agent": browserUserAgent,
	})
	if err != nil {
		return nil
	}
	return parseOpenSearchSuggestions(body)
}

func fetchYahooSuggestions(ctx context.Context, query string) []string {
	u, err := url.Parse("https://search.yahoo.com/sugg/gossip/gossip-us-ura/")
	if err != nil {
		return nil
	}
	q := u.Query()
	q.Set("output", "sd1")
	q.Set("command", query)
	u.RawQuery = q.Encode()

	body, err := httpGetJSON(ctx, u.String(), suggestTimeout, map[string]string{
		"Accept":     "application/json",
		"User-Agent": browserUserAgent,
	})
	if err != nil {
		return nil
	}
	var data struct {
		Gossip struct {
			Results []struct {
				Key string `json:"key"`
			} `json:"results"`
		} `json:"gossip"`
	}
	if json.Unmarshal(body, &data) != nil {
		return nil
	}
	out := make([]string, 0, len(data.Gossip.Results))
	for _, row := range data.Gossip.Results {
		if row.Key != "" {
			out = append(out, row.Key)
		}
	}
	return out
}

func fetchDuckDuckGoSuggestions(ctx context.Context, query string) []string {
	u, err := url.Parse("https://duckduckgo.com/ac/")
	if err != nil {
		return nil
	}
	q := u.Query()
	q.Set("q", query)
	q.Set("type", "list")
	u.RawQuery = q.Encode()

	body, err := httpGetJSON(ctx, u.String(), suggestTimeout, map[string]string{
		"Accept":     "application/json",
		"User-Agent": browserUserAgent,
	})
	if err != nil {
		return nil
	}
	var rows []map[string]any
	if json.Unmarshal(body, &rows) != nil {
		return nil
	}
	out := make([]string, 0, len(rows))
	for _, row := range rows {
		phrase, _ := row["phrase"].(string)
		if phrase != "" {
			out = append(out, phrase)
		}
	}
	return out
}

func parseOpenSearchSuggestions(body []byte) []string {
	var data []any
	if json.Unmarshal(body, &data) != nil || len(data) < 2 {
		return nil
	}
	list, ok := data[1].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(list))
	for _, item := range list {
		if s, ok := item.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

func httpGetJSON(ctx context.Context, rawURL string, timeout time.Duration, headers map[string]string) ([]byte, error) {
	reqCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, resp.Body)
		return nil, io.EOF
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}
