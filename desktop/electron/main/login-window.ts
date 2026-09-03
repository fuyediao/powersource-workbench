/**
 * Compact sign-in window, kept out of the app-window registry so tab tear-off
 * never treats it as a Workbench shell.
 */
import { BrowserWindow, nativeTheme } from 'electron'
import path from 'node:path'
import { APP_DISPLAY_NAME } from '../shared/app-identity'
import { APP_WINDOW_LOGIN_ARG } from '../shared/ipc'
import { hideNonDarwinMenuBar } from './application-menu'
import { appWindows, createAppWindow, destroyAllAppWindows, focusedAppWindow } from './app-windows'
import { isLoginWindowId, markLoginWindowId, unmarkLoginWindowId } from './login-window-flag'
import { getStoredAuthSession } from './auth-session-store'
import { getPlatformShell, showBrowserWindow, type PlatformShell } from './platform'

/**
 * Resolves the OS shell at call time so a circular import cannot capture
 * an uninitialized `windowsShell` / `darwinShell` during module evaluation.
 * @returns Platform chrome for the current OS.
 */
function platformShell(): PlatformShell {
  return getPlatformShell()
}

const LOGIN_WIDTH = 440
const LOGIN_HEIGHT = 580

let loginWindow: BrowserWindow | null = null
let rendererSignedIn = false
let silentStartPending = false
let preloadPath = ''
let rendererIndexHtml = ''
let devServerUrl: string | undefined
let publicDir = ''

/**
 * One-time wiring from `electron/main/index.ts` before the first window opens.
 * @param options - Preload path, renderer entry points, and public assets dir.
 * @returns Nothing.
 */
export function configureLoginWindow(options: {
  preload: string
  indexHtml: string
  devServerUrl?: string
  publicDir: string
}): void {
  preloadPath = options.preload
  rendererIndexHtml = options.indexHtml
  devServerUrl = options.devServerUrl
  publicDir = options.publicDir
}

/**
 * Marks the first auth report as a silent (tray-only) launch.
 * @param hidden - True when this process should stay hidden until the tray opens it.
 * @returns Nothing.
 */
export function setLoginSilentStart(hidden: boolean): void {
  silentStartPending = hidden
}

/**
 * Returns whether the last renderer report said a session is active.
 * @returns True after a signed-in report.
 */
export function isRendererSignedIn(): boolean {
  return rendererSignedIn
}

/**
 * Returns whether `win` is the compact sign-in window.
 * @param win - Candidate window.
 * @returns True for the login window.
 */
export function isLoginWindow(win: BrowserWindow | null): boolean {
  return Boolean(win && !win.isDestroyed() && isLoginWindowId(win.id))
}

/**
 * Live login window, if any.
 * @returns The sign-in window, or null.
 */
export function getLoginWindow(): BrowserWindow | null {
  if (!loginWindow || loginWindow.isDestroyed()) {
    loginWindow = null
    return null
  }
  return loginWindow
}

/**
 * Window that tray / Dock / activate should show: app shell, else login.
 * @returns A live window, or null.
 */
export function getForegroundWindow(): BrowserWindow | null {
  return focusedAppWindow() ?? getLoginWindow()
}

/**
 * Destroys the compact sign-in window (do not `close()` — that hides to tray).
 * @returns Nothing.
 */
function destroyLoginWindow(): void {
  const win = getLoginWindow()
  if (win) {
    win.destroy()
  }
  loginWindow = null
}

/**
 * Creates the compact sign-in window, or reuses the existing one.
 * @param seed - Initial visibility.
 * @returns The login window after its renderer has loaded.
 */
export async function createLoginWindow(seed?: { show?: boolean }): Promise<BrowserWindow> {
  const existing = getLoginWindow()
  if (existing) {
    if (seed?.show !== false) {
      showBrowserWindow(existing)
    }
    return existing
  }

  const win = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    width: LOGIN_WIDTH,
    height: LOGIN_HEIGHT,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    minimizable: true,
    center: true,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111416' : '#f7f8f8',
    show: seed?.show ?? true,
    icon: process.platform === 'darwin' ? undefined : path.join(publicDir, 'favicon.ico'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [APP_WINDOW_LOGIN_ARG],
    },
    ...platformShell().windowOptions(),
  })

  loginWindow = win
  markLoginWindowId(win.id)
  platformShell().afterCreateWindow(win)
  hideNonDarwinMenuBar(win)

  win.on('close', (event) => {
    platformShell().onWindowClose(win, event)
  })
  win.on('closed', () => {
    unmarkLoginWindowId(win.id)
    if (loginWindow === win) {
      loginWindow = null
    }
  })

  if (devServerUrl) {
    await win.loadURL(devServerUrl)
  } else {
    await win.loadFile(rendererIndexHtml)
  }

  return win
}

/**
 * Shows an existing session window, or opens login / the shell as needed.
 * @returns Nothing.
 */
export async function showOrCreateSessionWindow(): Promise<void> {
  if (rendererSignedIn || getStoredAuthSession()) {
    rendererSignedIn = true
    const live = appWindows()
    if (live.length > 0) {
      showBrowserWindow(live.find((win) => win.isFocused()) ?? live[live.length - 1] ?? null)
      return
    }
    await createAppWindow()
    return
  }
  await createLoginWindow({ show: true })
}

/**
 * Opens the shell when this machine already has a cached session, otherwise
 * the compact sign-in window.
 * @param seed - Initial visibility.
 * @returns Nothing.
 */
export async function openInitialSessionWindow(seed?: { show?: boolean }): Promise<void> {
  if (getStoredAuthSession()) {
    rendererSignedIn = true
    if (appWindows().length === 0) {
      await createAppWindow({ show: seed?.show ?? true })
    }
    return
  }
  await createLoginWindow(seed)
}

/**
 * Switches between the compact login window and the main shell.
 * @param signedIn - True when the renderer has a Workbench session.
 * @returns Nothing.
 */
export async function applyRendererSignedIn(signedIn: boolean): Promise<void> {
  const hideForSilentStart = silentStartPending
  silentStartPending = false
  rendererSignedIn = signedIn

  if (signedIn) {
    if (appWindows().length === 0) {
      await createAppWindow({ show: !hideForSilentStart })
    } else if (!hideForSilentStart) {
      showBrowserWindow(getForegroundWindow())
    }
    destroyLoginWindow()
    return
  }

  await createLoginWindow({ show: !hideForSilentStart })
  destroyAllAppWindows()
}
