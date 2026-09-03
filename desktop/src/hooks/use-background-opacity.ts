import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_BACKGROUND_OPACITY,
  fetchBackgroundOpacity,
  MAX_BACKGROUND_OPACITY,
  MIN_BACKGROUND_OPACITY,
  saveBackgroundOpacity,
} from '@/utils/home/library-api'

/**
 * Clamps background opacity into the supported range.
 * @param value - Raw opacity.
 * @returns Clamped opacity.
 */
function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_OPACITY
  }
  return Math.min(MAX_BACKGROUND_OPACITY, Math.max(MIN_BACKGROUND_OPACITY, value))
}

/**
 * Loads and updates page wallpaper opacity, persisting to Supabase.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @returns Opacity state and setter.
 */
export function useBackgroundOpacity(userId: string | null): {
  opacity: number
  setOpacity: (opacity: number) => void
} {
  const [opacity, setOpacityState] = useState(DEFAULT_BACKGROUND_OPACITY)
  const saveTimer = useRef<number | null>(null)
  const pendingOpacity = useRef<number | null>(null)
  const userIdRef = useRef<string | null>(userId)
  userIdRef.current = userId

  useEffect(() => {
    if (!userId) {
      setOpacityState(DEFAULT_BACKGROUND_OPACITY)
      return
    }

    let active = true
    void fetchBackgroundOpacity(userId)
      .then((next) => {
        if (!active) {
          return
        }
        setOpacityState(clampOpacity(next))
      })
      .catch(() => undefined)
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
      void saveBackgroundOpacity(currentUserId, value).catch(() => undefined)
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
      void saveBackgroundOpacity(userId, value).catch(() => undefined)
    }, 250)
  }

  return { opacity, setOpacity }
}
