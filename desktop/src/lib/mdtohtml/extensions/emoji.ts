import type { Root, Text } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { nameToEmoji } from 'gemoji'

/** Matches `:shortcode:` runs (gemoji names use word chars, `+`, and `-`). */
const SHORTCODE_RE = /:([+\-\w]+):/g

/**
 * Resolve a shortcode to its emoji.
 *
 * Custom aliases (engine `emojis` option) win over the gemoji set. Image
 * values (containing a dot, e.g. `foo.png`) are hint-only and never inlined.
 *
 * @param name - Shortcode without colons.
 * @param custom - Custom alias map from engine options.
 * @returns Unicode emoji, or null when the name is unknown.
 */
function resolveShortcode(
  name: string,
  custom: Record<string, string>,
): string | null {
  const alias = custom[name]
  if (alias && !alias.includes('.')) {
    return alias
  }
  return nameToEmoji[name] ?? null
}

/**
 * Replace `:shortcode:` runs in a text value with Unicode emoji.
 *
 * @param value - Raw text content.
 * @param custom - Custom alias map from engine options.
 * @returns Replaced text, or null when no known shortcode matched.
 */
function replaceShortcodes(
  value: string,
  custom: Record<string, string>,
): string | null {
  let matched = false
  const replaced = value.replace(SHORTCODE_RE, (token, name: string) => {
    const emoji = resolveShortcode(name, custom)
    if (emoji === null) {
      return token
    }
    matched = true
    return emoji
  })
  return matched ? replaced : null
}

/**
 * Remark plugin that renders emoji shortcodes (`:smile:` → 😄) in text nodes.
 * Inline code and fenced code are separate mdast node types, so literal
 * shortcodes inside code are never rewritten. Options are read lazily so a
 * single engine instance can honor runtime emoji-map updates.
 *
 * @param getCustom - Accessor returning the custom emoji alias map.
 * @returns Unified transformer.
 */
export const remarkEmojiShortcodes: Plugin<
  [() => Record<string, string>],
  Root
> = (getCustom) => {
  return (tree: Root) => {
    const custom = getCustom()
    visit(tree, 'text', (node: Text) => {
      const replaced = replaceShortcodes(node.value, custom)
      if (replaced !== null) {
        node.value = replaced
      }
    })
  }
}
