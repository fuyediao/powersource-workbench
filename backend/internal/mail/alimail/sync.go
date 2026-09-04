package alimail

import (
	"context"
	"strings"
	"time"
)

const (
	// syncFetchLimit bounds how many inbox UIDs are fetched per sync run.
	syncFetchLimit = 500
	// mailboxFetchLimit bounds how many UIDs are fetched from the secondary
	// mailboxes (sent, drafts, trash, spam), which are always read in full
	// rather than incrementally.
	mailboxFetchLimit = 200
	// bodyPrefetchMaxAge is how far back deep/shallow sync may pull full
	// MIME bodies so opening recent mail does not wait on IMAP hydrate.
	bodyPrefetchMaxAge = 90 * 24 * time.Hour
	// bodyPrefetchLimit caps bodies fetched per sync run.
	bodyPrefetchLimit = 40
)

// SyncResult summarizes the outcome of an AliMail (IMAP) sync run.
type SyncResult struct {
	Status         string // done | failed | cancelled
	MessagesSynced int
	ErrorMessage   string
}

// RunSync performs an IMAP sync across the mapped mailboxes (inbox, sent,
// drafts, trash, spam, archive when present) and upserts the fetched
// messages. Each mailbox uses its persisted UID cursor (see cursor.go) to
// decide between a fast UID-range fetch and a periodic full reconcile,
// instead of always searching the whole mailbox. Recent message bodies
// (last ~3 months) are prefetched up to bodyPrefetchLimit per run.
func (c *Client) RunSync(
	ctx context.Context,
	accountID string,
	cfg Config,
	onProgress func(synced, total int),
	checkCancel func() bool,
) SyncResult {
	cursors := c.loadFolderCursors(ctx, accountID)
	snapshot, err := syncMailboxes(cfg, cursors, syncFetchLimit, mailboxFetchLimit)
	if err != nil {
		return SyncResult{Status: "failed", ErrorMessage: err.Error()}
	}
	// Persist folder rows before upserts so messages can link folder_id.
	c.persistFolderCursors(ctx, accountID, snapshot)
	folderIDs := c.loadFolderIDsByRole(ctx, accountID)
	synced := 0
	prefetch := make([]bodyPrefetchItem, 0, bodyPrefetchLimit)
	cutoff := time.Now().UTC().Add(-bodyPrefetchMaxAge)
	for i, msg := range snapshot.Messages {
		if checkCancel != nil && i%50 == 0 && checkCancel() {
			return SyncResult{Status: "cancelled", MessagesSynced: synced}
		}
		msgID := c.UpsertMessage(ctx, accountID, msg, folderIDs[msg.MailboxRole])
		if msgID != "" {
			synced++
			if len(prefetch) < bodyPrefetchLimit && messageWithinPrefetchWindow(msg.ReceivedAt, cutoff) {
				prefetch = append(prefetch, bodyPrefetchItem{
					MessageID:   msgID,
					MailboxName: msg.Mailbox,
					UID:         msg.UID,
				})
			}
		}
		if onProgress != nil && synced%20 == 0 {
			onProgress(synced, len(snapshot.Messages))
		}
	}
	c.reconcileRemoteDeletions(ctx, accountID, snapshot)
	c.prefetchMessageBodies(ctx, cfg, prefetch, checkCancel)
	if onProgress != nil {
		onProgress(synced, len(snapshot.Messages))
	}
	return SyncResult{Status: "done", MessagesSynced: synced}
}

type bodyPrefetchItem struct {
	MessageID   string
	MailboxName string
	UID         string
}

// messageWithinPrefetchWindow reports whether receivedAt is on/after cutoff.
func messageWithinPrefetchWindow(receivedAt string, cutoff time.Time) bool {
	receivedAt = strings.TrimSpace(receivedAt)
	if receivedAt == "" {
		return true // unknown date: prefetch once while under the per-run cap
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, receivedAt); err == nil {
			return !t.Before(cutoff)
		}
	}
	return false
}

// prefetchMessageBodies fetches and caches MIME bodies for recent messages
// that do not already have a mail_message_bodies row.
func (c *Client) prefetchMessageBodies(ctx context.Context, cfg Config, items []bodyPrefetchItem, checkCancel func() bool) {
	if len(items) == 0 {
		return
	}
	ids := make([]string, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.MessageID)
	}
	var existing []struct {
		MessageID string `json:"message_id"`
	}
	_ = c.sb.From("mail_message_bodies").Select("message_id").In("message_id", ids).Exec(ctx, &existing)
	hasBody := make(map[string]bool, len(existing))
	for _, row := range existing {
		hasBody[row.MessageID] = true
	}
	conn, err := loginIMAP(cfg)
	if err != nil {
		return
	}
	defer conn.close()
	selected := ""
	for i, item := range items {
		if checkCancel != nil && i%10 == 0 && checkCancel() {
			return
		}
		if hasBody[item.MessageID] || item.UID == "" {
			continue
		}
		mailboxName := item.MailboxName
		if mailboxName == "" {
			mailboxName = "INBOX"
		}
		if selected != mailboxName {
			if err := conn.selectMailbox(mailboxName); err != nil {
				continue
			}
			selected = mailboxName
		}
		lines, ferr := conn.command("UID FETCH " + item.UID + " (BODY.PEEK[])")
		if ferr != nil {
			continue
		}
		for _, line := range lines {
			if raw := extractLiteral(line); raw != "" {
				html, text, atts := parseMIMEBody(raw)
				c.upsertBody(ctx, item.MessageID, html, text)
				if len(atts) > 0 {
					// Attachment metadata is filled on open/download; body text is enough for prefetch.
					_ = atts
				}
				break
			}
		}
	}
	_, _ = conn.command("LOGOUT")
}

// SyncFolders lists IMAP mailboxes and upserts their mail_folders cursor rows
// without fetching message headers. It gives the sidebar folder list and the
// UID cursor a baseline even before the first full RunSync completes.
func (c *Client) SyncFolders(ctx context.Context, accountID string) error {
	cfg, err := c.LoadConfig(ctx, accountID)
	if err != nil {
		return err
	}
	conn, err := loginIMAP(*cfg)
	if err != nil {
		return err
	}
	defer conn.close()
	boxes, err := listMailboxes(conn)
	if err != nil {
		return err
	}
	snapshot := syncSnapshot{Cursors: make(map[string]FolderCursor), BoxNames: make(map[string]string)}
	cursors := c.loadFolderCursors(ctx, accountID)
	for _, box := range boxes {
		uidValidity, uidNext, highestModSeq, serr := conn.selectMailboxStatus(box.Name)
		if serr != nil {
			continue
		}
		cursor := cursors[box.Role]
		cursor.UIDValidity = uidValidity
		cursor.UIDNext = uidNext
		if highestModSeq > 0 {
			cursor.HighestModSeq = highestModSeq
		}
		snapshot.BoxNames[box.Role] = box.Name
		snapshot.Cursors[box.Role] = cursor
	}
	_, _ = conn.command("LOGOUT")
	c.persistFolderCursors(ctx, accountID, snapshot)
	return nil
}

// reconcileRemoteDeletions removes local IMAP headers whose mailbox UID no
// longer exists remotely. It only reconciles mailbox roles that completed a
// full UID SEARCH ALL in this run, so a transient mailbox error cannot delete
// valid local data.
func (c *Client) reconcileRemoteDeletions(ctx context.Context, accountID string, snapshot syncSnapshot) {
	var rows []struct {
		ID                string `json:"id"`
		ProviderMessageID string `json:"provider_message_id"`
	}
	if err := c.sb.From("mail_messages").
		Select("id,provider_message_id").
		Eq("mail_account_id", accountID).
		Like("provider_message_id", "imap:%").
		Exec(ctx, &rows); err != nil {
		return
	}

	for _, row := range rows {
		mailboxName, uid := extractImapRef(row.ProviderMessageID)
		role := mailboxRoleForProviderRef(mailboxName, row.ProviderMessageID)
		if uid == "" || role == "" || !snapshot.Completed[role] {
			continue
		}
		if snapshot.LiveUIDs[role][uid] {
			continue
		}
		c.deleteCachedMessage(ctx, row.ID)
	}
}

// mailboxRoleForProviderRef maps a stored provider id back to the mailbox role
// used by a sync snapshot.
func mailboxRoleForProviderRef(mailboxName, providerID string) string {
	if legacyProviderIDRe.MatchString(providerID) {
		return roleInbox
	}
	return resolveMailboxRole("", strings.TrimSpace(mailboxName))
}

// deleteCachedMessage removes Storage objects first, then deletes the message;
// database foreign keys cascade bodies and attachment metadata.
func (c *Client) deleteCachedMessage(ctx context.Context, messageID string) {
	var attachments []struct {
		StoragePath *string `json:"storage_path"`
	}
	_ = c.sb.From("mail_attachments").
		Select("storage_path").
		Eq("message_id", messageID).
		Exec(ctx, &attachments)
	paths := make([]string, 0, len(attachments))
	for _, attachment := range attachments {
		if attachment.StoragePath != nil && *attachment.StoragePath != "" {
			paths = append(paths, *attachment.StoragePath)
		}
	}
	if len(paths) > 0 {
		_ = c.sb.StorageRemove(ctx, "mail-attachments", paths)
	}
	_ = c.sb.From("mail_messages").Delete().Eq("id", messageID).Exec(ctx, nil)
}
