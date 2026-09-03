package start

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/httpx"
)

// Handler serves the /start sub-app.
type Handler struct{}

// New builds a start-page proxy handler.
func New() *Handler {
	return &Handler{}
}

// Routes returns the /start router.
func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.NotFound(notFound)
	r.MethodNotAllowed(methodNotAllowed)

	r.Get("/suggest", h.suggest)
	r.Post("/markets/quotes", h.marketQuotes)
	r.Get("/markets/search", h.marketSearch)
	r.Get("/news", h.news)
	r.Get("/weather/place", h.weatherPlace)
	r.Get("/weather/search", h.weatherSearch)
	r.Get("/weather", h.weather)
	r.Get("/currency/catalog", h.currencyCatalog)
	r.Get("/currency/convert", h.currencyConvert)

	return r
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "Not found"})
}

func methodNotAllowed(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteText(w, http.StatusMethodNotAllowed, "Method not allowed")
}

// suggest handles GET /start/suggest?engine=&q=.
func (h *Handler) suggest(w http.ResponseWriter, r *http.Request) {
	engine := r.URL.Query().Get("engine")
	query := r.URL.Query().Get("q")
	if engine != "Google" && engine != "Bing" && engine != "Yahoo" {
		httpx.WriteError(w, http.StatusBadRequest, "engine must be Google, Bing, or Yahoo.")
		return
	}
	suggestions := fetchSuggestions(r.Context(), engine, query)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"engine":      engine,
		"query":       strings.TrimSpace(query),
		"suggestions": suggestions,
	})
}

type marketQuotesBody struct {
	Assets []MarketAssetRequest `json:"assets"`
}

// marketQuotes handles POST /start/markets/quotes.
func (h *Handler) marketQuotes(w http.ResponseWriter, r *http.Request) {
	var body marketQuotesBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "Invalid JSON body")
		return
	}
	assets := parseMarketAssets(body.Assets)
	quotes := fetchMarketQuotes(r.Context(), assets)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"quotes": quotes})
}

// marketSearch handles GET /start/markets/search?q=.
func (h *Handler) marketSearch(w http.ResponseWriter, r *http.Request) {
	results := searchMarketAssets(r.Context(), r.URL.Query().Get("q"))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"results": results})
}

// news handles GET /start/news.
func (h *Handler) news(w http.ResponseWriter, r *http.Request) {
	items := fetchNewsBriefing(r.Context(), 1)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// weather handles GET /start/weather?lat=&lon=.
func (h *Handler) weather(w http.ResponseWriter, r *http.Request) {
	lat, lon, ok := parseLatLon(r)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "lat and lon must be valid coordinates.")
		return
	}
	dto, err := fetchWeather(r.Context(), lat, lon)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "Weather response incomplete")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, dto)
}

// weatherPlace handles GET /start/weather/place?lat=&lon=&language=.
func (h *Handler) weatherPlace(w http.ResponseWriter, r *http.Request) {
	lat, lon, ok := parseLatLon(r)
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "lat and lon must be valid coordinates.")
		return
	}
	place := fetchPlaceName(r.Context(), lat, lon, r.URL.Query().Get("language"))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"place": place})
}

// weatherSearch handles GET /start/weather/search?q=&language=.
func (h *Handler) weatherSearch(w http.ResponseWriter, r *http.Request) {
	results := searchPlaces(r.Context(), r.URL.Query().Get("q"), r.URL.Query().Get("language"))
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"results": results})
}

// currencyCatalog handles GET /start/currency/catalog.
func (h *Handler) currencyCatalog(w http.ResponseWriter, r *http.Request) {
	entries, err := fetchCurrencyCatalog(r.Context())
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "Currency catalog unavailable")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"currencies": entries})
}

// currencyConvert handles GET /start/currency/convert?amount=&from=&to=.
func (h *Handler) currencyConvert(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	amount, ok := parseAmount(q.Get("amount"))
	if !ok {
		httpx.WriteError(w, http.StatusBadRequest, "amount must be a finite number.")
		return
	}
	from, okFrom := normalizeCurrencyCode(q.Get("from"))
	to, okTo := normalizeCurrencyCode(q.Get("to"))
	if !okFrom || !okTo {
		httpx.WriteError(w, http.StatusBadRequest, "from and to must be valid currency codes.")
		return
	}
	dto, err := fetchCurrencyConvert(r.Context(), amount, from, to)
	if err != nil {
		httpx.WriteError(w, http.StatusBadGateway, "Currency response incomplete")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, dto)
}
