// Package mailcore holds the MIME/RFC 2822 encode-decode helpers shared by
// the Gmail and AliMail provider clients (backend/internal/mail/gmail,
// backend/internal/mail/alimail): address parsing, RFC 2047 header
// decoding/encoding, charset conversion, and outgoing-message building. This
// is the "MailProcessor" seam from the Mailspring-Sync reference design —
// one path for turning addresses/headers into rows and options into a raw
// RFC 2822 message, so both providers behave identically instead of
// maintaining two copies of the same MIME logic.
package mailcore

import (
	"encoding/base64"
	"io"
	"mime"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/encoding"
	"golang.org/x/text/encoding/ianaindex"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"

	"github.com/fuyediao/powersource-workbench/backend/internal/shared/idutil"
)

// Addr is a parsed email address with an optional display name.
type Addr struct {
	Email string `json:"email"`
	Name  string `json:"name,omitempty"`
}

// Attachment is one MIME file part on an outgoing message.
type Attachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

// NilIfEmpty returns nil for an empty string so a Supabase write stores NULL
// instead of an empty string for an optional text column.
func NilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// ContainsStr reports whether value is present in list.
func ContainsStr(list []string, value string) bool {
	for _, v := range list {
		if v == value {
			return true
		}
	}
	return false
}

// DecodeCharset converts raw bytes of the named IANA charset to UTF-8.
//
// When the charset is missing or unknown, bytes that are already valid UTF-8
// are returned as-is and anything else is decoded as GB18030, which covers
// the GB2312 / GBK mail commonly produced by Chinese mail clients.
func DecodeCharset(raw []byte, charset string) string {
	name := strings.TrimSpace(charset)
	if name == "" || strings.EqualFold(name, "utf-8") || strings.EqualFold(name, "utf8") {
		if utf8.Valid(raw) {
			return string(raw)
		}
		return decodeWith(simplifiedchinese.GB18030, raw)
	}
	enc, err := ianaindex.MIME.Encoding(name)
	if err != nil || enc == nil {
		if utf8.Valid(raw) {
			return string(raw)
		}
		return decodeWith(simplifiedchinese.GB18030, raw)
	}
	return decodeWith(enc, raw)
}

func decodeWith(enc encoding.Encoding, raw []byte) string {
	decoded, err := io.ReadAll(transform.NewReader(strings.NewReader(string(raw)), enc.NewDecoder()))
	if err != nil {
		return string(raw)
	}
	return string(decoded)
}

// headerDecoder decodes RFC 2047 encoded-words, including the GB2312 / GBK /
// Big5 charsets used by Chinese mail clients (Go only handles UTF-8 and
// ISO-8859-1 out of the box). Shared by both providers so a raw encoded
// header decodes the same way regardless of transport.
var headerDecoder = mime.WordDecoder{
	CharsetReader: func(charset string, input io.Reader) (io.Reader, error) {
		raw, err := io.ReadAll(input)
		if err != nil {
			return nil, err
		}
		return strings.NewReader(DecodeCharset(raw, charset)), nil
	},
}

// DecodeRFC2047 decodes encoded-word header values, returning the input on error.
func DecodeRFC2047(s string) string {
	if s == "" || !strings.Contains(s, "=?") {
		return s
	}
	decoded, err := headerDecoder.DecodeHeader(s)
	if err != nil {
		return s
	}
	return decoded
}

func isASCII(s string) bool {
	for _, r := range s {
		if r > 127 {
			return false
		}
	}
	return true
}

// EncodeHeaderWord encodes a header value as an RFC 2047 word when non-ASCII.
func EncodeHeaderWord(s string) string {
	if isASCII(s) {
		return s
	}
	return mime.BEncoding.Encode("UTF-8", s)
}

// ParseSingleAddress parses a single "Name <email>" header value, decoding
// RFC 2047 encoded words in the display name.
func ParseSingleAddress(s string) (name, email string) {
	if s == "" {
		return "", ""
	}
	if addr, err := mail.ParseAddress(s); err == nil {
		return DecodeRFC2047(addr.Name), addr.Address
	}
	return "", strings.TrimSpace(s)
}

// ParseAddressList parses a comma-separated address-list header value.
func ParseAddressList(s string) []Addr {
	if strings.TrimSpace(s) == "" {
		return []Addr{}
	}
	addrs, err := mail.ParseAddressList(s)
	if err != nil {
		return []Addr{}
	}
	out := make([]Addr, 0, len(addrs))
	for _, a := range addrs {
		out = append(out, Addr{Email: a.Address, Name: DecodeRFC2047(a.Name)})
	}
	return out
}

func formatAddress(a Addr) string {
	if a.Name == "" {
		return a.Email
	}
	return EncodeHeaderWord(a.Name) + " <" + a.Email + ">"
}

func formatAddressList(addrs []Addr) string {
	parts := make([]string, 0, len(addrs))
	for _, a := range addrs {
		parts = append(parts, formatAddress(a))
	}
	return strings.Join(parts, ", ")
}

// RFC2822Opts carries the fields needed to build an outgoing message.
type RFC2822Opts struct {
	From        string
	To          []Addr
	Cc          []Addr
	Bcc         []Addr
	ReplyTo     string
	Subject     string
	BodyHTML    string
	BodyText    string
	MessageID   string
	InReplyTo   string
	Attachments []Attachment
}

// BuildRFC2822Raw builds a CRLF-delimited RFC 2822 message, used directly for
// AliMail SMTP DATA and as the input to BuildRFC2822's base64url wrapping for
// the Gmail API `raw` field.
func BuildRFC2822Raw(opts RFC2822Opts) string {
	var b strings.Builder
	writeHeader := func(name, value string) {
		if value != "" {
			b.WriteString(name + ": " + value + "\r\n")
		}
	}
	writeHeader("From", opts.From)
	writeHeader("To", formatAddressList(opts.To))
	if len(opts.Cc) > 0 {
		writeHeader("Cc", formatAddressList(opts.Cc))
	}
	if len(opts.Bcc) > 0 {
		writeHeader("Bcc", formatAddressList(opts.Bcc))
	}
	writeHeader("Subject", EncodeHeaderWord(opts.Subject))
	writeHeader("Date", time.Now().UTC().Format(time.RFC1123Z))
	msgID := opts.MessageID
	if msgID == "" {
		msgID = "<" + idutil.UUIDv4() + "@geocrm>"
	}
	writeHeader("Message-ID", msgID)
	writeHeader("In-Reply-To", opts.InReplyTo)
	writeHeader("Reply-To", opts.ReplyTo)
	b.WriteString("MIME-Version: 1.0\r\n")

	if len(opts.Attachments) == 0 {
		writeBodyParts(&b, opts)
		return b.String()
	}

	mixed := "mix_" + idutil.UUIDv4()
	b.WriteString(`Content-Type: multipart/mixed; boundary="` + mixed + "\"\r\n\r\n")
	b.WriteString("--" + mixed + "\r\n")
	writeBodyParts(&b, opts)
	for _, att := range opts.Attachments {
		writeAttachmentPart(&b, mixed, att)
	}
	b.WriteString("--" + mixed + "--\r\n")
	return b.String()
}

// BuildRFC2822 builds a base64url-encoded message for the Gmail API `raw` field.
func BuildRFC2822(opts RFC2822Opts) string {
	return base64.RawURLEncoding.EncodeToString([]byte(BuildRFC2822Raw(opts)))
}

// writeBodyParts writes the text/html alternative (or single) body onto b.
func writeBodyParts(b *strings.Builder, opts RFC2822Opts) {
	hasHTML := opts.BodyHTML != ""
	hasText := opts.BodyText != ""
	switch {
	case hasHTML && hasText:
		boundary := "bnd_" + idutil.UUIDv4()
		b.WriteString(`Content-Type: multipart/alternative; boundary="` + boundary + "\"\r\n\r\n")
		writePart(b, boundary, "text/plain", opts.BodyText)
		writePart(b, boundary, "text/html", opts.BodyHTML)
		b.WriteString("--" + boundary + "--\r\n")
	case hasHTML:
		b.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
		b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		b.WriteString(wrapBase64(opts.BodyHTML))
	default:
		b.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
		b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
		b.WriteString(wrapBase64(opts.BodyText))
	}
}

// writeAttachmentPart writes one file part onto a mixed MIME message.
func writeAttachmentPart(b *strings.Builder, boundary string, att Attachment) {
	ct := att.ContentType
	if ct == "" {
		ct = "application/octet-stream"
	}
	name := att.Filename
	if name == "" {
		name = "attachment"
	}
	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: " + ct + "; name=\"" + EncodeHeaderWord(name) + "\"\r\n")
	b.WriteString("Content-Disposition: attachment; filename=\"" + EncodeHeaderWord(name) + "\"\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(wrapBase64Bytes(att.Data))
}

func writePart(b *strings.Builder, boundary, contentType, body string) {
	b.WriteString("--" + boundary + "\r\n")
	b.WriteString("Content-Type: " + contentType + "; charset=\"UTF-8\"\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	b.WriteString(wrapBase64(body))
}

// wrapBase64 encodes content as base64 with 76-char lines and CRLF endings.
func wrapBase64(content string) string {
	return wrapBase64Bytes([]byte(content))
}

// wrapBase64Bytes encodes raw bytes as base64 with 76-char lines and CRLF endings.
func wrapBase64Bytes(data []byte) string {
	encoded := base64.StdEncoding.EncodeToString(data)
	var b strings.Builder
	for i := 0; i < len(encoded); i += 76 {
		end := i + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		b.WriteString(encoded[i:end])
		b.WriteString("\r\n")
	}
	return b.String()
}
