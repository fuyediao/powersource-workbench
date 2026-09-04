package supabase

import "testing"

func TestAuthorizeURLUsesPublicOrigin(t *testing.T) {
	c := NewService("http://kong:8000", "https://supabase.example.com", "service", "anon")
	loc := c.AuthorizeURL("google", "https://api.example.com/auth/callback")
	wantPrefix := "https://supabase.example.com/auth/v1/authorize?"
	if loc[:len(wantPrefix)] != wantPrefix {
		t.Fatalf("AuthorizeURL = %q, want prefix %q", loc, wantPrefix)
	}
}

func TestAuthorizeURLFallsBackToBaseURL(t *testing.T) {
	c := NewService("https://supabase.example.com", "", "service", "anon")
	loc := c.AuthorizeURL("google", "https://api.example.com/auth/callback")
	if loc[:len("https://supabase.example.com/auth/v1/authorize?")] != "https://supabase.example.com/auth/v1/authorize?" {
		t.Fatalf("AuthorizeURL = %q, want public base fallback", loc)
	}
}
