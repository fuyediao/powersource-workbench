package alimail

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/crypto"
)

var hexKey64 = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

// EncryptionKeyValid reports whether key is a usable 256-bit AES-GCM hex key.
func EncryptionKeyValid(key string) bool { return hexKey64.MatchString(key) }

// SaveConfig encrypts and inserts the IMAP/SMTP credential secret for a newly
// created mail account (secret_type = imap_password).
func (c *Client) SaveConfig(ctx context.Context, accountID string, cfg Config) error {
	cfgJSON, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	encrypted, err := crypto.Encrypt(string(cfgJSON), c.env.EncryptionKey)
	if err != nil {
		return err
	}
	return c.sb.From("mail_account_secrets").Insert(map[string]any{
		"mail_account_id": accountID, "secret_type": "imap_password", "encrypted_secret": encrypted,
	}).Exec(ctx, nil)
}

// ReplaceConfig deletes any existing IMAP/SMTP secret and saves cfg in its
// place (used when reconnecting a previously errored/disconnected mailbox).
func (c *Client) ReplaceConfig(ctx context.Context, accountID string, cfg Config) error {
	_ = c.sb.From("mail_account_secrets").Delete().Eq("mail_account_id", accountID).Exec(ctx, nil)
	return c.SaveConfig(ctx, accountID, cfg)
}

// LoadConfig decrypts the stored IMAP/SMTP config for an account.
func (c *Client) LoadConfig(ctx context.Context, accountID string) (*Config, error) {
	var secret struct {
		EncryptedSecret string `json:"encrypted_secret"`
	}
	found, _ := c.sb.From("mail_account_secrets").Select("encrypted_secret").Eq("mail_account_id", accountID).Eq("secret_type", "imap_password").MaybeSingle(ctx, &secret)
	if !found {
		return nil, errors.New("No credentials found")
	}
	plain, err := crypto.Decrypt(secret.EncryptedSecret, c.env.EncryptionKey)
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal([]byte(plain), &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// TestAccount loads the stored config and runs a live IMAP connectivity test.
func (c *Client) TestAccount(ctx context.Context, accountID string) TestResult {
	cfg, err := c.LoadConfig(ctx, accountID)
	if err != nil {
		return TestResult{OK: false, Error: err.Error()}
	}
	return TestConnection(*cfg)
}
