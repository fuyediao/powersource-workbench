package gmail

import "context"

// LabelOp describes a best-effort Gmail label mirror triggered by a mailbox
// read/star/trash action performed in the local UI.
type LabelOp struct {
	Read         *bool
	Star         *bool
	Trash        *bool
	Archive      *bool
	Spam         *bool
	Important    *bool
	AddLabels    []string
	RemoveLabels []string
}

func (op LabelOp) addRemove() (add, remove []string) {
	if op.Read != nil {
		if *op.Read {
			remove = append(remove, "UNREAD")
		} else {
			add = append(add, "UNREAD")
		}
	}
	if op.Star != nil {
		if *op.Star {
			add = append(add, "STARRED")
		} else {
			remove = append(remove, "STARRED")
		}
	}
	if op.Trash != nil {
		if *op.Trash {
			add = append(add, "TRASH")
			remove = append(remove, "INBOX", "SPAM")
		} else {
			remove = append(remove, "TRASH")
			add = append(add, "INBOX")
		}
	}
	if op.Archive != nil {
		if *op.Archive {
			remove = append(remove, "INBOX", "TRASH", "SPAM")
		} else {
			add = append(add, "INBOX")
		}
	}
	if op.Spam != nil {
		if *op.Spam {
			add = append(add, "SPAM")
			remove = append(remove, "INBOX", "TRASH")
		} else {
			remove = append(remove, "SPAM")
			add = append(add, "INBOX")
		}
	}
	if op.Important != nil {
		if *op.Important {
			add = append(add, "IMPORTANT")
		} else {
			remove = append(remove, "IMPORTANT")
		}
	}
	add = append(add, op.AddLabels...)
	remove = append(remove, op.RemoveLabels...)
	return add, remove
}

// MirrorRow is the subset of mail_messages needed to mirror bulk ops to Gmail.
// JSON tags match the Supabase column names so callers can decode query
// results directly into this type.
type MirrorRow struct {
	ID                string   `json:"id"`
	MailAccountID     string   `json:"mail_account_id"`
	ProviderMessageID string   `json:"provider_message_id"`
	Labels            []string `json:"labels"`
}

// MirrorLabel applies a single-message label mutation to Gmail. It returns
// nil without calling the API for non-Gmail ids or inactive accounts (not an
// error — there is simply nothing to mirror).
func (c *Client) MirrorLabel(ctx context.Context, accountID, providerMessageID string, op LabelOp) error {
	if !IsGmailProviderMessageID(providerMessageID) || !c.IsActiveAccount(ctx, accountID) {
		return nil
	}
	token, err := c.GetAccessToken(ctx, accountID)
	if err != nil {
		return err
	}
	add, remove := op.addRemove()
	return modifyLabels(ctx, token, providerMessageID, add, remove)
}

// groupMirrorRowsByAccount collects provider message IDs per active Gmail account.
func (c *Client) groupMirrorRowsByAccount(ctx context.Context, rows []MirrorRow) map[string][]string {
	eligibility := map[string]bool{}
	byAccount := map[string][]string{}
	for _, row := range rows {
		if !IsGmailProviderMessageID(row.ProviderMessageID) {
			continue
		}
		eligible, ok := eligibility[row.MailAccountID]
		if !ok {
			eligible = c.IsActiveAccount(ctx, row.MailAccountID)
			eligibility[row.MailAccountID] = eligible
		}
		if !eligible {
			continue
		}
		byAccount[row.MailAccountID] = append(byAccount[row.MailAccountID], row.ProviderMessageID)
	}
	return byAccount
}

// MirrorBulk applies a label mutation to up to 1000 messages per Gmail
// account. It returns the first error encountered per account (accountID ->
// error) so the caller can enqueue a durable mail_sync_tasks retry instead of
// silently dropping the mutation.
func (c *Client) MirrorBulk(ctx context.Context, rows []MirrorRow, op LabelOp) map[string]error {
	add, remove := op.addRemove()
	errs := map[string]error{}
	for accountID, ids := range c.groupMirrorRowsByAccount(ctx, rows) {
		token, err := c.GetAccessToken(ctx, accountID)
		if err != nil {
			errs[accountID] = err
			continue
		}
		for _, chunk := range chunkStrings(ids, 100) {
			if err := batchModifyLabels(ctx, token, chunk, add, remove); err != nil {
				errs[accountID] = err
			}
		}
	}
	return errs
}

// DeleteBulk permanently deletes messages on Gmail, returning per-account
// errors (see MirrorBulk).
func (c *Client) DeleteBulk(ctx context.Context, rows []MirrorRow) map[string]error {
	errs := map[string]error{}
	for accountID, ids := range c.groupMirrorRowsByAccount(ctx, rows) {
		token, err := c.GetAccessToken(ctx, accountID)
		if err != nil {
			errs[accountID] = err
			continue
		}
		for _, chunk := range chunkStrings(ids, 1000) {
			if err := batchDeleteMessages(ctx, token, chunk); err != nil {
				errs[accountID] = err
			}
		}
	}
	return errs
}

func chunkStrings(s []string, size int) [][]string {
	var out [][]string
	for i := 0; i < len(s); i += size {
		end := i + size
		if end > len(s) {
			end = len(s)
		}
		out = append(out, s[i:end])
	}
	return out
}
