package start

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	marketsTimeout = 6 * time.Second
	workbenchUA    = "Mozilla/5.0 Workbench/1.0"
)

// MarketAssetRequest is one selected market asset from the client.
type MarketAssetRequest struct {
	ID     string `json:"id"`
	Symbol string `json:"symbol"`
	Name   string `json:"name"`
	Kind   string `json:"kind"`
}

// MarketQuote is a live price snapshot.
type MarketQuote struct {
	ID     string  `json:"id"`
	Symbol string  `json:"symbol"`
	Name   string  `json:"name"`
	Kind   string  `json:"kind"`
	Price  float64 `json:"price"`
	Change float64 `json:"change"`
}

// MarketSearchHit is a picker search result.
type MarketSearchHit struct {
	ID     string  `json:"id"`
	Symbol string  `json:"symbol"`
	Name   string  `json:"name"`
	Kind   string  `json:"kind"`
	Thumb  *string `json:"thumb"`
}

// parseMarketAssets keeps only well-formed crypto/stock rows.
func parseMarketAssets(raw []MarketAssetRequest) []MarketAssetRequest {
	out := make([]MarketAssetRequest, 0, len(raw))
	for _, item := range raw {
		if item.ID == "" || item.Symbol == "" || item.Name == "" {
			continue
		}
		if item.Kind != "crypto" && item.Kind != "stock" {
			continue
		}
		out = append(out, item)
	}
	return out
}

// searchMarketAssets searches stocks and cryptocurrencies for the markets picker.
func searchMarketAssets(ctx context.Context, query string) []MarketSearchHit {
	normalized := strings.TrimSpace(query)
	if normalized == "" {
		return []MarketSearchHit{}
	}
	type pack struct {
		kind string
		hits []MarketSearchHit
	}
	ch := make(chan pack, 2)
	go func() { ch <- pack{kind: "stock", hits: searchStockAssets(ctx, normalized)} }()
	go func() { ch <- pack{kind: "crypto", hits: searchCryptoAssets(ctx, normalized)} }()
	var stockHits, cryptoHits []MarketSearchHit
	for i := 0; i < 2; i++ {
		p := <-ch
		if p.kind == "stock" {
			stockHits = p.hits
		} else {
			cryptoHits = p.hits
		}
	}
	if len(stockHits) > 6 {
		stockHits = stockHits[:6]
	}
	if len(cryptoHits) > 6 {
		cryptoHits = cryptoHits[:6]
	}
	return append(stockHits, cryptoHits...)
}

func searchCryptoAssets(ctx context.Context, query string) []MarketSearchHit {
	u, err := url.Parse("https://api.coingecko.com/api/v3/search")
	if err != nil {
		return nil
	}
	q := u.Query()
	q.Set("query", query)
	u.RawQuery = q.Encode()
	body, err := httpGetBytes(ctx, u.String(), marketsTimeout, map[string]string{"Accept": "application/json"})
	if err != nil {
		return nil
	}
	var data struct {
		Coins []struct {
			ID     string `json:"id"`
			Symbol string `json:"symbol"`
			Name   string `json:"name"`
			Thumb  string `json:"thumb"`
		} `json:"coins"`
	}
	if json.Unmarshal(body, &data) != nil {
		return nil
	}
	out := make([]MarketSearchHit, 0, 8)
	for _, coin := range data.Coins {
		if coin.ID == "" || coin.Symbol == "" || coin.Name == "" {
			continue
		}
		var thumb *string
		if coin.Thumb != "" {
			t := coin.Thumb
			thumb = &t
		}
		out = append(out, MarketSearchHit{
			ID:     coin.ID,
			Symbol: strings.ToUpper(coin.Symbol),
			Name:   coin.Name,
			Kind:   "crypto",
			Thumb:  thumb,
		})
		if len(out) >= 8 {
			break
		}
	}
	return out
}

func searchStockAssets(ctx context.Context, query string) []MarketSearchHit {
	u, err := url.Parse("https://query1.finance.yahoo.com/v1/finance/search")
	if err != nil {
		return nil
	}
	q := u.Query()
	q.Set("q", query)
	q.Set("quotesCount", "8")
	q.Set("newsCount", "0")
	u.RawQuery = q.Encode()
	body, err := httpGetBytes(ctx, u.String(), marketsTimeout, map[string]string{"User-Agent": workbenchUA})
	if err != nil {
		return nil
	}
	var data struct {
		Quotes []struct {
			Symbol    string `json:"symbol"`
			Shortname string `json:"shortname"`
			Longname  string `json:"longname"`
			QuoteType string `json:"quoteType"`
		} `json:"quotes"`
	}
	if json.Unmarshal(body, &data) != nil {
		return nil
	}
	out := make([]MarketSearchHit, 0, len(data.Quotes))
	for _, quote := range data.Quotes {
		symbol := strings.ToUpper(strings.TrimSpace(quote.Symbol))
		if symbol == "" || (quote.QuoteType != "EQUITY" && quote.QuoteType != "ETF") {
			continue
		}
		name := strings.TrimSpace(quote.Shortname)
		if name == "" {
			name = strings.TrimSpace(quote.Longname)
		}
		if name == "" {
			name = symbol
		}
		thumb := stockThumbURL(symbol)
		out = append(out, MarketSearchHit{
			ID:     "stock:" + symbol,
			Symbol: symbol,
			Name:   name,
			Kind:   "stock",
			Thumb:  &thumb,
		})
	}
	return out
}

func stockThumbURL(symbol string) string {
	root := symbol
	if i := strings.Index(symbol, "."); i >= 0 {
		root = symbol[:i]
	}
	return "https://storage.googleapis.com/iex/api/logos/" + url.PathEscape(root) + ".png"
}

// fetchMarketQuotes loads quotes for selected assets in request order.
func fetchMarketQuotes(ctx context.Context, assets []MarketAssetRequest) []MarketQuote {
	cryptoAssets := make([]MarketAssetRequest, 0)
	stockAssets := make([]MarketAssetRequest, 0)
	for _, asset := range assets {
		if asset.Kind == "crypto" {
			cryptoAssets = append(cryptoAssets, asset)
		} else if asset.Kind == "stock" {
			stockAssets = append(stockAssets, asset)
		}
	}
	cryptoMeta := make(map[string]struct{ Symbol, Name string }, len(cryptoAssets))
	cryptoIDs := make([]string, 0, len(cryptoAssets))
	for _, asset := range cryptoAssets {
		cryptoIDs = append(cryptoIDs, asset.ID)
		cryptoMeta[asset.ID] = struct{ Symbol, Name string }{Symbol: asset.Symbol, Name: asset.Name}
	}

	type pack struct {
		quotes []MarketQuote
	}
	ch := make(chan pack, 1+len(stockAssets))
	go func() {
		ch <- pack{quotes: fetchCryptoQuotesByIDs(ctx, cryptoIDs, cryptoMeta)}
	}()
	for _, asset := range stockAssets {
		go func(symbol string) {
			q := fetchStockQuote(ctx, symbol)
			if q == nil {
				ch <- pack{}
				return
			}
			ch <- pack{quotes: []MarketQuote{*q}}
		}(asset.Symbol)
	}

	byID := make(map[string]MarketQuote)
	expected := 1 + len(stockAssets)
	for i := 0; i < expected; i++ {
		p := <-ch
		for _, quote := range p.quotes {
			byID[quote.ID] = quote
		}
	}

	out := make([]MarketQuote, 0, len(assets))
	for _, asset := range assets {
		if quote, ok := byID[asset.ID]; ok {
			out = append(out, quote)
		}
	}
	return out
}

func fetchCryptoQuotesByIDs(
	ctx context.Context,
	ids []string,
	meta map[string]struct{ Symbol, Name string },
) []MarketQuote {
	if len(ids) == 0 {
		return nil
	}
	u, err := url.Parse("https://api.coingecko.com/api/v3/simple/price")
	if err != nil {
		return nil
	}
	q := u.Query()
	q.Set("ids", strings.Join(ids, ","))
	q.Set("vs_currencies", "usd")
	q.Set("include_24hr_change", "true")
	u.RawQuery = q.Encode()
	body, err := httpGetBytes(ctx, u.String(), marketsTimeout, nil)
	if err != nil {
		return nil
	}
	var data map[string]struct {
		USD          *float64 `json:"usd"`
		USD24HChange *float64 `json:"usd_24h_change"`
	}
	if json.Unmarshal(body, &data) != nil {
		return nil
	}
	out := make([]MarketQuote, 0, len(ids))
	for _, id := range ids {
		row, ok := data[id]
		info, okMeta := meta[id]
		if !ok || !okMeta || row.USD == nil {
			continue
		}
		change := 0.0
		if row.USD24HChange != nil {
			change = *row.USD24HChange
		}
		out = append(out, MarketQuote{
			ID:     id,
			Symbol: info.Symbol,
			Name:   info.Name,
			Kind:   "crypto",
			Price:  *row.USD,
			Change: change,
		})
	}
	return out
}

func fetchStockQuote(ctx context.Context, symbol string) *MarketQuote {
	rawURL := fmt.Sprintf("https://query1.finance.yahoo.com/v8/finance/chart/%s", url.PathEscape(symbol))
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil
	}
	q := u.Query()
	q.Set("interval", "1d")
	q.Set("range", "5d")
	u.RawQuery = q.Encode()
	body, err := httpGetBytes(ctx, u.String(), marketsTimeout, map[string]string{"User-Agent": workbenchUA})
	if err != nil {
		return nil
	}
	var data struct {
		Chart struct {
			Result []struct {
				Meta struct {
					RegularMarketPrice *float64 `json:"regularMarketPrice"`
					ChartPreviousClose *float64 `json:"chartPreviousClose"`
					PreviousClose      *float64 `json:"previousClose"`
					ShortName          string   `json:"shortName"`
					LongName           string   `json:"longName"`
				} `json:"meta"`
			} `json:"result"`
		} `json:"chart"`
	}
	if json.Unmarshal(body, &data) != nil || len(data.Chart.Result) == 0 {
		return nil
	}
	meta := data.Chart.Result[0].Meta
	if meta.RegularMarketPrice == nil {
		return nil
	}
	previous := meta.ChartPreviousClose
	if previous == nil {
		previous = meta.PreviousClose
	}
	if previous == nil || *previous == 0 {
		return nil
	}
	name := meta.ShortName
	if name == "" {
		name = meta.LongName
	}
	if name == "" {
		name = symbol
	}
	price := *meta.RegularMarketPrice
	return &MarketQuote{
		ID:     "stock:" + symbol,
		Symbol: symbol,
		Name:   name,
		Kind:   "stock",
		Price:  price,
		Change: ((price - *previous) / *previous) * 100,
	}
}

func httpGetBytes(ctx context.Context, rawURL string, timeout time.Duration, headers map[string]string) ([]byte, error) {
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
	return io.ReadAll(io.LimitReader(resp.Body, 2<<20))
}
