const CLIPBOARD_FRAGMENT_BOUNDARY_RE =
    /<!--\s*(?:StartFragment|EndFragment)\s*-->/gi;

const SEMANTIC_CLIPBOARD_HTML_RE =
    /<(?:a|b|blockquote|code|del|em|h[1-6]|hr|i|img|li|math|ol|pre|s|strike|strong|sub|sup|table|tbody|td|tfoot|th|thead|tr|u|ul)\b/i;

/**
 * Normalizes Chromium clipboard HTML before Aura converts it to Markdown.
 * Browser-only fragment markers are removed. Plain wrapper markup falls back
 * to `text/plain`, while genuinely rich structures keep the HTML conversion.
 * @param html - Clipboard `text/html` payload.
 * @param plainText - Clipboard `text/plain` payload.
 * @returns Clean HTML, or an empty string when plain-text handling is safer.
 */
export function normalizeClipboardHtml(html: string, plainText: string): string {
    const normalized = html.replace(CLIPBOARD_FRAGMENT_BOUNDARY_RE, "");
    if (plainText && !SEMANTIC_CLIPBOARD_HTML_RE.test(normalized)) {
        return "";
    }
    return normalized;
}
