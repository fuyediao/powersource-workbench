/** Aggregated document metrics for the status-bar word-count panel. */
export type DocumentStats = {
  /** Total characters (markdown source, trailing newline ignored). */
  characters: number
  /** CJK characters + Latin/numeric word tokens. */
  words: number
  /** Line count (at least 1 when the document is non-empty). */
  lines: number
  /** Estimated reading time in whole minutes (min 1 when there is content). */
  readingMinutes: number
}

const EMPTY_STATS: DocumentStats = {
  characters: 0,
  words: 0,
  lines: 0,
  readingMinutes: 0,
}

/** Typora-ish speaking pace for mixed CJK / Latin word units. */
const WORDS_PER_MINUTE = 400

/**
 * Count words like Typora: each CJK ideograph is one word; Latin runs are
 * whitespace/punctuation-separated tokens.
 *
 * @param text - Document text.
 * @returns Word count.
 */
function countWords(text: string): number {
  const cjkMatches = text.match(
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g,
  )
  const cjkCount = cjkMatches?.length ?? 0
  const latinSource = text.replace(
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g,
    ' ',
  )
  const latinMatches = latinSource.match(
    /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g,
  )
  return cjkCount + (latinMatches?.length ?? 0)
}

/**
 * Compute word-count panel stats from markdown source.
 *
 * @param markdown - Current document markdown.
 * @returns Character, word, line, and reading-time stats.
 */
export function computeDocumentStats(markdown: string): DocumentStats {
  if (!markdown) {
    return EMPTY_STATS
  }
  const characters = markdown.endsWith('\n')
    ? markdown.length - 1
    : markdown.length
  if (characters <= 0) {
    return EMPTY_STATS
  }
  const words = countWords(markdown)
  const lines = markdown.endsWith('\n')
    ? markdown.split('\n').length - 1
    : markdown.split('\n').length
  const readingMinutes =
    words > 0 ? Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) : 0
  return { characters, words, lines, readingMinutes }
}
