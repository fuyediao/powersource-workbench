import { apiGetJson, apiPostJson } from './api-client'

export interface MarketQuote {
  id: string
  symbol: string
  name: string
  kind: 'crypto' | 'stock'
  price: number
  change: number
}

export interface MarketSearchHit {
  id: string
  symbol: string
  name: string
  kind: 'crypto' | 'stock'
  thumb: string | null
}

export interface MarketAssetRequest {
  id: string
  symbol: string
  name: string
  kind: 'crypto' | 'stock'
}

/**
 * Loads quotes for selected market assets via geocrm-api POST /start/markets/quotes.
 * @param assets - Selected assets.
 * @returns Quotes (empty on failure).
 */
export async function fetchMarketQuotes(assets: MarketAssetRequest[]): Promise<MarketQuote[]> {
  if (assets.length === 0) {
    return []
  }
  try {
    const data = await apiPostJson<{ quotes?: MarketQuote[] }>('/start/markets/quotes', {
      assets,
    })
    return Array.isArray(data.quotes) ? data.quotes : []
  } catch {
    return []
  }
}

/**
 * Searches market assets via geocrm-api GET /start/markets/search.
 * @param query - Search text.
 * @returns Hits (empty on failure).
 */
export async function searchMarketAssets(query: string): Promise<MarketSearchHit[]> {
  try {
    const params = new URLSearchParams({ q: query })
    const data = await apiGetJson<{ results?: MarketSearchHit[] }>(
      `/start/markets/search?${params.toString()}`,
    )
    return Array.isArray(data.results) ? data.results : []
  } catch {
    return []
  }
}
