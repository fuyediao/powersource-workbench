import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_SEARCH_PANEL_OPACITY,
  fetchSearchPanelOpacity,
  MAX_PANEL_OPACITY,
  MIN_PANEL_OPACITY,
  saveSearchPanelOpacity,
} from '@/utils/home/library-api'

/**
 * Clamps search-panel opacity into the supported range.
 * @param value - Raw opacity.
 * @returns Clamped opacity.
 */
function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SEARCH_PANEL_OPACITY
  }
  return Math.min(MAX_PANEL_OPACITY, Math.max(MIN_PANEL_OPACITY, value))
}

/**
 * Applies search suggestions panel opacity to the document CSS variable.
 * @param opacity - Opacity value (0–1).
 * @returns Nothing.
 */
function applySearchPanelOpacity(opacity: number): void {
  document.documentElement.style.setProperty(
    '--search-panel-alpha',
    String(clampOpacity(opacity)),
  )
}

/**
 * Loads and updates search-suggestions panel opacity, persisting to Supabase.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Opacity state and setter.
 */
export function useSearchPanelOpacity(userId: string | null): {
  opacity: number
  setOpacity: (opacity: number) => void
} {
  const [opacity, setOpacityState] = useState(DEFAULT_SEARCH_PANEL_OPACITY)
  const saveTimer = useRef<number | null>(null)
  const pendingOpacity = useRef<number | null>(null)
  const userIdRef = useRef<string | null>(userId)
  userIdRef.current = userId

  useEffect(() => {
    if (!userId) {
      setOpacityState(DEFAULT_SEARCH_PANEL_OPACITY)
      applySearchPanelOpacity(DEFAULT_SEARCH_PANEL_OPACITY)
      return
    }

    let active = true
    void fetchSearchPanelOpacity(userId)
      .then((next) => {
        if (!active) {
          return
        }
        const clamped = clampOpacity(next)
        setOpacityState(clamped)
        applySearchPanelOpacity(clamped)
      })
      .catch(() => {
        if (active) {
          applySearchPanelOpacity(DEFAULT_SEARCH_PANEL_OPACITY)
        }
      })
    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    /**
     * Flushes any debounced opacity write to Supabase immediately.
     * @returns Nothing.
     */
    function flushPendingSave(): void {
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
      if (pendingOpacity.current === null) {
        return
      }
      const value = pendingOpacity.current
      pendingOpacity.current = null
      const currentUserId = userIdRef.current
      if (!currentUserId) {
        return
      }
      void saveSearchPanelOpacity(currentUserId, value).catch(() => undefined)
    }

    window.addEventListener('pagehide', flushPendingSave)
    return () => {
      window.removeEventListener('pagehide', flushPendingSave)
      flushPendingSave()
    }
  }, [])

  /**
   * Updates opacity immediately and persists it to Supabase after a short debounce.
   * @param nextOpacity - Next opacity value.
   * @returns Nothing.
   */
  function setOpacity(nextOpacity: number): void {
    const clamped = clampOpacity(nextOpacity)
    setOpacityState(clamped)
    applySearchPanelOpacity(clamped)
    if (!userId) {
      return
    }
    pendingOpacity.current = clamped
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      const value = pendingOpacity.current
      if (value === null) {
        return
      }
      pendingOpacity.current = null
      void saveSearchPanelOpacity(userId, value).catch(() => undefined)
    }, 250)
  }

  return { opacity, setOpacity }
}
