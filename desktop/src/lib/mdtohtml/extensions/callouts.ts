import type { Root, Blockquote, Paragraph, Text } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/** Recognized GFM alert / callout types. */
const CALLOUT_TYPES = new Set([
  'NOTE',
  'TIP',
  'IMPORTANT',
  'WARNING',
  'CAUTION',
])

/** Leading `[!TYPE]` marker at the start of a callout blockquote. */
const CALLOUT_MARKER_RE = /^\[!(\w+)\]\s*\n?/

/**
 * Remark plugin that recognizes `> [!TYPE]` alert blockquotes and tags them
 * with `data.calloutType` plus hast properties so both the Aura renderer and
 * the HTML preview emit `data-type="callout" data-subtype="TYPE"`.
 *
 * @param getEnabled - Accessor returning whether callouts are enabled.
 * @returns Unified transformer.
 */
export const remarkCallouts: Plugin<[() => boolean], Root> = (getEnabled) => {
  return (tree: Root) => {
    if (!getEnabled()) {
      return
    }
    visit(tree, 'blockquote', (node: Blockquote) => {
      const first = node.children[0]
      if (!first || first.type !== 'paragraph') {
        return
      }
      const paragraph = first as Paragraph
      const firstChild = paragraph.children[0]
      if (!firstChild || firstChild.type !== 'text') {
        return
      }
      const textNode = firstChild as Text
      const match = CALLOUT_MARKER_RE.exec(textNode.value)
      if (!match) {
        return
      }
      const type = match[1].toUpperCase()
      if (!CALLOUT_TYPES.has(type)) {
        return
      }

      textNode.value = textNode.value.slice(match[0].length)
      // Drop a now-empty leading paragraph (marker was on its own line).
      if (
        textNode.value === '' &&
        paragraph.children.length === 1
      ) {
        node.children.shift()
      }

      const data = (node.data ?? {}) as {
        calloutType?: string
        hProperties?: Record<string, string>
      }
      data.calloutType = type
      data.hProperties = {
        ...data.hProperties,
        'data-type': 'callout',
        'data-subtype': type,
      }
      node.data = data
    })
  }
}
