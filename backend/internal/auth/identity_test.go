package auth

import "testing"

func TestResolveSignInEmail(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name       string
		identifier string
		wantEmail  string
		wantCode   string
	}{
		{name: "super admin username", identifier: "contact", wantEmail: "contact@geocrm.org"},
		{name: "super admin email", identifier: "Contact@geocrm.org", wantEmail: "contact@geocrm.org"},
		{name: "member username", identifier: "team.user", wantEmail: "team.user@accounts.powersource.work"},
		{name: "invalid", identifier: "A", wantCode: "invalid_username"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			email, code := ResolveSignInEmail(tc.identifier, "contact@geocrm.org", "accounts.powersource.work")
			if email != tc.wantEmail || code != tc.wantCode {
				t.Fatalf("got %q %q, want %q %q", email, code, tc.wantEmail, tc.wantCode)
			}
		})
	}
}

func TestIsPlatformAdmin(t *testing.T) {
	t.Parallel()
	if !IsPlatformAdmin("super_admin") || !IsPlatformAdmin("system_admin") || IsPlatformAdmin("member") {
		t.Fatal("unexpected platform-admin mapping")
	}
}
