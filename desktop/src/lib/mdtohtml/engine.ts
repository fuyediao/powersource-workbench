import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkFrontmatter from 'remark-frontmatter'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import rehypeParse from 'rehype-parse'
import rehypeRemark from 'rehype-remark'
import type { Root } from 'mdast'
import { AuraRenderer } from './aura-render'
import {
  normalizeAuraDom,
  restoreTextMarks,
  FOOTNOTE_REF_TOKEN_RE,
  FOOTNOTE_DEFS_TOKEN_RE,
  LINK_REF_DEFS_TOKEN_RE,
  YAML_FRONT_MATTER_TOKEN_RE,
  DETAILS_TOKEN_RE,
  type FootnoteDef,
  type DetailsBlock,
} from './normalize'
import { CARET, FRONT_END_CARET } from './constants'
import { DEFAULT_ENGINE_OPTIONS, type MarkdownEngineOptions } from './options'
import { remarkTextMarks } from './extensions/text-marks'
import { remarkCallouts } from './extensions/callouts'
import { remarkDetails } from './extensions/details'
import { remarkEmojiShortcodes } from './extensions/emoji'
import { remarkHeadingIds } from './extensions/heading-ids'
import { remarkUnicodeEscapes } from './extensions/unicode-escapes'
import { sanitizeHtml } from './sanitize'

/**
 * Escape text for safe insertion into HTML element content.
 *
 * @param value - Raw text.
 * @returns Escaped text.
 */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * mdast-util-to-hast state (subset) used by the custom text-mark handlers.
 */
interface HastState {
  all(node: unknown): unknown[]
  patch(from: unknown, to: unknown): void
  applyData(from: unknown, to: unknown): unknown
}

/**
 * Build a remark-rehype handler that maps a custom text-mark node to an
 * HTML element with the same tag name.
 *
 * @param tagName - Target HTML tag (`mark` / `sup` / `sub`).
 * @returns Handler compatible with remark-rehype.
 */
function textMarkHandler(tagName: string) {
  return (state: HastState, node: unknown) => {
    const result = {
      type: 'element',
      tagName,
      properties: {},
      children: state.all(node),
    }
    state.patch(node, result)
    return state.applyData(node, result)
  }
}

/**
 * Build a remark-rehype handler that maps a custom text-mark node to an HTML
 * element with extra properties (e.g. `data-type` for spoiler / Critic).
 *
 * @param tagName - Target HTML tag.
 * @param properties - Extra hast properties.
 * @returns Handler compatible with remark-rehype.
 */
function textMarkElementHandler(
  tagName: string,
  properties: Record<string, unknown>,
) {
  return (state: HastState, node: unknown) => {
    const result = {
      type: 'element',
      tagName,
      properties: { ...properties },
      children: state.all(node),
    }
    state.patch(node, result)
    return state.applyData(node, result)
  }
}

/** hast handlers mapping custom mdast nodes to HTML elements. */
const TEXT_MARK_HANDLERS = {
  mark: textMarkHandler('mark'),
  sup: textMarkHandler('sup'),
  sub: textMarkHandler('sub'),
  spoiler: textMarkElementHandler('span', { dataType: 'spoiler' }),
  criticAddition: textMarkElementHandler('ins', {
    dataType: 'critic-addition',
  }),
  criticDeletion: textMarkElementHandler('del', {
    dataType: 'critic-deletion',
  }),
  criticHighlight: textMarkElementHandler('mark', {
    dataType: 'critic-highlight',
  }),
  criticComment: textMarkElementHandler('span', {
    dataType: 'critic-comment',
  }),
  details(state: HastState, node: unknown) {
    const details = node as {
      open?: boolean
      summary?: string
      children?: unknown[]
    }
    const summaryText =
      typeof details.summary === 'string' ? details.summary : ''
    const result = {
      type: 'element',
      tagName: 'details',
      properties: details.open ? { open: true } : {},
      children: [
        {
          type: 'element',
          tagName: 'summary',
          properties: {},
          children: [{ type: 'text', value: summaryText }],
        },
        ...state.all(node),
      ],
    }
    state.patch(node, result)
    return state.applyData(node, result)
  },
} as unknown as Record<string, never>

/**
 * Collect plain text from a hast subtree (used when serializing semantic tags).
 *
 * @param node - hast node.
 * @returns Concatenated text content.
 */
function hastText(node: unknown): string {
  if (!node || typeof node !== 'object') {
    return ''
  }
  const record = node as { type?: string; value?: string; children?: unknown[] }
  if (record.type === 'text' && typeof record.value === 'string') {
    return record.value
  }
  if (!Array.isArray(record.children)) {
    return ''
  }
  return record.children.map(hastText).join('')
}

/**
 * Tags that may nest inside semantic HTML when serializing back to Markdown
 * (e.g. `<ruby><rt>…</rt></ruby>`).
 */
const NESTABLE_SEMANTIC_TAGS = new Set([
  'kbd',
  'samp',
  'var',
  'span',
  'abbr',
  'ruby',
  'rt',
  'rp',
  'audio',
  'video',
  'source',
  'sup',
  'sub',
  'mark',
  'u',
  'b',
  'i',
  'em',
  'strong',
  's',
  'del',
  'ins',
  'small',
  'cite',
  'q',
  'br',
])

/**
 * Serialize a hast child for semantic HTML round-trip (preserves nestable tags).
 *
 * @param child - hast node.
 * @returns HTML fragment.
 */
function serializeHastChild(child: unknown): string {
  if (!child || typeof child !== 'object') {
    return ''
  }
  const record = child as {
    type?: string
    value?: string
    tagName?: string
    properties?: Record<string, unknown>
    children?: unknown[]
  }
  if (record.type === 'text' && typeof record.value === 'string') {
    return escapeText(record.value)
  }
  if (
    record.type === 'element' &&
    typeof record.tagName === 'string' &&
    NESTABLE_SEMANTIC_TAGS.has(record.tagName.toLowerCase())
  ) {
    return serializeSemanticElement(record.tagName.toLowerCase(), child)
  }
  return escapeText(hastText(child))
}

/**
 * Serialize an allowlisted hast element (and nestable descendants) to HTML.
 *
 * @param tagName - Element tag.
 * @param node - hast element node.
 * @returns HTML string.
 */
function serializeSemanticElement(tagName: string, node: unknown): string {
  const record = node as {
    properties?: Record<string, unknown>
    children?: unknown[]
  }
  const attrs = serializeHastAttrs(tagName, record.properties ?? {})
  if (tagName === 'br' || tagName === 'source') {
    return `<${tagName}${attrs} />`
  }
  const inner = (record.children ?? []).map(serializeHastChild).join('')
  return `<${tagName}${attrs}>${inner}</${tagName}>`
}

/**
 * Keep semantic phrasing tags as raw HTML in Markdown instead of demoting
 * them to inline code (rehype-remark's default for unknown elements).
 *
 * @param tagName - HTML tag to preserve.
 * @returns Handler compatible with rehype-remark.
 */
function semanticHtmlHandler(tagName: string) {
  return (_state: unknown, node: unknown) => {
    return {
      type: 'html',
      value: serializeSemanticElement(tagName, node),
    }
  }
}

/**
 * Serialize allowlisted hast properties back to an HTML attribute string.
 *
 * @param tagName - Element tag.
 * @param properties - hast properties object.
 * @returns Attribute string including a leading space when non-empty.
 */
function serializeHastAttrs(
  tagName: string,
  properties: Record<string, unknown>,
): string {
  const allowed =
    tagName === 'span'
      ? new Set(['style', 'class', 'title'])
      : tagName === 'abbr'
        ? new Set(['title', 'class'])
        : tagName === 'audio'
          ? new Set([
              'src',
              'controls',
              'autoplay',
              'loop',
              'muted',
              'preload',
              'title',
              'class',
            ])
          : tagName === 'video'
            ? new Set([
                'src',
                'controls',
                'width',
                'height',
                'autoplay',
                'loop',
                'muted',
                'preload',
                'poster',
                'title',
                'class',
              ])
            : tagName === 'source'
              ? new Set(['src', 'type', 'media'])
              : tagName === 'ruby' || tagName === 'rt'
                ? new Set(['class', 'title', 'lang'])
                : tagName === 'rp'
                  ? new Set(['class', 'title'])
                  : new Set<string>()
  const parts: string[] = []
  for (const [rawName, rawValue] of Object.entries(properties)) {
    if (rawValue == null || rawValue === false) {
      continue
    }
    const name = rawName === 'className' ? 'class' : rawName
    if (!allowed.has(name) || typeof rawValue === 'object') {
      continue
    }
    if (rawValue === true || rawValue === '') {
      parts.push(name)
      continue
    }
    const value = String(rawValue)
    if (name === 'style') {
      // Keep author styles that survived the forward sanitizer.
      parts.push(`style="${escapeText(value).replace(/"/g, '&quot;')}"`)
      continue
    }
    parts.push(`${name}="${escapeText(value).replace(/"/g, '&quot;')}"`)
  }
  return parts.length > 0 ? ` ${parts.join(' ')}` : ''
}

/** rehype-remark handlers that preserve semantic / styled phrasing tags. */
const SEMANTIC_HTML_HANDLERS = {
  kbd: semanticHtmlHandler('kbd'),
  samp: semanticHtmlHandler('samp'),
  var: semanticHtmlHandler('var'),
  span: semanticHtmlHandler('span'),
  abbr: semanticHtmlHandler('abbr'),
  audio: semanticHtmlHandler('audio'),
  video: semanticHtmlHandler('video'),
  source: semanticHtmlHandler('source'),
  ruby: semanticHtmlHandler('ruby'),
  rt: semanticHtmlHandler('rt'),
  rp: semanticHtmlHandler('rp'),
} as unknown as Record<string, never>

/**
 * TypeScript Markdown engine implemented on top of the unified / remark /
 * rehype ecosystem. Reproduces the Aura DOM conversion surface that
 * `src/core` calls on `aura.markdown.*`.
 *
 * Pipeline:
 * - `markdownToAuraDom` = remark-parse → AuraRenderer
 * - `auraDomToMarkdown` = normalize → rehype-parse → rehype-remark → stringify
 * - `spinAuraDom` = auraDomToMarkdown → markdownToAuraDom (with caret preservation)
 */
export class AuraMarkdownEngine {
  private options: MarkdownEngineOptions

  private readonly mdParser = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkHeadingIds)
    .use(remarkTextMarks, () => ({
      mark: this.options.mark,
      sup: this.options.sup,
      sub: this.options.sub,
      spoiler: this.options.spoiler,
      critic: this.options.critic,
    }))
    .use(remarkCallouts, () => this.options.callout)
    .use(remarkDetails)
    .use(remarkUnicodeEscapes)
    .use(remarkEmojiShortcodes, () => this.options.emojis)

  private readonly mdToHtml = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkHeadingIds)
    .use(remarkTextMarks, () => ({
      mark: this.options.mark,
      sup: this.options.sup,
      sub: this.options.sub,
      spoiler: this.options.spoiler,
      critic: this.options.critic,
    }))
    .use(remarkCallouts, () => this.options.callout)
    .use(remarkDetails)
    .use(remarkUnicodeEscapes)
    .use(remarkEmojiShortcodes, () => this.options.emojis)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      handlers: TEXT_MARK_HANDLERS,
    })
    .use(rehypeStringify, { allowDangerousHtml: true })

  private readonly htmlToMd = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark, { handlers: SEMANTIC_HTML_HANDLERS })
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: '-',
      emphasis: '*',
      strong: '*',
      fences: true,
      listItemIndent: 'one',
    })

  /**
   * @param options - Engine option overrides.
   */
  constructor(options: Partial<MarkdownEngineOptions> = {}) {
    this.options = { ...DEFAULT_ENGINE_OPTIONS, ...options }
  }

  /**
   * Replace engine option flags.
   *
   * @param options - Option overrides.
   */
  setOptions(options: Partial<MarkdownEngineOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * Parse Markdown into an mdast tree.
   *
   * @param markdown - Markdown source.
   * @returns mdast root.
   */
  private parse(markdown: string): Root {
    const tree = this.mdParser.parse(markdown)
    // `.parse()` skips the transform phase; run it so custom mdast transforms
    // (text marks, callouts) apply before rendering.
    return this.mdParser.runSync(tree) as Root
  }

  /**
   * Convert Markdown to Aura WYSIWYG DOM.
   *
   * @param markdown - Markdown source.
   * @returns Aura DOM HTML.
   */
  markdownToAuraDom(markdown: string): string {
    const tree = this.parse(markdown)
    return new AuraRenderer(this.options).render(tree)
  }

  /**
   * Slice source Markdown into one verbatim string per rendered top-level
   * block, mirroring how {@link AuraRenderer.render} groups children (a run of
   * consecutive footnote definitions collapses into a single block). Each slice
   * includes the block content plus the whitespace up to the next block, so
   * concatenating the slices reproduces the original source exactly.
   *
   * @param markdown - Markdown source.
   * @returns Verbatim source slices aligned 1:1 with rendered top-level blocks.
   */
  topBlockSourceSlices(markdown: string): string[] {
    // Run the full transform pipeline so regrouped nodes (details, etc.) match
    // the top-level blocks emitted by markdownToAuraDom.
    const tree = this.parse(markdown)
    const children = tree.children
    const starts: number[] = []
    let i = 0
    while (i < children.length) {
      const child = children[i]
      if (child.type === 'footnoteDefinition') {
        const runStart = child.position?.start.offset ?? 0
        while (
          i < children.length &&
          children[i].type === 'footnoteDefinition'
        ) {
          i += 1
        }
        // A run of definitions renders as one footnotes block only when enabled.
        if (this.options.footnotes) {
          starts.push(runStart)
        }
        continue
      }
      if (child.type === 'definition') {
        const runStart = child.position?.start.offset ?? 0
        while (i < children.length && children[i].type === 'definition') {
          i += 1
        }
        starts.push(runStart)
        continue
      }
      starts.push(child.position?.start.offset ?? 0)
      i += 1
    }
    if (starts.length === 0) {
      return []
    }
    // Absorb any leading whitespace / front matter into the first block.
    starts[0] = 0
    const slices: string[] = []
    for (let k = 0; k < starts.length; k += 1) {
      const end = k + 1 < starts.length ? starts[k + 1] : markdown.length
      slices.push(markdown.slice(starts[k], end))
    }
    return slices
  }

  /**
   * Convert Aura WYSIWYG DOM back to Markdown.
   *
   * @param auraHtml - Aura DOM HTML.
   * @returns Markdown source.
   */
  auraDomToMarkdown(auraHtml: string): string {
    const {
      html,
      refLabels,
      footnoteDefBlocks,
      linkRefDefBlocks,
      yamlFrontMatterBlocks,
      detailsBlocks,
    } = normalizeAuraDom(auraHtml)
    let markdown = restoreTextMarks(String(this.htmlToMd.processSync(html)))
    // Restore footnote references from placeholder tokens.
    markdown = markdown.replace(FOOTNOTE_REF_TOKEN_RE, (_match, index) => {
      const label = refLabels[Number(index)]
      return label != null ? `[^${label}]` : ''
    })
    // Restore definition groups at their original source positions.
    markdown = markdown.replace(FOOTNOTE_DEFS_TOKEN_RE, (_match, index) => {
      return this.renderFootnoteDefs(footnoteDefBlocks[Number(index)] ?? [])
    })
    markdown = markdown.replace(LINK_REF_DEFS_TOKEN_RE, (_match, index) => {
      const block = linkRefDefBlocks[Number(index)] ?? ''
      return block ? `${block}\n\n` : ''
    })
    markdown = markdown.replace(YAML_FRONT_MATTER_TOKEN_RE, (_match, index) => {
      const source = yamlFrontMatterBlocks[Number(index)] ?? ''
      return `---\n${source.replace(/\n+$/, '')}\n---\n\n`
    })
    markdown = this.restoreDetailsTokens(markdown, detailsBlocks)
    return markdown
  }

  /**
   * Replace details placeholders with `<details>` Markdown/HTML wrappers.
   * Nested placeholders inside a body are expanded recursively.
   *
   * @param markdown - Markdown that may contain details tokens.
   * @param blocks - Extracted details blocks keyed by token index.
   * @returns Markdown with details restored.
   */
  private restoreDetailsTokens(
    markdown: string,
    blocks: DetailsBlock[],
  ): string {
    return markdown.replace(DETAILS_TOKEN_RE, (_match, index) => {
      return this.renderDetailsBlock(blocks[Number(index)], blocks)
    })
  }

  /**
   * Serialize one details block back to Markdown-friendly HTML wrappers.
   *
   * @param block - Extracted details payload.
   * @param blocks - All extracted blocks (for nested token expansion).
   * @returns `<details>`…`</details>` source fragment.
   */
  private renderDetailsBlock(
    block: DetailsBlock | undefined,
    blocks: DetailsBlock[],
  ): string {
    if (!block) {
      return ''
    }
    const openAttr = block.open ? ' open' : ''
    let bodyMd = restoreTextMarks(
      String(this.htmlToMd.processSync(block.bodyHtml)),
    ).trim()
    bodyMd = this.restoreDetailsTokens(bodyMd, blocks)
    const summary = block.summary
    const body = bodyMd ? `\n\n${bodyMd}\n\n` : '\n'
    return `<details${openAttr}>\n<summary>${summary}</summary>${body}</details>\n\n`
  }

  /**
   * Serialize extracted footnote definitions back to Markdown.
   *
   * @param defs - Footnote definitions in document order.
   * @returns Markdown definition list, or empty string when none.
   */
  private renderFootnoteDefs(defs: FootnoteDef[]): string {
    return defs
      .map((def) => {
        const body = restoreTextMarks(
          String(this.htmlToMd.processSync(def.html)),
        ).trim()
        const lines = body.split('\n')
        const first = lines.shift() ?? ''
        const rest = lines
          .map((line) => (line.trim() === '' ? '' : `    ${line}`))
          .join('\n')
        return `[^${def.label}]: ${first}${rest ? `\n${rest}` : ''}`
      })
      .join('\n\n')
  }

  /**
   * Convert Markdown to standard preview HTML.
   *
   * @param markdown - Markdown source.
   * @returns HTML string.
   */
  markdownToHtml(markdown: string): string {
    const file = this.mdToHtml.processSync(markdown)
    return String(file)
  }

  /**
   * Convert Aura DOM to standard HTML (via Markdown).
   *
   * @param auraHtml - Aura DOM HTML.
   * @returns HTML string.
   */
  auraDomToHtml(auraHtml: string): string {
    return this.markdownToHtml(this.auraDomToMarkdown(auraHtml))
  }

  /**
   * Re-spin Aura DOM after an edit (serialize → parse → render), preserving
   * the caret by mapping `<wbr>` ↔ internal caret token across the round-trip.
   *
   * @param auraHtml - Aura DOM fragment being edited.
   * @returns Re-rendered Aura DOM HTML.
   */
  spinAuraDom(auraHtml: string): string {
    // ToC spin: outline builder feeds "<p>[ToC]</p>" + heading DOM.
    if (this.options.toc && /\[ToC\]/i.test(auraHtml)) {
      return this.buildTableOfContents(auraHtml)
    }
    const withCaret = auraHtml.split(FRONT_END_CARET).join(CARET)
    const markdown = this.auraDomToMarkdown(withCaret)
    const rendered = this.markdownToAuraDom(markdown)
    return rendered.split(CARET).join(FRONT_END_CARET)
  }

  /**
   * Build a nested table-of-contents `<ul>` from heading elements in the
   * given Aura DOM. Emits `li > span[data-target-id]` entries matching the
   * structure `outlineRender` post-processes.
   *
   * @param auraHtml - Aura DOM containing headings (and a `[ToC]` marker).
   * @returns Table-of-contents HTML wrapped in a single `<ul>`.
   */
  buildTableOfContents(auraHtml: string): string {
    const doc = new DOMParser().parseFromString(
      `<div id="aura-toc-root">${auraHtml}</div>`,
      'text/html',
    )
    const root = doc.getElementById('aura-toc-root')
    if (!root) {
      return '<ul></ul>'
    }
    const headings = Array.from(
      root.querySelectorAll('h1, h2, h3, h4, h5, h6'),
    ).map((el) => ({
      level: Number(el.tagName.slice(1)),
      text: (el.textContent ?? '').replace(new RegExp(FRONT_END_CARET, 'g'), '').trim(),
    }))
    if (headings.length === 0) {
      return '<ul></ul>'
    }

    let html = '<ul>'
    let prevLevel = headings[0].level
    let open = 0
    headings.forEach((heading, index) => {
      if (index > 0) {
        if (heading.level > prevLevel) {
          html += '<ul>'
          open += 1
        } else if (heading.level < prevLevel) {
          while (open > 0 && heading.level < prevLevel) {
            html += '</li></ul>'
            open -= 1
            prevLevel -= 1
          }
          html += '</li>'
        } else {
          html += '</li>'
        }
      }
      html += `<li><span data-target-id="">${escapeText(heading.text)}</span>`
      prevLevel = heading.level
    })
    html += '</li>'
    while (open > 0) {
      html += '</ul></li>'
      open -= 1
    }
    html += '</ul>'
    return html
  }

  /**
   * Sanitize an HTML fragment.
   *
   * @param html - Untrusted HTML.
   * @returns Sanitized HTML.
   */
  sanitize(html: string): string {
    return sanitizeHtml(html)
  }

  /**
   * Convert arbitrary HTML (e.g. pasted) to Markdown.
   *
   * @param html - HTML source.
   * @returns Markdown source.
   */
  htmlToMarkdown(html: string): string {
    const file = this.htmlToMd.processSync(html)
    return String(file)
  }

  /**
   * Convert arbitrary HTML (e.g. pasted) to Aura DOM.
   *
   * @param html - HTML source.
   * @returns Aura DOM HTML.
   */
  htmlToAuraDom(html: string): string {
    return this.markdownToAuraDom(this.htmlToMarkdown(html))
  }

  /**
   * Whether a string is a usable link destination.
   *
   * @param link - Candidate URL.
   * @returns True when non-empty and not obviously invalid.
   */
  isValidLinkDest(link: string): boolean {
    const trimmed = link.trim()
    if (!trimmed) {
      return false
    }
    return !/\s/.test(trimmed) || /^<.+>$/.test(trimmed)
  }

  /**
   * Emoji alias → unicode/image map.
   *
   * @returns Configured emoji map.
   */
  getEmojis(): Record<string, string> {
    return this.options.emojis
  }
}

/**
 * Create a configured Aura Markdown engine.
 *
 * @param options - Engine option overrides.
 * @returns Engine instance.
 */
export function createMarkdownEngine(
  options: Partial<MarkdownEngineOptions> = {},
): AuraMarkdownEngine {
  return new AuraMarkdownEngine(options)
}
