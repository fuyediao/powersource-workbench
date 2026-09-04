package settings

import (
	"strings"
	"testing"
)

func TestParseEgressJSONIpify(t *testing.T) {
	info, err := ParseEgressJSON("https://api.ipify.org?format=json", []byte(`{"ip":"203.0.113.10"}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if info.IP != "203.0.113.10" {
		t.Fatalf("ip = %q", info.IP)
	}
}

func TestParseEgressJSONIpapi(t *testing.T) {
	body := []byte(`{"ip":"203.0.113.11","country_name":"United States","region":"California","city":"Los Angeles","org":"Example ISP"}`)
	info, err := ParseEgressJSON("https://ipapi.co/json/", body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if info.IP != "203.0.113.11" || info.Country != "United States" || info.City != "Los Angeles" {
		t.Fatalf("unexpected info: %+v", info)
	}
}

func TestParseEgressJSONIpAPI(t *testing.T) {
	body := []byte(`{"query":"203.0.113.12","country":"Japan","regionName":"Tokyo","city":"Tokyo","isp":"Example"}`)
	info, err := ParseEgressJSON("https://ip-api.com/json/", body)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if info.IP != "203.0.113.12" || info.Country != "Japan" {
		t.Fatalf("unexpected info: %+v", info)
	}
}

func TestSanitizeProviderErrorRedactsKey(t *testing.T) {
	key := "sk-secret-value-12345"
	msg := sanitizeProviderError(errString("provider rejected key "+key+" for region"), key)
	if strings.Contains(msg, key) {
		t.Fatalf("key leaked: %q", msg)
	}
	if !strings.Contains(msg, "[redacted]") {
		t.Fatalf("expected redaction marker: %q", msg)
	}
}

func TestSanitizeProviderErrorTruncates(t *testing.T) {
	long := strings.Repeat("x", 500)
	msg := sanitizeProviderError(errString(long), "")
	if len(msg) > 410 {
		t.Fatalf("too long: %d", len(msg))
	}
	if !strings.HasSuffix(msg, "…") {
		t.Fatalf("expected ellipsis: %q", msg)
	}
}

type errString string

func (e errString) Error() string { return string(e) }

func TestModelResultSkippedShape(t *testing.T) {
	// Document the JSON contract expected by the frontend dual-path UI.
	r := ModelResult{
		Model:   "gemini",
		OK:      false,
		Message: "No API key saved for Google Gemini.",
		Skipped: true,
	}
	if r.OK || !r.Skipped || r.Model != "gemini" {
		t.Fatalf("unexpected skipped row: %+v", r)
	}
}
