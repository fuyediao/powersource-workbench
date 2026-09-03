import { escapeHtml } from '@/utils/mail/parse-mail-recipients'

const QUOTE_ATTR = 'data-mail-quoted'

/**
 * Wraps a previous message as collapsible quoted HTML for reply/forward.
 * @param html - Sanitized original HTML.
 * @param text - Fallback plain text.
 * @param cite - Citation line (From / date).
 * @returns HTML fragment.
 */
export function wrapQuotedMailHtml(html: string, text: string, cite: string): string {
  const inner = html.trim() || `<pre>${escapeHtml(text)}</pre>`
  return `<div ${QUOTE_ATTR}="hidden" class="mail-quoted"><p class="mail-quoted-cite">${escapeHtml(cite)}</p><blockquote>${inner}</blockquote></div>`
}

/**
 * Whether compose HTML still contains a quoted block.
 * @param html - Composer HTML.
 * @returns True when a quote wrapper exists.
 */
export function composeHasQuotedText(html: string): boolean {
  return html.includes(QUOTE_ATTR)
}

/**
 * Removes quoted blocks from compose HTML.
 * @param html - Composer HTML.
 * @returns HTML without quotes.
 */
export function removeQuotedMailHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  doc.querySelectorAll(`[${QUOTE_ATTR}]`).forEach((node) => node.remove())
  return doc.getElementById('root')?.innerHTML ?? html
}
