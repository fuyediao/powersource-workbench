package alimail

import (
	"errors"
	"net"
	"testing"
)

func TestCapabilityHasIdle(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		lines []string
		want  bool
	}{
		{"idle present", []string{"* CAPABILITY IMAP4rev1 IDLE LITERAL+"}, true},
		{"idle only token", []string{"* CAPABILITY IDLE"}, true},
		{"no idle", []string{"* CAPABILITY IMAP4rev1 LITERAL+ AUTH=PLAIN"}, false},
		{"idlebox is not idle", []string{"* CAPABILITY IMAP4rev1 IDLEBOX"}, false},
		{"empty", nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := capabilityHasIdle(tc.lines); got != tc.want {
				t.Fatalf("capabilityHasIdle(%v) = %v, want %v", tc.lines, got, tc.want)
			}
		})
	}
}

func TestIsIdleWakeLine(t *testing.T) {
	t.Parallel()
	cases := []struct {
		line string
		want bool
	}{
		{"* 12 EXISTS", true},
		{"* 3 EXPUNGE", true},
		{"* 1 RECENT", true},
		{"* 12 FETCH (FLAGS (\\Seen))", true},
		{"* VANISHED 1:3", true},
		{"* VANISHED (EARLIER) 10:20", true},
		{"* OK Still here", false},
		{"+ idling", false},
		{"A001 OK IDLE completed", false},
		{"* 0 EXISTS", true},
	}
	for _, tc := range cases {
		if got := isIdleWakeLine(tc.line); got != tc.want {
			t.Errorf("isIdleWakeLine(%q) = %v, want %v", tc.line, got, tc.want)
		}
	}
}

func TestIsNetTimeout(t *testing.T) {
	t.Parallel()
	if !isNetTimeout(timeoutErr{}) {
		t.Fatal("timeoutErr should count as a timeout")
	}
	if !isNetTimeout(&net.DNSError{IsTimeout: true, Err: "timeout"}) {
		t.Fatal("net timeout should count")
	}
	if isNetTimeout(errors.New("connection reset")) {
		t.Fatal("generic error should not count as timeout")
	}
	if !isNetTimeout(&timeoutDeadline{}) {
		t.Fatal("net.Error timeout should count")
	}
}

type timeoutDeadline struct{}

func (timeoutDeadline) Error() string   { return "i/o timeout" }
func (timeoutDeadline) Timeout() bool   { return true }
func (timeoutDeadline) Temporary() bool { return true }
