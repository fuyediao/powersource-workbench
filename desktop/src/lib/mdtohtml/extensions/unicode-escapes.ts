import type { Root, Text } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/** ES6-style `\u{1F680}` escapes (1–6 hex digits). */
const U_BRACE_ESCAPE_RE = /\\u\{([0-9a-fA-F]{1,6})\}/g

/** Classic `\u4f60` four-digit hex escapes. */
const U_HEX4_ESCAPE_RE = /\\u([0-9a-fA-F]{4})/g

/**
 * Decode `\uXXXX` / `\u{...}` runs in plain text.
 *
 * @param value - Raw text node content.
 * @returns Decoded text, or null when no escape matched.
 */
function decodeUnicodeEscapes(value: string): string | null {
  let matched = false
  let out = value.replace(U_BRACE_ESCAPE_RE, (token, hex: string) => {
    const code = Number.parseInt(hex, 16)
    if (!Number.isFinite(code) || code > 0x10ffff) {
      return token
    }
    matched = true
    return String.fromCodePoint(code)
  })
  out = out.replace(U_HEX4_ESCAPE_RE, (token, hex: string) => {
    const code = Number.parseInt(hex, 16)
    if (!Number.isFinite(code)) {
      return token
    }
    matched = true
    return String.fromCodePoint(code)
  })
  return matched ? out : null
}

/**
 * Remark plugin that decodes JavaScript-style Unicode escapes in text nodes
 * (`\u4f60\u597d` → 你好). Inline / fenced code uses separate mdast nodes,
 * so escapes inside code stay literal.
 *
 * @returns Unified transformer.
 */
export const remarkUnicodeEscapes: Plugin<[], Root> = () => {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text) => {
      const decoded = decodeUnicodeEscapes(node.value)
      if (decoded !== null) {
        node.value = decoded
      }
    })
  }
}
