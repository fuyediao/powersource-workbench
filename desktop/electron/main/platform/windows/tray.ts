import { app, BrowserWindow, Tray, nativeImage } from 'electron'
import path from 'node:path'
import { APP_SHORT_NAME } from '../../../shared/app-identity'
import type { ApplicationMenuLabels } from '../../../shared/ipc'
import { OPEN_SETTINGS_EVENT, SIGN_OUT_EVENT } from '../../../shared/ipc'
import {
  buildStatusItemMenu,
  DEFAULT_STATUS_ITEM_LABELS,
  type StatusItemLabels,
} from '../status-item-menu'
import { showBrowserWindow } from '../show-window'

let tray: Tray | null = null
let quitting = false
let getWindowRef: () => BrowserWindow | null = () => null
let traySignedIn = false
let trayLabels: StatusItemLabels = DEFAULT_STATUS_ITEM_LABELS

/**
 * Returns whether the app is shutting down from the tray Quit action.
 * @returns True when quit was requested.
 */
export function isTrayQuitting(): boolean {
  return quitting
}

/**
 * Fully quits on Windows (bypasses close-to-tray).
 * @returns Nothing.
 */
export function quitWindowsApp(): void {
  quitting = true
  tray?.destroy()
  tray = null
  app.quit()
}

/**
 * Shows the main window and asks the renderer to open Settings.
 * @returns Nothing.
 */
function openSettingsFromTray(): void {
  const win = getWindowRef()
  showBrowserWindow(win)
  if (!win || win.isDestroyed()) {
    return
  }
  win.webContents.send(OPEN_SETTINGS_EVENT)
}

/**
 * Shows the main window and asks the renderer to sign out.
 * @returns Nothing.
 */
function signOutFromTray(): void {
  const win = getWindowRef()
  showBrowserWindow(win)
  if (!win || win.isDestroyed()) {
    return
  }
  win.webContents.send(SIGN_OUT_EVENT)
}

/**
 * Rebuilds the notification-area tray menu from the latest i18n labels.
 * @returns Nothing.
 */
function refreshWindowsTrayMenu(): void {
  if (!tray) {
    return
  }
  tray.setContextMenu(
    buildStatusItemMenu({
      signedIn: traySignedIn,
      labels: trayLabels,
      onOpen: () => showBrowserWindow(getWindowRef()),
      onSettings: openSettingsFromTray,
      onSignOut: signOutFromTray,
      onQuit: () => {
        quitWindowsApp()
      },
    }),
  )
}

/**
 * Rebuilds the Windows tray after app language or sign-in changes.
 * @param options - Signed-in flag and translated labels.
 * @returns Nothing.
 */
export function updateWindowsTrayMenu(options: {
  signedIn: boolean
  labels: ApplicationMenuLabels
}): void {
  traySignedIn = options.signedIn
  trayLabels = options.labels
  refreshWindowsTrayMenu()
}

/**
 * Creates the Windows notification-area tray icon.
 * @param iconDir - Directory containing multi-size `favicon.ico`.
 * @param getWindow - Resolves the current BrowserWindow.
 * @returns Nothing.
 */
export function createWindowsTray(
  iconDir: string,
  getWindow: () => BrowserWindow | null,
): void {
  if (tray) {
    return
  }

  getWindowRef = getWindow
  const iconPath = path.join(iconDir, 'favicon.ico')
  const image = nativeImage.createFromPath(iconPath)
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip(APP_SHORT_NAME)
  refreshWindowsTrayMenu()
  tray.on('click', () => showBrowserWindow(getWindowRef()))
  tray.on('double-click', () => showBrowserWindow(getWindowRef()))
}

/**
 * Hides the window to the tray instead of destroying it.
 * @param win - Window that received a close request.
 * @param event - Close event (preventable).
 * @returns Nothing.
 */
export function handleWindowsCloseToTray(
  win: BrowserWindow,
  event: Electron.Event,
): void {
  if (quitting || !tray) {
    return
  }
  event.preventDefault()
  win.hide()
}
