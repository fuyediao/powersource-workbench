package start

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	currencyAPIBase    = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1"
	currencyTimeout    = 10 * time.Second
	currencyCatalogTTL = time.Hour
)

var currencyCodeRE = regexp.MustCompile(`^[A-Z0-9]{2,16}$`)

// CurrencyCatalogEntry is one fiat or crypto row from the public FX catalog.
type CurrencyCatalogEntry struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Kind string `json:"kind"`
}

// CurrencyConvertDto is one conversion snapshot.
type CurrencyConvertDto struct {
	Amount float64 `json:"amount"`
	From   string  `json:"from"`
	To     string  `json:"to"`
	Rate   float64 `json:"rate"`
	Result float64 `json:"result"`
	Date   string  `json:"date"`
}

var (
	catalogMu      sync.Mutex
	catalogCache   []CurrencyCatalogEntry
	catalogFetched time.Time
)

// ISO 4217 alphabetic codes (active plus common fund / metal / test units).
const iso4217Codes = `
AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV
BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE
CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD
HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD
KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV
MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB
RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT
TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF
XAG XAU XBA XBB XBC XBD XCD XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWG
ZWL
`

var iso4217Fiat = map[string]struct{}{}

func init() {
	for _, code := range strings.Fields(iso4217Codes) {
		iso4217Fiat[code] = struct{}{}
	}
}

func parseAmount(raw string) (float64, bool) {
	v, err := strconv.ParseFloat(strings.TrimSpace(raw), 64)
	if err != nil || math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, false
	}
	return v, true
}

func normalizeCurrencyCode(raw string) (string, bool) {
	code := strings.ToUpper(strings.TrimSpace(raw))
	if !currencyCodeRE.MatchString(code) {
		return "", false
	}
	return code, true
}

func isFiatCurrencyCode(code string) bool {
	_, ok := iso4217Fiat[code]
	return ok
}

// fetchCurrencyCatalog loads the public FX catalog (cached for one hour).
func fetchCurrencyCatalog(ctx context.Context) ([]CurrencyCatalogEntry, error) {
	catalogMu.Lock()
	if len(catalogCache) > 0 && time.Since(catalogFetched) < currencyCatalogTTL {
		out := catalogCache
		catalogMu.Unlock()
		return out, nil
	}
	catalogMu.Unlock()

	body, err := httpGetBytes(ctx, currencyAPIBase+"/currencies.json", currencyTimeout, map[string]string{
		"Accept": "application/json",
	})
	if err != nil {
		return nil, err
	}
	var data map[string]string
	if json.Unmarshal(body, &data) != nil {
		return nil, errors.New("currency catalog incomplete")
	}
	out := make([]CurrencyCatalogEntry, 0, len(data))
	for raw, name := range data {
		code, ok := normalizeCurrencyCode(raw)
		if !ok {
			continue
		}
		label := strings.TrimSpace(name)
		if label == "" {
			label = code
		}
		kind := "crypto"
		if isFiatCurrencyCode(code) {
			kind = "fiat"
		}
		out = append(out, CurrencyCatalogEntry{Code: code, Name: label, Kind: kind})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Code < out[j].Code })

	catalogMu.Lock()
	catalogCache = out
	catalogFetched = time.Now()
	catalogMu.Unlock()
	return out, nil
}

// fetchCurrencyConvert converts amount from one catalog code to another.
func fetchCurrencyConvert(ctx context.Context, amount float64, from, to string) (*CurrencyConvertDto, error) {
	if from == to {
		return &CurrencyConvertDto{
			Amount: amount,
			From:   from,
			To:     to,
			Rate:   1,
			Result: amount,
			Date:   time.Now().UTC().Format("2006-01-02"),
		}, nil
	}
	base := strings.ToLower(from)
	quote := strings.ToLower(to)
	rawURL, err := url.JoinPath(currencyAPIBase, "currencies", base+".json")
	if err != nil {
		return nil, err
	}
	body, err := httpGetBytes(ctx, rawURL, currencyTimeout, map[string]string{"Accept": "application/json"})
	if err != nil {
		return nil, err
	}
	var data map[string]any
	if json.Unmarshal(body, &data) != nil {
		return nil, errors.New("currency response incomplete")
	}
	table, _ := data[base].(map[string]any)
	unitRaw, ok := table[quote]
	if !ok {
		return nil, errors.New("currency response incomplete")
	}
	unitRate, ok := jsonNumber(unitRaw)
	if !ok {
		return nil, errors.New("currency response incomplete")
	}
	date := time.Now().UTC().Format("2006-01-02")
	if raw, ok := data["date"].(string); ok && strings.TrimSpace(raw) != "" {
		date = raw
	}
	return &CurrencyConvertDto{
		Amount: amount,
		From:   from,
		To:     to,
		Rate:   unitRate,
		Result: amount * unitRate,
		Date:   date,
	}, nil
}

func jsonNumber(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		if math.IsNaN(n) || math.IsInf(n, 0) {
			return 0, false
		}
		return n, true
	case json.Number:
		f, err := n.Float64()
		if err != nil || math.IsNaN(f) || math.IsInf(f, 0) {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}
