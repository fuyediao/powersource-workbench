import { Constants } from '@/lib/mdcore/util/constants'

const HLJS_STYLE_ID = 'auraHljsStyle'

/**
 * Resolve a highlight.js stylesheet href from npm-bundled URLs only.
 *
 * @param codeTheme - highlight.js style id.
 * @returns Stylesheet href (falls back to bundled `github`).
 */
function resolveHljsStyleHref(codeTheme: string): string {
  const urls = (
    window as Window & {
      __AURA_HLJS_STYLE_URLS__?: Record<string, string>
    }
  ).__AURA_HLJS_STYLE_URLS__
  if (urls?.[codeTheme]) {
    return urls[codeTheme]
  }
  if (urls?.github) {
    return urls.github
  }
  return ''
}

/**
 * Swap the global highlight.js theme stylesheet used by WYSIWYG code blocks.
 *
 * @param codeTheme - highlight.js style id (`github`, `github-dark`, …).
 */
export function applyCodeTheme(codeTheme: string): void {
  let theme = codeTheme
  if (!Constants.CODE_THEME.includes(theme)) {
    theme = 'github'
  }
  const href = resolveHljsStyleHref(theme)
  if (!href) {
    return
  }
  const existing = document.getElementById(
    HLJS_STYLE_ID,
  ) as HTMLLinkElement | null
  if (existing?.getAttribute('href') === href) {
    return
  }
  existing?.remove()

  const link = document.createElement('link')
  link.id = HLJS_STYLE_ID
  link.rel = 'stylesheet'
  link.type = 'text/css'
  link.href = href
  document.head.appendChild(link)
}
