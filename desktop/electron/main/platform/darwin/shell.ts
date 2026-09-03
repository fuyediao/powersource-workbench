import type { BrowserWindow } from 'electron'
import { USES_CUSTOM_TITLE_BAR } from '../../../shared/platform'
import { attachWindowChromeEvents } from '../../ipc'
import type { PlatformShell } from '../types'
import { resolveMacAppIconPath, syncMacDockIconWithAppearance } from './app-icon'
import {
  createDarwinTray,
  handleDarwinCloseToTray,
  isDarwinTrayQuitting,
} from './tray'

/**
 * Vertical offset that centers native 12px traffic lights in the 40px caption.
 * Matches Cursor / VS Code hidden title bar alignment.
 */
const TRAFFIC_LIGHT_Y = 14

/**
 * Left inset matching Windows `ml-4` traffic-light cluster.
 */
const TRAFFIC_LIGHT_X = 16

/**
 * macOS shell: Cursor-style hidden title bar (native traffic lights + overlay).
 */
export const darwinShell: PlatformShell = {
  usesCustomTitleBar: USES_CUSTOM_TITLE_BAR,

  /**
   * @returns Hidden native title bar with inset traffic lights.
   */
  windowOptions: () => ({
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: TRAFFIC_LIGHT_X, y: TRAFFIC_LIGHT_Y },
    ...(process.env.VITE_PUBLIC
      ? { icon: resolveMacAppIconPath(process.env.VITE_PUBLIC) }
      : {}),
  }),

  /**
   * Sets the light Dock icon and creates the menu-bar extra.
   * @param iconDir - Public assets directory.
   * @param getWindow - Resolves the main window.
   * @returns Nothing.
   */
  onAppReady: (iconDir, getWindow) => {
    syncMacDockIconWithAppearance(iconDir)
    createDarwinTray(iconDir, getWindow)
  },

  /**
   * Wires maximize / focus IPC for the caption overlay.
   * @param win - New window.
   * @returns Nothing.
   */
  afterCreateWindow: (win: BrowserWindow) => {
    attachWindowChromeEvents(win)
  },

  /**
   * Close hides to the menu-bar extra unless Quit was chosen.
   * @param win - Closing window.
   * @param event - Close event.
   * @returns Nothing.
   */
  onWindowClose: (win, event) => {
    handleDarwinCloseToTray(win, event)
  },

  /**
   * Keeps the process alive while the window is only hidden to the tray.
   * @returns True unless tray Quit / Command+Q is in progress.
   */
  shouldKeepAliveOnAllClosed: () => !isDarwinTrayQuitting(),
}
