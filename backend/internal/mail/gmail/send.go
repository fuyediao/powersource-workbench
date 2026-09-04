package gmail

import "context"

// SendOptions carries the fields needed to send an outgoing Gmail message.
type SendOptions struct {
	From        string
	To          []Addr
	Cc          []Addr
	Bcc         []Addr
	ReplyTo     string
	Subject     string
	BodyHTML    string
	BodyText    string
	InReplyTo   string
	Attachments []Attachment
}

// Send sends a message through the Gmail API and returns the provider
// message and thread ids.
func (c *Client) Send(ctx context.Context, accountID string, opts SendOptions) (providerMessageID, threadID string, err error) {
	token, err := c.GetAccessToken(ctx, accountID)
	if err != nil {
		return "", "", err
	}
	raw := buildRFC2822(rfc2822Opts{
		From:        opts.From,
		To:          opts.To,
		Cc:          opts.Cc,
		Bcc:         opts.Bcc,
		ReplyTo:     opts.ReplyTo,
		Subject:     opts.Subject,
		BodyHTML:    opts.BodyHTML,
		BodyText:    opts.BodyText,
		InReplyTo:   opts.InReplyTo,
		Attachments: opts.Attachments,
	})
	return sendMessage(ctx, token, raw)
}
