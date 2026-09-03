import { app, type BrowserWindow } from 'electron'
import { USES_CUSTOM_TITLE_BAR } from '../../../shared/platform'
import { attachWindowChromeEvents } from '../../ipc'
import type { PlatformShell } from '../types'
import { createWindowsTray, handleWindowsCloseToTray, isTrayQuitting } from './tray'

/**
 * Windows shell: frameless renderer traffic lights + system tray (workbench-windows style).
 */
export const windowsShell: PlatformShell = {
  usesCustomTitleBar: USES_CUSTOM_TITLE_BAR,

  /**
   * @returns Frameless window options for custom caption chrome.
   */
  windowOptions: () => ({
    frame: false,
  }),

  /**
   * Sets the AppUserModelID and creates the notification-area tray.
   * @param iconDir - Public assets directory.
   * @param getWindow - Resolves the main window.
   * @returns Nothing.
   */
  onAppReady: (iconDir, getWindow) => {
    app.setAppUserModelId(app.getName())
    createWindowsTray(iconDir, getWindow)
  },

  /**
   * Wires maximize / focus IPC for the custom title bar.
   * @param win - New window.
   * @returns Nothing.
   */
  afterCreateWindow: (win: BrowserWindow) => {
    attachWindowChromeEvents(win)
  },

  /**
   * Close hides to tray unless Quit was chosen.
   * @param win - Closing window.
   * @param event - Close event.
   * @returns Nothing.
   */
  onWindowClose: (win, event) => {
    handleWindowsCloseToTray(win, event)
  },

  /**
   * Keeps the process alive while the window is only hidden to the tray.
   * @returns True unless tray Quit is in progress.
   */
  shouldKeepAliveOnAllClosed: () => !isTrayQuitting(),
}
