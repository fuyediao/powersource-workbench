import type { Html, Root, RootContent } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Custom mdast node for a Markdown-friendly `<details>` / `<summary>` block.
 * CommonMark ends HTML blocks at blank lines, so the body often arrives as
 * sibling Markdown nodes between open/close tags; this node re-groups them.
 */
export interface DetailsNode {
  type: 'details'
  /** Whether the block is expanded by default (`open` attribute). */
  open: boolean
  /** Plain-text summary label (HTML tags stripped). */
  summary: string
  /** Block children that belong inside the details body. */
  children: RootContent[]
  data?: Record<string, unknown>
  position?: {
    start?: { offset?: number; line?: number; column?: number }
    end?: { offset?: number; line?: number; column?: number }
  }
}

/** Opening `<details…>` that may include a trailing `<summary>…</summary>`. */
const DETAILS_OPEN_RE = /^<details(\s[^>]*)?\s*>([\s\S]*)$/i

/** Closing `</details>` HTML block. */
const DETAILS_CLOSE_RE = /^\s*<\/details\s*>\s*$/i

/** Complete `<details>…</details>` in a single HTML block. */
const DETAILS_COMPLETE_RE =
  /^<details(\s[^>]*)?\s*>([\s\S]*)<\/details\s*>\s*$/i

/** Leading `<summary>…</summary>` inside an HTML fragment. */
const SUMMARY_RE = /^\s*<summary(\s[^>]*)?>([\s\S]*?)<\/summary\s*>\s*/i

/**
 * Strip HTML tags from a summary fragment, decoding a few common entities.
 *
 * @param html - Raw summary inner HTML.
 * @returns Plain text suitable for a `<summary>` label.
 */
function summaryText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()
}

/**
 * Pull a leading `<summary>` out of an HTML fragment.
 *
 * @param html - Fragment after `<details…>`.
 * @returns Summary text and the remainder, or null when no summary is present.
 */
function takeSummary(html: string): { summary: string; rest: string } | null {
  const match = SUMMARY_RE.exec(html)
  if (!match) {
    return null
  }
  return {
    summary: summaryText(match[2]),
    rest: html.slice(match[0].length),
  }
}

/**
 * Build a details node from an open/close range of sibling children.
 *
 * @param openHtml - Opening HTML node value.
 * @param middle - Nodes between open and close tags.
 * @param openNode - Opening HTML mdast node (for position).
 * @param closeNode - Closing HTML mdast node (for position).
 * @returns Details node, or null when the open tag is not recognized.
 */
function buildFromRange(
  openHtml: string,
  middle: RootContent[],
  openNode: Html,
  closeNode: Html,
): DetailsNode | null {
  const openMatch = DETAILS_OPEN_RE.exec(openHtml.trim())
  if (!openMatch) {
    return null
  }
  const open = /\bopen\b/i.test(openMatch[1] ?? '')
  let summary = ''
  const body: RootContent[] = []
  const afterOpen = openMatch[2] ?? ''
  const fromOpen = takeSummary(afterOpen)
  if (fromOpen) {
    summary = fromOpen.summary
    if (fromOpen.rest.trim()) {
      body.push({ type: 'html', value: fromOpen.rest } as Html)
    }
  } else if (afterOpen.trim()) {
    body.push({ type: 'html', value: afterOpen } as Html)
  }

  for (const node of middle) {
    if (!summary && node.type === 'html') {
      const fromMid = takeSummary(node.value)
      if (fromMid) {
        summary = fromMid.summary
        if (fromMid.rest.trim()) {
          body.push({ type: 'html', value: fromMid.rest } as Html)
        }
        continue
      }
    }
    body.push(node)
  }

  return {
    type: 'details',
    open,
    summary,
    children: body,
    position: {
      start: openNode.position?.start,
      end: closeNode.position?.end,
    },
  }
}

/**
 * Build a details node from a single self-contained HTML block. Inner markup
 * stays as one HTML child when it is not empty (Markdown inside was never
 * parsed by CommonMark).
 *
 * @param value - Full `<details>…</details>` HTML.
 * @param source - Original HTML mdast node.
 * @returns Details node, or null when the value is not a complete details block.
 */
function buildFromComplete(value: string, source: Html): DetailsNode | null {
  const match = DETAILS_COMPLETE_RE.exec(value.trim())
  if (!match) {
    return null
  }
  const open = /\bopen\b/i.test(match[1] ?? '')
  let inner = match[2] ?? ''
  let summary = ''
  const fromSummary = takeSummary(inner)
  if (fromSummary) {
    summary = fromSummary.summary
    inner = fromSummary.rest
  }
  const body: RootContent[] = []
  if (inner.trim()) {
    body.push({ type: 'html', value: inner.trim() } as Html)
  }
  return {
    type: 'details',
    open,
    summary,
    children: body,
    position: source.position,
  }
}

/**
 * Walk a parent's children and coalesce CommonMark-split `<details>` ranges.
 *
 * @param children - Mutable list of mdast block nodes.
 */
function coalesceDetails(children: RootContent[]): void {
  let index = 0
  while (index < children.length) {
    const child = children[index]
    if (child.type !== 'html') {
      index += 1
      continue
    }

    const trimmed = child.value.trim()
    if (DETAILS_COMPLETE_RE.test(trimmed)) {
      const complete = buildFromComplete(trimmed, child)
      if (complete) {
        children[index] = complete as unknown as RootContent
      }
      index += 1
      continue
    }

    if (!DETAILS_OPEN_RE.test(trimmed) || DETAILS_CLOSE_RE.test(trimmed)) {
      index += 1
      continue
    }

    let closeIndex = -1
    for (let j = index + 1; j < children.length; j += 1) {
      const candidate = children[j]
      if (
        candidate.type === 'html' &&
        DETAILS_CLOSE_RE.test(candidate.value)
      ) {
        closeIndex = j
        break
      }
    }
    if (closeIndex < 0) {
      index += 1
      continue
    }

    const middle = children.slice(index + 1, closeIndex)
    const details = buildFromRange(
      child.value,
      middle,
      child,
      children[closeIndex] as Html,
    )
    if (!details) {
      index += 1
      continue
    }
    children.splice(index, closeIndex - index + 1, details as unknown as RootContent)
    index += 1
  }
}

/**
 * Remark plugin that regroups `<details>` / `<summary>` HTML around Markdown
 * body blocks so blank lines no longer leave an empty collapsible shell.
 *
 * @returns Unified transformer.
 */
export const remarkDetails: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, (node) => {
      const record = node as { children?: RootContent[] }
      if (!Array.isArray(record.children)) {
        return
      }
      // Only coalesce when HTML siblings can appear (root / block containers).
      if (
        node.type === 'root' ||
        node.type === 'blockquote' ||
        node.type === 'listItem' ||
        node.type === 'footnoteDefinition' ||
        (node as { type: string }).type === 'details'
      ) {
        coalesceDetails(record.children)
      }
    })
  }
}
