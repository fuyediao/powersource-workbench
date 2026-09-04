package aichat

import (
	"encoding/base64"
	"strings"
	"testing"
)

// TestParseAskImageAcceptsJPEG verifies a small JPEG payload is accepted.
func TestParseAskImageAcceptsJPEG(t *testing.T) {
	raw := []byte{0xff, 0xd8, 0xff, 0xd9}
	img, err := parseAskImage(&requestImage{
		MIMEType: "image/jpeg",
		Data:     base64.StdEncoding.EncodeToString(raw),
	})
	if err != nil {
		t.Fatalf("parseAskImage() error = %v", err)
	}
	if len(img) != 1 || img[0].MIMEType != "image/jpeg" {
		t.Fatalf("got %+v", img)
	}
}

// TestParseAskImageRejectsGIF verifies unsupported MIME types are rejected.
func TestParseAskImageRejectsGIF(t *testing.T) {
	_, err := parseAskImage(&requestImage{MIMEType: "image/gif", Data: "AAAA"})
	if err != errInvalidImageMIME {
		t.Fatalf("err = %v, want errInvalidImageMIME", err)
	}
}

// TestParseAskImageNilIsEmpty verifies a missing image is not an error.
func TestParseAskImageNilIsEmpty(t *testing.T) {
	img, err := parseAskImage(nil)
	if err != nil || img != nil {
		t.Fatalf("parseAskImage(nil) = (%v, %v)", img, err)
	}
}

// TestScreenshotUserPrefixIsEnglish guards against non-English instruction text.
func TestScreenshotUserPrefixIsEnglish(t *testing.T) {
	for _, r := range ScreenshotUserPrefix {
		if r >= 0x4e00 && r <= 0x9fff {
			t.Fatalf("ScreenshotUserPrefix contains CJK rune %q", r)
		}
	}
	if !strings.Contains(ScreenshotUserPrefix, "Ask AI sidebar") {
		t.Fatal("ScreenshotUserPrefix should mention the Ask AI sidebar")
	}
}

func TestMapSearchSuffixIsEnglish(t *testing.T) {
	for _, r := range MapSearchSuffix {
		if r >= 0x4e00 && r <= 0x9fff {
			t.Fatalf("MapSearchSuffix contains CJK rune %q", r)
		}
	}
	if !strings.Contains(MapSearchSuffix, "mjson") {
		t.Fatal("MapSearchSuffix should mention mjson")
	}
	prompt, ok := SystemPromptForAsk("quick", true, false)
	if !ok || !strings.Contains(prompt, MapSearchSuffix) {
		t.Fatal("SystemPromptForAsk(quick, true, false) should append MapSearchSuffix")
	}
	plain, ok := SystemPromptForAsk("think", false, false)
	if !ok || strings.Contains(plain, "mjson") {
		t.Fatal("SystemPromptForAsk(think, false, false) should stay the Think prompt")
	}
}

func TestWebSearchSuffixIsEnglish(t *testing.T) {
	for _, r := range WebSearchSuffix {
		if r >= 0x4e00 && r <= 0x9fff {
			t.Fatalf("WebSearchSuffix contains CJK rune %q", r)
		}
	}
	if !strings.Contains(WebSearchSuffix, "WEB SEARCH IS ACTIVE") {
		t.Fatal("WebSearchSuffix should mention WEB SEARCH IS ACTIVE")
	}
	prompt, ok := SystemPromptForAsk("quick", false, true)
	if !ok || !strings.Contains(prompt, WebSearchSuffix) {
		t.Fatal("SystemPromptForAsk(quick, false, true) should append WebSearchSuffix")
	}
	if strings.Contains(prompt, "mjson") {
		t.Fatal("web search must not append the map mjson contract")
	}
}
