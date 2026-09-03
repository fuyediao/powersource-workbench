import type { BrowserWindow } from 'electron'

/**
 * Shows and focuses a BrowserWindow (restore from minimize / tray).
 * @param win - Window to show, or null.
 * @returns Nothing.
 */
export function showBrowserWindow(win: BrowserWindow | null): void {
  if (!win) {
    return
  }
  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
}
