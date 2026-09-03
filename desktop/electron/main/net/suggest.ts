import { apiGetJson } from './api-client'

export type SuggestEngine = 'Google' | 'Bing' | 'Yahoo'

/**
 * Loads search suggestions via workbench-api GET /start/suggest.
 * @param engine - Active search engine.
 * @param query - Search text.
 * @returns Suggestion strings (empty on failure).
 */
export async function fetchSuggestions(
  engine: SuggestEngine,
  query: string,
): Promise<string[]> {
  try {
    const params = new URLSearchParams({ engine, q: query })
    const data = await apiGetJson<{ suggestions?: string[] }>(
      `/start/suggest?${params.toString()}`,
    )
    return Array.isArray(data.suggestions) ? data.suggestions : []
  } catch {
    return []
  }
}
