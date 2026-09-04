// Package jwt implements the minimal HS256 JWT signing and verification used by
// the proxy agent tokens and the T&E community tokens. Both share JWT_SECRET and
// are distinguished by a `typ` claim. The wire format matches the legacy
// implementations (base64url, no padding), so tokens issued by the legacy Node
// service and this Go service are mutually verifiable during cutover.
package jwt

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"
)

var b64 = base64.RawURLEncoding

// SignHS256 signs the given claims with HMAC-SHA256 and returns a compact JWT.
func SignHS256(claims map[string]any, secret string) (string, error) {
	headerJSON, err := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		return "", err
	}
	payloadJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	signingInput := b64.EncodeToString(headerJSON) + "." + b64.EncodeToString(payloadJSON)
	sig := sign(signingInput, secret)
	return signingInput + "." + sig, nil
}

// ParseHS256 verifies the token signature against secret and returns the decoded
// claims. It returns ok=false for malformed tokens, signature mismatches, or
// expired tokens (when an `exp` numeric claim is present).
func ParseHS256(token, secret string) (map[string]any, bool) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, false
	}
	expected := sign(parts[0]+"."+parts[1], secret)
	if subtle.ConstantTimeCompare([]byte(parts[2]), []byte(expected)) != 1 {
		return nil, false
	}
	payload, err := b64.DecodeString(parts[1])
	if err != nil {
		return nil, false
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, false
	}
	if exp, ok := claims["exp"].(float64); ok {
		if int64(exp) < time.Now().Unix() {
			return nil, false
		}
	}
	return claims, true
}

func sign(input, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(input))
	return b64.EncodeToString(mac.Sum(nil))
}
