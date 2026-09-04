package alimail

import (
	"bufio"
	"crypto/tls"
	"fmt"
	"io"
	"net"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Config mirrors the stored ImapSmtpConfig (camelCase JSON keys).
type Config struct {
	ImapHost string `json:"imapHost"`
	ImapPort int    `json:"imapPort"`
	ImapSSL  bool   `json:"imapSsl"`
	SMTPHost string `json:"smtpHost"`
	SMTPPort int    `json:"smtpPort"`
	SMTPSSL  bool   `json:"smtpSsl"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// TestResult is the outcome of an IMAP connectivity test.
type TestResult struct {
	OK    bool
	Error string
}

// SyncMessage is one normalized IMAP FETCH result.
type SyncMessage struct {
	UID         string
	Mailbox     string
	MailboxRole string
	Flags       []string
	Subject     string
	FromAddress string
	FromName    string
	ToAddresses []Addr
	CcAddresses []Addr
	ReceivedAt  string
	MessageID   string
}

// FetchedBody holds the decoded body parts and attachments of one fetched message.
type FetchedBody struct {
	BodyHTML    string
	BodyText    string
	Attachments []AttachmentPart
}

const imapDialTimeout = 15 * time.Second

// TestConnection connects and reads the IMAP greeting.
func TestConnection(cfg Config) TestResult {
	c, err := dialIMAP(cfg)
	if err != nil {
		return TestResult{OK: false, Error: err.Error()}
	}
	defer c.close()
	greeting, err := c.readResponseLine()
	if err != nil {
		return TestResult{OK: false, Error: err.Error()}
	}
	if !strings.Contains(greeting, "OK") {
		return TestResult{OK: false, Error: "Unexpected IMAP greeting"}
	}
	return TestResult{OK: true}
}

// loginIMAP connects and authenticates without selecting a mailbox.
func loginIMAP(cfg Config) (*imapConn, error) {
	c, err := dialIMAP(cfg)
	if err != nil {
		return nil, err
	}
	if _, err := c.readResponseLine(); err != nil {
		c.close()
		return nil, err
	}
	if _, err := c.command(fmt.Sprintf("LOGIN %s %s", quoteIMAP(cfg.Username), quoteIMAP(cfg.Password))); err != nil {
		c.close()
		return nil, err
	}
	return c, nil
}

// syncSnapshot contains fetched headers, the live UID set for every mailbox
// role that ran a deep scan this run, and the updated per-role cursor to
// persist for the next incremental sync.
type syncSnapshot struct {
	Messages []SyncMessage
	LiveUIDs map[string]map[string]bool
	// Completed reports which roles ran a deep (full `UID SEARCH ALL`) scan
	// this run — only those are safe inputs to reconcileRemoteDeletions,
	// since a shallow UID-range scan never sees the full live set.
	Completed map[string]bool
	Cursors   map[string]FolderCursor
	// BoxNames maps role -> IMAP mailbox name, for the mail_folders upsert.
	BoxNames map[string]string
}

// syncMailboxes logs in once and, for every known mailbox (inbox, sent,
// drafts, trash, spam), either runs a fast UID-range fetch (new UIDs above
// the persisted cursor) or a periodic full `UID SEARCH ALL` deep scan that
// also reconciles remote deletions. When the server supports CONDSTORE,
// shallow runs also apply CHANGEDSINCE flag updates.
func syncMailboxes(cfg Config, cursors map[string]FolderCursor, inboxLimit, otherLimit int) (syncSnapshot, error) {
	c, err := loginIMAP(cfg)
	if err != nil {
		return syncSnapshot{}, err
	}
	defer c.close()

	supportsCondstore := c.enableCondstore()
	boxes, err := listMailboxes(c)
	if err != nil {
		return syncSnapshot{}, err
	}
	snapshot := syncSnapshot{
		LiveUIDs:  make(map[string]map[string]bool),
		Completed: make(map[string]bool),
		Cursors:   make(map[string]FolderCursor),
		BoxNames:  make(map[string]string),
	}
	var firstErr error
	for _, box := range boxes {
		limit := otherLimit
		if box.Role == roleInbox {
			limit = inboxLimit
		}
		msgs, liveUIDs, newCursor, deep, ferr := fetchMailboxHeaders(c, box, cursors[box.Role], limit, supportsCondstore)
		if ferr != nil {
			if firstErr == nil && box.Role == roleInbox {
				firstErr = ferr
			}
			continue
		}
		snapshot.BoxNames[box.Role] = box.Name
		snapshot.Messages = append(snapshot.Messages, msgs...)
		snapshot.Cursors[box.Role] = newCursor
		if deep {
			snapshot.LiveUIDs[box.Role] = liveUIDs
			snapshot.Completed[box.Role] = true
		}
	}
	_, _ = c.command("LOGOUT")
	if firstErr != nil {
		return syncSnapshot{}, firstErr
	}
	return snapshot, nil
}

const headerFetchItems = "(UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO CC DATE MESSAGE-ID)])"

// fetchMailboxHeaders selects one mailbox, decides whether this run is a
// shallow (UID range + optional CONDSTORE CHANGEDSINCE) or deep (full
// `UID SEARCH ALL`) scan, and returns the normalized headers plus the
// updated cursor.
func fetchMailboxHeaders(c *imapConn, box mailbox, cursor FolderCursor, limit int, supportsCondstore bool) (msgs []SyncMessage, liveUIDs map[string]bool, newCursor FolderCursor, deep bool, err error) {
	uidValidity, uidNext, highestModSeq, err := c.selectMailboxStatus(box.Name)
	if err != nil {
		return nil, nil, cursor, false, err
	}
	newCursor = FolderCursor{
		UIDValidity:   uidValidity,
		UIDNext:       uidNext,
		SyncedMinUID:  cursor.SyncedMinUID,
		HighestModSeq: cursor.HighestModSeq,
		LastDeepAt:    cursor.LastDeepAt,
	}
	if cursor.UIDValidity != 0 && cursor.UIDValidity != uidValidity {
		newCursor.SyncedMinUID = 0
		newCursor.HighestModSeq = 0
		newCursor.LastDeepAt = time.Time{}
	}
	deep = newCursor.SyncedMinUID == 0 || newCursor.LastDeepAt.IsZero() || time.Since(newCursor.LastDeepAt) >= deepScanInterval

	searchCmd := "UID SEARCH ALL"
	if !deep {
		searchCmd = fmt.Sprintf("UID SEARCH UID %d:*", newCursor.SyncedMinUID+1)
	}
	searchLines, serr := c.command(searchCmd)
	if serr != nil {
		return nil, nil, cursor, false, serr
	}
	uids := parseSearchUIDs(searchLines)
	if deep {
		liveUIDs = make(map[string]bool, len(uids))
		for _, uid := range uids {
			liveUIDs[uid] = true
		}
	}

	byUID := map[string]SyncMessage{}
	if len(uids) > 0 {
		fetchUIDs := uids
		if len(fetchUIDs) > limit {
			fetchUIDs = fetchUIDs[len(fetchUIDs)-limit:]
		}
		fetchLines, ferr := c.command("UID FETCH " + strings.Join(fetchUIDs, ",") + " " + headerFetchItems)
		if ferr != nil {
			return nil, nil, cursor, false, ferr
		}
		for _, line := range fetchLines {
			msg, ok := parseImapFetch(line)
			if !ok {
				continue
			}
			msg.Mailbox = box.Name
			msg.MailboxRole = box.Role
			byUID[msg.UID] = msg
		}
	}

	// CONDSTORE: pull flag-only changes for UIDs already in the local cursor
	// range so \Seen / \Flagged updates land without waiting for a deep scan.
	if !deep && supportsCondstore && cursor.HighestModSeq > 0 {
		changedLines, cerr := c.command(fmt.Sprintf(
			"UID FETCH 1:%d (UID FLAGS) (CHANGEDSINCE %d)",
			newCursor.SyncedMinUID, cursor.HighestModSeq,
		))
		if cerr == nil {
			for _, line := range changedLines {
				msg, ok := parseImapFetch(line)
				if !ok {
					continue
				}
				msg.Mailbox = box.Name
				msg.MailboxRole = box.Role
				if existing, hit := byUID[msg.UID]; hit {
					existing.Flags = msg.Flags
					byUID[msg.UID] = existing
				} else {
					byUID[msg.UID] = msg
				}
			}
		}
	}

	out := make([]SyncMessage, 0, len(byUID))
	maxUID := newCursor.SyncedMinUID
	for _, msg := range byUID {
		out = append(out, msg)
		if n, perr := strconv.ParseInt(msg.UID, 10, 64); perr == nil && n > maxUID {
			maxUID = n
		}
	}
	newCursor.SyncedMinUID = maxUID
	if highestModSeq > 0 {
		newCursor.HighestModSeq = highestModSeq
	}
	if deep {
		newCursor.LastDeepAt = time.Now()
	}
	if len(out) == 0 && deep {
		newCursor.LastDeepAt = time.Now()
	}
	return out, liveUIDs, newCursor, deep, nil
}

// enableCondstore advertises CONDSTORE when the server supports it (ENABLE or
// CAPABILITY). Returns whether CHANGEDSINCE / HIGHESTMODSEQ may be used.
func (c *imapConn) enableCondstore() bool {
	lines, err := c.command("CAPABILITY")
	if err != nil {
		return false
	}
	if !capabilityHasToken(lines, "CONDSTORE") {
		return false
	}
	// Best-effort ENABLE (RFC 5161); some servers already expose HIGHESTMODSEQ
	// on SELECT without ENABLE.
	_, _ = c.command("ENABLE CONDSTORE")
	return true
}

// capabilityHasToken reports whether any CAPABILITY response lists token.
func capabilityHasToken(lines []string, token string) bool {
	want := strings.ToUpper(token)
	for _, line := range lines {
		for _, field := range strings.Fields(strings.ToUpper(line)) {
			if field == want {
				return true
			}
		}
	}
	return false
}

// fetchMessageBodyByUID fetches and decodes a message body from one mailbox.
func fetchMessageBodyByUID(cfg Config, mailboxName, uid string) (*FetchedBody, error) {
	c, err := loginIMAP(cfg)
	if err != nil {
		return nil, err
	}
	defer c.close()

	if err := c.selectMailbox(mailboxName); err != nil {
		return nil, err
	}
	lines, err := c.command("UID FETCH " + uid + " (BODY.PEEK[])")
	if err != nil {
		return nil, err
	}
	_, _ = c.command("LOGOUT")

	for _, line := range lines {
		if raw := extractLiteral(line); raw != "" {
			html, text, atts := parseMIMEBody(raw)
			return &FetchedBody{BodyHTML: html, BodyText: text, Attachments: atts}, nil
		}
	}
	return nil, nil
}

// ── Minimal IMAP client ──────────────────────────────────────────────────────

type imapConn struct {
	conn net.Conn
	r    *bufio.Reader
	tag  int
}

func dialIMAP(cfg Config) (*imapConn, error) {
	addr := net.JoinHostPort(cfg.ImapHost, strconv.Itoa(cfg.ImapPort))
	var conn net.Conn
	var err error
	useTLS := cfg.ImapSSL || cfg.ImapPort == 993
	if useTLS {
		conn, err = tls.DialWithDialer(&net.Dialer{Timeout: imapDialTimeout}, "tcp", addr, &tls.Config{ServerName: cfg.ImapHost, InsecureSkipVerify: true})
	} else {
		conn, err = net.DialTimeout("tcp", addr, imapDialTimeout)
	}
	if err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Now().Add(60 * time.Second))
	return &imapConn{conn: conn, r: bufio.NewReader(conn)}, nil
}

func (c *imapConn) close() { _ = c.conn.Close() }

func (c *imapConn) readRawLine() (string, error) {
	line, err := c.r.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

var trailingLiteralRe = regexp.MustCompile("\\{(\\d+)}$")

// readResponseLine reads one logical IMAP response, expanding literals inline.
func (c *imapConn) readResponseLine() (string, error) {
	var sb strings.Builder
	for {
		line, err := c.readRawLine()
		if err != nil {
			return "", err
		}
		if m := trailingLiteralRe.FindStringSubmatch(line); m != nil {
			n, _ := strconv.Atoi(m[1])
			sb.WriteString(line)
			sb.WriteString("\r\n")
			buf := make([]byte, n)
			if _, err := io.ReadFull(c.r, buf); err != nil {
				return "", err
			}
			sb.Write(buf)
			continue
		}
		sb.WriteString(line)
		return sb.String(), nil
	}
}

// command sends a tagged command and returns the untagged response lines.
func (c *imapConn) command(cmd string) ([]string, error) {
	lines, _, err := c.commandFull(cmd)
	return lines, err
}

// commandFull is like command but also returns the tagged status line
// (without the tag prefix), needed to parse COPYUID from MOVE/COPY responses.
func (c *imapConn) commandFull(cmd string) (untagged []string, tagged string, err error) {
	c.tag++
	tag := fmt.Sprintf("A%03d", c.tag)
	_ = c.conn.SetDeadline(time.Now().Add(60 * time.Second))
	if _, err := c.conn.Write([]byte(tag + " " + cmd + "\r\n")); err != nil {
		return nil, "", err
	}
	var lines []string
	for {
		line, err := c.readResponseLine()
		if err != nil {
			return nil, "", err
		}
		if strings.HasPrefix(line, tag+" ") {
			status := strings.TrimPrefix(line, tag+" ")
			if strings.HasPrefix(status, "OK") {
				return lines, status, nil
			}
			return lines, status, fmt.Errorf("IMAP command failed: %s", truncate(status, 200))
		}
		lines = append(lines, line)
	}
}

func quoteIMAP(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func parseSearchUIDs(lines []string) []string {
	for _, line := range lines {
		if strings.HasPrefix(line, "* SEARCH") {
			fields := strings.Fields(strings.TrimPrefix(line, "* SEARCH"))
			return fields
		}
	}
	return nil
}

var (
	fetchUIDRe      = regexp.MustCompile(`UID (\d+)`)
	fetchFlagsRe    = regexp.MustCompile(`FLAGS \(([^)]*)\)`)
	fetchDateRe     = regexp.MustCompile(`INTERNALDATE "([^"]+)"`)
	literalMarkerRe = regexp.MustCompile(`\{(\d+)}\r\n`)
)

func parseImapFetch(line string) (SyncMessage, bool) {
	if !strings.Contains(line, "FETCH") {
		return SyncMessage{}, false
	}
	var m SyncMessage
	if mm := fetchUIDRe.FindStringSubmatch(line); mm != nil {
		m.UID = mm[1]
	}
	if m.UID == "" {
		return SyncMessage{}, false
	}
	if mm := fetchFlagsRe.FindStringSubmatch(line); mm != nil {
		m.Flags = strings.Fields(mm[1])
	}
	if mm := fetchDateRe.FindStringSubmatch(line); mm != nil {
		m.ReceivedAt = parseInternalDate(mm[1])
	}
	if header := extractLiteral(line); header != "" {
		applyImapHeaders(&m, header)
	}
	return m, true
}

// extractLiteral returns the bytes of the first literal in a logical line.
func extractLiteral(line string) string {
	idx := literalMarkerRe.FindStringSubmatchIndex(line)
	if idx == nil {
		return ""
	}
	n, _ := strconv.Atoi(line[idx[2]:idx[3]])
	start := idx[1]
	if start+n > len(line) {
		n = len(line) - start
	}
	if n <= 0 {
		return ""
	}
	return line[start : start+n]
}

func applyImapHeaders(m *SyncMessage, headerBlock string) {
	msg, err := mail.ReadMessage(strings.NewReader(headerBlock + "\r\n\r\n"))
	if err != nil {
		return
	}
	m.Subject = decodeRFC2047(msg.Header.Get("Subject"))
	m.FromName, m.FromAddress = parseSingleAddress(msg.Header.Get("From"))
	m.ToAddresses = parseAddressList(msg.Header.Get("To"))
	m.CcAddresses = parseAddressList(msg.Header.Get("Cc"))
	m.MessageID = strings.Trim(strings.TrimSpace(msg.Header.Get("Message-ID")), "<>")
	if m.ReceivedAt == "" {
		if d, derr := mail.ParseDate(msg.Header.Get("Date")); derr == nil {
			m.ReceivedAt = d.UTC().Format(time.RFC3339Nano)
		}
	}
}

func parseInternalDate(s string) string {
	for _, layout := range []string{"02-Jan-2006 15:04:05 -0700", "_2-Jan-2006 15:04:05 -0700"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC().Format(time.RFC3339Nano)
		}
	}
	return ""
}
