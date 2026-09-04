package mcp

import (
	"strings"
	"testing"
)

func TestGenerateKeyShapeAndPrefix(t *testing.T) {
	plaintext, prefix, err := generateKey()
	if err != nil {
		t.Fatalf("generateKey: %v", err)
	}
	if !strings.HasPrefix(plaintext, keyLiteralPrefix) {
		t.Fatalf("plaintext %q missing literal prefix %q", plaintext, keyLiteralPrefix)
	}
	if prefix != plaintext[:displayPrefixLength] {
		t.Fatalf("prefix = %q, want %q", prefix, plaintext[:displayPrefixLength])
	}
	if len(plaintext) != len(keyLiteralPrefix)+keySecretBytes*2 {
		t.Fatalf("plaintext length = %d, want %d", len(plaintext), len(keyLiteralPrefix)+keySecretBytes*2)
	}
}

func TestGenerateKeyProducesDistinctSecretsAcrossCalls(t *testing.T) {
	first, _, err := generateKey()
	if err != nil {
		t.Fatalf("generateKey: %v", err)
	}
	second, _, err := generateKey()
	if err != nil {
		t.Fatalf("generateKey: %v", err)
	}
	if first == second {
		t.Fatal("two mints produced the same plaintext key")
	}
	if hashKey(first) == hashKey(second) {
		t.Fatal("two mints produced the same key hash, so one key would authenticate as the other")
	}
}

func TestHashKeyIsStableAndNotReversible(t *testing.T) {
	const sample = "gcrm_mcp_0123456789abcdef"
	digest := hashKey(sample)
	if digest != hashKey(sample) {
		t.Fatal("hashKey is not deterministic")
	}
	if len(digest) != 64 {
		t.Fatalf("digest length = %d, want 64 hex characters", len(digest))
	}
	if strings.Contains(digest, sample) {
		t.Fatal("digest leaks the plaintext key")
	}
}

func TestIsUUID(t *testing.T) {
	cases := map[string]bool{
		"3f2504e0-4f89-11d3-9a0c-0305e82c3301": true,
		"3F2504E0-4F89-11D3-9A0C-0305E82C3301": true,
		"3f2504e04f8911d39a0c0305e82c3301":     false,
		"3f2504e0-4f89-11d3-9a0c-0305e82c330":  false,
		"3f2504e0-4f89-11d3-9a0c-0305e82c33,1": false,
		"":                                     false,
	}
	for value, want := range cases {
		if got := isUUID(value); got != want {
			t.Fatalf("isUUID(%q) = %v, want %v", value, got, want)
		}
	}
}
