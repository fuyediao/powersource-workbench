import { useCallback, useState } from 'react'

/** Shared rail modes (Admin / Settings / Clash). `hidden` is macOS native-menu only. */
export type SidebarMode = 'expanded' | 'collapsed' | 'hover' | 'hidden'

export const SIDEBAR_EXPANDED_PX = 240
export const SIDEBAR_COLLAPSED_PX = 48

export interface UseSidebarModeOptions {
  /** localStorage key for persistence. */
  storageKey: string
  /** Mode when storage is empty or invalid. */
  defaultMode?: SidebarMode
}

export interface UseSidebarModeReturn {
  mode: SidebarMode
  expanded: boolean
  reservedPx: number
  setMode: (mode: SidebarMode) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocusIn: () => void
  onFocusOut: (event: {
    currentTarget: EventTarget | null
    relatedTarget: EventTarget | null
  }) => void
}

/**
 * Returns whether the macOS native menu can restore a fully hidden rail.
 * @returns True on darwin with the application menu.
 */
function nativeMenuAllowsHidden(): boolean {
  return Boolean(window.workbench?.window?.usesNativeApplicationMenu)
}

/**
 * Coerces a stored or requested mode so Windows/Linux never stick on Hidden.
 * @param mode - Candidate mode.
 * @param defaultMode - Fallback when Hidden is not allowed.
 * @returns Valid mode for this platform.
 */
function coerceSidebarMode(mode: SidebarMode, defaultMode: SidebarMode): SidebarMode {
  if (mode === 'hidden' && !nativeMenuAllowsHidden()) {
    return defaultMode === 'hidden' ? 'hover' : defaultMode
  }
  return mode
}

/**
 * Reads a persisted sidebar mode from localStorage.
 * @param storageKey - Persistence key.
 * @param defaultMode - Fallback mode.
 * @returns Valid mode.
 */
function readStoredMode(storageKey: string, defaultMode: SidebarMode): SidebarMode {
  try {
    const stored = localStorage.getItem(storageKey)
    if (
      stored === 'expanded' ||
      stored === 'collapsed' ||
      stored === 'hover' ||
      stored === 'hidden'
    ) {
      return coerceSidebarMode(stored, defaultMode)
    }
  } catch {
    // ignore quota / private mode
  }
  return coerceSidebarMode(defaultMode, 'hover')
}

/**
 * Expand / collapse / hover / hidden rail mode with reserved layout width.
 * Hidden is only applied when the native application menu can show the rail again.
 * @param options - Storage key and default mode.
 * @returns Mode, visual expand flag, reserved width, and pointer/focus handlers.
 */
export function useSidebarMode(options: UseSidebarModeOptions): UseSidebarModeReturn {
  const { storageKey, defaultMode = 'expanded' } = options
  const [mode, setModeState] = useState<SidebarMode>(() =>
    readStoredMode(storageKey, defaultMode),
  )
  const [hover, setHover] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)

  const expanded = mode === 'expanded' || (mode === 'hover' && (hover || focusWithin))
  const reservedPx =
    mode === 'hidden'
      ? 0
      : mode === 'expanded'
        ? SIDEBAR_EXPANDED_PX
        : SIDEBAR_COLLAPSED_PX

  const setMode = useCallback(
    (next: SidebarMode): void => {
      const resolved = coerceSidebarMode(next, defaultMode)
      setModeState(resolved)
      setHover(false)
      setFocusWithin(false)
      try {
        localStorage.setItem(storageKey, resolved)
      } catch {
        // ignore quota / private mode
      }
    },
    [defaultMode, storageKey],
  )

  const onPointerEnter = useCallback((): void => {
    if (mode !== 'hover') {
      return
    }
    setHover(true)
  }, [mode])

  const onPointerLeave = useCallback((): void => {
    if (mode !== 'hover') {
      return
    }
    setHover(false)
  }, [mode])

  const onFocusIn = useCallback((): void => {
    if (mode !== 'hover') {
      return
    }
    setFocusWithin(true)
  }, [mode])

  const onFocusOut = useCallback(
    (event: {
      currentTarget: EventTarget | null
      relatedTarget: EventTarget | null
    }): void => {
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
