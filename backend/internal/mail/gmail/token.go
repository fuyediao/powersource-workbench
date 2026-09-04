package gmail

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/crypto"
)

// GetAccessToken returns a valid Gmail access token, refreshing and
// persisting it when the cached token has expired (or is about to).
func (c *Client) GetAccessToken(ctx context.Context, accountID string) (string, error) {
	var secret struct {
		EncryptedSecret string `json:"encrypted_secret"`
	}
	found, _ := c.sb.From("mail_account_secrets").Select("encrypted_secret").Eq("mail_account_id", accountID).Eq("secret_type", "oauth_refresh_token").MaybeSingle(ctx, &secret)
	if !found {
		return "", errors.New("No OAuth secret found")
	}
	plain, err := crypto.Decrypt(secret.EncryptedSecret, c.env.EncryptionKey)
	if err != nil {
		return "", err
	}
	var data struct {
		RefreshToken string `json:"refresh_token"`
		AccessToken  string `json:"access_token"`
		ExpiryDate   int64  `json:"expiry_date"`
	}
	if err := json.Unmarshal([]byte(plain), &data); err != nil {
		return "", err
	}
	if data.AccessToken != "" && data.ExpiryDate > time.Now().UnixMilli()+5*60*1000 {
		return data.AccessToken, nil
	}
	newToken, expiry, err := c.refreshToken(ctx, data.RefreshToken)
	if err != nil {
		return "", err
	}
	updated, _ := json.Marshal(map[string]any{"refresh_token": data.RefreshToken, "access_token": newToken, "expiry_date": expiry})
	if enc, encErr := crypto.Encrypt(string(updated), c.env.EncryptionKey); encErr == nil {
		_ = c.sb.From("mail_account_secrets").Update(map[string]any{"encrypted_secret": enc}).Eq("mail_account_id", accountID).Eq("secret_type", "oauth_refresh_token").Exec(ctx, nil)
	}
	return newToken, nil
}

// IsActiveAccount reports whether accountID is an active Gmail OAuth mailbox.
func (c *Client) IsActiveAccount(ctx context.Context, accountID string) bool {
	if accountID == "" {
		return false
	}
	var acc struct {
		Provider string `json:"provider"`
		Status   string `json:"status"`
	}
	found, _ := c.sb.From("mail_accounts").Select("provider,status").Eq("id", accountID).MaybeSingle(ctx, &acc)
	return found && acc.Provider == "gmail" && acc.Status == "active"
}
