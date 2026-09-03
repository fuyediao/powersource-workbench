import { app, BrowserWindow, Tray, nativeImage } from 'electron'
import fs from 'node:fs'
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

/** Menu-bar extra template (72px PNG drawn at 24pt). */
const TRAY_TEMPLATE_PNG = 'tray-iconTemplate.png'

/** Logical menu-bar icon size in points (status item slot). */
const TRAY_TEMPLATE_POINT_SIZE = 24

/**
 * Returns whether the app is shutting down from tray Quit or Command+Q.
 * @returns True when quit was requested.
 */
export function isDarwinTrayQuitting(): boolean {
  return quitting
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
 * Builds the menu-bar extra context menu from the latest i18n labels.
 * @returns Nothing.
 */
function refreshDarwinTrayMenu(): void {
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
        quitting = true
        tray?.destroy()
        tray = null
        app.quit()
      },
    }),
  )
}

/**
 * Rebuilds the menu-bar extra after app language or sign-in changes.
 * @param options - Signed-in flag and translated labels.
 * @returns Nothing.
 */
export function updateDarwinTrayMenu(options: {
  signedIn: boolean
  labels: ApplicationMenuLabels
}): void {
  traySignedIn = options.signedIn
  trayLabels = options.labels
  refreshDarwinTrayMenu()
}

/**
 * Builds the menu-bar template image (monochrome, appearance-aware).
 * One 72px PNG is enough; `scaleFactor` maps it to 24pt so Retina stays sharp.
 * @param iconDir - Public assets directory.
 * @returns Tray native image.
 */
function createMacTrayImage(iconDir: string): Electron.NativeImage {
  const templatePath = path.join(iconDir, TRAY_TEMPLATE_PNG)
  if (!fs.existsSync(templatePath)) {
    return nativeImage.createEmpty()
  }
  const png = fs.readFileSync(templatePath)
  const probe = nativeImage.createFromBuffer(png)
  if (probe.isEmpty()) {
    return nativeImage.createEmpty()
  }
  const { width } = probe.getSize()
  const scaleFactor = Math.max(1, width / TRAY_TEMPLATE_POINT_SIZE)
  const icon = nativeImage.createFromBuffer(png, { scaleFactor })
  icon.setTemplateImage(true)
  return icon
}

/**
 * Creates the macOS menu-bar extra (status item).
 * @param iconDir - Directory containing `tray-iconTemplate.png`.
 * @param getWindow - Resolves the current BrowserWindow.
 * @returns Nothing.
 */
export function createDarwinTray(
  iconDir: string,
  getWindow: () => BrowserWindow | null,
): void {
  if (tray) {
    return
  }

  getWindowRef = getWindow
  const image = createMacTrayImage(iconDir)
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip(APP_SHORT_NAME)
  // macOS menu-bar extra: left click opens the menu (`setContextMenu`).
  // Windows keeps right-click for the menu and left-click to show the window.
  refreshDarwinTrayMenu()

  app.on('before-quit', () => {
    quitting = true
    tray?.destroy()
    tray = null
  })
}

/**
 * Hides the window to the menu-bar extra instead of destroying it.
 * @param win - Window that received a close request.
 * @param event - Close event (preventable).
 * @returns Nothing.
 */
export function handleDarwinCloseToTray(
  win: BrowserWindow,
  event: Electron.Event,
): void {
  if (quitting || !tray) {
    return
  }
  event.preventDefault()
  win.hide()
}
