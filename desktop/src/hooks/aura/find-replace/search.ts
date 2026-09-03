import { getActiveEditor } from '@/utils/aura/active-editor'

export type FindFlags = {
  matchCase: boolean
  wholeWord: boolean
  useRegex: boolean
}

export type FindMatch = {
  range: Range
  text: string
}

type FindPos = { node: Text; offset: number }

const HIGHLIGHT_ALL = 'aura-find'
const HIGHLIGHT_CURRENT = 'aura-find-current'

/**
 * Resolve the WYSIWYG contenteditable root (source mode uses Monaco find).
 *
 * @returns Editor root element, or null when the editor is not ready.
 */
export function getFindRoot(): HTMLElement | null {
  const instance = getActiveEditor() as
    | {
        aura?: {
          wysiwyg?: { element: HTMLElement }
        }
      }
    | undefined
  return instance?.aura?.wysiwyg?.element ?? null
}

/**
 * Escape a string for use inside a RegExp source.
 *
 * @param value - Raw search text.
 * @returns Escaped pattern.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a global RegExp for the query and flags.
 *
 * @param query - User find string.
 * @param flags - Match options.
 * @returns RegExp, or null when the query/pattern is invalid or empty.
 */
export function buildFindRegExp(
  query: string,
  flags: FindFlags,
): RegExp | null {
  if (!query) {
    return null
  }
  let source = flags.useRegex ? query : escapeRegExp(query)
  if (!source) {
    return null
  }
  if (flags.wholeWord) {
    source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  }
  try {
    return new RegExp(source, flags.matchCase ? 'gu' : 'giu')
  } catch {
    return null
  }
}

/**
 * Collect text nodes under the editor root (skip decorative previews).
 *
 * @param root - Active editor element.
 * @returns Ordered text nodes.
 */
function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement!
      if (!parent) {
        return NodeFilter.FILTER_REJECT
      }
      if (
        parent.closest(
          '.aura-wysiwyg__preview, [contenteditable="false"]',
        )
      ) {
        return NodeFilter.FILTER_REJECT
      }
      if (!node.nodeValue) {
        return NodeFilter.FILTER_REJECT
      }
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let current = walker.nextNode()
  while (current) {
    nodes.push(current as Text)
    current = walker.nextNode()
  }
  return nodes
}

/**
 * Map a character offset in the concatenated text to a DOM position.
 *
 * @param nodes - Text nodes in document order.
 * @param index - Global character index.
 * @returns DOM position.
 */
function positionAt(nodes: Text[], index: number): FindPos {
  let remaining = index
  for (const node of nodes) {
    const len = node.nodeValue?.length ?? 0
    if (remaining <= len) {
      return { node, offset: remaining }
    }
    remaining -= len
  }
  const last = nodes[nodes.length - 1]
  return { node: last, offset: last.nodeValue?.length ?? 0 }
}

/**
 * Find all match ranges for the query inside the editor root.
 *
 * @param root - Editor contenteditable.
 * @param query - Find string.
 * @param flags - Match options.
 * @returns Match list (empty when none / invalid pattern).
 */
export function findMatches(
  root: HTMLElement,
  query: string,
  flags: FindFlags,
): FindMatch[] {
  const re = buildFindRegExp(query, flags)
  if (!re) {
    return []
  }
  const nodes = collectTextNodes(root)
  if (nodes.length === 0) {
    return []
  }
  const haystack = nodes.map((node) => node.nodeValue ?? '').join('')
  const matches: FindMatch[] = []
  re.lastIndex = 0
  let found = re.exec(haystack)
  while (found) {
    const text = found[0]
    if (!text) {
      re.lastIndex += 1
      found = re.exec(haystack)
      continue
    }
    const start = found.index
    const end = start + text.length
    const startPos = positionAt(nodes, start)
    const endPos = positionAt(nodes, end)
    const range = document.createRange()
    range.setStart(startPos.node, startPos.offset)
    range.setEnd(endPos.node, endPos.offset)
    matches.push({ range, text })
    found = re.exec(haystack)
  }
  return matches
}

/**
 * Apply CSS Highlight API overlays for all matches and the current one.
 *
 * @param matches - All matches.
 * @param currentIndex - Active match index, or -1.
 */
export function paintFindHighlights(
  matches: FindMatch[],
  currentIndex: number,
): void {
  const highlights = (
    CSS as typeof CSS & {
      highlights?: Map<string, Highlight>
    }
  ).highlights
  if (!highlights) {
    return
  }
  highlights.delete(HIGHLIGHT_ALL)
  highlights.delete(HIGHLIGHT_CURRENT)
  if (matches.length === 0) {
    return
  }
  highlights.set(
    HIGHLIGHT_ALL,
    new Highlight(...matches.map((item) => item.range)),
  )
  if (currentIndex >= 0 && currentIndex < matches.length) {
    highlights.set(
      HIGHLIGHT_CURRENT,
      new Highlight(matches[currentIndex].range),
    )
  }
}

/** Clear find highlight overlays. */
export function clearFindHighlights(): void {
  const highlights = (
    CSS as typeof CSS & {
      highlights?: Map<string, Highlight>
    }
  ).highlights
  highlights?.delete(HIGHLIGHT_ALL)
  highlights?.delete(HIGHLIGHT_CURRENT)
}

/**
 * Scroll a match into view without changing the DOM selection (keeps find-bar focus).
 *
 * @param match - Target match.
 */
export function scrollMatchIntoView(match: FindMatch): void {
  const node = match.range.startContainer
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement
  element?.scrollIntoView({ block: 'center', inline: 'nearest' })
}

/**
 * Select a match range and scroll it into view.
 * Note: updating the Selection moves focus into the contenteditable.
 *
 * @param match - Target match.
 */
export function selectMatch(match: FindMatch): void {
  const selection = window.getSelection()
  if (!selection) {
    return
  }
  selection.removeAllRanges()
  selection.addRange(match.range)
  scrollMatchIntoView(match)
}

/**
 * Apply VS Code–style preserve-case transform to a replacement.
 *
 * @param sample - Original matched text.
 * @param replacement - User replacement string.
 * @returns Case-adjusted replacement.
 */
export function applyPreserveCase(sample: string, replacement: string): string {
  if (!sample || !replacement) {
    return replacement
  }
  if (sample === sample.toUpperCase() && sample !== sample.toLowerCase()) {
    return replacement.toUpperCase()
  }
  if (sample === sample.toLowerCase() && sample !== sample.toUpperCase()) {
    return replacement.toLowerCase()
  }
  if (sample[0] === sample[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

/**
 * Replace the current DOM selection with text (contenteditable).
 *
 * @param text - Insertion text.
 * @returns Whether the browser accepted the edit.
 */
export function replaceSelectionText(text: string): boolean {
  return document.execCommand('insertText', false, text)
}

const HISTORY_KEY = 'aura-find-history'
const HISTORY_MAX = 20

/**
 * Load recent find queries (newest first).
 *
 * @returns History list.
 */
export function loadFindHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

/**
 * Push a query onto find history (deduped, capped).
 *
 * @param query - Non-empty find string.
 */
export function pushFindHistory(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) {
    return
  }
  const next = [
    trimmed,
    ...loadFindHistory().filter((item) => item !== trimmed),
  ]
  localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(next.slice(0, HISTORY_MAX)),
  )
}
