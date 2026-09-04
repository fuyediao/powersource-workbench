package mcp

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// keyLiteralPrefix marks every GeoCRM MCP key so leaked strings are easy to
// recognise in logs and secret scanners.
const keyLiteralPrefix = "gcrm_mcp_"

// keySecretBytes is the entropy behind the random half of a key.
const keySecretBytes = 24

// displayPrefixLength is how much of the plaintext is kept as the non-secret
// display prefix (literal marker plus the first 8 random characters).
const displayPrefixLength = len(keyLiteralPrefix) + 8

// maxKeysPerUser caps how many MCP keys one account may hold at once. A user
// must delete a key before minting a 6th, so a lost machine never forces
// rotating (and re-registering) every other agent's key.
const maxKeysPerUser = 5

// errKeyNotFound reports that the caller has no matching MCP key row.
var errKeyNotFound = errors.New("mcp: key not found")

// errMaxKeysReached reports that the caller already holds maxKeysPerUser keys.
var errMaxKeysReached = errors.New("mcp: maximum of 5 keys reached")

// keyRecord mirrors the non-secret columns of public.mcp_api_keys.
type keyRecord struct {
	ID         string  `json:"id"`
	UserID     string  `json:"user_id"`
	KeyPrefix  string  `json:"key_prefix"`
	Label      *string `json:"label"`
	Enabled    bool    `json:"enabled"`
	CreatedAt  string  `json:"created_at"`
	LastUsedAt *string `json:"last_used_at"`
}

// keyColumns is the non-secret projection used everywhere except the
// key-hash lookup in resolveKey.
const keyColumns = "id,user_id,key_prefix,label,enabled,created_at,last_used_at"

// hashKey returns the SHA-256 hex digest stored in mcp_api_keys.key_hash.
// Plaintext keys are high-entropy random strings, so a plain digest (rather
// than a slow password hash) is appropriate and keeps request auth cheap.
func hashKey(plaintext string) string {
	sum := sha256.Sum256([]byte(plaintext))
	return hex.EncodeToString(sum[:])
}

// generateKey mints a new plaintext key with its display prefix.
func generateKey() (plaintext, prefix string, err error) {
	buf := make([]byte, keySecretBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	plaintext = keyLiteralPrefix + hex.EncodeToString(buf)
	return plaintext, plaintext[:displayPrefixLength], nil
}

// listKeys returns every key the caller holds, oldest first.
func listKeys(ctx context.Context, sb *supabase.Client, userID string) ([]keyRecord, error) {
	var rows []keyRecord
	if err := sb.From("mcp_api_keys").
		Select(keyColumns).
		Eq("user_id", userID).
		Order("created_at", true).
		Exec(ctx, &rows); err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []keyRecord{}
	}
	return rows, nil
}

// createKey mints a new key for the caller, rejecting a 6th with
// errMaxKeysReached. The plaintext is returned once and never persisted.
func createKey(ctx context.Context, sb *supabase.Client, userID, label string) (plaintext string, rec *keyRecord, err error) {
	existing, err := listKeys(ctx, sb, userID)
	if err != nil {
		return "", nil, err
	}
	if len(existing) >= maxKeysPerUser {
		return "", nil, errMaxKeysReached
	}

	plaintext, prefix, err := generateKey()
	if err != nil {
		return "", nil, err
	}
	row := map[string]any{
		"user_id":    userID,
		"key_prefix": prefix,
		"key_hash":   hashKey(plaintext),
		"enabled":    true,
	}
	if trimmed := strings.TrimSpace(label); trimmed != "" {
		row["label"] = trimmed
	}

	var created keyRecord
	if err := sb.From("mcp_api_keys").
		Insert(row).
		Returning().
		Select(keyColumns).
		Single(ctx, &created); err != nil {
		return "", nil, err
	}
	return plaintext, &created, nil
}

// setKeyEnabled flips one key's enabled flag. It returns errKeyNotFound when
// keyID does not belong to userID, so a request can never toggle someone
// else's key.
func setKeyEnabled(ctx context.Context, sb *supabase.Client, userID, keyID string, enabled bool) error {
	var updated []struct {
		ID string `json:"id"`
	}
	if err := sb.From("mcp_api_keys").
		Eq("id", keyID).
		Eq("user_id", userID).
		Update(map[string]any{"enabled": enabled}).
		Returning().
		Select("id").
		Exec(ctx, &updated); err != nil {
		return err
	}
	if len(updated) == 0 {
		return errKeyNotFound
	}
	return nil
}

// deleteKey removes one key. It returns errKeyNotFound when keyID does not
// belong to userID.
func deleteKey(ctx context.Context, sb *supabase.Client, userID, keyID string) error {
	var deleted []struct {
		ID string `json:"id"`
	}
	if err := sb.From("mcp_api_keys").
		Eq("id", keyID).
		Eq("user_id", userID).
		Delete().
		Returning().
		Select("id").
		Exec(ctx, &deleted); err != nil {
		return err
	}
	if len(deleted) == 0 {
		return errKeyNotFound
	}
	return nil
}

// resolveKey maps a presented plaintext key to its owning user and key id. It
// returns empty strings when the key is malformed, unknown, or disabled.
func resolveKey(ctx context.Context, sb *supabase.Client, plaintext string) (userID, keyID string, err error) {
	plaintext = strings.TrimSpace(plaintext)
	if !strings.HasPrefix(plaintext, keyLiteralPrefix) || len(plaintext) <= displayPrefixLength {
		return "", "", nil
	}
	digest := hashKey(plaintext)

	var row struct {
		ID      string `json:"id"`
		UserID  string `json:"user_id"`
		KeyHash string `json:"key_hash"`
		Enabled bool   `json:"enabled"`
	}
	found, err := sb.From("mcp_api_keys").
		Select("id,user_id,key_hash,enabled").
		Eq("key_hash", digest).
		MaybeSingle(ctx, &row)
	if err != nil {
		return "", "", err
	}
	// Constant-time compare keeps the lookup free of digest-timing signal even
	// though PostgREST already matched on equality.
	if !found || subtle.ConstantTimeCompare([]byte(row.KeyHash), []byte(digest)) != 1 {
		return "", "", nil
	}
	if !row.Enabled {
		return "", "", nil
	}
	return row.UserID, row.ID, nil
}

// touchKeyUsage records the last time a specific key authenticated a request.
// Failures are non-fatal: usage telemetry must never break a tool call.
func touchKeyUsage(ctx context.Context, sb *supabase.Client, keyID string) {
	_ = sb.From("mcp_api_keys").
		Eq("id", keyID).
		Update(map[string]any{"last_used_at": time.Now().UTC().Format(time.RFC3339)}).
		Exec(ctx, nil)
}
