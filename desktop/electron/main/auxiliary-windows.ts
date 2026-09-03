import type { BrowserWindow } from 'electron'
import { isAgentOverlayWindow } from './agent-overlay'
import { isSpotlightWindow } from './spotlight'

/**
 * Returns whether a window is Spotlight or the Agent overlay (not the main app).
 * @param win - Candidate window.
 * @returns True when the window is an auxiliary panel.
 */
export function isAuxiliaryWindow(win: BrowserWindow | null): boolean {
  return isSpotlightWindow(win) || isAgentOverlayWindow(win)
}
