/**
 * Chat assistant markdown → HTML via the local Aura markdown engine
 * (`src/lib/mdtohtml`), with code-block toolbars.
 */

import { createMarkdownEngineApi } from '@/lib/mdtohtml'

/** Titles/labels for chat code-block toolbar (pass from i18n in the UI). */
export interface ChatCodeToolbarI18n {
  copy: string
  download: string
  plain: string
}

/** Shared chat preview engine (GFM + text marks; visual fences enhanced after mount). */
const chatMd = createMarkdownEngineApi({
  sanitize: true,
  // Preview panes are produced by {@link enhanceChatMarkdown} on the live DOM.
  codeBlockPreview: false,
  mathBlockPreview: false,
  toc: false,
})

const ICON_COPY_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`

const ICON_DOWNLOAD_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>`

const LANG_ABBREV: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  jsx: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  typescript: 'TypeScript',
  toml: 'TOML',
  json: 'JSON',
  json5: 'JSON5',
  bash: 'Bash',
  sh: 'Shell',
  zsh: 'Zsh',
  shell: 'Shell',
  py: 'Python',
  python: 'Python',
  rs: 'Rust',
  rust: 'Rust',
  go: 'Go',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  sql: 'SQL',
  html: 'HTML',
  xml: 'XML',
  css: 'CSS',
  scss: 'SCSS',
  vue: 'Vue',
  ini: 'Ini',
  nginx: 'Nginx',
  dockerfile: 'Dockerfile',
}

/** Fence languages rendered as visual previews by the Aura editor runtime. */
const VISUAL_FENCE_LANGUAGES = new Set([
  'abc',
  'echarts',
  'flowchart',
  'graphviz',
  'dot',
  'digraph',
  'lily',
  'lilypond',
  'markmap',
  'mermaid',
  'mindmap',
  'plantuml',
  'puml',
  'smiles',
])

/**
 * Escapes text for HTML body content.
 *
 * @param s - Raw text
 * @returns Escaped string
 */
function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Escapes text for HTML attribute values.
 *
 * @param s - Raw text
 * @returns Escaped string
 */
function escapeAttr(s: string): string {
  return escapeHtml(s).replaceAll("'", '&#39;')
}

/**
 * Produces a short label for the code-block header from a fence language token.
 *
 * @param info - Fence info / language class
 * @param plainLabel - Fallback when language is empty
 * @returns Display label
 */
function formatCodeLangLabel(info: string, plainLabel: string): string {
  const raw = info.trim()
  if (!raw) return plainLabel
  const first = raw.split(/\s+/)[0]?.toLowerCase() ?? ''
  if (!first) return plainLabel
  if (LANG_ABBREV[first]) return LANG_ABBREV[first]!
  if (first.length <= 4) return first.toUpperCase()
  return first.charAt(0).toUpperCase() + first.slice(1)
}

/**
 * Reads the language token from a &lt;code class="language-…"&gt; element.
 *
 * @param code - Code element inside a pre
 * @returns Language id or empty
 */
function codeLanguage(code: Element): string {
  const cls = code.getAttribute('class') ?? ''
  const match = /\blanguage-([^\s]+)/i.exec(cls)
  return match?.[1]?.toLowerCase() ?? ''
}

/**
 * Builds toolbar chrome around a &lt;pre&gt; block.
 *
 * @param preOuterHtml - Serialized &lt;pre&gt;…&lt;/pre&gt;
 * @param langLabel - Language label for the toolbar
 * @param toolbar - Localized toolbar strings
 * @returns Wrapped HTML
 */
function wrapCodeBlockWithToolbar(
  preOuterHtml: string,
  langLabel: string,
  toolbar: ChatCodeToolbarI18n,
): string {
  const copyT = escapeAttr(toolbar.copy)
  const dlT = escapeAttr(toolbar.download)
  return (
    `<div class="chat-code-block">` +
    `<div class="chat-code-block__toolbar">` +
    `<span class="chat-code-block__label">${escapeHtml(langLabel)}</span>` +
    `<div class="chat-code-block__actions">` +
    `<button type="button" class="chat-code-block__btn" data-chat-code-action="copy" title="${copyT}">${ICON_COPY_SVG}</button>` +
    `<button type="button" class="chat-code-block__btn" data-chat-code-action="download" title="${dlT}">${ICON_DOWNLOAD_SVG}</button>` +
    `</div></div>` +
    `<div class="chat-code-block__body">${preOuterHtml.trim()}</div>` +
    `</div>`
  )
}

/**
 * Normalizes common LLM markdown quirks (e.g. `***Label:**` → `**Label:**`).
 *
 * @param content - Raw assistant text
 * @returns Cleaner markdown for the parser
 */
function normalizeAssistantMarkdown(content: string): string {
  return content
    .replace(/\*{3}([^*\n]+?):\*{0,2}/g, '**$1:**')
    .replace(/\*{3}([^*\n]+?)\*{2}/g, '**$1**')
    // via.placeholder.com is often unreachable; rewrite for display tests / old history.
    .replaceAll('via.placeholder.com', 'placehold.co')
}

/**
 * Wraps each top-level &lt;pre&gt; in the rendered HTML with chat code-block chrome.
 *
 * @param html - HTML from {@link createMarkdownEngineApi.markdownToHtml}
 * @param toolbar - Localized copy/download/plain labels
 * @returns HTML with toolbars
 */
function decorateCodeBlocks(html: string, toolbar: ChatCodeToolbarI18n): string {
  const doc = new DOMParser().parseFromString(
    `<div id="chat-md-root">${html}</div>`,
    'text/html',
  )
  const root = doc.getElementById('chat-md-root')
  if (!root) return html

  const pres = Array.from(root.querySelectorAll('pre'))
  for (const pre of pres) {
    if (pre.closest('.chat-code-block')) continue
    const code = pre.querySelector('code')
    const lang = code ? codeLanguage(code) : ''
    // Leave math fences for {@link enhanceChatMarkdown} / KaTeX (no code chrome).
    if (lang === 'math') continue
    if (code && VISUAL_FENCE_LANGUAGES.has(lang)) {
      const preview = document.createElement('div')
      preview.className = `language-${lang}`
      preview.textContent = code.textContent ?? ''
      pre.closest('.aura-wysiwyg__block')?.replaceWith(preview)
      if (pre.isConnected) pre.replaceWith(preview)
      continue
    }
    // SVG needs its source pre as the safe input to the Editor SVG renderer.
    if (lang === 'svg') continue
    const label = formatCodeLangLabel(lang, toolbar.plain)
    const wrapped = wrapCodeBlockWithToolbar(pre.outerHTML, label, toolbar)
    pre.insertAdjacentHTML('beforebegin', wrapped)
    pre.remove()
  }

  return root.innerHTML
}

/**
 * Renders chat assistant markdown to HTML with code-block toolbars.
 *
 * @param content - Raw markdown
 * @param toolbar - Localized copy/download/plain labels
 * @returns HTML for `dangerouslySetInnerHTML`
 */
export function renderChatMarkdown(content: string, toolbar: ChatCodeToolbarI18n): string {
  try {
    const src = normalizeAssistantMarkdown(content)
    const html = chatMd.markdownToHtml(src)
    const safe = chatMd.sanitize(html)
    return decorateCodeBlocks(safe, toolbar)
  } catch {
    return `<p>${escapeHtml(content)}</p>`
  }
}
