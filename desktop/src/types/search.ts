export type WebSearchEngine = 'Google' | 'Bing' | 'Yahoo'

export type SearchEngine = WebSearchEngine | 'Ask'

const WEB_SEARCH_ENGINES: readonly WebSearchEngine[] = ['Google', 'Bing', 'Yahoo']

const SEARCH_ENGINES: readonly SearchEngine[] = [...WEB_SEARCH_ENGINES, 'Ask']

/**
 * Returns whether a value is a known search engine id (including Ask).
 * @param value - Candidate.
 * @returns True for Google, Bing, Yahoo, or Ask.
 */
export function isSearchEngine(value: unknown): value is SearchEngine {
  return typeof value === 'string' && (SEARCH_ENGINES as readonly string[]).includes(value)
}

/**
 * Returns whether an engine opens a public web search URL.
 * @param value - Candidate.
 * @returns True for Google, Bing, or Yahoo.
 */
export function isWebSearchEngine(value: unknown): value is WebSearchEngine {
  return typeof value === 'string' && (WEB_SEARCH_ENGINES as readonly string[]).includes(value)
}

/**
 * Engine used for typeahead suggestions (Ask reuses Google).
 * @param engine - Selected engine.
 * @returns Google, Bing, or Yahoo.
 */
export function suggestEngineFor(engine: SearchEngine): WebSearchEngine {
  return isWebSearchEngine(engine) ? engine : 'Google'
}
