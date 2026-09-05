// Package oajwt issues Workbench sessions for OA-verified employees.
// These tokens are not Supabase JWTs and do not create Auth users.
package oajwt

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const (
	issuer        = "workbench-oa"
	accessType    = "access"
	refreshType   = "refresh"
	refreshPrefix = "oa1."
	accessTTL     = time.Hour
	refreshTTL    = 30 * 24 * time.Hour
)

// Claims is a signed OA session payload.
type Claims struct {
	Issuer    string `json:"iss"`
	Type      string `json:"typ"`
	Subject   string `json:"sub"`
	ExpiresAt int64  `json:"exp"`
	IssuedAt  int64  `json:"iat"`
}

type tokenPair struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int
}

// UserID returns the stable Workbench id for an OA employee.
// @param username - Normalized employee id.
// @returns Prefixed id that is not a Supabase user uuid.
func UserID(username string) string {
	return "oa:" + username
}

// IssuePair signs an access token and a prefixed refresh token.
// @param secret - HMAC key (ENCRYPTION_KEY).
// @param username - Normalized employee id.
// @returns Token pair.
func IssuePair(secret []byte, username string) (tokenPair, error) {
	now := time.Now().UTC()
	access, err := sign(secret, Claims{
		Issuer:    issuer,
		Type:      accessType,
		Subject:   username,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(accessTTL).Unix(),
	})
	if err != nil {
		return tokenPair{}, err
	}
	refresh, err := sign(secret, Claims{
		Issuer:    issuer,
		Type:      refreshType,
		Subject:   username,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(refreshTTL).Unix(),
	})
	if err != nil {
		return tokenPair{}, err
	}
	return tokenPair{
		AccessToken:  access,
		RefreshToken: refreshPrefix + refresh,
		ExpiresIn:    int(accessTTL.Seconds()),
	}, nil
}

// IsRefreshToken reports whether a refresh token belongs to an OA session.
// @param token - Refresh token from the client.
// @returns True for OA refresh tokens.
func IsRefreshToken(token string) bool {
	return strings.HasPrefix(strings.TrimSpace(token), refreshPrefix)
}

// ParseAccess verifies an OA access token.
// @param secret - HMAC key.
// @param token - Bearer token.
// @returns Claims when the token is a valid OA access token.
func ParseAccess(secret []byte, token string) (*Claims, error) {
	return parse(secret, token, accessType)
}

// ParseRefresh verifies an OA refresh token.
// @param secret - HMAC key.
// @param token - Prefixed refresh token.
// @returns Claims when the token is a valid OA refresh token.
func ParseRefresh(secret []byte, token string) (*Claims, error) {
	trimmed := strings.TrimSpace(token)
	if !strings.HasPrefix(trimmed, refreshPrefix) {
		return nil, fmt.Errorf("not an oa refresh token")
	}
	return parse(secret, strings.TrimPrefix(trimmed, refreshPrefix), refreshType)
}

func sign(secret []byte, claims Claims) (string, error) {
	if len(secret) == 0 {
		return "", fmt.Errorf("missing jwt secret")
	}
	header, err := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		return "", err
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	body := b64(header) + "." + b64(payload)
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(body))
	return body + "." + b64(mac.Sum(nil)), nil
}

func parse(secret []byte, token string, wantType string) (*Claims, error) {
	if len(secret) == 0 {
		return nil, fmt.Errorf("missing jwt secret")
	}
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("malformed token")
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := b64(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return nil, fmt.Errorf("bad signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var claims Claims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, err
	}
	if claims.Issuer != issuer || claims.Type != wantType || claims.Subject == "" {
		return nil, fmt.Errorf("invalid claims")
	}
	if claims.ExpiresAt <= time.Now().Unix() {
		return nil, fmt.Errorf("expired")
	}
	return &claims, nil
}

func b64(raw []byte) string {
	return base64.RawURLEncoding.EncodeToString(raw)
}
