import type { BrowserWindow } from 'electron'
import { isAgentOverlayWindow } from './agent-overlay'
import { isLoginWindowId } from './login-window-flag'
import { isSpotlightWindow } from './spotlight'

/**
 * Returns whether a window is Spotlight, the Agent overlay, or the login window
 * (not a main Workbench shell).
 * @param win - Candidate window.
 * @returns True when the window is an auxiliary panel.
 */
export function isAuxiliaryWindow(win: BrowserWindow | null): boolean {
  return (
    isSpotlightWindow(win) ||
    isAgentOverlayWindow(win) ||
    Boolean(win && isLoginWindowId(win.id))
  )
}
