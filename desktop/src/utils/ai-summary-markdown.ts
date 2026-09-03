/**
 * Customer AI summary Markdown → sanitized HTML via local Aura `lib/mdtohtml`.
 */

import { createMarkdownEngineApi } from '@/lib/mdtohtml'

/** Preview engine (GFM); fence/math preview panes are not needed for CRM summaries. */
const aiSummaryMd = createMarkdownEngineApi({
  sanitize: true,
  codeBlockPreview: false,
  mathBlockPreview: false,
  toc: false,
})

/**
 * Renders customer AI-summary markdown with {@link createMarkdownEngineApi}
 * and returns sanitized HTML for `dangerouslySetInnerHTML`.
 * @param markdown - Raw markdown from DB or generation.
 * @returns Safe HTML, or empty string when input is blank.
 */
export function sanitizeCustomerAiSummaryHtml(markdown: string): string {
  const src = typeof markdown === 'string' ? markdown.trim() : ''
  if (!src) {
    return ''
  }
  try {
    const raw = aiSummaryMd.markdownToHtml(src)
    return aiSummaryMd.sanitize(raw)
  } catch (err) {
    console.error('[ai-summary-markdown] render:', err)
    return ''
  }
}
