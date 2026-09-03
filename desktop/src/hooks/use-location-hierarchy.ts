/**
 * Map viewport hierarchy (backward / forward) — Vue useLocationHierarchy parity.
 */

import { useCallback, useRef, useState } from 'react'
import type {
  Coordinates,
  LocationHierarchy,
  LocationView,
  ShopLocation,
} from '@/types/chat'

const EMPTY_VIEW: LocationView = {
  center: { latitude: 0, longitude: 0 },
  zoom: 2,
  shops: [],
}

const EMPTY_HIERARCHY: LocationHierarchy = {
  current: EMPTY_VIEW,
  history: [],
  forward: [],
}

export interface UseLocationHierarchyReturn {
  canGoBackward: boolean
  canGoForward: boolean
  currentView: LocationView
  setCurrentView: (
    center: Coordinates,
    zoom: number,
    shops: ShopLocation[],
    query?: string,
  ) => void
  goBackward: () => LocationView | null
  goForward: () => LocationView | null
  clearHierarchy: () => void
}

/**
 * Maintains a stack of map views for undo/redo-style navigation.
 *
 * @returns Hierarchy state and navigation helpers
 */
export function useLocationHierarchy(): UseLocationHierarchyReturn {
  const hierarchyRef = useRef<LocationHierarchy>(EMPTY_HIERARCHY)
  const [hierarchy, setHierarchy] = useState<LocationHierarchy>(EMPTY_HIERARCHY)

  const sync = useCallback((next: LocationHierarchy) => {
    hierarchyRef.current = next
    setHierarchy(next)
  }, [])

  const setCurrentView = useCallback(
    (center: Coordinates, zoom: number, shops: ShopLocation[], query?: string) => {
      const prev = hierarchyRef.current
      const history =
        prev.current.shops.length > 0 ? [...prev.history, { ...prev.current }] : prev.history
      sync({
        history,
        forward: [],
        current: { center, zoom, shops, query },
      })
    },
    [sync],
  )

  const goBackward = useCallback((): LocationView | null => {
    const prev = hierarchyRef.current
    if (prev.history.length === 0) return null
    const history = [...prev.history]
    const previousView = history.pop()
    if (!previousView) return null
    const forward =
      prev.current.shops.length > 0 ? [...prev.forward, { ...prev.current }] : prev.forward
    sync({ history, forward, current: previousView })
    return previousView
  }, [sync])

  const goForward = useCallback((): LocationView | null => {
    const prev = hierarchyRef.current
    if (prev.forward.length === 0) return null
    const forward = [...prev.forward]
    const nextView = forward.pop()
    if (!nextView) return null
    const history =
      prev.current.shops.length > 0 ? [...prev.history, { ...prev.current }] : prev.history
    sync({ history, forward, current: nextView })
    return nextView
  }, [sync])

  const clearHierarchy = useCallback(() => {
    sync(EMPTY_HIERARCHY)
  }, [sync])

  return {
    canGoBackward: hierarchy.history.length > 0,
    canGoForward: hierarchy.forward.length > 0,
    currentView: hierarchy.current,
    setCurrentView,
    goBackward,
    goForward,
    clearHierarchy,
  }
}
