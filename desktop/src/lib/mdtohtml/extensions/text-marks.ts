import type { Root, Text, PhrasingContent } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Which inline text-mark constructs are enabled.
 */
export interface TextMarkOptions {
  /** `==highlight==` → `<mark>`. */
  mark: boolean
  /** `^superscript^` → `<sup>`. */
  sup: boolean
  /** `~subscript~` → `<sub>`. */
  sub: boolean
  /** `||spoiler||` → Discord-style spoiler span. */
  spoiler: boolean
  /** Critic Markup `{++}` / `{--}` / `{==}` / `{>>}`. */
  critic: boolean
}

/** Custom mdast node types emitted for text-mark constructs. */
export type TextMarkType =
  | 'mark'
  | 'sup'
  | 'sub'
  | 'spoiler'
  | 'criticAddition'
  | 'criticDeletion'
  | 'criticHighlight'
  | 'criticComment'

/** Custom mdast node emitted for a text-mark construct. */
export interface TextMarkNode {
  type: TextMarkType
  marker: string
  children: PhrasingContent[]
  data?: { hName: string }
}

interface MarkPattern {
  type: TextMarkType
  marker: string
  source: string
}

/** Parent types that must not be re-scanned for nested delimiters. */
const TEXT_MARK_PARENT_TYPES = new Set<string>([
  'mark',
  'sup',
  'sub',
  'spoiler',
  'criticAddition',
  'criticDeletion',
  'criticHighlight',
  'criticComment',
])

/**
 * Build the enabled delimiter patterns. The scanner always picks the earliest
 * match in the remaining text. Critic `{==…==}` is registered before plain
 * `==…==` so brace-wrapped highlights win when both could apply.
 *
 * @param options - Enabled constructs.
 * @returns Pattern list for the scanner.
 */
function buildPatterns(options: TextMarkOptions): MarkPattern[] {
  const patterns: MarkPattern[] = []
  if (options.critic) {
    patterns.push({
      type: 'criticAddition',
      marker: '{++',
      source: '\\{\\+\\+(.+?)\\+\\+\\}',
    })
    patterns.push({
      type: 'criticDeletion',
      marker: '{--',
      source: '\\{--(.+?)--\\}',
    })
    patterns.push({
      type: 'criticHighlight',
      marker: '{==',
      source: '\\{==(.+?)==\\}',
    })
    patterns.push({
      type: 'criticComment',
      marker: '{>>',
      source: '\\{>>(.+?)<<\\}',
    })
  }
  if (options.spoiler) {
    patterns.push({
      type: 'spoiler',
      marker: '||',
      source: '\\|\\|(.+?)\\|\\|',
    })
  }
  if (options.mark) {
    patterns.push({ type: 'mark', marker: '==', source: '==(.+?)==' })
  }
  if (options.sup) {
    patterns.push({ type: 'sup', marker: '^', source: '\\^([^\\s^]+?)\\^' })
  }
  if (options.sub) {
    patterns.push({ type: 'sub', marker: '~', source: '~([^\\s~]+?)~' })
  }
  return patterns
}

/**
 * Split a text value into a sequence of plain-text and text-mark nodes.
 *
 * @param value - Raw text content.
 * @param patterns - Enabled delimiter patterns.
 * @returns Replacement nodes, or null when nothing matched.
 */
function splitTextMarks(
  value: string,
  patterns: MarkPattern[],
): PhrasingContent[] | null {
  const out: PhrasingContent[] = []
  let rest = value
  let matched = false

  while (rest.length > 0) {
    let best: { pattern: MarkPattern; match: RegExpExecArray } | null = null
    for (const pattern of patterns) {
      const re = new RegExp(pattern.source)
      const match = re.exec(rest)
      if (match && (best === null || match.index < best.match.index)) {
        best = { pattern, match }
      }
    }

    if (best === null) {
      out.push({ type: 'text', value: rest } as Text)
      break
    }

    matched = true
    const { pattern, match } = best
    if (match.index > 0) {
      out.push({ type: 'text', value: rest.slice(0, match.index) } as Text)
    }
    const node: TextMarkNode = {
      type: pattern.type,
      marker: pattern.marker,
      children: [{ type: 'text', value: match[1] } as Text],
      data: { hName: pattern.type },
    }
    out.push(node as unknown as PhrasingContent)
    rest = rest.slice(match.index + match[0].length)
  }

  return matched ? out : null
}

/**
 * Remark plugin that rewrites inline text-mark delimiters into custom mdast
 * nodes (`mark` / `sup` / `sub` / `spoiler` / Critic Markup). Options are read
 * lazily so a single engine instance can honor `Set*` toggles.
 *
 * @param getOptions - Accessor returning the current text-mark options.
 * @returns Unified transformer.
 */
export const remarkTextMarks: Plugin<[() => TextMarkOptions], Root> = (
  getOptions,
) => {
  return (tree: Root) => {
    const patterns = buildPatterns(getOptions())
    if (patterns.length === 0) {
      return
    }
    visit(tree, 'text', (node, index, parent) => {
      if (parent == null || index == null) {
        return
      }
      const parentType = (parent as { type: string }).type
      if (TEXT_MARK_PARENT_TYPES.has(parentType)) {
        return
      }
      const replacement = splitTextMarks(node.value, patterns)
      if (replacement) {
        parent.children.splice(index, 1, ...(replacement as never[]))
        return index + replacement.length
      }
    })
  }
}
