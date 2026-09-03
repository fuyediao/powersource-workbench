import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/**
 * Markdown renderer for T&E community posts (user-generated content).
 *
 * Posts are authored in a WYSIWYG editor and persisted as Markdown. Rendering is
 * the only place Markdown becomes HTML, so it runs with `html: false` and a tight
 * DOMPurify allowlist that permits images and videos but nothing executable.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

/** DOMPurify allowlist for community post bodies (text + image/video media). */
const COMMUNITY_POST_PURIFY: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'blockquote',
    'code',
    'pre',
    'a',
    'img',
    'video',
    'source',
    'hr',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'title', 'src', 'alt', 'controls', 'preload', 'type'],
}

/**
 * Replace `:::video <url>:::` fences with sanitizable `<video>` markup.
 *
 * The te editor emits this fence for uploaded videos so the stored
 * Markdown stays portable while still rendering an inline player.
 *
 * @param markdown - Raw post Markdown
 * @returns Markdown with video fences expanded to HTML-ish tags
 */
function expandVideoFences(markdown: string): string {
  return markdown.replace(
    /:::video\s*\n?([^\n:]+)\n?:::/g,
    (_match, rawUrl: string) => {
      const url = rawUrl.trim()
      if (!/^https?:\/\//i.test(url)) return ''
      const safe = url.replace(/"/g, '%22')
      return `\n\n<video controls preload="metadata" src="${safe}"></video>\n\n`
    },
  )
}

/**
 * Render a community post body to safe HTML for display.
 *
 * @param markdown - Raw Markdown from `te_community_posts.body_markdown`
 * @returns Sanitized HTML string, or empty string when input is blank
 */
export function renderCommunityPostHtml(markdown: string): string {
  const src = typeof markdown === 'string' ? markdown.trim() : ''
  if (!src) return ''

  try {
    // Enable html only for the controlled `<video>` we inject, then sanitize.
    const renderer = new MarkdownIt({ html: true, linkify: true, breaks: true })
    const raw = renderer.render(expandVideoFences(src))
    return DOMPurify.sanitize(raw, COMMUNITY_POST_PURIFY)
  } catch {
    const escaped = src
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    return `<p>${escaped}</p>`
  }
}

/**
 * Render a short, single-line plain-text excerpt from Markdown for list rows.
 *
 * @param markdown - Raw Markdown body
 * @param maxLength - Maximum excerpt length (default 120)
 * @returns Plain-text excerpt
 */
export function communityPostExcerpt(markdown: string, maxLength = 120): string {
  const text = (typeof markdown === 'string' ? markdown : '')
    .replace(/:::video[\s\S]*?:::/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}

export default md
