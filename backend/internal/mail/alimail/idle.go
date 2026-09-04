package alimail

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"
)

// ErrIdleUnsupported is returned when CAPABILITY does not include IDLE.
var ErrIdleUnsupported = errors.New("IMAP server does not support IDLE")

const (
	idleReissueAfter = 25 * time.Minute
	idleReadSlice    = 5 * time.Second
	idleWakeDebounce = 400 * time.Millisecond
	idleBackoffMin   = 5 * time.Second
	idleBackoffMax   = 5 * time.Minute
	idleBeginTimeout = 30 * time.Second
)

// RunInboxIdle keeps INBOX selected and IDLEs until ctx is cancelled.
// onWake is invoked after EXISTS / EXPUNGE / RECENT / FETCH (debounced).
// Returns ErrIdleUnsupported when the server has no IDLE capability.
func RunInboxIdle(ctx context.Context, cfg Config, onWake func()) error {
	backoff := idleBackoffMin
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		err := runInboxIdleOnce(ctx, cfg, onWake)
		if errors.Is(err, ErrIdleUnsupported) {
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
		}
		backoff *= 2
		if backoff > idleBackoffMax {
			backoff = idleBackoffMax
		}
	}
}

// runInboxIdleOnce logs in, checks IDLE, SELECTs INBOX, and re-IDLEs until
// the connection drops or ctx is cancelled.
func runInboxIdleOnce(ctx context.Context, cfg Config, onWake func()) error {
	c, err := loginIMAP(cfg)
	if err != nil {
		return err
	}
	defer c.close()

	ok, err := c.supportsIdle()
	if err != nil {
		return err
	}
	if !ok {
		return ErrIdleUnsupported
	}
	if err := c.selectMailbox("INBOX"); err != nil {
		return err
	}

	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		woke, err := c.idleSession(ctx, idleReissueAfter)
		if err != nil {
			return err
		}
		if woke && onWake != nil {
			onWake()
		}
	}
}

// supportsIdle reports whether the server advertised IDLE.
func (c *imapConn) supportsIdle() (bool, error) {
	lines, err := c.command("CAPABILITY")
	if err != nil {
		return false, err
	}
	return capabilityHasIdle(lines), nil
}

// capabilityHasIdle reports whether any CAPABILITY response lists IDLE.
func capabilityHasIdle(lines []string) bool {
	for _, line := range lines {
		for _, field := range strings.Fields(strings.ToUpper(line)) {
			if field == "IDLE" {
				return true
			}
		}
	}
	return false
}

// isIdleWakeLine reports whether an untagged IMAP line means new/changed mail.
func isIdleWakeLine(line string) bool {
	if !strings.HasPrefix(line, "* ") {
		return false
	}
	fields := strings.Fields(line)
	if len(fields) < 2 {
		return false
	}
	if strings.EqualFold(fields[1], "VANISHED") {
		return true
	}
	if len(fields) < 3 {
		return false
	}
	switch strings.ToUpper(fields[2]) {
	case "EXISTS", "EXPUNGE", "RECENT", "FETCH":
		return true
	default:
		return false
	}
}

// idleSession runs one IDLE round: begin, wait for wake or timeout, then DONE.
func (c *imapConn) idleSession(ctx context.Context, timeout time.Duration) (woke bool, err error) {
	tag, err := c.beginIdle()
	if err != nil {
		return false, err
	}
	defer func() {
		stopErr := c.endIdle(tag)
		if err == nil && stopErr != nil && ctx.Err() == nil {
			err = stopErr
		}
	}()

	deadline := time.Now().Add(timeout)
	for {
		line, rerr := c.readIdleLine(ctx, deadline)
		if rerr != nil {
			if ctx.Err() != nil {
				return woke, ctx.Err()
			}
			if isNetTimeout(rerr) {
				return woke, nil
			}
			return woke, rerr
		}
		if !isIdleWakeLine(line) {
			continue
		}
		woke = true
		debounceUntil := time.Now().Add(idleWakeDebounce)
		for time.Now().Before(debounceUntil) {
			extra, e2 := c.readIdleLine(ctx, debounceUntil)
			if e2 != nil {
				break
			}
			_ = extra
		}
		return true, nil
	}
}

// beginIdle sends IDLE and waits for the continuation "+".
func (c *imapConn) beginIdle() (string, error) {
	c.tag++
	tag := fmt.Sprintf("A%03d", c.tag)
	_ = c.conn.SetDeadline(time.Time{})
	if _, err := c.conn.Write([]byte(tag + " IDLE\r\n")); err != nil {
		return "", err
	}
	_ = c.conn.SetReadDeadline(time.Now().Add(idleBeginTimeout))
	for {
		line, err := c.readResponseLine()
		if err != nil {
			return "", err
		}
		if strings.HasPrefix(line, "+") {
			return tag, nil
		}
		if strings.HasPrefix(line, tag+" ") {
			return "", fmt.Errorf("IDLE rejected: %s", truncate(strings.TrimPrefix(line, tag+" "), 200))
		}
	}
}

// endIdle terminates the current IDLE with DONE and waits for the tagged OK.
func (c *imapConn) endIdle(tag string) error {
	_ = c.conn.SetDeadline(time.Now().Add(idleBeginTimeout))
	if _, err := c.conn.Write([]byte("DONE\r\n")); err != nil {
		return err
	}
	for {
		line, err := c.readResponseLine()
		if err != nil {
			return err
		}
		if strings.HasPrefix(line, tag+" ") {
			status := strings.TrimPrefix(line, tag+" ")
			if strings.HasPrefix(status, "OK") {
				return nil
			}
			return fmt.Errorf("IDLE DONE failed: %s", truncate(status, 200))
		}
	}
}

// readIdleLine reads one logical IMAP line, slicing the wait so ctx can cancel.
func (c *imapConn) readIdleLine(ctx context.Context, until time.Time) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	remaining := time.Until(until)
	if remaining <= 0 {
		return "", timeoutErr{}
	}
	slice := idleReadSlice
	if remaining < slice {
		slice = remaining
	}
	_ = c.conn.SetReadDeadline(time.Now().Add(slice))
	return c.readResponseLine()
}

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "idle read timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

func isNetTimeout(err error) bool {
	var te timeoutErr
	if errors.As(err, &te) {
		return true
	}
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}
