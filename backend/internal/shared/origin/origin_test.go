package origin

import "testing"

func TestNormalizeBrowserOrigin(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"https://app.example.com/", "https://app.example.com"},
		{"app.example.com", "https://app.example.com"},
		{"http://localhost:5173", "http://localhost:5173"},
		{"", ""},
		{"not a url", ""},
	}
	for _, tc := range tests {
		if got := NormalizeBrowserOrigin(tc.in); got != tc.want {
			t.Fatalf("NormalizeBrowserOrigin(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPickValidatedReturnOrigin(t *testing.T) {
	cfg := Config{
		AppPublicOriginAllowlist: "https://a.example.com,https://b.example.com",
	}
	if got := cfg.PickValidatedReturnOrigin("https://b.example.com/"); got != "https://b.example.com" {
		t.Fatalf("allowed client origin: got %q", got)
	}
	if got := cfg.PickValidatedReturnOrigin("https://evil.example.com"); got != "" {
		t.Fatalf("disallowed client origin: got %q", got)
	}
}
