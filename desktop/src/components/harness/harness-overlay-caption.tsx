/**
 * Compact Ask Agent overlay caption.
 * Windows / Linux paint a single red close light. macOS leaves a drag strip
 * for the native traffic-light cluster (minimize and zoom stay disabled).
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const CLOSE_ACTIVE = '#FF5F57'
const INACTIVE = '#787878'
/** Close glyph (WinUI #AARRGGBB BF3C0700 → CSS #RRGGBBAA). */
const GLYPH_CLOSE = '#3c0700bf'

/**
 * Hides the Agent overlay BrowserWindow.
 * @returns Nothing.
 */
function hideOverlay(): void {
  void window.workbench?.agentOverlay?.hide?.()
}

/**
 * Returns whether this overlay should paint a close light (not macOS native).
 * @returns True on Windows / Linux.
 */
function paintsOverlayCloseLight(): boolean {
  return !window.workbench?.window?.usesNativeApplicationMenu
}

/**
 * Overlay caption: native lights on macOS, painted red close elsewhere.
 * @returns Drag strip, with a close light when the platform paints its own.
 */
export function HarnessOverlayCaption() {
  const { t } = useTranslation()
  const paintClose = paintsOverlayCloseLight()
  const [focused, setFocused] = useState(() => document.hasFocus())
  const [hovering, setHovering] = useState(false)
  const showGlyphs = hovering && focused
  const closeColor = focused ? CLOSE_ACTIVE : INACTIVE

  useEffect(() => {
    if (!paintClose) {
      return
    }
    /**
     * Syncs light color with overlay window focus.
     * @returns Nothing.
     */
    function onFocusChange(): void {
      setFocused(document.hasFocus())
    }
    window.addEventListener('focus', onFocusChange)
    window.addEventListener('blur', onFocusChange)
    return () => {
      window.removeEventListener('focus', onFocusChange)
      window.removeEventListener('blur', onFocusChange)
    }
  }, [paintClose])

  if (!paintClose) {
    return (
      <div
        className="title-bar title-bar-native-inset flex h-8 shrink-0 items-center [-webkit-app-region:drag]"
        aria-hidden
      />
    )
  }

  return (
    <div className="title-bar flex h-8 shrink-0 items-center px-2.5 [-webkit-app-region:drag]">
      <button
        type="button"
        className="title-bar-traffic title-bar-no-drag grid size-3.5 place-items-center rounded-full"
        style={{ backgroundColor: closeColor }}
        title={t('agentOverlay.close')}
        aria-label={t('agentOverlay.close')}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={hideOverlay}
      >
        <svg
          viewBox="0 0 8 8"
          className="size-2 transition-opacity duration-100"
          style={{ opacity: showGlyphs ? 1 : 0 }}
          aria-hidden
        >
          <path
            d="M2 2 L6 6 M6 2 L2 6"
            fill="none"
            stroke={GLYPH_CLOSE}
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
