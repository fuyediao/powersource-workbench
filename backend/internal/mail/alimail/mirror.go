package alimail

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// MirrorMessage is the subset of a mail_messages row needed to mirror a
// folder move or permanent delete, including the local UUID so a successful
// MOVE can rewrite provider_message_id to the destination UID.
type MirrorMessage struct {
	ID                string
	ProviderMessageID string
}

// MirrorRead sets or clears the IMAP \Seen flag for the given provider
// message ids, keeping the server's read state in sync with a local
// read/unread action. Without this, a later full sync would re-derive
// is_read from the (unchanged) server flag and silently revert the action.
func (c *Client) MirrorRead(ctx context.Context, accountID string, providerMessageIDs []string, isRead bool) error {
	return c.mirrorFlag(ctx, accountID, providerMessageIDs, `\Seen`, isRead)
}

// MirrorStar sets or clears the IMAP \Flagged flag for the given provider
// message ids.
func (c *Client) MirrorStar(ctx context.Context, accountID string, providerMessageIDs []string, starred bool) error {
	return c.mirrorFlag(ctx, accountID, providerMessageIDs, `\Flagged`, starred)
}

// MirrorTrash moves the given messages into the account's Trash mailbox.
func (c *Client) MirrorTrash(ctx context.Context, accountID string, messages []MirrorMessage) error {
	return c.mirrorMove(ctx, accountID, messages, roleTrash)
}

// MirrorUntrash moves the given messages back to INBOX.
func (c *Client) MirrorUntrash(ctx context.Context, accountID string, messages []MirrorMessage) error {
	return c.mirrorMove(ctx, accountID, messages, roleInbox)
}

// MirrorSpam moves the given messages into the account's Spam/Junk mailbox.
func (c *Client) MirrorSpam(ctx context.Context, accountID string, messages []MirrorMessage) error {
	return c.mirrorMove(ctx, accountID, messages, roleSpam)
}

// MirrorUnspam moves the given messages back to INBOX.
func (c *Client) MirrorUnspam(ctx context.Context, accountID string, messages []MirrorMessage) error {
	return c.mirrorMove(ctx, accountID, messages, roleInbox)
}

// MirrorArchive moves the given messages into the account's Archive mailbox
// (or All Mail when that is the only archive-like folder advertised).
func (c *Client) MirrorArchive(ctx context.Context, accountID string, messages []MirrorMessage) error {
	return c.mirrorMove(ctx, accountID, messages, roleArchive)
}

// MirrorUnarchive moves the given messages back to INBOX.
func (c *Client) MirrorUnarchive(ctx context.Context, accountID string, messages []MirrorMessage) error {
	return c.mirrorMove(ctx, accountID, messages, roleInbox)
}

// MirrorDelete permanently removes the given messages from the IMAP server
// (STORE \Deleted + EXPUNGE). Local rows are expected to already be gone.
func (c *Client) MirrorDelete(ctx context.Context, accountID string, providerMessageIDs []string) error {
	byMailbox := map[string][]string{}
	for _, id := range providerMessageIDs {
		mailboxName, uid := extractImapRef(id)
		if mailboxName == "" || uid == "" {
			continue
		}
		byMailbox[mailboxName] = append(byMailbox[mailboxName], uid)
	}
	if len(byMailbox) == 0 {
		return nil
	}
	cfg, err := c.LoadConfig(ctx, accountID)
	if err != nil {
		return err
	}
	conn, err := loginIMAP(*cfg)
	if err != nil {
		return err
	}
	defer conn.close()

	var firstErr error
	for mailboxName, uids := range byMailbox {
		if serr := conn.selectMailbox(mailboxName); serr != nil {
			if firstErr == nil {
				firstErr = serr
			}
			continue
		}
		uidSet := strings.Join(uids, ",")
		if _, cerr := conn.command("UID STORE " + uidSet + ` +FLAGS (\Deleted)`); cerr != nil {
			if firstErr == nil {
				firstErr = cerr
			}
			continue
		}
		// Prefer UID EXPUNGE (RFC 4315) so only the deleted set is purged;
		// fall back to a full EXPUNGE when the server rejects it.
		if _, cerr := conn.command("UID EXPUNGE " + uidSet); cerr != nil {
			if _, cerr2 := conn.command("EXPUNGE"); cerr2 != nil && firstErr == nil {
				firstErr = cerr2
			}
		}
	}
	_, _ = conn.command("LOGOUT")
	return firstErr
}

// mirrorFlag groups providerMessageIDs by their source mailbox and issues one
// `UID STORE` per mailbox to add or remove flag.
func (c *Client) mirrorFlag(ctx context.Context, accountID string, providerMessageIDs []string, flag string, add bool) error {
	byMailbox := map[string][]string{}
	for _, id := range providerMessageIDs {
		mailboxName, uid := extractImapRef(id)
		if mailboxName == "" || uid == "" {
			continue
		}
		byMailbox[mailboxName] = append(byMailbox[mailboxName], uid)
	}
	if len(byMailbox) == 0 {
		return nil
	}
	cfg, err := c.LoadConfig(ctx, accountID)
	if err != nil {
		return err
	}
	conn, err := loginIMAP(*cfg)
	if err != nil {
		return err
	}
	defer conn.close()

	verb := "+FLAGS"
	if !add {
		verb = "-FLAGS"
	}
	var firstErr error
	for mailboxName, uids := range byMailbox {
		if serr := conn.selectMailbox(mailboxName); serr != nil {
			if firstErr == nil {
				firstErr = serr
			}
			continue
		}
		cmd := "UID STORE " + strings.Join(uids, ",") + " " + verb + " (" + flag + ")"
		if _, cerr := conn.command(cmd); cerr != nil && firstErr == nil {
			firstErr = cerr
		}
	}
	_, _ = conn.command("LOGOUT")
	return firstErr
}

// mirrorMove moves messages into the IMAP mailbox for targetRole and rewrites
// each local provider_message_id to the destination UID (via COPYUID) so the
// next sync does not treat the source UID as a remote delete.
func (c *Client) mirrorMove(ctx context.Context, accountID string, messages []MirrorMessage, targetRole string) error {
	if len(messages) == 0 {
		return nil
	}
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
	destName := mailboxNameForRole(boxes, targetRole)
	if destName == "" {
		_, _ = conn.command("LOGOUT")
		if targetRole == roleArchive {
			return ErrNoArchiveMailbox
		}
		return fmt.Errorf("no IMAP mailbox mapped to role %s", targetRole)
	}

	byMailbox := map[string][]MirrorMessage{}
	for _, msg := range messages {
		mailboxName, uid := extractImapRef(msg.ProviderMessageID)
		if mailboxName == "" || uid == "" || msg.ID == "" {
			continue
		}
		byMailbox[mailboxName] = append(byMailbox[mailboxName], msg)
	}

	var firstErr error
	for sourceName, msgs := range byMailbox {
		if strings.EqualFold(sourceName, destName) {
			continue
		}
		uids := make([]string, 0, len(msgs))
		byUID := map[string]MirrorMessage{}
		for _, msg := range msgs {
			_, uid := extractImapRef(msg.ProviderMessageID)
			uids = append(uids, uid)
			byUID[uid] = msg
		}
		if serr := conn.selectMailbox(sourceName); serr != nil {
			if firstErr == nil {
				firstErr = serr
			}
			continue
		}
		uidMap, merr := conn.moveUIDs(uids, destName)
		if merr != nil {
			if firstErr == nil {
				firstErr = merr
			}
			continue
		}
		for srcUID, destUID := range uidMap {
			msg, ok := byUID[srcUID]
			if !ok || destUID == "" {
				continue
			}
			newProviderID := providerMessageID(destName, targetRole, destUID)
			_ = c.sb.From("mail_messages").
				Update(map[string]any{"provider_message_id": newProviderID}).
				Eq("id", msg.ID).
				Exec(ctx, nil)
		}
	}
	_, _ = conn.command("LOGOUT")
	return firstErr
}

// mailboxNameForRole returns the IMAP mailbox name for role, or "" when the
// account has no mailbox mapped to that role.
func mailboxNameForRole(boxes []mailbox, role string) string {
	for _, box := range boxes {
		if box.Role == role {
			return box.Name
		}
	}
	return ""
}

// moveUIDs moves the given UIDs from the currently selected mailbox into
// destMailbox, returning a map of source UID -> destination UID when the
// server advertises COPYUID. Falls back to COPY + STORE \Deleted + EXPUNGE
// when UID MOVE is not supported.
func (c *imapConn) moveUIDs(uids []string, destMailbox string) (map[string]string, error) {
	if len(uids) == 0 {
		return nil, nil
	}
	uidSet := strings.Join(uids, ",")
	destQuoted := quoteIMAP(destMailbox)

	untagged, tagged, err := c.commandFull("UID MOVE " + uidSet + " " + destQuoted)
	if err == nil {
		return parseCopyUIDMap(append(untagged, tagged), uids), nil
	}
	// MOVE unsupported / rejected — fall back to COPY + delete.
	untagged, tagged, cerr := c.commandFull("UID COPY " + uidSet + " " + destQuoted)
	if cerr != nil {
		return nil, err // prefer the original MOVE error when both fail
	}
	uidMap := parseCopyUIDMap(append(untagged, tagged), uids)
	if _, serr := c.command("UID STORE " + uidSet + ` +FLAGS (\Deleted)`); serr != nil {
		return uidMap, serr
	}
	if _, eerr := c.command("UID EXPUNGE " + uidSet); eerr != nil {
		_, _ = c.command("EXPUNGE")
	}
	return uidMap, nil
}

var copyUIDRe = regexp.MustCompile(`(?i)\[COPYUID\s+(\d+)\s+(\S+)\s+(\S+)\]`)

// parseCopyUIDMap extracts a source-UID → dest-UID map from IMAP response
// lines that contain a COPYUID response code. When COPYUID is absent it
// returns an empty map (the MOVE/COPY itself may still have succeeded).
func parseCopyUIDMap(lines []string, requestedUIDs []string) map[string]string {
	out := map[string]string{}
	for _, line := range lines {
		m := copyUIDRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		src := expandSequenceSet(m[2])
		dst := expandSequenceSet(m[3])
		if len(src) == 0 || len(src) != len(dst) {
			continue
		}
		for i := range src {
			out[src[i]] = dst[i]
		}
	}
	if len(out) > 0 {
		return out
	}
	// No COPYUID: leave empty so callers skip the provider-id rewrite.
	_ = requestedUIDs
	return out
}

// expandSequenceSet expands an IMAP sequence-set (e.g. "1,3:5") into discrete
// UID strings. Open-ended ranges ("*:5") are left unexpanded.
func expandSequenceSet(spec string) []string {
	var out []string
	for _, part := range strings.Split(spec, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if !strings.Contains(part, ":") {
			out = append(out, part)
			continue
		}
		bounds := strings.SplitN(part, ":", 2)
		if len(bounds) != 2 || bounds[0] == "*" || bounds[1] == "*" {
			continue
		}
		start, err1 := strconv.ParseInt(bounds[0], 10, 64)
		end, err2 := strconv.ParseInt(bounds[1], 10, 64)
		if err1 != nil || err2 != nil {
			continue
		}
		if end < start {
			start, end = end, start
		}
		// Cap pathological ranges; MOVE batches are small in practice.
		if end-start > 10_000 {
			return nil
		}
		for n := start; n <= end; n++ {
			out = append(out, strconv.FormatInt(n, 10))
		}
	}
	return out
}

// ErrNoArchiveMailbox is returned when MirrorArchive cannot find an Archive
// (or All Mail) folder on the account. Callers may choose to skip rather than
// fail the local archive action.
var ErrNoArchiveMailbox = errors.New("no archive mailbox on IMAP account")
