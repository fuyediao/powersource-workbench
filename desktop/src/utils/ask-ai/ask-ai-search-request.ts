const EVENT = 'geocrm:ask-ai-search'

let pendingQuery: string | null = null

/**
 * Queues a Home / Spotlight query for the Chat Ask page (web search on).
 * @param query - User search text.
 * @returns Nothing.
 */
export function requestAskAiSearch(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) {
    return
  }
  pendingQuery = trimmed
  window.dispatchEvent(new Event(EVENT))
}

/**
 * Takes the queued Ask search query, if any.
 * @returns Pending query, or null.
 */
export function takePendingAskAiSearchQuery(): string | null {
  const next = pendingQuery
  pendingQuery = null
  return next
}

/**
 * Subscribes to Ask search requests (open Chat Ask / send the turn).
 * @param listener - Callback.
 * @returns Unsubscribe.
 */
export function subscribeAskAiSearch(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

/**
 * Parses `geocrm://ask-search?q=` from Spotlight (or other windows).
 * @param url - Candidate URL.
 * @returns Decoded query, or null.
 */
export function parseAskAiSearchUrl(url: string): string | null {
  const trimmed = url.trim()
  const match = /^geocrm:\s*\/\/\s*ask-search(?:\?(.*))?$/i.exec(trimmed)
  if (!match) {
    return null
  }
  const params = new URLSearchParams(match[1] ?? '')
  const query = params.get('q')?.trim() ?? ''
  return query || null
}

/**
 * Builds a Spotlight handoff URL for Ask search.
 * @param query - User search text.
 * @returns Deep link.
 */
export function askAiSearchUrl(query: string): string {
  return `geocrm://ask-search?q=${encodeURIComponent(query.trim())}`
}
