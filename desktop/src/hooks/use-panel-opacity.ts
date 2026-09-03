import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_PANEL_OPACITY,
  fetchPanelOpacity,
  MAX_PANEL_OPACITY,
  MIN_PANEL_OPACITY,
  savePanelOpacity,
} from '@/utils/home/library-api'

/**
 * Clamps panel opacity into the supported range.
 * @param value - Raw opacity.
 * @returns Clamped opacity.
 */
function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PANEL_OPACITY
  }
  return Math.min(MAX_PANEL_OPACITY, Math.max(MIN_PANEL_OPACITY, value))
}

/**
 * Applies panel opacity to the document CSS variable.
 * @param opacity - Opacity value.
 * @returns Nothing.
 */
function applyPanelOpacity(opacity: number): void {
  document.documentElement.style.setProperty('--panel-alpha', String(clampOpacity(opacity)))
}

/**
 * Loads and updates the shared glass panel opacity, persisting to Supabase.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Opacity state and setter.
 */
export function usePanelOpacity(userId: string | null): {
  opacity: number
  setOpacity: (opacity: number) => void
} {
  const [opacity, setOpacityState] = useState(DEFAULT_PANEL_OPACITY)
  const saveTimer = useRef<number | null>(null)
  const pendingOpacity = useRef<number | null>(null)
  const userIdRef = useRef<string | null>(userId)
  userIdRef.current = userId

  useEffect(() => {
    if (!userId) {
      setOpacityState(DEFAULT_PANEL_OPACITY)
      applyPanelOpacity(DEFAULT_PANEL_OPACITY)
      return
    }

    let active = true
    void fetchPanelOpacity(userId)
      .then((next) => {
        if (!active) {
          return
        }
        const clamped = clampOpacity(next)
        setOpacityState(clamped)
        applyPanelOpacity(clamped)
      })
      .catch(() => {
        if (active) {
          applyPanelOpacity(DEFAULT_PANEL_OPACITY)
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
      void savePanelOpacity(currentUserId, value).catch(() => undefined)
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
    applyPanelOpacity(clamped)
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
      void savePanelOpacity(userId, value).catch(() => undefined)
    }, 250)
  }

  return { opacity, setOpacity }
}
