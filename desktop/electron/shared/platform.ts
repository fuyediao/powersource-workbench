/**
 * Shared platform flags for main + preload (no Electron imports).
 */

/** Current Node/Electron platform id. */
export const PLATFORM = process.platform

/** Renderer paints caption overlay (tabs / Ask AI / pin). */
export const USES_CUSTOM_TITLE_BAR = PLATFORM === 'win32' || PLATFORM === 'darwin'

/** Renderer-painted traffic lights (Windows frameless). macOS keeps native lights. */
export const USES_CUSTOM_TRAFFIC_LIGHTS = PLATFORM === 'win32'

/** Notification-area / menu-bar extra + close-to-tray. */
export const USES_SYSTEM_TRAY = PLATFORM === 'win32' || PLATFORM === 'darwin'

/** Native application menu (macOS only). Windows / Linux keep in-page menubars. */
export const USES_NATIVE_APPLICATION_MENU = PLATFORM === 'darwin'

/** Spotlight global shortcut (macOS Control+Shift+Space; elsewhere Alt+Space). */
export const SPOTLIGHT_ACCELERATOR =
  PLATFORM === 'darwin' ? 'Control+Shift+Space' : 'Alt+Space'

/** Open Settings (Cmd+, on macOS, Ctrl+, elsewhere). */
export const SETTINGS_ACCELERATOR = 'CommandOrControl+,'

/**
 * Close the active title-bar tab.
 * macOS keeps Cmd+W; Windows / Linux use Alt+W.
 */
export const CLOSE_TAB_ACCELERATOR = PLATFORM === 'darwin' ? 'CommandOrControl+W' : 'Alt+W'

/**
 * Quit the whole app (tray / menu label accelerator).
 * macOS uses Command+Q; Windows / Linux use Alt+Q.
 */
export const QUIT_ACCELERATOR = PLATFORM === 'darwin' ? 'Command+Q' : 'Alt+Q'
