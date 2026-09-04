package mail

import (
	"strings"
	"time"
	"unicode"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/supabase"
)

// parsedSearch is a Gmail-style query split into tokens + free text.
type parsedSearch struct {
	From       string
	To         string
	Subject    string
	In         string
	IsUnread   *bool
	IsStarred  *bool
	HasAttach  *bool
	Before     *time.Time
	After      *time.Time
	FreeText   string
	HasInToken bool
}

// parseMailSearch parses from:/to:/subject:/in:/is:/has:/before:/after: tokens.
func parseMailSearch(raw string) parsedSearch {
	var out parsedSearch
	fields := tokenizeSearch(strings.TrimSpace(raw))
	var free []string
	for _, field := range fields {
		key, value, ok := splitSearchToken(field)
		if !ok {
			free = append(free, field)
			continue
		}
		value = strings.Trim(value, `"'`)
		switch key {
		case "from":
			out.From = value
		case "to":
			out.To = value
		case "subject":
			out.Subject = value
		case "in":
			out.In = strings.ToLower(value)
			out.HasInToken = true
		case "is":
			switch strings.ToLower(value) {
			case "unread":
				v := true
				out.IsUnread = &v
			case "read":
				v := false
				out.IsUnread = &v
			case "starred":
				v := true
				out.IsStarred = &v
			case "unstarred":
				v := false
				out.IsStarred = &v
			}
		case "has":
			if strings.EqualFold(value, "attachment") || strings.EqualFold(value, "attachments") {
				v := true
				out.HasAttach = &v
			}
		case "before":
			if t, ok := parseSearchDate(value); ok {
				out.Before = &t
			}
		case "after":
			if t, ok := parseSearchDate(value); ok {
				out.After = &t
			}
		default:
			free = append(free, field)
		}
	}
	out.FreeText = strings.Join(free, " ")
	return out
}

func tokenizeSearch(raw string) []string {
	var out []string
	var b strings.Builder
	inQuotes := false
	for _, r := range raw {
		if r == '"' {
			inQuotes = !inQuotes
			b.WriteRune(r)
			continue
		}
		if unicode.IsSpace(r) && !inQuotes {
			if b.Len() > 0 {
				out = append(out, b.String())
				b.Reset()
			}
			continue
		}
		b.WriteRune(r)
	}
	if b.Len() > 0 {
		out = append(out, b.String())
	}
	return out
}

func splitSearchToken(field string) (key, value string, ok bool) {
	i := strings.IndexByte(field, ':')
	if i <= 0 || i == len(field)-1 {
		return "", "", false
	}
	key = strings.ToLower(field[:i])
	switch key {
	case "from", "to", "subject", "in", "is", "has", "before", "after":
		return key, strings.TrimSpace(field[i+1:]), true
	default:
		return "", "", false
	}
}

func parseSearchDate(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	for _, layout := range []string{time.RFC3339, "2006-01-02", "2006/01/02"} {
		if t, err := time.ParseInLocation(layout, value, time.UTC); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func sanitizeSearchTerm(s string) string {
	return strings.NewReplacer("%", " ", ",", " ", "(", " ", ")", " ", "*", " ").Replace(strings.TrimSpace(s))
}

func inTokenToLabel(in string) string {
	switch strings.ToLower(strings.TrimSpace(in)) {
	case "inbox":
		return "INBOX"
	case "sent":
		return "SENT"
	case "trash":
		return "TRASH"
	case "spam":
		return "SPAM"
	case "drafts", "draft":
		return "DRAFT"
	case "starred", "star":
		return "STARRED"
	case "archive", "archived":
		return "ARCHIVE"
	case "snoozed", "snooze":
		return "SNOOZED"
	case "all", "allmail":
		return "ALL"
	case "unread":
		return "UNREAD"
	case "important":
		return "IMPORTANT"
	default:
		return ""
	}
}

// applyParsedSearch adds token filters onto a message list query.
func applyParsedSearch(q *supabase.Query, parsed parsedSearch) *supabase.Query {
	if parsed.From != "" {
		term := sanitizeSearchTerm(parsed.From)
		if term != "" {
			q = q.Or("from_address.ilike.%" + term + "%,from_name.ilike.%" + term + "%")
		}
	}
	if parsed.Subject != "" {
		term := sanitizeSearchTerm(parsed.Subject)
		if term != "" {
			q = q.Ilike("subject", "%"+term+"%")
		}
	}
	if parsed.IsUnread != nil {
		if *parsed.IsUnread {
			q = q.Eq("is_read", "false")
		} else {
			q = q.Eq("is_read", "true")
		}
	}
	if parsed.IsStarred != nil {
		if *parsed.IsStarred {
			q = q.Eq("is_starred", "true")
		} else {
			q = q.Eq("is_starred", "false")
		}
	}
	if parsed.HasAttach != nil && *parsed.HasAttach {
		q = q.Eq("has_attachments", "true")
	}
	if parsed.Before != nil {
		q = q.Lt("received_at", parsed.Before.UTC().Format(time.RFC3339))
	}
	if parsed.After != nil {
		q = q.Gte("received_at", parsed.After.UTC().Format(time.RFC3339))
	}
	if s := sanitizeSearchTerm(parsed.FreeText); len(s) >= 2 {
		q = q.Or("subject.ilike.%" + s + "%,from_address.ilike.%" + s + "%,from_name.ilike.%" + s + "%,snippet.ilike.%" + s + "%")
	}
	return q
}

func messageMatchesToToken(row map[string]any, to string) bool {
	needle := strings.ToLower(strings.TrimSpace(to))
	if needle == "" {
		return true
	}
	for _, email := range addressEmails(row["to_addresses"]) {
		if strings.Contains(email, needle) {
			return true
		}
	}
	for _, email := range addressEmails(row["cc_addresses"]) {
		if strings.Contains(email, needle) {
			return true
		}
	}
	return false
}
