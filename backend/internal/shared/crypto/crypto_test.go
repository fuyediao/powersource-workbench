package crypto

import (
	"strings"
	"testing"
)

// 64 hex chars = 32 bytes (AES-256).
const testKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

func TestEncryptDecryptRoundTrip(t *testing.T) {
	plaintext := "imap-app-password-\u00e9\u4e2d"
	ct, err := Encrypt(plaintext, testKey)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}
	if !strings.Contains(ct, ":") {
		t.Fatalf("ciphertext missing iv:ct separator: %q", ct)
	}
	got, err := Decrypt(ct, testKey)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if got != plaintext {
		t.Fatalf("round trip = %q, want %q", got, plaintext)
	}
}

func TestDecryptInvalid(t *testing.T) {
	if _, err := Decrypt("no-separator", testKey); err == nil {
		t.Fatal("expected error for malformed ciphertext")
	}
}
