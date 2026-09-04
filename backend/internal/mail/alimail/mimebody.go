package alimail

import (
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"net/textproto"
	"regexp"
	"strings"

	"golang.org/x/text/transform"

	"github.com/fuyediao/powersource-workbench/backend/internal/mail/mailcore"
)

// maxCidDataURIBytes caps inline cid→data-URI rewriting so huge images stay
// downloadable attachments instead of bloating body_html.
const maxCidDataURIBytes = 2 << 20

// AttachmentPart is one decoded MIME attachment extracted from a message.
type AttachmentPart struct {
	Filename    string
	ContentType string
	ContentID   string
	Data        []byte
}

var (
	cidSrcDouble = regexp.MustCompile(`(?i)(\bsrc\s*=\s*")cid:([^"]+)(")`)
	cidSrcSingle = regexp.MustCompile(`(?i)(\bsrc\s*=\s*')cid:([^']+)(')`)
	cidSrcBare   = regexp.MustCompile(`(?i)(\bsrc\s*=\s*)cid:([^"'>\s]+)`)
)

// parseMIMEBody extracts the HTML / plain-text bodies and file attachments of a
// raw RFC 822 message, decoding Content-Transfer-Encoding and converting text
// part charsets to UTF-8. Inline images referenced via cid: are rewritten to
// data: URIs in the returned HTML so sandboxed clients can render them.
func parseMIMEBody(raw string) (bodyHTML, bodyText string, attachments []AttachmentPart) {
	msg, err := mail.ReadMessage(strings.NewReader(raw))
	if err != nil {
		return "", raw, nil
	}
	header := textproto.MIMEHeader(msg.Header)
	mediaType, params, err := mime.ParseMediaType(header.Get("Content-Type"))
	if err != nil {
		return "", decodePart(header, msg.Body), nil
	}
	if strings.HasPrefix(mediaType, "multipart/") {
		html, text, atts := walkMultipart(msg.Body, params["boundary"])
		return rewriteCidImages(html, atts), text, atts
	}
	decoded := decodePart(header, msg.Body)
	if strings.HasPrefix(mediaType, "text/html") {
		return decoded, "", nil
	}
	return "", decoded, nil
}

// walkMultipart collects the first usable HTML and plain-text parts plus any
// file attachments, recursing into nested multiparts.
func walkMultipart(r io.Reader, boundary string) (bodyHTML, bodyText string, attachments []AttachmentPart) {
	if boundary == "" {
		return "", "", nil
	}
	mr := multipart.NewReader(r, boundary)
	for {
		part, err := mr.NextPart()
		if err != nil {
			break
		}
		mediaType, params, _ := mime.ParseMediaType(part.Header.Get("Content-Type"))
		if strings.HasPrefix(mediaType, "multipart/") {
			html, text, nested := walkMultipart(part, params["boundary"])
			if bodyHTML == "" {
				bodyHTML = html
			}
			if bodyText == "" {
				bodyText = text
			}
			attachments = append(attachments, nested...)
			continue
		}
		if att, ok := readAttachmentPart(part.Header, part, mediaType); ok {
			attachments = append(attachments, att)
			continue
		}
		switch {
		case strings.HasPrefix(mediaType, "text/html") && bodyHTML == "":
			bodyHTML = decodePart(part.Header, part)
		case strings.HasPrefix(mediaType, "text/plain") && bodyText == "":
			bodyText = decodePart(part.Header, part)
		}
	}
	return bodyHTML, bodyText, attachments
}

// readAttachmentPart returns a decoded attachment when the MIME part looks like
// a downloadable file, or an inline image with a Content-ID (cid: in HTML).
func readAttachmentPart(header textproto.MIMEHeader, body io.Reader, mediaType string) (AttachmentPart, bool) {
	disposition, dispParams, _ := mime.ParseMediaType(header.Get("Content-Disposition"))
	filename := decodeRFC2047(strings.TrimSpace(dispParams["filename"]))
	if filename == "" {
		_, ctParams, _ := mime.ParseMediaType(header.Get("Content-Type"))
		filename = decodeRFC2047(strings.TrimSpace(ctParams["name"]))
	}
	contentID := normalizeContentID(header.Get("Content-ID"))
	isAttachment := strings.EqualFold(disposition, "attachment")
	isInlineImage := strings.HasPrefix(strings.ToLower(mediaType), "image/") &&
		(contentID != "" || strings.EqualFold(disposition, "inline"))
	if !isAttachment && filename == "" && !isInlineImage {
		return AttachmentPart{}, false
	}
	if !isAttachment && !isInlineImage && (strings.HasPrefix(mediaType, "text/plain") || strings.HasPrefix(mediaType, "text/html")) {
		return AttachmentPart{}, false
	}
	data, err := io.ReadAll(decodeTransferEncoding(body, header.Get("Content-Transfer-Encoding")))
	if err != nil || len(data) == 0 {
		return AttachmentPart{}, false
	}
	if filename == "" {
		if contentID != "" {
			filename = "inline-" + sanitizeCidFilename(contentID)
		} else {
			filename = "attachment"
		}
		if ext := imageExtForType(mediaType); ext != "" && !strings.Contains(filename, ".") {
			filename += ext
		}
	}
	contentType := mediaType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return AttachmentPart{
		Filename:    filename,
		ContentType: contentType,
		ContentID:   contentID,
		Data:        data,
	}, true
}

// rewriteCidImages replaces cid: image references with data: URIs from matching
// MIME parts so sandboxed iframes can display inline logos without auth headers.
func rewriteCidImages(html string, attachments []AttachmentPart) string {
	if html == "" || !strings.Contains(strings.ToLower(html), "cid:") || len(attachments) == 0 {
		return html
	}
	byRef := make(map[string]AttachmentPart, len(attachments)*2)
	for _, att := range attachments {
		if len(att.Data) == 0 || len(att.Data) > maxCidDataURIBytes {
			continue
		}
		if !strings.HasPrefix(strings.ToLower(att.ContentType), "image/") && !looksLikeImageFilename(att.Filename) {
			continue
		}
		if att.ContentID != "" {
			byRef[strings.ToLower(att.ContentID)] = att
		}
		if att.Filename != "" {
			byRef[strings.ToLower(att.Filename)] = att
		}
	}
	if len(byRef) == 0 {
		return html
	}
	replace := func(prefix, ref, suffix string) (string, bool) {
		key := strings.ToLower(strings.Trim(ref, "<>"))
		att, ok := byRef[key]
		if !ok {
			return "", false
		}
		ct := att.ContentType
		if ct == "" || ct == "application/octet-stream" {
			ct = "image/png"
		}
		dataURI := "data:" + ct + ";base64," + base64.StdEncoding.EncodeToString(att.Data)
		return prefix + dataURI + suffix, true
	}
	html = cidSrcDouble.ReplaceAllStringFunc(html, func(match string) string {
		sub := cidSrcDouble.FindStringSubmatch(match)
		if len(sub) != 4 {
			return match
		}
		if out, ok := replace(sub[1], sub[2], sub[3]); ok {
			return out
		}
		return match
	})
	html = cidSrcSingle.ReplaceAllStringFunc(html, func(match string) string {
		sub := cidSrcSingle.FindStringSubmatch(match)
		if len(sub) != 4 {
			return match
		}
		if out, ok := replace(sub[1], sub[2], sub[3]); ok {
			return out
		}
		return match
	})
	return cidSrcBare.ReplaceAllStringFunc(html, func(match string) string {
		sub := cidSrcBare.FindStringSubmatch(match)
		if len(sub) != 3 {
			return match
		}
		if out, ok := replace(sub[1]+`"`, sub[2], `"`); ok {
			return out
		}
		return match
	})
}

// normalizeContentID strips angle brackets and whitespace from a Content-ID header.
func normalizeContentID(raw string) string {
	id := strings.TrimSpace(raw)
	id = strings.TrimPrefix(id, "<")
	id = strings.TrimSuffix(id, ">")
	return strings.TrimSpace(id)
}

// sanitizeCidFilename keeps a Content-ID usable as a fallback filename stem.
func sanitizeCidFilename(cid string) string {
	out := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '-' || r == '_' {
			return r
		}
		return '_'
	}, cid)
	if out == "" {
		return "image"
	}
	if len(out) > 64 {
		return out[:64]
	}
	return out
}

// imageExtForType returns a file extension for common image MIME types.
func imageExtForType(mediaType string) string {
	switch strings.ToLower(strings.TrimSpace(strings.Split(mediaType, ";")[0])) {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/bmp":
		return ".bmp"
	default:
		return ""
	}
}

// looksLikeImageFilename reports whether the filename extension is an image.
func looksLikeImageFilename(name string) bool {
	lower := strings.ToLower(name)
	for _, ext := range []string{".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"} {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

// decodePart reads a text MIME part, undoing its Content-Transfer-Encoding and
// converting the declared charset to UTF-8.
func decodePart(header textproto.MIMEHeader, body io.Reader) string {
	raw, err := io.ReadAll(decodeTransferEncoding(body, header.Get("Content-Transfer-Encoding")))
	if err != nil || len(raw) == 0 {
		return ""
	}
	_, params, _ := mime.ParseMediaType(header.Get("Content-Type"))
	return mailcore.DecodeCharset(raw, params["charset"])
}

// decodeTransferEncoding wraps body in a reader that undoes the given
// Content-Transfer-Encoding. Unknown encodings are passed through unchanged.
func decodeTransferEncoding(body io.Reader, encodingName string) io.Reader {
	switch strings.ToLower(strings.TrimSpace(encodingName)) {
	case "base64":
		return base64.NewDecoder(base64.StdEncoding, newBase64Cleaner(body))
	case "quoted-printable":
		return quotedprintable.NewReader(body)
	default:
		return body
	}
}

// newBase64Cleaner strips whitespace (line breaks and padding spaces) from a
// base64 stream so that folded IMAP payloads decode without errors.
func newBase64Cleaner(r io.Reader) io.Reader {
	return transform.NewReader(r, transform.RemoveFunc(func(r rune) bool {
		return r == '\r' || r == '\n' || r == ' ' || r == '\t'
	}))
}
