import type { Root, RootContent, PhrasingContent } from 'mdast'
import { calloutIconSvgHtml } from '@/icons/AllIcons'
import { CARET, FRONT_END_CARET, ZWSP } from './constants'
import type { DetailsNode } from './extensions/details'
import { getCustomHeadingId } from './extensions/heading-ids'
import type { MarkdownEngineOptions } from './options'
import { isRenderedCodeLanguage } from './rendered-code-languages'

/**
 * Escape HTML special characters for text nodes / attribute values.
 *
 * @param value - Raw text.
 * @returns Escaped text safe for HTML output.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Display label for a GFM alert / callout subtype (Typora / GitHub style).
 *
 * @param type - Uppercase subtype such as `NOTE`.
 * @returns Title text shown above the callout body.
 */
function calloutTitleLabel(type: string): string {
  const key = type.toUpperCase()
  switch (key) {
    case 'NOTE':
      return 'Note'
    case 'TIP':
      return 'Tip'
    case 'IMPORTANT':
      return 'Important'
    case 'WARNING':
      return 'Warning'
    case 'CAUTION':
      return 'Caution'
    default:
      return key.charAt(0) + key.slice(1).toLowerCase()
  }
}

/** Phrasing HTML tags that may pass through Markdown as raw HTML. */
const SAFE_PHRASING_HTML_TAGS = new Set([
  'kbd',
  'samp',
  'var',
  'sup',
  'sub',
  'span',
  'mark',
  'abbr',
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
  // Ruby annotation (CommonMark inline HTML).
  'ruby',
  'rt',
  'rp',
  // Media embeds (CommonMark treats these as inline HTML, not HTML blocks).
  'audio',
  'video',
  'source',
])

/** Void phrasing tags written without a closing pair. */
const VOID_PHRASING_HTML_TAGS = new Set(['br', 'source'])

/** Attributes allowed on allowlisted phrasing tags. */
const SAFE_PHRASING_ATTRS: Record<string, ReadonlySet<string>> = {
  span: new Set(['style', 'class', 'title']),
  abbr: new Set(['title', 'class']),
  mark: new Set(['class', 'title']),
  q: new Set(['cite', 'title', 'class']),
  cite: new Set(['title', 'class']),
  br: new Set(['class']),
  audio: new Set([
    'src',
    'controls',
    'autoplay',
    'loop',
    'muted',
    'preload',
    'title',
    'class',
  ]),
  video: new Set([
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
  ]),
  source: new Set(['src', 'type', 'media']),
  ruby: new Set(['class', 'title', 'lang']),
  rt: new Set(['class', 'title', 'lang']),
  rp: new Set(['class', 'title']),
}

/** Attributes whose values must not use dangerous URL schemes. */
const URL_BEARING_ATTRS = new Set(['src', 'poster', 'cite', 'href'])

/** Reject attribute values that can execute script. */
const DANGEROUS_URL_RE = /^\s*(javascript|vbscript|data):/i

/** CSS declarations permitted inside a `style` attribute. */
const SAFE_STYLE_PROPS = new Set([
  'color',
  'background',
  'background-color',
  'font-weight',
  'font-style',
  'font-size',
  'text-decoration',
  'opacity',
])

/** Reject style values that can execute script or load external resources. */
const DANGEROUS_STYLE_RE =
  /url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding/i

/**
 * Sanitize a CSS `style` attribute down to allowlisted declarations.
 *
 * @param style - Raw style attribute value.
 * @returns Sanitized style string, or empty when nothing safe remains.
 */
function sanitizeInlineStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const colon = part.indexOf(':')
      if (colon <= 0) {
        return []
      }
      const prop = part.slice(0, colon).trim().toLowerCase()
      const value = part.slice(colon + 1).trim()
      if (!SAFE_STYLE_PROPS.has(prop) || DANGEROUS_STYLE_RE.test(value)) {
        return []
      }
      return [`${prop}: ${value}`]
    })
    .join('; ')
}

/**
 * Escape an attribute value for a double-quoted HTML attribute.
 *
 * @param value - Raw attribute value.
 * @returns Escaped value.
 */
function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

/**
 * Parse HTML attributes from an open-tag attribute string.
 *
 * @param raw - Attribute text between the tag name and `>` / `/>`.
 * @returns Attribute name ??value map (boolean attrs map to empty string).
 */
function parseHtmlAttributes(raw: string): Map<string, string> {
  const attrs = new Map<string, string>()
  const re =
    /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw)) !== null) {
    const name = match[1].toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attrs.set(name, value)
  }
  return attrs
}

/**
 * Rebuild a safe open tag from an allowlisted tag name and attributes.
 *
 * @param tag - Lowercase tag name.
 * @param attrs - Parsed attributes.
 * @param selfClosing - Whether to emit a void / self-closing tag.
 * @returns Safe open tag HTML, or null when the tag is not allowlisted.
 */
function buildSafeOpenTag(
  tag: string,
  attrs: Map<string, string>,
  selfClosing: boolean,
): string | null {
  if (!SAFE_PHRASING_HTML_TAGS.has(tag)) {
    return null
  }
  const allowed = SAFE_PHRASING_ATTRS[tag] ?? new Set<string>()
  const parts: string[] = [tag]
  for (const [name, value] of attrs) {
    if (!allowed.has(name) || name.startsWith('on')) {
      continue
    }
    if (URL_BEARING_ATTRS.has(name) && DANGEROUS_URL_RE.test(value)) {
      continue
    }
    if (name === 'style') {
      const style = sanitizeInlineStyle(value)
      if (style) {
        parts.push(`style="${escapeAttr(style)}"`)
      }
      continue
    }
    // Boolean media attrs (`controls`, `autoplay`, ?? often have no value.
    if (value === '' && (tag === 'audio' || tag === 'video')) {
      parts.push(name)
      continue
    }
    parts.push(`${name}="${escapeAttr(value)}"`)
  }
  if (selfClosing || VOID_PHRASING_HTML_TAGS.has(tag)) {
    return `<${parts.join(' ')} />`
  }
  return `<${parts.join(' ')}>`
}

/**
 * Pass through allowlisted phrasing HTML tags (optional safe attributes).
 * Anything else stays escaped so raw HTML cannot inject markup.
 *
 * @param value - mdast `html` node value (often a single tag fragment).
 * @returns Safe tag HTML, or null when the fragment is not allowlisted.
 */
function renderSafePhrasingHtml(value: string): string | null {
  const trimmed = value.trim()
  const close = /^<\/([a-zA-Z][\w-]*)\s*>$/.exec(trimmed)
  if (close) {
    const tag = close[1].toLowerCase()
    return SAFE_PHRASING_HTML_TAGS.has(tag) && !VOID_PHRASING_HTML_TAGS.has(tag)
      ? `</${tag}>`
      : null
  }
  const open =
    /^<([a-zA-Z][\w-]*)((?:\s+[a-zA-Z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)\s*>$/.exec(
      trimmed,
    )
  if (open) {
    const tag = open[1].toLowerCase()
    const attrs = parseHtmlAttributes(open[2] ?? '')
    const selfClosing = open[3] === '/' || VOID_PHRASING_HTML_TAGS.has(tag)
    return buildSafeOpenTag(tag, attrs, selfClosing)
  }
  return null
}

/**
 * Whether an HTML block is a standalone SVG document (optional XML / DOCTYPE).
 *
 * @param html - Raw HTML block source.
 * @returns True when the block should use the SVG preview path.
 */
function isStandaloneSvg(html: string): boolean {
  return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!DOCTYPE[\s\S]*?>\s*)?<svg\b/i.test(
    html,
  )
}

/**
 * Build a heading id slug matching Aura's `wysiwyg-<slug>` convention.
 *
 * @param text - Heading text content.
 * @returns Slugified id.
 */
function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Render an mdast tree into Aura WYSIWYG DOM HTML.
 *
 * This reproduces the block/inline conventions of the Aura WYSIWYG DOM
 * (`data-block`, `data-marker`, dual-pane code/math blocks, caret/ZWSP).
 */
export class AuraRenderer {
  private readonly options: MarkdownEngineOptions

  /** Footnote identifier ??1-based index (definition order). */
  private footnoteIndex = new Map<string, number>()

  /** Footnote identifier ??plain-text tooltip label (definition body). */
  private footnoteLabelText = new Map<string, string>()

  /** Link/image reference identifier ??definition (url + title). */
  private linkDefinitions = new Map<
    string,
    { url: string; title: string | null | undefined; label: string }
  >()

  /**
   * @param options - Engine option flags.
   */
  constructor(options: MarkdownEngineOptions) {
    this.options = options
  }

  /**
   * Render a full document root to Aura DOM.
   * Footnote definitions stay where they appear in the source (Typora-style),
   * not scooped to the document end.
   *
   * @param root - mdast root node.
   * @returns Aura DOM HTML string.
   */
  render(root: Root): string {
    type FootnoteDefNode = Extract<RootContent, { type: 'footnoteDefinition' }>
    type LinkDefNode = Extract<RootContent, { type: 'definition' }>
    const defs = root.children.filter(
      (child): child is FootnoteDefNode => child.type === 'footnoteDefinition',
    )
    this.footnoteIndex = new Map(
      defs.map((def, i) => [def.identifier, i + 1]),
    )
    this.footnoteLabelText = new Map(
      defs.map((def) => [
        def.identifier,
        this.nodeText(def as unknown as RootContent).trim(),
      ]),
    )
    this.linkDefinitions = new Map(
      root.children
        .filter((child): child is LinkDefNode => child.type === 'definition')
        .map((def) => [
          def.identifier,
          {
            url: def.url,
            title: def.title,
            label: def.label ?? def.identifier,
          },
        ]),
    )

    let html = ''
    let index = 0
    const { children } = root
    while (index < children.length) {
      const child = children[index]
      if (child.type === 'footnoteDefinition') {
        const run: FootnoteDefNode[] = []
        while (
          index < children.length &&
          children[index].type === 'footnoteDefinition'
        ) {
          run.push(children[index] as FootnoteDefNode)
          index += 1
        }
        html += this.renderFootnoteDefs(run)
        continue
      }
      if (child.type === 'definition') {
        const run: LinkDefNode[] = []
        while (
          index < children.length &&
          children[index].type === 'definition'
        ) {
          run.push(children[index] as LinkDefNode)
          index += 1
        }
        html += this.renderLinkRefDefs(run)
        continue
      }
      html += this.renderBlock(child)
      index += 1
    }
    return html
  }

  /**
   * Render collected footnote definitions as an Aura footnotes block.
   *
   * @param defs - Footnote definition nodes in document order.
   * @returns Aura DOM footnotes block, or empty string when none.
   */
  private renderFootnoteDefs(
    defs: Array<Extract<RootContent, { type: 'footnoteDefinition' }>>,
  ): string {
    if (!this.options.footnotes || defs.length === 0) {
      return ''
    }
    const items = defs
      .map((def) => {
        const inner = def.children.map((child) => this.renderBlock(child)).join('')
        return `<li data-type="footnotes-li" data-marker="${escapeHtml(def.identifier)}">${inner}</li>`
      })
      .join('')
    return (
      '<div data-block="0" data-type="footnotes-block">' +
      `<ol data-type="footnotes-defs-ol">${items}</ol></div>`
    )
  }

  /**
   * Render consecutive link/image reference definitions as a visible Typora-
   * style block (muted markdown lines kept at their source position).
   *
   * @param defs - Link definition nodes in document order.
   * @returns Aura DOM link-ref-defs block, or empty string when none.
   */
  private renderLinkRefDefs(
    defs: Array<Extract<RootContent, { type: 'definition' }>>,
  ): string {
    if (defs.length === 0) {
      return ''
    }
    const lines = defs
      .map((def) => {
        const label = escapeHtml(def.label ?? def.identifier)
        const url = escapeHtml(def.url)
        const title =
          def.title != null && def.title !== ''
            ? ` "${escapeHtml(def.title)}"`
            : ''
        return `[${label}]: ${url}${title}`
      })
      .join('\n')
    return `<div data-block="0" data-type="link-ref-defs-block">${lines}</div>`
  }

  /**
   * Render a single block-level node.
   *
   * @param node - mdast block node.
   * @returns Aura DOM HTML for the block.
   */
  private renderBlock(node: RootContent): string {
    switch (node.type) {
      case 'paragraph': {
        const promoted = this.promoteHtmlParagraph(node)
        if (promoted !== null) {
          return promoted
        }
        return `<p data-block="0">${this.renderInline(node.children)}</p>`
      }
      case 'heading': {
        const level = node.depth
        const customId = getCustomHeadingId(node)
        const text = this.plainText(node.children)
        const id = customId ?? headingSlug(text)
        const customAttr = customId
          ? ` data-custom-heading-id="${escapeHtml(customId)}"`
          : ''
        return (
          `<h${level} data-block="0" id="wysiwyg-${escapeHtml(id)}"${customAttr} data-marker="#">` +
          `${this.renderInline(node.children)}</h${level}>`
        )
      }
      case 'blockquote': {
        const calloutType = (
          node as unknown as { data?: { calloutType?: string } }
        ).data?.calloutType
        if (calloutType) {
          const subtype = escapeHtml(calloutType)
          const label = escapeHtml(calloutTitleLabel(calloutType))
          const title =
            `<p class="aura-callout-title" contenteditable="false" data-callout-title="1">` +
            calloutIconSvgHtml(calloutType) +
            `<span class="aura-callout-label">${label}</span>` +
            `</p>`
          return (
            `<blockquote data-block="0" data-type="callout" data-subtype="${subtype}">` +
            title +
            node.children.map((child) => this.renderBlock(child)).join('') +
            '</blockquote>'
          )
        }
        return (
          `<blockquote data-block="0">` +
          node.children.map((child) => this.renderBlock(child)).join('') +
          '</blockquote>'
        )
      }
      case 'list':
        return this.renderList(node)
      case 'code':
        return this.renderCode(node.lang ?? '', node.value)
      case 'thematicBreak':
        return '<hr data-block="0" />'
      case 'table':
        return this.renderTable(node)
      case 'html':
        return this.renderHtmlBlock(node.value)
      case 'details' as string:
        return this.renderDetails(node as unknown as DetailsNode)
      case 'yaml' as string:
        return this.renderYamlFrontMatter(
          (node as unknown as { value: string }).value,
        )
      case 'math' as string:
        return this.renderMathBlock((node as unknown as { value: string }).value)
      default:
        return `<p data-block="0">${escapeHtml(this.nodeText(node))}</p>`
    }
  }

  /**
   * Render a regrouped `<details>` / `<summary>` collapsible block.
   *
   * @param node - Custom details mdast node.
   * @returns Aura DOM details HTML.
   */
  private renderDetails(node: DetailsNode): string {
    const openAttr = node.open ? ' open' : ''
    const summary = escapeHtml(node.summary)
    const body = node.children
      .map((child) => this.renderBlock(child))
      .join('')
    return (
      `<details data-block="0"${openAttr}>` +
      `<summary>${summary}</summary>` +
      body +
      '</details>'
    )
  }

  /**
   * Render top-of-document YAML front matter as a read-only metadata block.
   *
   * @param value - YAML source without opening/closing delimiters.
   * @returns Aura DOM metadata block.
   */
  private renderYamlFrontMatter(value: string): string {
    return (
      '<div class="aura-frontmatter" data-type="yaml-front-matter" ' +
      'data-block="0" contenteditable="false">' +
      '<div class="aura-frontmatter__label">YAML Front Matter</div>' +
      `<pre class="aura-frontmatter__source"><code class="language-yaml">${escapeHtml(value)}</code></pre>` +
      '</div>'
    )
  }

  /**
   * Promote a paragraph that is only HTML (+ whitespace) into an HTML block.
   * CommonMark treats tags like `<svg>` as inline HTML; without this step they
   * would be escaped as plain text in a `<p>`.
   *
   * @param node - mdast paragraph.
   * @returns Html-block markup, or null when the paragraph should stay a `<p>`.
   */
  private promoteHtmlParagraph(
    node: Extract<RootContent, { type: 'paragraph' }>,
  ): string | null {
    if (
      !node.children.every(
        (child) =>
          child.type === 'html' ||
          (child.type === 'text' && /^\s*$/.test(child.value)),
      )
    ) {
      return null
    }
    const html = node.children
      .map((child) => ('value' in child ? child.value : ''))
      .join('')
      .trim()
    if (!html || !isStandaloneSvg(html)) {
      return null
    }
    return this.renderHtmlBlock(html)
  }

  /**
   * Render an ordered / unordered list.
   *
   * @param node - mdast list node.
   * @returns Aura DOM list HTML.
   */
  private renderList(node: Extract<RootContent, { type: 'list' }>): string {
    const tag = node.ordered ? 'ol' : 'ul'
    const attrs: string[] = []
    if (node.spread === false) {
      attrs.push('data-tight="true"')
    }
    if (node.ordered && node.start != null && node.start !== 1) {
      attrs.push(`start="${node.start}"`)
    }
    const marker = node.ordered ? `${node.start ?? 1}.` : '*'
    attrs.push(`data-marker="${marker}"`)
    attrs.push('data-block="0"')
    const items = node.children
      .map((item) => this.renderListItem(item, node.ordered ?? false, marker))
      .join('')
    return `<${tag} ${attrs.join(' ')}>${items}</${tag}>`
  }

  /**
   * Render a list item, including task-list checkbox markers.
   *
   * @param item - mdast list item.
   * @param ordered - Whether the parent list is ordered.
   * @param marker - List marker string.
   * @returns Aura DOM list-item HTML.
   */
  private renderListItem(
    item: Extract<RootContent, { type: 'list' }>['children'][number],
    ordered: boolean,
    marker: string,
  ): string {
    const attrs = [`data-marker="${marker}"`]
    let taskbox = ''
    if (typeof item.checked === 'boolean') {
      attrs.push('class="vditor-task"')
      const checked = item.checked ? ' checked=""' : ''
      taskbox = `<input${checked} type="checkbox" />`
    }
    const inner = item.children
      .map((child, index) => {
        if (child.type === 'paragraph' && item.spread === false && index === 0) {
          return this.renderInline(child.children)
        }
        return this.renderBlock(child)
      })
      .join('')
    return `<li ${attrs.join(' ')}>${taskbox}${inner}</li>`
  }

  /**
   * Render a fenced code block as either one editable surface or, for visual
   * renderer languages, separate source and preview panes.
   *
   * @param lang - Language info string.
   * @param value - Code body.
   * @returns Aura DOM code-block HTML.
   */
  private renderCode(lang: string, value: string): string {
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : ''
    const hasVisualPreview =
      this.options.codeBlockPreview &&
      isRenderedCodeLanguage(lang, this.options.renderedCodeLanguages)
    if (!hasVisualPreview) {
      return (
        '<div class="aura-wysiwyg__block" data-type="code-block" data-block="0" data-marker="```">' +
        '<pre class="aura-wysiwyg__code" data-render="2">' +
        `<code${langClass}>${escapeHtml(value)}\n</code></pre>` +
        '</div>'
      )
    }

    const editable =
      '<pre class="aura-wysiwyg__pre" style="display: none">' +
      `<code${langClass}>${escapeHtml(value)}\n</code></pre>`
    const preview =
      '<pre class="aura-wysiwyg__preview" data-render="2">' +
      `<code${langClass}>${escapeHtml(value)}</code></pre>`
    return (
      '<div class="aura-wysiwyg__block" data-type="code-block" data-block="0" data-marker="```">' +
      editable +
      preview +
      '</div>'
    )
  }

  /**
   * Render a math block with editable + preview panes.
   *
   * @param value - Math body.
   * @returns Aura DOM math-block HTML.
   */
  private renderMathBlock(value: string): string {
    const preHidden = this.options.mathBlockPreview ? ' style="display: none"' : ''
    const editable =
      `<pre${preHidden}><code data-type="math-block">${escapeHtml(value)}</code></pre>`
    let preview = ''
    if (this.options.mathBlockPreview) {
      preview =
        '<pre class="aura-wysiwyg__preview" data-render="2">' +
        `<div data-type="math-block" class="language-math">${escapeHtml(value)}</div></pre>`
    }
    return (
      '<div class="aura-wysiwyg__block" data-type="math-block" data-block="0">' +
      editable +
      preview +
      '</div>'
    )
  }

  /**
   * Render a raw HTML block with editable + preview panes.
   * Standalone SVG documents reuse the fenced-svg preview path (sanitized)
   * while remaining `html-block` so Markdown round-trips as raw HTML.
   *
   * @param value - Raw HTML.
   * @returns Aura DOM html-block HTML.
   */
  private renderHtmlBlock(value: string): string {
    const trimmed = value.trim()
    if (isStandaloneSvg(trimmed)) {
      const escaped = escapeHtml(trimmed)
      return (
        '<div class="aura-wysiwyg__block" data-type="html-block" data-block="0">' +
        `<pre class="aura-wysiwyg__pre" style="display: none"><code class="language-svg">${escaped}</code></pre>` +
        '<pre class="aura-wysiwyg__preview" data-render="2">' +
        `<code class="language-svg">${escaped}</code></pre>` +
        '</div>'
      )
    }
    return (
      '<div class="aura-wysiwyg__block" data-type="html-block" data-block="0">' +
      `<pre class="aura-wysiwyg__pre" style="display: none"><code>${escapeHtml(trimmed)}</code></pre>` +
      `<pre class="aura-wysiwyg__preview" data-render="2">${trimmed}</pre>` +
      '</div>'
    )
  }

  /**
   * Render a GFM table.
   *
   * @param node - mdast table node.
   * @returns Aura DOM table HTML.
   */
  private renderTable(node: Extract<RootContent, { type: 'table' }>): string {
    const align = node.align ?? []
    const [head, ...body] = node.children
    const alignAttr = (index: number): string => {
      const a = align[index]
      return a ? ` align="${a}"` : ''
    }
    const headHtml =
      '<thead><tr>' +
      head.children
        .map((cell, index) => `<th${alignAttr(index)}>${this.renderInline(cell.children)}</th>`)
        .join('') +
      '</tr></thead>'
    const bodyHtml = body.length
      ? '<tbody>' +
        body
          .map(
            (row) =>
              '<tr>' +
              row.children
                .map(
                  (cell, index) =>
                    `<td${alignAttr(index)}>${this.renderInline(cell.children)}</td>`,
                )
                .join('') +
              '</tr>',
          )
          .join('') +
        '</tbody>'
      : ''
    return `<table data-block="0">${headHtml}${bodyHtml}</table>`
  }

  /**
   * Render inline phrasing content.
   *
   * @param nodes - mdast phrasing nodes.
   * @returns Aura DOM inline HTML.
   */
  private renderInline(nodes: PhrasingContent[]): string {
    return nodes.map((node) => this.renderInlineNode(node)).join('')
  }

  /**
   * Render a single inline node.
   *
   * @param node - mdast phrasing node.
   * @returns Aura DOM inline HTML.
   */
  private renderInlineNode(node: PhrasingContent): string {
    switch (node.type) {
      case 'text':
        return escapeHtml(node.value)
      case 'strong':
        return `<strong data-marker="**">${this.renderInline(node.children)}</strong>`
      case 'emphasis':
        return `<em data-marker="*">${this.renderInline(node.children)}</em>`
      case 'delete':
        return `<s data-marker="~~">${this.renderInline(node.children)}</s>`
      case 'inlineCode':
        return `<code data-marker="\`">${ZWSP}${escapeHtml(node.value)}</code>${ZWSP}`
      case 'link': {
        const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
        return `<a href="${escapeHtml(node.url)}"${title}>${this.renderInline(node.children)}</a>`
      }
      case 'linkReference':
        return this.renderLinkReference(node)
      case 'image': {
        const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
        return `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.alt ?? '')}"${title} />`
      }
      case 'imageReference':
        return this.renderImageReference(node)
      case 'break':
        return '<br />'
      case 'footnoteReference':
        return this.renderFootnoteRef(node.identifier)
      case 'mark' as string:
        return `<mark data-marker="==">${this.renderInline(this.markChildren(node))}</mark>`
      case 'sup' as string:
        return `<sup data-marker="^">${this.renderInline(this.markChildren(node))}</sup>`
      case 'sub' as string:
        return `<sub data-marker="~">${this.renderInline(this.markChildren(node))}</sub>`
      case 'spoiler' as string:
        return (
          `<span data-type="spoiler" data-marker="||">` +
          `${this.renderInline(this.markChildren(node))}</span>`
        )
      case 'criticAddition' as string:
        return (
          `<ins data-type="critic-addition" data-marker="{++">` +
          `${this.renderInline(this.markChildren(node))}</ins>`
        )
      case 'criticDeletion' as string:
        return (
          `<del data-type="critic-deletion" data-marker="{--">` +
          `${this.renderInline(this.markChildren(node))}</del>`
        )
      case 'criticHighlight' as string:
        return (
          `<mark data-type="critic-highlight" data-marker="{==">` +
          `${this.renderInline(this.markChildren(node))}</mark>`
        )
      case 'criticComment' as string:
        return (
          `<span data-type="critic-comment" data-marker="{>>">` +
          `${this.renderInline(this.markChildren(node))}</span>`
        )
      case 'inlineMath' as string:
        return this.renderInlineMath((node as unknown as { value: string }).value)
      case 'html':
        return renderSafePhrasingHtml(node.value) ?? escapeHtml(node.value)
      default:
        return escapeHtml(this.nodeText(node as RootContent))
    }
  }

  /**
   * Render a footnote reference as an Aura `<sup>` marker.
   *
   * @param identifier - Footnote identifier.
   * @returns Aura DOM footnote-ref HTML.
   */
  private renderFootnoteRef(identifier: string): string {
    // When footnotes are disabled, keep the literal Markdown token as text.
    if (!this.options.footnotes) {
      return escapeHtml(`[^${identifier}]`)
    }
    const index = this.footnoteIndex.get(identifier) ?? 1
    const labelText = this.footnoteLabelText.get(identifier) ?? ''
    const ariaLabel = labelText
      ? ` aria-label="${escapeHtml(labelText)}"`
      : ''
    return (
      `${ZWSP}<sup data-type="footnotes-ref" data-footnotes-label="${escapeHtml(identifier)}"${ariaLabel} ` +
      `class="aura-tooltipped aura-tooltipped__s">${index}</sup>${ZWSP}`
    )
  }

  /**
   * Resolve a reference-style link against document definitions.
   *
   * @param node - mdast linkReference node.
   * @returns Anchor HTML, or a literal fallback when unresolved.
   */
  private renderLinkReference(
    node: Extract<PhrasingContent, { type: 'linkReference' }>,
  ): string {
    const def = this.linkDefinitions.get(node.identifier)
    if (!def) {
      const label = node.label ?? node.identifier
      return escapeHtml(`[${this.plainText(node.children) || label}]`)
    }
    const title = def.title ? ` title="${escapeHtml(def.title)}"` : ''
    return (
      `<a href="${escapeHtml(def.url)}"${title}>` +
      `${this.renderInline(node.children)}</a>`
    )
  }

  /**
   * Resolve a reference-style image against document definitions.
   *
   * @param node - mdast imageReference node.
   * @returns Image HTML, or a literal fallback when unresolved.
   */
  private renderImageReference(
    node: Extract<PhrasingContent, { type: 'imageReference' }>,
  ): string {
    const def = this.linkDefinitions.get(node.identifier)
    const alt = node.alt ?? ''
    if (!def) {
      return escapeHtml(`![${alt}]`)
    }
    const title = def.title ? ` title="${escapeHtml(def.title)}"` : ''
    return `<img src="${escapeHtml(def.url)}" alt="${escapeHtml(alt)}"${title} />`
  }

  /**
   * Extract children from a custom text-mark node (mark / spoiler / Critic).
   *
   * @param node - Custom inline node.
   * @returns Phrasing children.
   */
  private markChildren(node: PhrasingContent): PhrasingContent[] {
    const children = (node as unknown as { children?: PhrasingContent[] }).children
    return Array.isArray(children) ? children : []
  }

  /**
   * Render inline math with editable + preview spans.
   *
   * @param value - Math source.
   * @returns Aura DOM inline-math HTML.
   */
  private renderInlineMath(value: string): string {
    return (
      '<span class="aura-wysiwyg__block" data-type="math-inline">' +
      `<code data-type="math-inline" style="display: none">${ZWSP}${escapeHtml(value)}</code>` +
      '<span class="aura-wysiwyg__preview" data-render="2">' +
      `<span class="language-math">${escapeHtml(value)}</span></span>` +
      `</span>${ZWSP}`
    )
  }

  /**
   * Extract plain text from phrasing children (for heading ids).
   *
   * @param nodes - mdast phrasing nodes.
   * @returns Concatenated text.
   */
  private plainText(nodes: PhrasingContent[]): string {
    return nodes
      .map((node) => {
        if (node.type === 'text' || node.type === 'inlineCode') {
          return node.value
        }
        if ('children' in node && Array.isArray(node.children)) {
          return this.plainText(node.children as PhrasingContent[])
        }
        return ''
      })
      .join('')
  }

  /**
   * Best-effort text extraction for unhandled node types.
   *
   * @param node - Any mdast node.
   * @returns Text content.
   */
  private nodeText(node: RootContent): string {
    if ('value' in node && typeof node.value === 'string') {
      return node.value
    }
    if ('children' in node && Array.isArray(node.children)) {
      return (node.children as RootContent[]).map((child) => this.nodeText(child)).join('')
    }
    return ''
  }
}

/** Re-export caret tokens for callers that stitch carets into rendered DOM. */
export const CARET_TOKENS = { CARET, FRONT_END_CARET, ZWSP }
