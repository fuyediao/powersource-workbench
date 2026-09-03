package auth

import "testing"

func TestValidUsername(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "super admin", value: "ps0000", want: true},
		{name: "member", value: "team.user", want: true},
		{name: "email is not a username", value: "contact@geocrm.org", want: false},
		{name: "too short", value: "ab", want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := ValidUsername(NormalizeUsername(tc.value)); got != tc.want {
				t.Fatalf("ValidUsername(%q) = %v, want %v", tc.value, got, tc.want)
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
