package alimail

import (
	"context"
	"strings"
	"time"
)

// deepScanInterval bounds how often a mailbox gets a full `UID SEARCH ALL`
// reconcile pass instead of a fast UID-range fetch (Mailspring's
// DEEP_SCAN_INTERVAL is ~10 minutes; our background nudge runs every 2
// minutes, so most nudges are shallow and only every ~5th is deep).
const deepScanInterval = 10 * time.Minute

// FolderCursor is the persisted IMAP sync cursor for one mailbox, mirroring
// mail_folders.uidvalidity/uidnext/synced_min_uid/highestmodseq/last_deep_at.
//
// A zero-value cursor means "never synced": the next fetch always runs a
// deep (full) scan to establish a baseline.
type FolderCursor struct {
	UIDValidity   int64
	UIDNext       int64
	SyncedMinUID  int64
	HighestModSeq int64
	LastDeepAt    time.Time
}

// folderTableRole maps an internal mailbox role constant to the value
// mail_folders.role's CHECK constraint accepts. Note "drafts" is plural in
// that column even though the internal roleDraft constant is singular.
var folderTableRole = map[string]string{
	roleInbox: "inbox", roleSent: "sent", roleDraft: "drafts",
	roleTrash: "trash", roleSpam: "spam", roleArchive: "archive",
}

var tableRoleToInternal = map[string]string{
	"inbox": roleInbox, "sent": roleSent, "drafts": roleDraft,
	"trash": roleTrash, "spam": roleSpam, "archive": roleArchive,
}

type folderCursorRow struct {
	Role          string  `json:"role"`
	UIDValidity   *int64  `json:"uidvalidity"`
	UIDNext       *int64  `json:"uidnext"`
	SyncedMinUID  *int64  `json:"synced_min_uid"`
	HighestModSeq *int64  `json:"highestmodseq"`
	LastDeepAt    *string `json:"last_deep_at"`
}

// loadFolderIDsByRole returns mail_folders.id keyed by internal mailbox role
// (inbox/sent/draft/trash/spam/archive) for linking mail_messages.folder_id.
func (c *Client) loadFolderIDsByRole(ctx context.Context, accountID string) map[string]string {
	var rows []struct {
		ID   string `json:"id"`
		Role string `json:"role"`
	}
	_ = c.sb.From("mail_folders").
		Select("id,role").
		Eq("mail_account_id", accountID).
		Exec(ctx, &rows)
	out := make(map[string]string, len(rows))
	for _, row := range rows {
		role := tableRoleToInternal[row.Role]
		if role == "" || row.ID == "" {
			continue
		}
		out[role] = row.ID
	}
	return out
}

// loadFolderCursors returns the persisted mail_folders cursor for account,
// keyed by mailbox role.
func (c *Client) loadFolderCursors(ctx context.Context, accountID string) map[string]FolderCursor {
	var rows []folderCursorRow
	_ = c.sb.From("mail_folders").
		Select("role,uidvalidity,uidnext,synced_min_uid,highestmodseq,last_deep_at").
		Eq("mail_account_id", accountID).
		Exec(ctx, &rows)
	out := make(map[string]FolderCursor, len(rows))
	for _, row := range rows {
		role := tableRoleToInternal[row.Role]
		if role == "" {
			continue
		}
		cursor := FolderCursor{}
		if row.UIDValidity != nil {
			cursor.UIDValidity = *row.UIDValidity
		}
		if row.UIDNext != nil {
			cursor.UIDNext = *row.UIDNext
		}
		if row.SyncedMinUID != nil {
			cursor.SyncedMinUID = *row.SyncedMinUID
		}
		if row.HighestModSeq != nil {
			cursor.HighestModSeq = *row.HighestModSeq
		}
		if row.LastDeepAt != nil {
			if t, ok := parseCursorTimestamp(*row.LastDeepAt); ok {
				cursor.LastDeepAt = t
			}
		}
		out[role] = cursor
	}
	return out
}

// persistFolderCursors upserts the mail_folders row (and cursor state) for
// every mailbox role touched by snapshot, so the next sync can resume
// incrementally.
func (c *Client) persistFolderCursors(ctx context.Context, accountID string, snapshot syncSnapshot) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for role, name := range snapshot.BoxNames {
		tableRole := folderTableRole[role]
		if tableRole == "" {
			continue
		}
		row := map[string]any{
			"mail_account_id": accountID,
			"provider_id":     name,
			"name":            name,
			"role":            tableRole,
			"last_shallow_at": now,
		}
		if cursor, ok := snapshot.Cursors[role]; ok {
			row["uidvalidity"] = nonZeroInt64(cursor.UIDValidity)
			row["uidnext"] = nonZeroInt64(cursor.UIDNext)
			row["synced_min_uid"] = nonZeroInt64(cursor.SyncedMinUID)
			row["highestmodseq"] = nonZeroInt64(cursor.HighestModSeq)
			if !cursor.LastDeepAt.IsZero() {
				row["last_deep_at"] = cursor.LastDeepAt.UTC().Format(time.RFC3339Nano)
			}
		}
		_ = c.sb.From("mail_folders").Upsert(row, "mail_account_id,provider_id").Exec(ctx, nil)
	}
}

func nonZeroInt64(v int64) any {
	if v == 0 {
		return nil
	}
	return v
}

// parseCursorTimestamp parses a Supabase timestamptz string (RFC3339Nano or
// RFC3339).
func parseCursorTimestamp(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), true
		}
	}
	return time.Time{}, false
}
