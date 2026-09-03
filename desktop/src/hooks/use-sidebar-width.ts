/**
 * Persisted map sidebar width (Vue useSidebarWidth parity).
 */

import { useCallback, useState } from 'react'

const SIDEBAR_WIDTH_STORAGE_KEY = 'geocrm-electron-map-sidebar-width'
const DEFAULT_WIDTH = 400
const MIN_WIDTH = 300
const MAX_WIDTH = 800

/**
 * Reads the initial sidebar width from localStorage.
 *
 * @returns Clamped width in pixels
 */
function getInitialWidth(): number {
  try {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (stored) {
      const width = Number.parseInt(stored, 10)
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) return width
    }
  } catch {
    // ignore
  }
  return DEFAULT_WIDTH
}

export interface UseSidebarWidthReturn {
  sidebarWidth: number
  updateWidth: (newWidth: number) => void
  minWidth: number
  maxWidth: number
}

/**
 * Sidebar width with localStorage persistence.
 *
 * @returns Width state and updater
 */
export function useSidebarWidth(): UseSidebarWidthReturn {
  const [sidebarWidth, setSidebarWidth] = useState(getInitialWidth)

  const updateWidth = useCallback((newWidth: number) => {
    const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
    setSidebarWidth(clamped)
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped))
    } catch {
      // ignore
    }
  }, [])

  return {
    sidebarWidth,
    updateWidth,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
  }
}
