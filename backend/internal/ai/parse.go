package ai

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

// ErrInvalidTrilingualResponse is returned by ParseTrilingual when the
// provider response does not contain a usable {en_us, zh_cn, zh_tw} JSON
// object.
var ErrInvalidTrilingualResponse = errors.New("ai: response did not contain a valid trilingual JSON object")

// fencedJSONRe strips a wrapping Markdown code fence (```json ... ``` or
// ``` ... ```) some providers add despite being told not to.
var fencedJSONRe = regexp.MustCompile("(?is)^```(?:json)?\\s*(.*?)```$")

// Trilingual holds one AI-generated result rendered in the three UI locales
// this monorepo supports (en-US, zh-CN, zh-TW).
type Trilingual struct {
	EnUs string
	ZhCn string
	ZhTw string
}

// ParseTrilingual extracts a {"en_us", "zh_cn", "zh_tw"} JSON object from raw
// provider text, tolerating a wrapping Markdown code fence and any
// leading/trailing commentary around the JSON object itself.
func ParseTrilingual(content string) (Trilingual, error) {
	s := strings.TrimSpace(content)
	if m := fencedJSONRe.FindStringSubmatch(s); m != nil {
		s = strings.TrimSpace(m[1])
	}
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start == -1 || end == -1 || end <= start {
		return Trilingual{}, ErrInvalidTrilingualResponse
	}
	s = s[start : end+1]

	var parsed struct {
		EnUs string `json:"en_us"`
		ZhCn string `json:"zh_cn"`
		ZhTw string `json:"zh_tw"`
	}
	if err := json.Unmarshal([]byte(s), &parsed); err != nil {
		return Trilingual{}, ErrInvalidTrilingualResponse
	}
	enUs := strings.TrimSpace(parsed.EnUs)
	zhCn := strings.TrimSpace(parsed.ZhCn)
	zhTw := strings.TrimSpace(parsed.ZhTw)
	if enUs == "" || zhCn == "" || zhTw == "" {
		return Trilingual{}, ErrInvalidTrilingualResponse
	}
	return Trilingual{EnUs: enUs, ZhCn: zhCn, ZhTw: zhTw}, nil
}
