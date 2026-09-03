/**
 * SWR-style hydrate for customer detail tab panels.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getCustomerDetailTabCache,
  setCustomerDetailTabCache,
  type CustomerDetailTabCacheKey,
  type CustomerDetailTabBag,
} from '@/utils/customer-detail-cache'

interface UseCustomerTabCacheResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Writes local state and cache after CRUD. */
  setData: (next: T) => void
}

/**
 * Loads a tab payload from memory cache first, then revalidates in the background.
 * @param customerId - Customer id.
 * @param tabKey - Cache bag key.
 * @param fetcher - Network loader (latest ref is always used).
 * @param errorMessage - Message when fetch fails.
 * @returns Tab data helpers.
 */
export function useCustomerTabCache<K extends CustomerDetailTabCacheKey>(
  customerId: string,
  tabKey: K,
  fetcher: () => Promise<NonNullable<CustomerDetailTabBag[K]>>,
  errorMessage: string,
): UseCustomerTabCacheResult<NonNullable<CustomerDetailTabBag[K]>> {
  type T = NonNullable<CustomerDetailTabBag[K]>
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const errorRef = useRef(errorMessage)
  errorRef.current = errorMessage

  const cached = getCustomerDetailTabCache(customerId, tabKey) as T | undefined
  const [data, setDataState] = useState<T | null>(cached ?? null)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)

  /**
   * Writes data into React state and the shared cache.
   * @param next - Fresh payload.
   * @returns Nothing.
   */
  const setData = useCallback(
    (next: T): void => {
      setDataState(next)
      setCustomerDetailTabCache(customerId, tabKey, next)
    },
    [customerId, tabKey],
  )

  const reload = useCallback(async (): Promise<void> => {
    const hadCache = getCustomerDetailTabCache(customerId, tabKey) !== undefined
    if (!hadCache) {
      setLoading(true)
    }
    setError(null)
    try {
      const next = await fetcherRef.current()
      setDataState(next)
      setCustomerDetailTabCache(customerId, tabKey, next)
    } catch (err) {
      console.error(`[useCustomerTabCache:${tabKey}]`, err)
      setError(errorRef.current)
      if (!hadCache) {
        setDataState(null)
      }
    } finally {
      setLoading(false)
    }
  }, [customerId, tabKey])

  useEffect(() => {
    const hit = getCustomerDetailTabCache(customerId, tabKey) as T | undefined
    if (hit !== undefined) {
      setDataState(hit)
      setLoading(false)
    } else {
      setDataState(null)
      setLoading(true)
    }
    void reload()
  }, [customerId, reload, tabKey])

  return { data, loading, error, reload, setData }
}
