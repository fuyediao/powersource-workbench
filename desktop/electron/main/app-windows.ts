/**
 * Registry of full GeoCRM application windows.
 *
 * Every window created here is a GeoCRM shell (title-bar tabs, Ask AI, pin).
 * The first window and dock-created windows also have a Home launcher;
 * windows spawned by tab tear-off omit it. Spotlight and the Agent overlay
 * are separate auxiliary panels and never enter this registry (see
 * `auxiliary-windows.ts`). This registry backs Chrome-style title-bar tab
 * tear-off / merge: a torn-off tab spawns a new app window here, and a
 * dropped-on-caption tab targets another window from {@link appWindows}.
 */

import { BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { APP_DISPLAY_NAME } from '../shared/app-identity'
import { APP_WINDOW_HIDE_HOME_ARG } from '../shared/ipc'
import { hideNonDarwinMenuBar } from './application-menu'
import { destroyInAppBrowserPanesForWindow } from './in-app-browser'
import { getPlatformShell } from './platform'

const platformShell = getPlatformShell()

/** Live top-level app windows, oldest first (excludes Spotlight / Agent overlay). */
const windows = new Set<BrowserWindow>()

let preloadPath = ''
let rendererIndexHtml = ''
let devServerUrl: string | undefined
let publicDir = ''
let harnessE2EMode = false

/**
 * Title-bar caption strip height in DIP — matches `h-10` (2.5rem) in
 * `MacStyleTitleBar.tsx`. Used to hit-test a Chrome-style tab merge drop.
 */
export const TITLE_BAR_CAPTION_HEIGHT_DIP = 40

/** Optional placement / visibility for a newly created app window. */
export interface AppWindowSeed {
  /** Screen x for the new window's top-left corner (omit for Electron's default placement). */
  x?: number
  /** Screen y for the new window's top-left corner. */
  y?: number
  /** False keeps the window hidden until the caller shows it. Defaults to true. */
  show?: boolean
  /**
   * False omits the Home launcher (windows spawned by tab tear-off / Open in
   * new window). Defaults to true for the first shell and dock "new window".
   */
  showHomeButton?: boolean
}

/**
 * One-time wiring from `electron/main/index.ts` before the first window opens.
 * @param options - Preload path, renderer entry points, public assets dir, and E2E flag.
 * @returns Nothing.
 */
export function configureAppWindows(options: {
  preload: string
  indexHtml: string
  devServerUrl?: string
  publicDir: string
  harnessE2EMode: boolean
}): void {
  preloadPath = options.preload
  rendererIndexHtml = options.indexHtml
  devServerUrl = options.devServerUrl
  publicDir = options.publicDir
  harnessE2EMode = options.harnessE2EMode
}

/**
 * Builds `webPreferences.additionalArguments` for one app window.
 * @param seed - Optional window seed (Home launcher, etc.).
 * @returns Argv flags forwarded into the preload / renderer.
 */
function buildAdditionalArguments(seed?: AppWindowSeed): string[] {
  const args: string[] = []
  if (harnessE2EMode) {
    args.push('--harness-e2e-renderer')
  }
  if (seed?.showHomeButton === false) {
    args.push(APP_WINDOW_HIDE_HOME_ARG)
  }
  return args
}

/**
 * Creates one full GeoCRM shell window (Home, title-bar tabs, Ask AI, pin).
 * @param seed - Optional screen position and initial visibility.
 * @returns The new window, after its renderer has finished loading.
 */
export async function createAppWindow(seed?: AppWindowSeed): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    x: seed?.x,
    y: seed?.y,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    show: seed?.show ?? true,
    icon:
      process.platform === 'darwin' ? undefined : path.join(publicDir, 'favicon.ico'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: buildAdditionalArguments(seed),
    },
    ...platformShell.windowOptions(),
  })

  windows.add(win)
  platformShell.afterCreateWindow(win)
  hideNonDarwinMenuBar(win)

  // Restore browser-style reload / fullscreen when the native menu bar is hidden.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return
    }

    const noModifiers = !input.alt && !input.meta && !input.control && !input.shift
    if (input.key === 'F11' && noModifiers) {
      event.preventDefault()
      if (!win.isDestroyed()) {
        win.setFullScreen(!win.isFullScreen())
      }
      return
    }

    const isReloadChord =
      (input.key.toLowerCase() === 'r' &&
        (input.control || input.meta) &&
        !input.alt &&
        !input.shift) ||
      (input.key === 'F5' && noModifiers)
    if (!isReloadChord) {
      return
    }
    event.preventDefault()
    win.webContents.reload()
  })

  // Only the last surviving app window hides to tray; extra windows close normally
  // (destroy) so tear-off / merge does not pin every window open forever.
  win.on('close', (event) => {
    if (windows.size > 1) {
      return
    }
    platformShell.onWindowClose(win, event)
  })

  win.on('closed', () => {
    windows.delete(win)
    destroyInAppBrowserPanesForWindow(win)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Allow blob/data popups so in-app PDF (and similar) can use Chromium’s viewer.
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 820,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      }
    }
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (devServerUrl) {
    await win.loadURL(devServerUrl)
    // Detached so DevTools do not sit inside the custom title-bar chrome.
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(rendererIndexHtml)
  }

  return win
}

/**
 * Live app windows, oldest first.
 * @returns Non-destroyed windows created by {@link createAppWindow}.
 */
export function appWindows(): BrowserWindow[] {
  return Array.from(windows).filter((win) => !win.isDestroyed())
}

/**
 * Resolves the app window that should receive tray / menu / Spotlight actions.
 * @returns The OS-focused app window, else the most recently created live one, else null.
 */
export function focusedAppWindow(): BrowserWindow | null {
  const live = appWindows()
  if (live.length === 0) {
    return null
  }
  return live.find((win) => win.isFocused()) ?? live[live.length - 1] ?? null
}

/**
 * Finds a live app window by Electron `BrowserWindow.id`.
 * @param id - Window id.
 * @returns Matching window, or null.
 */
export function appWindowById(id: number): BrowserWindow | null {
  return appWindows().find((win) => win.id === id) ?? null
}

/**
 * Finds the app window under a screen point — the Chrome-style tab-merge hit test.
 * @param point - Screen coordinates (same space as `screen.getCursorScreenPoint()`).
 * @param options - `excluding` skips the drag source; `captionOnly` restricts the
 *   hit box to the title-bar strip instead of the whole window.
 * @returns Matching window, or null.
 */
export function windowAtScreenPoint(
  point: { x: number; y: number },
  options?: { excluding?: BrowserWindow | null; captionOnly?: boolean },
): BrowserWindow | null {
  for (const win of appWindows()) {
    if (options?.excluding && win === options.excluding) {
      continue
    }
    const bounds = win.getBounds()
    const withinWindow =
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    if (!withinWindow) {
      continue
    }
    if (!options?.captionOnly || point.y <= bounds.y + TITLE_BAR_CAPTION_HEIGHT_DIP) {
      return win
    }
  }
  return null
}

/**
 * Destroys every live app window (app quit only — tab tear-off never calls this).
 * @returns Nothing.
 */
export function destroyAllAppWindows(): void {
  for (const win of appWindows()) {
    if (!win.isDestroyed()) {
      win.destroy()
    }
  }
}
