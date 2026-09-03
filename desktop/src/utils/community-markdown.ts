import DOMPurify from 'dompurify'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

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
 * Replace `:::video <url>:::` fences with numbered placeholders.
 *
 * The te editor emits this fence for uploaded videos so the stored
 * Markdown stays portable while still rendering an inline player.
 *
 * @param markdown - Raw post Markdown.
 * @returns Markdown with fences replaced, plus the extracted URLs.
 */
function extractVideoFences(markdown: string): { text: string; videos: string[] } {
  const videos: string[] = []
  const text = markdown.replace(/:::video\s*\n?([^\n:]+)\n?:::/g, (_match, rawUrl: string) => {
    const url = rawUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      return ''
    }
    const index = videos.length
    videos.push(url)
    return `\n\n%%WB_VIDEO_${String(index)}%%\n\n`
  })
  return { text, videos }
}

/**
 * Restore video placeholders to sanitizable `<video>` markup.
 *
 * @param html - HTML from the Markdown pipeline.
 * @param videos - URLs extracted by {@link extractVideoFences}.
 * @returns HTML with video elements.
 */
function restoreVideoPlayers(html: string, videos: string[]): string {
  return html.replace(
    /(?:<p>\s*)?%%WB_VIDEO_(\d+)%%(?:\s*<\/p>)?/g,
    (_match, rawIndex: string) => {
      const url = videos[Number(rawIndex)]
      if (!url) {
        return ''
      }
      const safe = url.replace(/"/g, '%22')
      return `<video controls preload="metadata" src="${safe}"></video>`
    },
  )
}

/**
 * Convert community-post Markdown to HTML with the existing remark stack.
 *
 * @param markdown - Raw Markdown (video fences already extracted).
 * @returns HTML string.
 */
function markdownToHtml(markdown: string): string {
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .processSync(markdown)
  return String(file)
}

/**
 * Render a community post body to safe HTML for display.
 *
 * @param markdown - Raw Markdown from `te_community_posts.body_markdown`.
 * @returns Sanitized HTML string, or empty string when input is blank.
 */
export function renderCommunityPostHtml(markdown: string): string {
  const src = typeof markdown === 'string' ? markdown.trim() : ''
  if (!src) {
    return ''
  }

  try {
    const { text, videos } = extractVideoFences(src)
    const raw = restoreVideoPlayers(markdownToHtml(text), videos)
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
 * @param markdown - Raw Markdown body.
 * @param maxLength - Maximum excerpt length (default 120).
 * @returns Plain-text excerpt.
 */
export function communityPostExcerpt(markdown: string, maxLength = 120): string {
  const text = (typeof markdown === 'string' ? markdown : '')
    .replace(/:::video[\s\S]*?:::/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength).trimEnd()}…`
}
