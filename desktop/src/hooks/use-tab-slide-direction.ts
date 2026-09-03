import { useRef } from 'react'
import type { TitleBarTabId } from '@/components/layout/MacStyleTitleBar'
import { isFeatureTabId } from '@/constants/feature-tabs'
import { isBrowserTabId } from '@/utils/settings/link-open-preference'

export type TabSlideDirection = 'forward' | 'back' | null

/**
 * Maps a title-bar tab to a coarse order index for slide direction.
 * @param id - Active or previous tab id.
 * @returns Order index, or -1 when unknown.
 */
function tabOrderIndex(id: TitleBarTabId): number {
  if (id === 'home') {
    return 0
  }
  if (id === 'settings' || isFeatureTabId(id)) {
    return 1
  }
  if (isBrowserTabId(id)) {
    return 2
  }
  return -1
}

/**
 * Resolves enter direction when switching Chrome-style title tabs.
 * @param screen - Active title-bar tab.
 * @returns `forward` (right), `back` (left), or null on first paint.
 */
export function useTabSlideDirection(screen: TitleBarTabId): TabSlideDirection {
  const previousRef = useRef<TitleBarTabId | null>(null)
  const previous = previousRef.current
  previousRef.current = screen

  if (previous === null || previous === screen) {
    return null
  }

  const fromIndex = tabOrderIndex(previous)
  const toIndex = tabOrderIndex(screen)
  if (fromIndex < 0 || toIndex < 0) {
    return null
  }

  return toIndex > fromIndex ? 'forward' : 'back'
}
