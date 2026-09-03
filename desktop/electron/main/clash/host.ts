import { BrowserWindow } from 'electron'

let getMainWindow: () => BrowserWindow | null = () => null

/**
 * Registers the main-window accessor used to emit Clash events into the renderer.
 * @param options - Window getter.
 */
export function configureClashHost(options: {
  getMainWindow: () => BrowserWindow | null
}): void {
  getMainWindow = options.getMainWindow
}

/**
 * WebContents of the GeoCRM main window (Clash UI lives in this renderer).
 * @returns Main-window webContents, or null.
 */
export function clashHostContents(): Electron.WebContents | null {
  const win = getMainWindow()
  if (!win || win.isDestroyed()) {
    return null
  }
  const contents = win.webContents
  if (!contents || contents.isDestroyed()) {
    return null
  }
  return contents
}

/**
 * GeoCRM main window (dialog parenting, show/hide for lightweight mode).
 * @returns Main window, or null when destroyed/absent.
 */
export function clashHostWindow(): BrowserWindow | null {
  const win = getMainWindow()
  return win && !win.isDestroyed() ? win : null
}
