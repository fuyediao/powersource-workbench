package mailcore

import (
	"encoding/base64"
	"strings"
	"testing"

	"golang.org/x/text/encoding/simplifiedchinese"
)

func TestDecodeRFC2047GBKSubject(t *testing.T) {
	gbk, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte("系统通知"))
	if err != nil {
		t.Fatalf("encode GBK: %v", err)
	}
	encoded := "=?GBK?B?" + base64.StdEncoding.EncodeToString(gbk) + "?="
	if got := DecodeRFC2047(encoded); got != "系统通知" {
		t.Fatalf("DecodeRFC2047 = %q, want %q", got, "系统通知")
	}
}

func TestDecodeRFC2047PlainPassthrough(t *testing.T) {
	if got := DecodeRFC2047("Hello World"); got != "Hello World" {
		t.Fatalf("DecodeRFC2047 = %q, want passthrough", got)
	}
}

func TestParseAddressList(t *testing.T) {
	got := ParseAddressList(`"Alice" <alice@example.com>, bob@example.com`)
	if len(got) != 2 {
		t.Fatalf("expected 2 addresses, got %d: %+v", len(got), got)
	}
	if got[0].Email != "alice@example.com" || got[0].Name != "Alice" {
		t.Fatalf("first address = %+v", got[0])
	}
	if got[1].Email != "bob@example.com" || got[1].Name != "" {
		t.Fatalf("second address = %+v", got[1])
	}
}

func TestParseSingleAddress(t *testing.T) {
	name, email := ParseSingleAddress(`"Carol" <carol@example.com>`)
	if name != "Carol" || email != "carol@example.com" {
		t.Fatalf("got name=%q email=%q", name, email)
	}
}

func TestBuildRFC2822RawIncludesHeadersAndBody(t *testing.T) {
	raw := BuildRFC2822Raw(RFC2822Opts{
		From:     "sender@example.com",
		To:       []Addr{{Email: "to@example.com", Name: "To Person"}},
		Subject:  "Hello",
		BodyText: "plain body",
	})
	if !strings.Contains(raw, "From: sender@example.com\r\n") {
		t.Fatalf("missing From header:\n%s", raw)
	}
	if !strings.Contains(raw, "To: To Person <to@example.com>\r\n") {
		t.Fatalf("missing To header:\n%s", raw)
	}
	if !strings.Contains(raw, "Subject: Hello\r\n") {
		t.Fatalf("missing Subject header:\n%s", raw)
	}
	if !strings.Contains(raw, "Content-Transfer-Encoding: base64") {
		t.Fatalf("expected a base64 body part:\n%s", raw)
	}
}

func TestBuildRFC2822IsBase64URLEncoded(t *testing.T) {
	encoded := BuildRFC2822(RFC2822Opts{From: "a@example.com", BodyText: "hi"})
	decoded, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("expected valid base64url, got error: %v", err)
	}
	if !strings.Contains(string(decoded), "From: a@example.com") {
		t.Fatalf("decoded message missing From header:\n%s", decoded)
	}
}

func TestNilIfEmpty(t *testing.T) {
	if NilIfEmpty("") != nil {
		t.Fatal("expected nil for empty string")
	}
	if NilIfEmpty("x") != "x" {
		t.Fatal("expected value passed through for non-empty string")
	}
}

func TestContainsStr(t *testing.T) {
	if !ContainsStr([]string{"a", "b"}, "b") {
		t.Fatal("expected true")
	}
	if ContainsStr([]string{"a", "b"}, "c") {
		t.Fatal("expected false")
	}
}

func TestDecodeCharsetGB18030Fallback(t *testing.T) {
	gbk, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte("测试"))
	if err != nil {
		t.Fatalf("encode GBK: %v", err)
	}
	if got := DecodeCharset(gbk, "GBK"); got != "测试" {
		t.Fatalf("DecodeCharset = %q, want %q", got, "测试")
	}
}
