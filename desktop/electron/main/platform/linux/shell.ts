import type { BrowserWindow } from 'electron'
import type { PlatformShell } from '../types'

/**
 * Linux (and other) shell: standard framed window.
 */
export const linuxShell: PlatformShell = {
  usesCustomTitleBar: false,

  /**
   * @returns Default framed window options.
   */
  windowOptions: () => ({
    frame: true,
  }),

  /**
   * No Linux-specific ready hooks yet.
   * @returns Nothing.
   */
  onAppReady: () => undefined,

  /**
   * No extra post-create chrome on Linux.
   * @param _win - New window.
   * @returns Nothing.
   */
  afterCreateWindow: (_win: BrowserWindow) => undefined,

  /**
   * Native close destroys the window.
   * @returns Nothing.
   */
  onWindowClose: () => undefined,

  /**
   * @returns Always false.
   */
  shouldKeepAliveOnAllClosed: () => false,
}
