import type { BrowserWindow } from 'electron'
import { isLoginWindowId } from './login-window-flag'
import { isSpotlightWindow } from './spotlight'

/**
 * Returns whether a window is Spotlight or the login window
 * (not a main Workbench shell).
 * @param win - Candidate window.
 * @returns True when the window is an auxiliary panel.
 */
export function isAuxiliaryWindow(win: BrowserWindow | null): boolean {
  return isSpotlightWindow(win) || Boolean(win && isLoginWindowId(win.id))
}
