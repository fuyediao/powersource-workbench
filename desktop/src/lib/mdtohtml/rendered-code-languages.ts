/** Built-in fenced languages that render to a derived visual preview. */
export const RENDERED_CODE_LANGUAGES = new Set([
  'abc',
  'dot',
  'digraph',
  'echarts',
  'flowchart',
  'graphviz',
  'lily',
  'lilypond',
  'markmap',
  'math',
  'mermaid',
  'mindmap',
  'plantuml',
  'puml',
  'smiles',
  'svg',
])

/**
 * Check whether a fenced language needs separate source and preview panes.
 *
 * @param language - Fence language identifier.
 * @param additional - Additional renderer languages configured by the host.
 * @returns Whether the language has a derived visual renderer.
 */
export function isRenderedCodeLanguage(
  language: string,
  additional: readonly string[] = [],
): boolean {
  const normalized = language.trim().toLowerCase()
  return (
    RENDERED_CODE_LANGUAGES.has(normalized) ||
    additional.some((item) => item.trim().toLowerCase() === normalized)
  )
}
