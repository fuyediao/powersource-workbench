package alimail

import "context"

// IsAlimailProviderMessageID reports whether providerID follows the AliMail
// (IMAP) provider message id scheme (`imap:...`).
func IsAlimailProviderMessageID(providerID string) bool {
	_, uid := extractImapRef(providerID)
	return uid != ""
}

// HydrateBody fetches a missing message body via IMAP and caches it locally.
func (c *Client) HydrateBody(ctx context.Context, accountID, messageID, providerMessageID string) *FetchedBody {
	mailboxName, uid := extractImapRef(providerMessageID)
	if uid == "" {
		return nil
	}
	cfg, err := c.LoadConfig(ctx, accountID)
	if err != nil {
		return nil
	}
	body, err := fetchMessageBodyByUID(*cfg, mailboxName, uid)
	if err != nil || body == nil {
		return nil
	}
	c.upsertBody(ctx, messageID, body.BodyHTML, body.BodyText)
	return body
}
