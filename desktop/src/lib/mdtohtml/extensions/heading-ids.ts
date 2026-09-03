import type { Heading, PhrasingContent, Root, Text } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Trailing Pandoc / Kramdown-style custom heading id: `## Title {#my-id}`.
 * Id must start with a letter; allows word chars, colon, dot, and hyphen.
 */
export const CUSTOM_HEADING_ID_RE = /\s*\{#([A-Za-z][\w:.-]*)\}\s*$/

/** mdast data fields attached when a custom heading id is found. */
export interface CustomHeadingIdData {
  /** Raw custom id (without `{#…}` wrappers). */
  customHeadingId: string
  /** hast properties for remark-rehype (HTML `id`). */
  hProperties?: { id?: string }
}

/**
 * Read a custom heading id previously attached by `remarkHeadingIds`.
 *
 * @param node - mdast heading node.
 * @returns Custom id, or null.
 */
export function getCustomHeadingId(node: Heading): string | null {
  const data = node.data as CustomHeadingIdData | undefined
  const id = data?.customHeadingId
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Concatenate plain text from phrasing nodes (for trailing `{#id}` detection).
 *
 * @param nodes - Phrasing children.
 * @returns Plain text.
 */
function phrasingPlainText(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text' || node.type === 'inlineCode') {
        return node.value
      }
      if ('children' in node && Array.isArray(node.children)) {
        return phrasingPlainText(node.children as PhrasingContent[])
      }
      return ''
    })
    .join('')
}

/**
 * Strip a trailing `{#id}` marker from the end of phrasing children.
 *
 * @param children - Heading phrasing children.
 * @returns Updated children and the extracted id (if any).
 */
export function stripTrailingCustomHeadingId(
  children: PhrasingContent[],
): { children: PhrasingContent[]; customId: string | null } {
  if (children.length === 0) {
    return { children, customId: null }
  }

  const plain = phrasingPlainText(children)
  const match = CUSTOM_HEADING_ID_RE.exec(plain)
  if (!match || match.index == null) {
    return { children, customId: null }
  }

  const customId = match[1]
  let toRemove = plain.length - match.index
  const out = children.map((child) =>
    child.type === 'text' ? ({ ...child } as Text) : child,
  )

  while (toRemove > 0 && out.length > 0) {
    const last = out[out.length - 1]
    if (last.type !== 'text') {
      // Marker must sit in trailing text; abort if structure is unexpected.
      return { children, customId: null }
    }
    if (last.value.length <= toRemove) {
      toRemove -= last.value.length
      out.pop()
    } else {
      last.value = last.value
        .slice(0, last.value.length - toRemove)
        .replace(/\s+$/u, '')
      toRemove = 0
      if (last.value.length === 0) {
        out.pop()
      }
    }
  }

  return { children: out, customId }
}

/**
 * Remark plugin that recognizes trailing `{#custom-id}` on headings, strips
 * it from the visible title, and stores the id on `node.data` for renderers.
 *
 * @returns Unified transformer.
 */
export const remarkHeadingIds: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'heading', (node: Heading) => {
      const { children, customId } = stripTrailingCustomHeadingId(node.children)
      if (!customId) {
        return
      }
      node.children = children
      const data = (node.data ?? {}) as CustomHeadingIdData
      data.customHeadingId = customId
      data.hProperties = { ...data.hProperties, id: customId }
      node.data = data as Heading['data']
    })
  }
}
