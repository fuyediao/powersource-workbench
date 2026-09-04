// Package crypto provides AES-256-GCM helpers for encrypting mail and channel
// credentials. The ciphertext format is wire-compatible with the legacy
// geocrm-api implementation (geocrm-api/src/shared/crypto.ts):
//
//	base64(iv) + ":" + base64(ciphertext||tag)
//
// where iv is a 12-byte nonce and the GCM authentication tag is appended to the
// ciphertext (matching the WebCrypto AES-GCM output layout).
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
)

// Encrypt encrypts plaintext with AES-256-GCM using a hex-encoded 32-byte key.
//
// It returns a "base64(iv):base64(ciphertext)" string.
func Encrypt(plaintext, hexKey string) (string, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nil, iv, []byte(plaintext), nil)
	ivB64 := base64.StdEncoding.EncodeToString(iv)
	ctB64 := base64.StdEncoding.EncodeToString(ciphertext)
	return ivB64 + ":" + ctB64, nil
}

// Decrypt reverses Encrypt for a "base64(iv):base64(ciphertext)" string using a
// hex-encoded 32-byte key.
func Decrypt(ciphertext, hexKey string) (string, error) {
	ivB64, ctB64, ok := strings.Cut(ciphertext, ":")
	if !ok {
		return "", errors.New("crypto: invalid ciphertext format")
	}
	iv, err := base64.StdEncoding.DecodeString(ivB64)
	if err != nil {
		return "", err
	}
	ct, err := base64.StdEncoding.DecodeString(ctB64)
	if err != nil {
		return "", err
	}
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	plain, err := gcm.Open(nil, iv, ct, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
