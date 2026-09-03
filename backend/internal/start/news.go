package start

import (
	"context"
	"html"
	"regexp"
	"strings"
	"time"
)

const (
	newsFeedURL    = "https://www.theverge.com/rss/index.xml"
	newsFeedSource = "The Verge"
	newsTimeout    = 8 * time.Second
)

// NewsBriefingItem is one editorial briefing card.
type NewsBriefingItem struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	URL         string `json:"url"`
	Source      string `json:"source"`
}

var (
	rssItemRE   = regexp.MustCompile(`(?is)<item\b[\s\S]*?</item>`)
	atomEntryRE = regexp.MustCompile(`(?is)<entry\b[\s\S]*?</entry>`)
	tagCDATARE  = regexp.MustCompile(`(?is)<([a-z0-9:_-]+)[^>]*><!\[CDATA\[([\s\S]*?)\]\]></([a-z0-9:_-]+)>`)
	tagPlainRE  = regexp.MustCompile(`(?is)<([a-z0-9:_-]+)[^>]*>([\s\S]*?)</([a-z0-9:_-]+)>`)
	htmlTagRE   = regexp.MustCompile(`(?is)<[^>]+>`)
	atomLinkAlt = regexp.MustCompile(`(?is)<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*/?>`)
	atomLinkAny = regexp.MustCompile(`(?is)<link\b[^>]*href=["']([^"']+)["'][^>]*/?>`)
)

// fetchNewsBriefing loads the latest editorial briefing items from a public feed.
func fetchNewsBriefing(ctx context.Context, limit int) []NewsBriefingItem {
	if limit <= 0 {
		limit = 1
	}
	body, err := httpGetBytes(ctx, newsFeedURL, newsTimeout, map[string]string{
		"Accept":     "application/atom+xml, application/rss+xml, application/xml, text/xml",
		"User-Agent": workbenchUA,
	})
	if err != nil {
		return []NewsBriefingItem{}
	}
	return parseFeedItems(string(body), limit)
}

func parseFeedItems(xmlDoc string, limit int) []NewsBriefingItem {
	if blocks := rssItemRE.FindAllString(xmlDoc, limit); len(blocks) > 0 {
		out := make([]NewsBriefingItem, 0, len(blocks))
		for _, block := range blocks {
			item := NewsBriefingItem{
				Title:       readTag(block, "title"),
				Description: summarize(readTag(block, "description")),
				URL:         readTag(block, "link"),
				Source:      newsFeedSource,
			}
			if item.URL == "" {
				item.URL = readTag(block, "guid")
			}
			if item.Title != "" && item.URL != "" {
				out = append(out, item)
			}
		}
		return out
	}

	blocks := atomEntryRE.FindAllString(xmlDoc, limit)
	out := make([]NewsBriefingItem, 0, len(blocks))
	for _, block := range blocks {
		item := NewsBriefingItem{
			Title:       readTag(block, "title"),
			Description: summarize(firstNonEmpty(readTag(block, "summary"), readTag(block, "content"))),
			URL:         readAtomLink(block),
			Source:      newsFeedSource,
		}
		if item.Title != "" && item.URL != "" {
			out = append(out, item)
		}
	}
	return out
}

func readTag(block, tag string) string {
	// Prefer CDATA then plain text for the named tag.
	for _, m := range tagCDATARE.FindAllStringSubmatch(block, -1) {
		if len(m) >= 4 && strings.EqualFold(m[1], tag) && strings.EqualFold(m[3], tag) {
			return decodeEntities(strings.TrimSpace(m[2]))
		}
	}
	for _, m := range tagPlainRE.FindAllStringSubmatch(block, -1) {
		if len(m) >= 4 && strings.EqualFold(m[1], tag) && strings.EqualFold(m[3], tag) {
			plain := htmlTagRE.ReplaceAllString(m[2], "")
			return decodeEntities(strings.TrimSpace(plain))
		}
	}
	return ""
}

func readAtomLink(block string) string {
	if m := atomLinkAlt.FindStringSubmatch(block); len(m) > 1 {
		return m[1]
	}
	if m := atomLinkAny.FindStringSubmatch(block); len(m) > 1 {
		return m[1]
	}
	return ""
}

func decodeEntities(value string) string {
	return html.UnescapeString(value)
}

func summarize(value string) string {
	compact := strings.Join(strings.Fields(value), " ")
	if len(compact) <= 140 {
		return compact
	}
	trimmed := strings.TrimSpace(compact[:137])
	return trimmed + "..."
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}
