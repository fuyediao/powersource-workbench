import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

/**
 * Platform-specific window chrome and lifecycle hooks.
 */
export interface PlatformShell {
  /** Renderer paints a caption overlay (tabs / Ask AI / pin). */
  readonly usesCustomTitleBar: boolean

  /**
   * Merges platform-specific BrowserWindow options.
   * @returns Partial window options.
   */
  windowOptions: () => Partial<BrowserWindowConstructorOptions>

  /**
   * Runs once when the app is ready (before the first window).
   * @param iconDir - Public assets directory (tray icon, etc.).
   * @param getWindow - Resolves the current main window.
   * @returns Nothing.
   */
  onAppReady: (iconDir: string, getWindow: () => BrowserWindow | null) => void

  /**
   * Runs after the main BrowserWindow is constructed.
   * @param win - New window.
   * @returns Nothing.
   */
  afterCreateWindow: (win: BrowserWindow) => void

  /**
   * Handles the window `close` event.
   * @param win - Closing window.
   * @param event - Close event.
   * @returns Nothing.
   */
  onWindowClose: (win: BrowserWindow, event: Electron.Event) => void

  /**
   * Whether `window-all-closed` should leave the process running.
   * @returns True to keep alive (e.g. Windows / macOS tray).
   */
  shouldKeepAliveOnAllClosed: () => boolean
}
