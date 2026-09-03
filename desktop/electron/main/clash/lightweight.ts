import { clashHostWindow } from './host'

let autoTimer: NodeJS.Timeout | null = null
let closeListenerWin: Electron.BrowserWindow | null = null
let focusListenerWin: Electron.BrowserWindow | null = null
let onCloseHandler: (() => void) | null = null
let onFocusHandler: (() => void) | null = null
let inLightweightMode = false

/**
 * Whether the main window is currently parked in lightweight mode.
 * @returns True while lightweight mode is active.
 */
export function isInLightweightMode(): boolean {
  return inLightweightMode
}

/**
 * Cancels the pending auto-lightweight timer (window regained focus, or the feature was
 * turned off), matching Clash Verge's `cancel_light_weight_timer`.
 */
function cancelAutoTimer(): void {
  if (autoTimer) {
    clearTimeout(autoTimer)
    autoTimer = null
  }
}

/**
 * Hides the main window (Clash Verge's own `entry_lightweight_mode` — Workbench keeps one
 * window/tray instead of spawning a second Clash-only surface).
 * @returns True when the window was hidden by this call.
 */
export function enterLightweightMode(): boolean {
  if (inLightweightMode) {
    return false
  }
  const win = clashHostWindow()
  if (win) {
    win.hide()
  }
  inLightweightMode = true
  cancelAutoTimer()
  return true
}

/**
 * Shows the main window again and re-arms the close/focus listeners when auto mode is on.
 * @returns True when lightweight mode was exited by this call.
 */
export function exitLightweightMode(): boolean {
  if (!inLightweightMode) {
    return false
  }
  const win = clashHostWindow()
  if (win) {
    win.show()
    win.focus()
  }
  inLightweightMode = false
  cancelAutoTimer()
  return true
}

/**
 * Arms a one-shot timer that enters lightweight mode after `minutes`, matching
 * `setup_light_weight_timer`.
 * @param minutes - Idle delay before auto-entering lightweight mode.
 */
function armAutoTimer(minutes: number): void {
  cancelAutoTimer()
  autoTimer = setTimeout(() => {
    autoTimer = null
    enterLightweightMode()
  }, Math.max(1, minutes) * 60 * 1000)
}

/**
 * Enables auto-lightweight mode: arms the timer when the window is closed-to-tray, cancels it
 * on focus. Matches Clash Verge's window-close / webview-focus listener pair.
 * @param minutes - Idle delay before auto-entering lightweight mode.
 */
export function enableAutoLightweightMode(minutes: number): void {
  disableAutoLightweightMode()
  const win = clashHostWindow()
  if (!win) {
    return
  }
  closeListenerWin = win
  focusListenerWin = win
  onCloseHandler = () => armAutoTimer(minutes)
  onFocusHandler = cancelAutoTimer
  win.on('close', onCloseHandler)
  win.on('focus', onFocusHandler)
}

/**
 * Disables auto-lightweight mode (removes listeners, cancels any pending timer).
 */
export function disableAutoLightweightMode(): void {
  cancelAutoTimer()
  if (closeListenerWin && !closeListenerWin.isDestroyed() && onCloseHandler) {
    closeListenerWin.removeListener('close', onCloseHandler)
  }
  if (focusListenerWin && !focusListenerWin.isDestroyed() && onFocusHandler) {
    focusListenerWin.removeListener('focus', onFocusHandler)
  }
  closeListenerWin = null
  focusListenerWin = null
  onCloseHandler = null
  onFocusHandler = null
}
