import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppItem } from '@/types/library'
import {
  applySavedHomeAppOrder,
  loadHomeAppOrder,
  saveHomeAppOrder,
} from '@/utils/home/home-app-order'

export interface UseHomeAppOrderReturn {
  /** Catalog tiles in the persisted (or default) order. */
  items: AppItem[]
  /** True after the first SQLite read finishes. */
  isLoaded: boolean
  /**
   * Reorders visible tiles and persists the merged catalog order.
   * @param orderedIds - Visible tile ids in the new order.
   */
  reorder: (orderedIds: string[]) => void
}

/**
 * Loads and persists Home Apps feature-tile order in local SQLite.
 * @param userId - Auth user id.
 * @param catalog - Built-in feature tiles (fixed catalog, default order).
 * @returns Ordered items and a reorder writer.
 */
export function useHomeAppOrder(userId: string, catalog: AppItem[]): UseHomeAppOrderReturn {
  const [savedIds, setSavedIds] = useState<string[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setSavedIds(null)
    void loadHomeAppOrder(userId).then((ids) => {
      if (!cancelled) {
        setSavedIds(ids)
      }
    })
    return () => {
      cancelled = true
    }
  }, [userId])

  const items = useMemo(
    () => applySavedHomeAppOrder(catalog, savedIds ?? []),
    [catalog, savedIds],
  )

  const reorder = useCallback(
    (orderedIds: string[]): void => {
      const visibleSet = new Set(orderedIds)
      const nextVisible = [...orderedIds]
      const merged: string[] = []
      for (const app of applySavedHomeAppOrder(catalog, savedIds ?? [])) {
        if (visibleSet.has(app.id)) {
          const take = nextVisible.shift()
          if (take) {
            merged.push(take)
          }
        } else {
          merged.push(app.id)
        }
      }
      merged.push(...nextVisible)
      const unique = applySavedHomeAppOrder(catalog, merged).map((app) => app.id)
      setSavedIds(unique)
      void saveHomeAppOrder(userId, unique)
    },
    [catalog, savedIds, userId],
  )

  return {
    items,
    isLoaded: savedIds !== null,
    reorder,
  }
}
