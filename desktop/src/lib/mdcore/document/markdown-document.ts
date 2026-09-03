import { demoteFlagMarkdown, unwrapFlagImages } from '../render/flagRender'

/** A rendered top-level block, keyed by stable HTML with a lazy serializer. */
interface DomBlock {
  /** Live DOM element represented by this block. */
  element: HTMLElement
  /** Preview-stripped HTML that identifies this block across re-renders. */
  key: string
  /** Serialize this block's DOM to Markdown (only called when it changed). */
  serialize: () => string
}

interface BlockRecord {
  key: string
  md: string
}

/**
 * Normalize a freshly serialized block so it ends with a single blank line
 * (standard block separation). Unchanged blocks keep their verbatim source
 * instead, so this only touches blocks the user actually edited.
 *
 * @param md - Block Markdown from the engine.
 * @returns Block Markdown ending in exactly one blank line, or empty.
 */
function normalizeTrailing(md: string): string {
  const body = md.replace(/\n+$/, '')
  return body ? `${body}\n\n` : ''
}

/**
 * Authoritative Markdown document for the live WYSIWYG editor.
 *
 * The DOM is a projection; this store owns the source string. On load the store
 * holds the file verbatim, sliced into one record per top-level block. After an
 * edit, {@link MarkdownDocument.sync} rebuilds the text by reusing the original
 * source of every unchanged block and re-serializing only the blocks whose DOM
 * changed. Untouched blocks therefore stay byte-identical to the loaded file.
 */
export class MarkdownDocument {
  private text = ''
  private records: BlockRecord[] = []
  private projectionValid = true

  /**
   * Current authoritative Markdown source.
   *
   * @returns Document text.
   */
  getText(): string {
    return this.text
  }

  /**
   * Replace the authoritative source without rendering it. Source mode uses
   * this while Monaco is active; `Aura.setValue` will rebuild block records
   * when returning to WYSIWYG.
   *
   * @param text - New Markdown source.
   */
  setText(text: string): void {
    this.text = text
    this.projectionValid = false
  }

  /**
   * Apply a bounded source edit.
   *
   * @param edit - UTF-16 source range and replacement text.
   */
  applyEdit(edit: { start: number; end: number; insert: string }): void {
    const start = Math.max(0, Math.min(edit.start, this.text.length))
    const end = Math.max(start, Math.min(edit.end, this.text.length))
    this.text = this.text.slice(0, start) + edit.insert + this.text.slice(end)
    this.projectionValid = false
  }

  /**
   * Seed the store from a freshly loaded and rendered document. When the source
   * slices align 1:1 with the rendered blocks, each block keeps its verbatim
   * source; otherwise the store falls back to canonical per-block serialization.
   *
   * @param markdown - Loaded Markdown source.
   * @param slices - Verbatim source slices from `topBlockSourceSlices`.
   * @param blocks - Rendered top-level blocks in document order.
   */
  reset(markdown: string, slices: string[], blocks: DomBlock[]): void {
    this.projectionValid = true
    if (blocks.length > 0 && slices.length === blocks.length) {
      this.records = blocks.map((block, index) => ({
        key: block.key,
        md: slices[index],
      }))
      this.text = markdown
      this.stampRanges(blocks)
      return
    }
    this.records = blocks.map((block, index) => ({
      key: block.key,
      md:
        index === blocks.length - 1
          ? `${block.serialize().trimEnd()}\n`
          : normalizeTrailing(block.serialize()),
    }))
    this.text = this.join()
    this.stampRanges(blocks)
  }

  /**
   * Rebuild the source from the current DOM, reusing the stored source of
   * unchanged blocks and re-serializing only changed / new blocks.
   *
   * @param blocks - Current top-level blocks in document order.
   * @returns Updated document text.
   */
  sync(blocks: DomBlock[]): string {
    if (!this.projectionValid) {
      return this.text
    }
    const prev = this.records
    const matches = orderedMatches(
      prev.map((record) => record.key),
      blocks.map((block) => block.key),
    )
    const matchedPrev = new Set(matches.filter((index) => index >= 0))
    const previousStarts: number[] = []
    prev.reduce((offset, record) => {
      previousStarts.push(offset)
      return offset + record.md.length
    }, 0)
    const next: BlockRecord[] = []
    blocks.forEach((block, index) => {
      const reuse = matches[index]
      if (reuse >= 0) {
        next.push(prev[reuse])
      } else {
        const sourceStart = Number(block.element.dataset.mdStart)
        const sourceIndex = Number.isFinite(sourceStart)
          ? previousStarts.indexOf(sourceStart)
          : -1
        const replacementIndex =
          sourceIndex >= 0 && !matchedPrev.has(sourceIndex)
            ? sourceIndex
            : index < prev.length && !matchedPrev.has(index)
              ? index
              : -1
        const replaced =
          replacementIndex >= 0 ? prev[replacementIndex] : null
        const separator = replaced
          ? trailingSeparator(replaced.md)
          : index === blocks.length - 1
            ? '\n'
            : '\n\n'
        next.push({
          key: block.key,
          md: `${block.serialize().trimEnd()}${separator}`,
        })
      }
    })
    this.records = next
    this.text = this.join()
    this.stampRanges(blocks)
    return this.text
  }

  /**
   * Join block records without changing preserved source separators.
   *
   * @returns Joined document text.
   */
  private join(): string {
    return this.records.map((record) => record.md).join('')
  }

  /**
   * Stamp live blocks with source offsets for diagnostics and future direct
   * transactions. These attributes are excluded from block identity.
   *
   * @param blocks - Live blocks aligned with current records.
   */
  private stampRanges(blocks: DomBlock[]): void {
    let offset = 0
    blocks.forEach((block, index) => {
      const md = this.records[index]?.md ?? ''
      block.element.dataset.mdStart = String(offset)
      offset += md.length
      block.element.dataset.mdEnd = String(offset)
    })
  }
}

/**
 * Preserve the whitespace separating a replaced block from the next one.
 *
 * @param source - Previous verbatim block source.
 * @returns Trailing separator.
 */
function trailingSeparator(source: string): string {
  const blankLines = source.match(/\n[ \t]*\n(?:[ \t]*\n)*$/)?.[0]
  if (blankLines) {
    return blankLines
  }
  return source.endsWith('\n') ? '\n' : ''
}

/**
 * Match equal block keys in order using a longest-common-subsequence table.
 * Ordered matching avoids swapping verbatim source between duplicate blocks.
 *
 * @param previous - Previous keys.
 * @param current - Current keys.
 * @returns Previous index for each current key, or -1 when changed/new.
 */
function orderedMatches(previous: string[], current: string[]): number[] {
  const rows = previous.length + 1
  const cols = current.length + 1
  const table = Array.from({ length: rows }, () =>
    new Uint16Array(cols),
  )
  for (let i = previous.length - 1; i >= 0; i -= 1) {
    for (let j = current.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        previous[i] === current[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const result = Array.from({ length: current.length }, () => -1)
  let i = 0
  let j = 0
  while (i < previous.length && j < current.length) {
    if (previous[i] === current[j]) {
      result[j] = i
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1
    } else {
      j += 1
    }
  }
  return result
}

/**
 * Stable identity for a block: its HTML with the caret marker and derived
 * preview panes removed, so async preview rendering (Mermaid, KaTeX, ...) and
 * injected copy / line-number chrome never look like a content edit.
 *
 * @param element - Top-level block element.
 * @returns Identity string.
 */
function blockKey(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement
  clone.removeAttribute('data-md-start')
  clone.removeAttribute('data-md-end')
  clone.querySelectorAll('wbr').forEach((wbr) => wbr.remove())
  clone
    .querySelectorAll('.aura-wysiwyg__preview')
    .forEach((preview) => preview.remove())
  clone.querySelectorAll('.aura-copy').forEach((menu) => menu.remove())
  clone
    .querySelectorAll('.aura-wysiwyg__code code')
    .forEach((code) => {
      const text = code.textContent ?? ''
      code.replaceChildren(text)
      code.classList.remove('hljs')
      code.removeAttribute('style')
    })
  return clone.outerHTML
}

/**
 * Serialize a single top-level block to Markdown (flags demoted to emoji).
 *
 * @param aura - Active editor instance.
 * @param element - Top-level block element.
 * @returns Block Markdown.
 */
function serializeBlock(aura: IAura, element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('wbr').forEach((wbr) => wbr.remove())
  unwrapFlagImages(clone)
  return demoteFlagMarkdown(aura.markdown.auraDomToMarkdown(clone.outerHTML))
}

/**
 * Collect the editor's top-level blocks in document order.
 *
 * @param aura - Active editor instance.
 * @returns Keyed blocks with lazy serializers.
 */
function collectTopBlocks(aura: IAura): DomBlock[] {
  const children = Array.from(aura.wysiwyg.element.children) as HTMLElement[]
  return children.map((element) => ({
    element,
    key: blockKey(element),
    serialize: () => serializeBlock(aura, element),
  }))
}

/**
 * Seed the document store from a freshly rendered source string.
 *
 * @param aura - Active editor instance.
 * @param markdown - Source that was just rendered into the DOM.
 */
export function resetDocumentFromSource(aura: IAura, markdown: string): void {
  const slices = aura.markdown.topBlockSourceSlices(markdown)
  aura.document.reset(markdown, slices, collectTopBlocks(aura))
}

/**
 * Sync the document store with the current DOM and return the source.
 *
 * @param aura - Active editor instance.
 * @returns Authoritative Markdown source.
 */
export function syncDocument(aura: IAura): string {
  return aura.document.sync(collectTopBlocks(aura))
}
