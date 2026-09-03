import { useEffect, useState } from 'react'
import { fetchMarketQuotes, type MarketQuoteDto } from '@/utils/shared/api'
import {
  fetchMarketAssetSelection,
  saveMarketAssetSelection,
  type MarketAssetDto,
} from '@/utils/home/library-api'

export type MarketQuote = MarketQuoteDto
export type MarketAsset = MarketAssetDto

const LEGACY_STORAGE_KEY = 'atlas-markets-assets'
const REFRESH_MS = 30_000

/**
 * Reads a one-time legacy localStorage selection for migration.
 * @returns Legacy assets or null.
 */
function readLegacyAssets(): MarketAsset[] | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return null
    }
    const assets = parsed.flatMap((item) => {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as MarketAsset).id !== 'string' ||
        typeof (item as MarketAsset).symbol !== 'string' ||
        typeof (item as MarketAsset).name !== 'string' ||
        ((item as MarketAsset).kind !== 'crypto' && (item as MarketAsset).kind !== 'stock')
      ) {
        return []
      }
      return [item as MarketAsset]
    })
    return assets.length > 0 ? assets.slice(0, 2) : null
  } catch {
    return null
  }
}

/**
 * Loads selected market quotes from the Supabase-backed selection and refreshes every 30s.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Quotes, selection, and updater.
 */
export function useMarkets(userId: string | null): {
  quotes: MarketQuote[]
  assets: MarketAsset[]
  loading: boolean
  setAssets: (assets: MarketAsset[]) => void
} {
  const [assets, setAssetsState] = useState<MarketAsset[]>([])
  const [quotes, setQuotes] = useState<MarketQuote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
      setAssetsState([])
      setQuotes([])
      setLoading(false)
      return
    }

    const currentUserId = userId
    let active = true

    /**
     * Applies a selection to local state and loads fresh quotes for it.
     * @param nextAssets - Selected assets from Supabase.
     * @returns Nothing.
     */
    async function applySelection(nextAssets: MarketAsset[]): Promise<void> {
      if (!active) {
        return
      }
      setAssetsState(nextAssets)
      const nextQuotes = await fetchMarketQuotes(nextAssets).catch(() => [])
      if (active) {
        setQuotes(nextQuotes)
      }
    }

    /**
     * Loads selection from Supabase, migrating legacy localStorage once.
     * @returns Nothing.
     */
    async function bootstrap(): Promise<void> {
      try {
        const remote = await fetchMarketAssetSelection(currentUserId)
        const legacy = readLegacyAssets()
        if (legacy) {
          // Drop the legacy key first so a later refresh cannot re-apply it.
          window.localStorage.removeItem(LEGACY_STORAGE_KEY)
          if (remote.length === 0) {
            const saved = await saveMarketAssetSelection(currentUserId, legacy)
            await applySelection(saved)
            return
          }
        }

        await applySelection(remote)
      } catch {
        if (active) {
          setAssetsState([])
          setQuotes([])
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    const intervalId = window.setInterval(() => {
      void fetchMarketAssetSelection(currentUserId)
        .then((current) => fetchMarketQuotes(current))
        .then((next) => {
          if (active) {
            setQuotes(next)
          }
        })
        .catch(() => undefined)
    }, REFRESH_MS)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [userId])

  /**
   * Persists a new asset selection to Supabase and refreshes quotes.
   * @param nextAssets - Selected assets (max 2).
   * @returns Nothing.
   */
  function setAssets(nextAssets: MarketAsset[]): void {
    const limited = nextAssets.slice(0, 2)
    setAssetsState(limited)
    if (!userId) {
      return
    }
    setLoading(true)
    void saveMarketAssetSelection(userId, limited)
      .then(async (saved) => {
        setAssetsState(saved)
        setQuotes(await fetchMarketQuotes(saved).catch(() => []))
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }

  return { quotes, assets, loading, setAssets }
}
