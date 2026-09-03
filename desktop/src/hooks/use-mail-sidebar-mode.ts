import { useCallback, useState } from 'react'

export type MailSidebarMode = 'expanded' | 'collapsed' | 'hover'

export const MAIL_SIDEBAR_EXPANDED_PX = 240
export const MAIL_SIDEBAR_COLLAPSED_PX = 48

const STORAGE_KEY = 'geocrm-electron-mail-sidebar-mode'

/**
 * Reads a persisted mail sidebar mode from localStorage.
 * @returns Valid mode, or expanded when unset/invalid.
 */
function readStoredMode(): MailSidebarMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'expanded' || stored === 'collapsed' || stored === 'hover') {
      return stored
    }
  } catch {
    // ignore quota / private mode
  }
  return 'expanded'
}

export interface UseMailSidebarModeReturn {
  mode: MailSidebarMode
  expanded: boolean
  reservedPx: number
  setMode: (mode: MailSidebarMode) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocusIn: () => void
  onFocusOut: (event: { currentTarget: EventTarget | null; relatedTarget: EventTarget | null }) => void
}

/**
 * Vue Admin-style mail folder rail: expanded, collapsed, or expand on hover.
 * @returns Mode, visual expand flag, reserved layout width, and pointer/focus handlers.
 */
export function useMailSidebarMode(): UseMailSidebarModeReturn {
  const [mode, setModeState] = useState<MailSidebarMode>(readStoredMode)
  const [hover, setHover] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)

  const expanded = mode === 'expanded' || (mode === 'hover' && (hover || focusWithin))
  const reservedPx = mode === 'expanded' ? MAIL_SIDEBAR_EXPANDED_PX : MAIL_SIDEBAR_COLLAPSED_PX

  const setMode = useCallback((next: MailSidebarMode): void => {
    setModeState(next)
    setHover(false)
    setFocusWithin(false)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore quota / private mode
    }
  }, [])

  const onPointerEnter = useCallback((): void => {
    if (mode !== 'hover') {
      return
    }
    setHover(true)
  }, [mode])

  const onPointerLeave = useCallback(
    (): void => {
      if (mode !== 'hover') {
        return
      }
      setHover(false)
    },
    [mode],
  )

  const onFocusIn = useCallback((): void => {
    if (mode !== 'hover') {
      return
    }
    setFocusWithin(true)
  }, [mode])

  const onFocusOut = useCallback(
    (event: { currentTarget: EventTarget | null; relatedTarget: EventTarget | null }): void => {
      if (mode !== 'hover') {
        return
      }
      const root = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null
      if (root && next && root.contains(next)) {
        return
      }
      setFocusWithin(false)
    },
    [mode],
  )

  return {
    mode,
    expanded,
    reservedPx,
    setMode,
    onPointerEnter,
    onPointerLeave,
    onFocusIn,
    onFocusOut,
  }
}
