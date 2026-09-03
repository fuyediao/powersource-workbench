import { FRONT_END_CARET, ZWSP } from './constants'

/** Private-use bracket chars that survive `remark-stringify` unescaped. */
const PUA_START = '\uE000'
const PUA_END = '\uE001'

/**
 * Placeholder tokens for text-mark markers. Emitting the literal `==` / `^` /
 * `~` / Critic braces as text lets `remark-stringify` escape them; private-use
 * tokens pass through untouched and are restored after stringify.
 */
const MARK_TOKENS: Record<
  string,
  { open: string; close: string; openMarker: string; closeMarker: string }
> = {
  mark: {
    open: '\uE002',
    close: '\uE003',
    openMarker: '==',
    closeMarker: '==',
  },
  sup: {
    open: '\uE004',
    close: '\uE005',
    openMarker: '^',
    closeMarker: '^',
  },
  sub: {
    open: '\uE006',
    close: '\uE007',
    openMarker: '~',
    closeMarker: '~',
  },
  spoiler: {
    open: '\uE008',
    close: '\uE009',
    openMarker: '||',
    closeMarker: '||',
  },
  criticAddition: {
    open: '\uE00A',
    close: '\uE00B',
    openMarker: '{++',
    closeMarker: '++}',
  },
  criticDeletion: {
    open: '\uE00C',
    close: '\uE00D',
    openMarker: '{--',
    closeMarker: '--}',
  },
  criticHighlight: {
    open: '\uE00E',
    close: '\uE00F',
    openMarker: '{==',
    closeMarker: '==}',
  },
  criticComment: {
    open: '\uE010',
    close: '\uE011',
    openMarker: '{>>',
    closeMarker: '<<}',
  },
}

/**
 * Restore text-mark placeholder tokens in serialized Markdown back to their
 * literal markers.
 *
 * @param markdown - Markdown containing placeholder tokens.
 * @returns Markdown with text-mark / Critic / spoiler delimiters restored.
 */
export function restoreTextMarks(markdown: string): string {
  let out = markdown
  for (const { open, close, openMarker, closeMarker } of Object.values(
    MARK_TOKENS,
  )) {
    out = out.split(open).join(openMarker).split(close).join(closeMarker)
  }
  return out
}

/** Build a footnote-reference placeholder for reference index `i`. */
function footnoteRefToken(index: number): string {
  return `${PUA_START}fnref:${index}${PUA_END}`
}

/** Regex matching a footnote-reference placeholder (capturing its index). */
export const FOOTNOTE_REF_TOKEN_RE = new RegExp(
  `${PUA_START}fnref:(\\d+)${PUA_END}`,
  'g',
)

/**
 * Build a footnote-definitions-block placeholder for block index `i`.
 * Keeps definition groups at their source position through HTML→Markdown.
 *
 * @param index - Block index into `footnoteDefBlocks`.
 * @returns Placeholder token.
 */
function footnoteDefsToken(index: number): string {
  return `${PUA_START}fndefs:${index}${PUA_END}`
}

/** Regex matching a footnote-definitions-block placeholder. */
export const FOOTNOTE_DEFS_TOKEN_RE = new RegExp(
  `${PUA_START}fndefs:(\\d+)${PUA_END}`,
  'g',
)

/**
 * Build a link-ref-defs-block placeholder for block index `i`.
 *
 * @param index - Block index into `linkRefDefBlocks`.
 * @returns Placeholder token.
 */
function linkRefDefsToken(index: number): string {
  return `${PUA_START}linkrefs:${index}${PUA_END}`
}

/** Regex matching a link-ref-defs-block placeholder. */
export const LINK_REF_DEFS_TOKEN_RE = new RegExp(
  `${PUA_START}linkrefs:(\\d+)${PUA_END}`,
  'g',
)

/**
 * Build a YAML-front-matter placeholder for block index `i`.
 *
 * @param index - Block index into `yamlFrontMatterBlocks`.
 * @returns Placeholder token.
 */
function yamlFrontMatterToken(index: number): string {
  return `${PUA_START}yamlfront:${index}${PUA_END}`
}

/** Regex matching a YAML-front-matter placeholder. */
export const YAML_FRONT_MATTER_TOKEN_RE = new RegExp(
  `${PUA_START}yamlfront:(\\d+)${PUA_END}`,
  'g',
)

/**
 * Build a details-block placeholder for block index `i`.
 *
 * @param index - Block index into `detailsBlocks`.
 * @returns Placeholder token.
 */
function detailsToken(index: number): string {
  return `${PUA_START}details:${index}${PUA_END}`
}

/** Regex matching a details-block placeholder. */
export const DETAILS_TOKEN_RE = new RegExp(
  `${PUA_START}details:(\\d+)${PUA_END}`,
  'g',
)

/** A single extracted footnote definition (in document order). */
export interface FootnoteDef {
  /** Footnote identifier / marker. */
  label: string
  /** Definition body as clean HTML for downstream HTML→Markdown. */
  html: string
}

/** Extracted `<details>` block for Markdown round-trip. */
export interface DetailsBlock {
  /** Whether the block has the `open` attribute. */
  open: boolean
  /** Summary label text. */
  summary: string
  /** Body HTML (summary removed) for HTML→Markdown. */
  bodyHtml: string
}

/** Result of normalizing Aura DOM into clean HTML plus extracted footnotes. */
export interface NormalizedAuraDom {
  /** Clean semantic HTML (footnote refs/defs replaced by placeholder tokens). */
  html: string
  /** Reference labels indexed by placeholder index. */
  refLabels: string[]
  /**
   * Footnote definition groups in document order (one entry per
   * `footnotes-block`, preserving source position).
   */
  footnoteDefBlocks: FootnoteDef[][]
  /**
   * Link/image reference definition groups in document order (one entry per
   * `link-ref-defs-block`, as Markdown definition text).
   */
  linkRefDefBlocks: string[]
  /** YAML front matter sources without delimiters, in document order. */
  yamlFrontMatterBlocks: string[]
  /** Collapsible details blocks in document order. */
  detailsBlocks: DetailsBlock[]
}

/**
 * Convert Aura WYSIWYG DOM into clean semantic HTML that `rehype-remark`
 * can turn back into Markdown, and extract footnote references/definitions
 * that have no direct hast→mdast mapping.
 *
 * Strips preview panes, editor wrappers, ZWSP placeholders, and caret
 * markers. Footnote refs become placeholder tokens (restored to `[^label]`
 * after stringify); each footnotes block becomes a position-preserving
 * placeholder restored to `[^id]: …` after stringify.
 *
 * @param auraHtml - Aura DOM HTML (contenteditable innerHTML).
 * @returns Normalized HTML plus extracted footnote data.
 */
export function normalizeAuraDom(auraHtml: string): NormalizedAuraDom {
  const doc = new DOMParser().parseFromString(
    `<div id="aura-normalize-root">${auraHtml}</div>`,
    'text/html',
  )
  const root = doc.getElementById('aura-normalize-root')
  if (!root) {
    return {
      html: '',
      refLabels: [],
      footnoteDefBlocks: [],
      linkRefDefBlocks: [],
      yamlFrontMatterBlocks: [],
      detailsBlocks: [],
    }
  }

  // Drop live preview panes; the editable source pane is the source of truth.
  root.querySelectorAll('.aura-wysiwyg__preview').forEach((el) => el.remove())

  // Custom heading ids: restore trailing `{#id}` before HTML→Markdown.
  root
    .querySelectorAll(
      'h1[data-custom-heading-id], h2[data-custom-heading-id], h3[data-custom-heading-id], h4[data-custom-heading-id], h5[data-custom-heading-id], h6[data-custom-heading-id]',
    )
    .forEach((el) => {
      const customId = el.getAttribute('data-custom-heading-id')
      if (!customId) {
        return
      }
      el.appendChild(doc.createTextNode(` {#${customId}}`))
      el.removeAttribute('data-custom-heading-id')
    })

  // Code blocks: unwrap `.aura-wysiwyg__block[data-type=code-block]` to <pre><code>.
  root
    .querySelectorAll('.aura-wysiwyg__block[data-type="code-block"]')
    .forEach((block) => {
      const pre = block.querySelector('pre')
      const code = pre?.querySelector('code')
      const replacement = doc.createElement('pre')
      const newCode = doc.createElement('code')
      const langClass = Array.from(code?.classList ?? []).find((c) =>
        c.startsWith('language-'),
      )
      if (langClass) {
        newCode.className = langClass
      }
      newCode.textContent = (code?.textContent ?? '').replace(/\n$/, '')
      replacement.appendChild(newCode)
      block.replaceWith(replacement)
    })

  // Math blocks: convert to a ```math fenced code block for round-trip.
  root
    .querySelectorAll('.aura-wysiwyg__block[data-type="math-block"]')
    .forEach((block) => {
      const code = block.querySelector('code[data-type="math-block"]')
      const pre = doc.createElement('pre')
      const newCode = doc.createElement('code')
      newCode.className = 'language-math'
      newCode.textContent = code?.textContent ?? ''
      pre.appendChild(newCode)
      block.replaceWith(pre)
    })

  // Inline math: convert to `$...$` text.
  root
    .querySelectorAll('.aura-wysiwyg__block[data-type="math-inline"]')
    .forEach((span) => {
      const code = span.querySelector('code[data-type="math-inline"]')
      const value = (code?.textContent ?? '').replace(new RegExp(ZWSP, 'g'), '')
      span.replaceWith(doc.createTextNode(`$${value}$`))
    })

  // HTML blocks: unwrap to raw HTML text.
  root
    .querySelectorAll('.aura-wysiwyg__block[data-type="html-block"]')
    .forEach((block) => {
      const code = block.querySelector('pre code')
      const raw = doc.createTextNode(code?.textContent ?? '')
      block.replaceWith(raw)
    })

  // Text-mark inlines: rewrite to Markdown markers so rehype-remark carries
  // them through as plain text (round-trips to `==`, `^`, `~`, `||`, Critic).
  root
    .querySelectorAll('span[data-type="spoiler"]')
    .forEach((el) => {
      unwrapWithMarkers(
        doc,
        el,
        MARK_TOKENS.spoiler.open,
        MARK_TOKENS.spoiler.close,
      )
    })
  root
    .querySelectorAll('ins[data-type="critic-addition"]')
    .forEach((el) => {
      unwrapWithMarkers(
        doc,
        el,
        MARK_TOKENS.criticAddition.open,
        MARK_TOKENS.criticAddition.close,
      )
    })
  root
    .querySelectorAll('del[data-type="critic-deletion"]')
    .forEach((el) => {
      unwrapWithMarkers(
        doc,
        el,
        MARK_TOKENS.criticDeletion.open,
        MARK_TOKENS.criticDeletion.close,
      )
    })
  root
    .querySelectorAll('mark[data-type="critic-highlight"]')
    .forEach((el) => {
      unwrapWithMarkers(
        doc,
        el,
        MARK_TOKENS.criticHighlight.open,
        MARK_TOKENS.criticHighlight.close,
      )
    })
  root
    .querySelectorAll('span[data-type="critic-comment"]')
    .forEach((el) => {
      unwrapWithMarkers(
        doc,
        el,
        MARK_TOKENS.criticComment.open,
        MARK_TOKENS.criticComment.close,
      )
    })
  root
    .querySelectorAll('mark:not([data-type="critic-highlight"])')
    .forEach((el) => {
      unwrapWithMarkers(doc, el, MARK_TOKENS.mark.open, MARK_TOKENS.mark.close)
    })
  root.querySelectorAll('sub').forEach((el) => {
    unwrapWithMarkers(doc, el, MARK_TOKENS.sub.open, MARK_TOKENS.sub.close)
  })
  root
    .querySelectorAll('sup:not([data-type="footnotes-ref"])')
    .forEach((el) => {
      unwrapWithMarkers(doc, el, MARK_TOKENS.sup.open, MARK_TOKENS.sup.close)
    })

  // Callouts / alerts: `blockquote[data-type=callout]` → `> [!TYPE]` first line.
  root
    .querySelectorAll('blockquote[data-type="callout"]')
    .forEach((el) => {
      el.querySelectorAll('[data-callout-title]').forEach((title) => {
        title.remove()
      })
      const subtype = (el.getAttribute('data-subtype') || 'NOTE').toUpperCase()
      const marker = doc.createElement('p')
      marker.textContent = `[!${subtype}]`
      el.insertBefore(marker, el.firstChild)
      el.removeAttribute('data-type')
      el.removeAttribute('data-subtype')
    })

  // Footnotes: extract the definition block and replace refs with placeholders.
  const refLabels: string[] = []
  root
    .querySelectorAll('sup[data-type="footnotes-ref"]')
    .forEach((el) => {
      const label = el.getAttribute('data-footnotes-label') ?? ''
      const index = refLabels.push(label) - 1
      el.replaceWith(doc.createTextNode(footnoteRefToken(index)))
    })

  const footnoteDefBlocks: FootnoteDef[][] = []
  root
    .querySelectorAll('div[data-type="footnotes-block"]')
    .forEach((block) => {
      const defs: FootnoteDef[] = []
      block
        .querySelectorAll('li[data-type="footnotes-li"]')
        .forEach((li) => {
          defs.push({
            label: li.getAttribute('data-marker') ?? '',
            html: li.innerHTML,
          })
        })
      const tokenIndex = footnoteDefBlocks.push(defs) - 1
      // Keep a block-level slot so defs reappear at this source position.
      const placeholder = doc.createElement('p')
      placeholder.textContent = footnoteDefsToken(tokenIndex)
      block.replaceWith(placeholder)
    })

  const linkRefDefBlocks: string[] = []
  root
    .querySelectorAll('div[data-type="link-ref-defs-block"]')
    .forEach((block) => {
      const markdown = (block.textContent ?? '').replace(/\n+$/, '')
      const tokenIndex = linkRefDefBlocks.push(markdown) - 1
      const placeholder = doc.createElement('p')
      placeholder.textContent = linkRefDefsToken(tokenIndex)
      block.replaceWith(placeholder)
    })

  const yamlFrontMatterBlocks: string[] = []
  root
    .querySelectorAll('div[data-type="yaml-front-matter"]')
    .forEach((block) => {
      const source = block.querySelector('code')?.textContent ?? ''
      const tokenIndex = yamlFrontMatterBlocks.push(source) - 1
      const placeholder = doc.createElement('p')
      placeholder.textContent = yamlFrontMatterToken(tokenIndex)
      block.replaceWith(placeholder)
    })

  // Details / summary: extract deepest-first so nested blocks stay intact.
  const detailsBlocks: DetailsBlock[] = []
  ;[...root.querySelectorAll('details')].reverse().forEach((el) => {
    const summaryEl = el.querySelector(':scope > summary')
    const summary = summaryEl?.textContent ?? ''
    summaryEl?.remove()
    const tokenIndex =
      detailsBlocks.push({
        open: el.hasAttribute('open'),
        summary,
        bodyHtml: el.innerHTML,
      }) - 1
    const placeholder = doc.createElement('p')
    placeholder.textContent = detailsToken(tokenIndex)
    el.replaceWith(placeholder)
  })

  let html = root.innerHTML
  // Remove ZWSP placeholders and the frontend caret element. The internal
  // caret token (CARET) is intentionally preserved so spinAuraDom can carry
  // the cursor through Markdown and re-materialize it as `<wbr>`.
  html = html.replace(new RegExp(ZWSP, 'g'), '')
  html = html.replace(new RegExp(FRONT_END_CARET, 'g'), '')
  html = html.replace(/<wbr\s*\/?>/g, '')
  return {
    html,
    refLabels,
    footnoteDefBlocks,
    linkRefDefBlocks,
    yamlFrontMatterBlocks,
    detailsBlocks,
  }
}

/**
 * Replace an inline element with its text content wrapped in Markdown markers.
 *
 * @param doc - Owning document.
 * @param el - Element to unwrap.
 * @param open - Opening marker text.
 * @param close - Closing marker text.
 */
function unwrapWithMarkers(
  doc: Document,
  el: Element,
  open: string,
  close: string,
): void {
  const fragment = doc.createDocumentFragment()
  fragment.appendChild(doc.createTextNode(open))
  while (el.firstChild) {
    fragment.appendChild(el.firstChild)
  }
  fragment.appendChild(doc.createTextNode(close))
  el.replaceWith(fragment)
}

/**
 * Backwards-compatible helper returning only the cleaned HTML.
 *
 * @param auraHtml - Aura DOM HTML.
 * @returns Clean semantic HTML string.
 */
export function auraDomToCleanHtml(auraHtml: string): string {
  return normalizeAuraDom(auraHtml).html
}
