package start_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fuyediao/powersource-workbench/backend/internal/start"
)

func TestSuggestRejectsBadEngine(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodGet, "/suggest?engine=DuckDuckGo&q=hello", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestSuggestEmptyQueryReturnsEmptyList(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodGet, "/suggest?engine=Google&q=%20", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body struct {
		Suggestions []string `json:"suggestions"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Suggestions == nil || len(body.Suggestions) != 0 {
		t.Fatalf("suggestions = %#v, want empty slice", body.Suggestions)
	}
}

func TestMarketQuotesInvalidJSON(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodPost, "/markets/quotes", strings.NewReader("{"))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestMarketSearchEmptyQuery(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodGet, "/markets/search?q=", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body struct {
		Results []any `json:"results"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Results == nil || len(body.Results) != 0 {
		t.Fatalf("results = %#v, want empty slice", body.Results)
	}
}

func TestWeatherRejectsBadCoords(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodGet, "/weather?lat=91&lon=0", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestWeatherPlaceRejectsMissingCoords(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodGet, "/weather/place?lat=25.03", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestWeatherSearchEmptyQuery(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodGet, "/weather/search?q=", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body struct {
		Results []any `json:"results"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Results == nil || len(body.Results) != 0 {
		t.Fatalf("results = %#v, want empty slice", body.Results)
	}
}

func TestCurrencyConvertRejectsBadCode(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodGet, "/currency/convert?amount=1&from=USD&to=bad!", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestCurrencyConvertSameCode(t *testing.T) {
	t.Parallel()
	handler := start.New().Routes()
	req := httptest.NewRequest(http.MethodGet, "/currency/convert?amount=2.5&from=USD&to=usd", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body struct {
		Amount float64 `json:"amount"`
		From   string  `json:"from"`
		To     string  `json:"to"`
		Rate   float64 `json:"rate"`
		Result float64 `json:"result"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.From != "USD" || body.To != "USD" || body.Rate != 1 || body.Result != 2.5 || body.Amount != 2.5 {
		t.Fatalf("body = %#v", body)
	}
}
