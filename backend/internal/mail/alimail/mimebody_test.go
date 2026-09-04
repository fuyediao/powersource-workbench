package alimail

import (
	"encoding/base64"
	"strings"
	"testing"

	"golang.org/x/text/encoding/simplifiedchinese"
)

func TestParseMIMEBodyDecodesBase64UTF8(t *testing.T) {
	want := "尊敬的用户：\r\n定期修改密码提醒"
	raw := "Subject: test\r\n" +
		"Content-Type: text/plain; charset=\"UTF-8\"\r\n" +
		"Content-Transfer-Encoding: base64\r\n\r\n" +
		base64.StdEncoding.EncodeToString([]byte(want))

	html, text, _ := parseMIMEBody(raw)
	if html != "" {
		t.Fatalf("bodyHTML = %q, want empty", html)
	}
	if text != want {
		t.Fatalf("bodyText = %q, want %q", text, want)
	}
}

func TestParseMIMEBodyDecodesQuotedPrintableGBK(t *testing.T) {
	gbk, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte("测试"))
	if err != nil {
		t.Fatalf("encode GBK: %v", err)
	}
	var qp strings.Builder
	for _, b := range gbk {
		qp.WriteString("=")
		const hexDigits = "0123456789ABCDEF"
		qp.WriteByte(hexDigits[b>>4])
		qp.WriteByte(hexDigits[b&0x0f])
	}
	raw := "Content-Type: text/html; charset=GBK\r\n" +
		"Content-Transfer-Encoding: quoted-printable\r\n\r\n" +
		qp.String()

	html, _, _ := parseMIMEBody(raw)
	if html != "测试" {
		t.Fatalf("bodyHTML = %q, want %q", html, "测试")
	}
}

func TestParseMIMEBodySkipsAttachmentParts(t *testing.T) {
	boundary := "bnd"
	raw := "Content-Type: multipart/mixed; boundary=\"" + boundary + "\"\r\n\r\n" +
		"--" + boundary + "\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n\r\nhello\r\n" +
		"--" + boundary + "\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"Content-Disposition: attachment; filename=\"notes.txt\"\r\n" +
		"Content-Transfer-Encoding: base64\r\n\r\n" +
		base64.StdEncoding.EncodeToString([]byte("attached")) + "\r\n" +
		"--" + boundary + "--\r\n"

	_, text, atts := parseMIMEBody(raw)
	if strings.TrimSpace(text) != "hello" {
		t.Fatalf("bodyText = %q, want %q", text, "hello")
	}
	if len(atts) != 1 || string(atts[0].Data) != "attached" || atts[0].Filename != "notes.txt" {
		t.Fatalf("attachments = %#v, want one notes.txt part", atts)
	}
}

func TestDecodeRFC2047GBKSubject(t *testing.T) {
	gbk, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte("系统通知"))
	if err != nil {
		t.Fatalf("encode GBK: %v", err)
	}
	encoded := "=?GBK?B?" + base64.StdEncoding.EncodeToString(gbk) + "?="
	if got := decodeRFC2047(encoded); got != "系统通知" {
		t.Fatalf("decodeRFC2047 = %q, want %q", got, "系统通知")
	}
}

func TestParseMIMEBodyRewritesCidInlineImage(t *testing.T) {
	boundary := "bnd"
	png := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	raw := "Content-Type: multipart/related; boundary=\"" + boundary + "\"\r\n\r\n" +
		"--" + boundary + "\r\n" +
		"Content-Type: text/html; charset=UTF-8\r\n\r\n" +
		`<img src="cid:logo@mail">` + "\r\n" +
		"--" + boundary + "\r\n" +
		"Content-Type: image/png\r\n" +
		"Content-Transfer-Encoding: base64\r\n" +
		"Content-ID: <logo@mail>\r\n" +
		"Content-Disposition: inline\r\n\r\n" +
		base64.StdEncoding.EncodeToString(png) + "\r\n" +
		"--" + boundary + "--\r\n"

	html, _, atts := parseMIMEBody(raw)
	if len(atts) != 1 || atts[0].ContentID != "logo@mail" {
		t.Fatalf("attachments = %#v, want one cid part", atts)
	}
	if !strings.Contains(html, "data:image/png;base64,") {
		t.Fatalf("bodyHTML = %q, want data URI rewrite", html)
	}
	if strings.Contains(strings.ToLower(html), "cid:") {
		t.Fatalf("bodyHTML still has cid: %q", html)
	}
}
