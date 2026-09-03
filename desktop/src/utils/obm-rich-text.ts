/**
 * Markdown → safe HTML for OBM storefront rich text (view mode).
 * Uses remark/rehype (already in the package) plus a DOM allowlist strip.
 */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'

/** Tags allowed in OBM / customer AI-summary HTML (web DOMPurify parity). */
const ALLOWED_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'BR',
  'STRONG',
  'B',
  'EM',
  'I',
  'U',
  'SMALL',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'CODE',
  'A',
  'SPAN',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
  'HR',
])

/** Attributes allowed on sanitized nodes. */
const ALLOWED_ATTR = new Set(['href', 'target', 'rel', 'title', 'class'])

/**
 * Strips disallowed tags/attrs from an HTML fragment via DOMParser.
 * @param html - Raw HTML from markdown render.
 * @returns Sanitized HTML string.
 */
function sanitizeHtmlFragment(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return ''
  }
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) {
    return ''
  }

  /**
   * Walks the tree and removes / unwraps unsafe nodes.
   * @param node - Current node.
   */
  function walk(node: Node): void {
    const children = Array.from(node.childNodes)
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        if (!ALLOWED_TAGS.has(el.tagName)) {
          while (el.firstChild) {
            node.insertBefore(el.firstChild, el)
          }
          node.removeChild(el)
          continue
        }
        for (const attr of Array.from(el.attributes)) {
          if (!ALLOWED_ATTR.has(attr.name.toLowerCase())) {
            el.removeAttribute(attr.name)
          }
        }
        if (el.tagName === 'A') {
          const href = el.getAttribute('href') ?? ''
          if (!/^(https?:|mailto:|#)/i.test(href)) {
            el.removeAttribute('href')
          }
          el.setAttribute('rel', 'noopener noreferrer')
          if (!el.getAttribute('target')) {
            el.setAttribute('target', '_blank')
          }
        }
        walk(el)
      } else if (child.nodeType === Node.COMMENT_NODE) {
        node.removeChild(child)
      }
    }
  }

  walk(root)
  return root.innerHTML
}

/**
 * Renders OBM storefront rich text (Markdown + limited HTML) for safe
 * `dangerouslySetInnerHTML`. Allowlist matches web `sanitizeObmRichTextHtml`.
 * @param markdown - Raw features / warnings / intro from the catalog row.
 * @returns Safe HTML string, or empty string when input is empty.
 */
export function sanitizeObmRichTextHtml(markdown: string): string {
  const src = typeof markdown === 'string' ? markdown.trim() : ''
  if (!src) {
    return ''
  }
  try {
    const file = unified()
      .use(remarkParse)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(src)
    return sanitizeHtmlFragment(String(file))
  } catch {
    const escaped = src
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return sanitizeHtmlFragment(`<p>${escaped}</p>`)
  }
}
