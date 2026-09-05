package oajwt

import "testing"

func TestIssueAndParse(t *testing.T) {
	secret := []byte("unit-test-secret-unit-test-secret")
	pair, err := IssuePair(secret, "ps1234")
	if err != nil {
		t.Fatal(err)
	}
	if !IsRefreshToken(pair.RefreshToken) {
		t.Fatal("expected oa refresh prefix")
	}
	access, err := ParseAccess(secret, pair.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	if access.Subject != "ps1234" || UserID(access.Subject) != "oa:ps1234" {
		t.Fatalf("unexpected access claims: %+v", access)
	}
	refresh, err := ParseRefresh(secret, pair.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if refresh.Subject != "ps1234" {
		t.Fatalf("unexpected refresh claims: %+v", refresh)
	}
	if _, err := ParseAccess(secret, pair.RefreshToken); err == nil {
		t.Fatal("refresh token must not parse as access")
	}
}
