import type { BrowserWindow } from 'electron'
import {
  WINDOW_FOCUS_EVENT,
  WINDOW_FULLSCREEN_EVENT,
  WINDOW_MAXIMIZED_EVENT,
} from '../shared/ipc'

/**
 * Wires maximize / focus / fullscreen events from a BrowserWindow to its renderer.
 * Kept out of `ipc.ts` so platform shells do not import the login-window cycle.
 * @param win - Application window.
 * @returns Nothing.
 */
export function attachWindowChromeEvents(win: BrowserWindow): void {
  const sendMaximized = (): void => {
    win.webContents.send(WINDOW_MAXIMIZED_EVENT, win.isMaximized())
  }
  const sendFocus = (focused: boolean): void => {
    win.webContents.send(WINDOW_FOCUS_EVENT, focused)
  }
  const sendFullScreen = (): void => {
    win.webContents.send(WINDOW_FULLSCREEN_EVENT, win.isFullScreen())
  }

  win.on('maximize', sendMaximized)
  win.on('unmaximize', sendMaximized)
  win.on('focus', () => sendFocus(true))
  win.on('blur', () => sendFocus(false))
  win.on('enter-full-screen', sendFullScreen)
  win.on('leave-full-screen', sendFullScreen)
}
