package model

// InlineImage is a base64-encoded image attached to a single user turn.
type InlineImage struct {
	// MIMEType is a browser image MIME type (image/jpeg, image/png, image/webp).
	MIMEType string
	// Base64 is raw standard-encoding payload without a data: prefix.
	Base64 string
}

// geminiUserParts builds Gemini generateContent parts (text plus optional inline images).
func geminiUserParts(text string, images []InlineImage) []map[string]any {
	parts := []map[string]any{{"text": text}}
	for _, img := range images {
		if img.Base64 == "" || img.MIMEType == "" {
			continue
		}
		parts = append(parts, map[string]any{
			"inline_data": map[string]any{
				"mime_type": img.MIMEType,
				"data":      img.Base64,
			},
		})
	}
	return parts
}

// openaiUserContent is a Chat Completions user content value (string or multimodal parts).
func openaiUserContent(text string, images []InlineImage) any {
	if !hasInlineImage(images) {
		return text
	}
	parts := []map[string]any{{"type": "text", "text": text}}
	for _, img := range images {
		if img.Base64 == "" || img.MIMEType == "" {
			continue
		}
		parts = append(parts, map[string]any{
			"type": "image_url",
			"image_url": map[string]any{
				"url": "data:" + img.MIMEType + ";base64," + img.Base64,
			},
		})
	}
	return parts
}

// anthropicUserContent is an Anthropic Messages user content value (string or blocks).
func anthropicUserContent(text string, images []InlineImage) any {
	if !hasInlineImage(images) {
		return text
	}
	parts := make([]map[string]any, 0, 1+len(images))
	for _, img := range images {
		if img.Base64 == "" || img.MIMEType == "" {
			continue
		}
		parts = append(parts, map[string]any{
			"type": "image",
			"source": map[string]any{
				"type":       "base64",
				"media_type": img.MIMEType,
				"data":       img.Base64,
			},
		})
	}
	parts = append(parts, map[string]any{"type": "text", "text": text})
	return parts
}

func hasInlineImage(images []InlineImage) bool {
	for _, img := range images {
		if img.Base64 != "" && img.MIMEType != "" {
			return true
		}
	}
	return false
}
