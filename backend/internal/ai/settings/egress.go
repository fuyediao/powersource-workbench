package settings

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// EgressInfo is the geocrm-api host's public egress address as seen by a
// third-party IP lookup service. Used by connectivity diagnostics so operators
// can tell whether Gemini region blocks (etc.) apply to the VPS, not the browser.
type EgressInfo struct {
	IP      string `json:"ip"`
	Country string `json:"country,omitempty"`
	Region  string `json:"region,omitempty"`
	City    string `json:"city,omitempty"`
	ISP     string `json:"isp,omitempty"`
	Error   string `json:"error,omitempty"`
}

// egressHTTPClient is shared by LookupEgress; tests may replace it.
var egressHTTPClient = &http.Client{Timeout: 8 * time.Second}

// egressServices are tried in order until one returns a usable IP.
var egressServices = []struct {
	URL   string
	Parse func([]byte) (EgressInfo, error)
}{
	{
		URL: "https://api.ipify.org?format=json",
		Parse: func(body []byte) (EgressInfo, error) {
			var raw struct {
				IP string `json:"ip"`
			}
			if err := json.Unmarshal(body, &raw); err != nil {
				return EgressInfo{}, err
			}
			if strings.TrimSpace(raw.IP) == "" {
				return EgressInfo{}, fmt.Errorf("empty ip")
			}
			return EgressInfo{IP: raw.IP}, nil
		},
	},
	{
		URL: "https://ipapi.co/json/",
		Parse: func(body []byte) (EgressInfo, error) {
			var raw struct {
				IP      string `json:"ip"`
				Country string `json:"country_name"`
				Region  string `json:"region"`
				City    string `json:"city"`
				Org     string `json:"org"`
			}
			if err := json.Unmarshal(body, &raw); err != nil {
				return EgressInfo{}, err
			}
			if strings.TrimSpace(raw.IP) == "" {
				return EgressInfo{}, fmt.Errorf("empty ip")
			}
			return EgressInfo{
				IP:      raw.IP,
				Country: raw.Country,
				Region:  raw.Region,
				City:    raw.City,
				ISP:     raw.Org,
			}, nil
		},
	},
	{
		URL: "https://ip-api.com/json/",
		Parse: func(body []byte) (EgressInfo, error) {
			var raw struct {
				Query   string `json:"query"`
				IP      string `json:"ip"`
				Country string `json:"country"`
				Region  string `json:"regionName"`
				City    string `json:"city"`
				ISP     string `json:"isp"`
			}
			if err := json.Unmarshal(body, &raw); err != nil {
				return EgressInfo{}, err
			}
			ip := strings.TrimSpace(raw.Query)
			if ip == "" {
				ip = strings.TrimSpace(raw.IP)
			}
			if ip == "" {
				return EgressInfo{}, fmt.Errorf("empty ip")
			}
			return EgressInfo{
				IP:      ip,
				Country: raw.Country,
				Region:  raw.Region,
				City:    raw.City,
				ISP:     raw.ISP,
			}, nil
		},
	},
}

// LookupEgress resolves the server's public egress IP via public lookup
// services. On total failure it returns EgressInfo with Error set (never an
// empty struct without a reason).
func LookupEgress(ctx context.Context) EgressInfo {
	var lastErr error
	for _, svc := range egressServices {
		info, err := fetchEgress(ctx, svc.URL, svc.Parse)
		if err == nil {
			return info
		}
		lastErr = err
	}
	msg := "All IP check services failed"
	if lastErr != nil {
		msg = lastErr.Error()
	}
	return EgressInfo{IP: "Error", Error: msg}
}

// fetchEgress GETs one lookup URL and parses the JSON body.
func fetchEgress(ctx context.Context, url string, parse func([]byte) (EgressInfo, error)) (EgressInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return EgressInfo{}, err
	}
	resp, err := egressHTTPClient.Do(req)
	if err != nil {
		return EgressInfo{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return EgressInfo{}, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return EgressInfo{}, fmt.Errorf("http %d", resp.StatusCode)
	}
	return parse(body)
}

// ParseEgressJSON is exported for unit tests of the ipapi / ip-api parsers.
func ParseEgressJSON(serviceURL string, body []byte) (EgressInfo, error) {
	for _, svc := range egressServices {
		if svc.URL == serviceURL {
			return svc.Parse(body)
		}
	}
	return EgressInfo{}, fmt.Errorf("unknown service")
}
