import {
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  type BrowserWindowConstructorOptions,
} from 'electron'
import {
  OPEN_URL_IN_APP_EVENT,
  SPOTLIGHT_IPC_CHANNEL,
  SPOTLIGHT_SHOWN_EVENT,
} from '../shared/ipc'
import { SPOTLIGHT_ACCELERATOR } from '../shared/platform'
import { hideNonDarwinMenuBar } from './application-menu'

/** Default Spotlight window width (px). */
const SPOTLIGHT_WIDTH = 720

/** Minimum Spotlight window height (px) — search bar only. */
const SPOTLIGHT_MIN_HEIGHT = 104

/** Maximum Spotlight window height (px). */
const SPOTLIGHT_MAX_HEIGHT = 560

let spotlightWin: BrowserWindow | null = null
/** In-flight create so warm preload + first toggle cannot open two windows. */
let spotlightCreatePromise: Promise<BrowserWindow> | null = null
let preloadPath = ''
let loadUrl = ''
let loadFile = ''
let getMainWindow: (() => BrowserWindow | null) | null = null
let blurHideArmed = false
let globalShortcutRegistered = false
let lastToggleAt = 0

/** Ignore duplicate shortcut / IPC toggles within this window (ms). */
const TOGGLE_DEBOUNCE_MS = 280

/**
 * Builds BrowserWindow options for the floating Spotlight panel.
 * @returns Constructor options.
 */
function spotlightWindowOptions(): BrowserWindowConstructorOptions {
  return {
    title: 'Spotlight',
    width: SPOTLIGHT_WIDTH,
    height: SPOTLIGHT_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }
}

/**
 * Resolves the display that should host Spotlight (main window’s screen, else primary).
 * @returns Electron display.
 */
function getTargetDisplay(): Electron.Display {
  const main = getMainWindow?.() ?? null
  if (main && !main.isDestroyed()) {
    return screen.getDisplayMatching(main.getBounds())
  }
  return screen.getPrimaryDisplay()
}

/**
 * Places Spotlight on the target display (Mac-style upper-middle).
 * Top is based on the search-bar height so a taller results list grows downward.
 * @param win - Spotlight window.
 * @param height - Content height in CSS pixels.
 * @returns Nothing.
 */
function placeSpotlightWindow(win: BrowserWindow, height: number): void {
  const display = getTargetDisplay()
  const { x, y, width, height: workHeight } = display.workArea
  const winHeight = Math.min(
    SPOTLIGHT_MAX_HEIGHT,
    Math.max(SPOTLIGHT_MIN_HEIGHT, Math.round(height)),
  )
  const left = Math.round(x + (width - SPOTLIGHT_WIDTH) / 2)
  const top = Math.round(y + workHeight * 0.28 - SPOTLIGHT_MIN_HEIGHT / 2)
  win.setBounds({
    x: left,
    y: Math.max(y + 12, top),
    width: SPOTLIGHT_WIDTH,
    height: winHeight,
  })
}

/**
 * Loads the Spotlight renderer route into the window.
 * @param win - Spotlight window.
 * @returns Nothing.
 */
async function loadSpotlightContents(win: BrowserWindow): Promise<void> {
  if (loadUrl) {
    await win.loadURL(`${loadUrl}#spotlight`)
    return
  }
  await win.loadFile(loadFile, { hash: 'spotlight' })
}

/**
 * Creates the Spotlight BrowserWindow if needed.
 * @returns Spotlight window.
 */
async function ensureSpotlightWindow(): Promise<BrowserWindow> {
  if (spotlightWin && !spotlightWin.isDestroyed()) {
    return spotlightWin
  }
  if (spotlightCreatePromise) {
    return spotlightCreatePromise
  }

  spotlightCreatePromise = (async (): Promise<BrowserWindow> => {
    const win = new BrowserWindow(spotlightWindowOptions())
    hideNonDarwinMenuBar(win)
    spotlightWin = win

    win.on('closed', () => {
      if (spotlightWin === win) {
        spotlightWin = null
      }
    })

    win.on('blur', () => {
      if (!blurHideArmed || win.isDestroyed()) {
        return
      }
      win.hide()
    })

    await loadSpotlightContents(win)
    return win
  })()

  try {
    return await spotlightCreatePromise
  } finally {
    spotlightCreatePromise = null
  }
}

/**
 * Shows and focuses Spotlight, then asks the renderer to focus the input.
 * @returns Nothing.
 */
async function showSpotlight(): Promise<void> {
  const win = await ensureSpotlightWindow()
  blurHideArmed = false
  placeSpotlightWindow(win, SPOTLIGHT_MIN_HEIGHT)
  if (!win.isVisible()) {
    win.show()
  }
  win.focus()
  win.webContents.focus()
  win.webContents.send(SPOTLIGHT_SHOWN_EVENT)
  // Delay blur-hide so the focus transition from the main window does not close immediately.
  setTimeout(() => {
    blurHideArmed = true
  }, 280)
}

/**
 * Hides the Spotlight window when present.
 * @returns Nothing.
 */
export function hideSpotlight(): void {
  blurHideArmed = false
  if (spotlightWin && !spotlightWin.isDestroyed() && spotlightWin.isVisible()) {
    spotlightWin.hide()
  }
}

/**
 * Toggles Spotlight visibility (debounced so the global shortcut cannot fire twice).
 * @returns Nothing.
 */
export async function toggleSpotlight(): Promise<void> {
  const now = Date.now()
  if (now - lastToggleAt < TOGGLE_DEBOUNCE_MS) {
    return
  }
  lastToggleAt = now

  if (spotlightWin && !spotlightWin.isDestroyed() && spotlightWin.isVisible()) {
    hideSpotlight()
    return
  }
  await showSpotlight()
}

/**
 * Resizes Spotlight to fit content, keeping the search bar top edge fixed.
 * @param height - Desired content height in CSS pixels.
 * @returns Nothing.
 */
function resizeSpotlight(height: number): void {
  if (!spotlightWin || spotlightWin.isDestroyed()) {
    return
  }
  const next = Math.min(
    SPOTLIGHT_MAX_HEIGHT,
    Math.max(SPOTLIGHT_MIN_HEIGHT, Math.round(height)),
  )
  const bounds = spotlightWin.getBounds()
  if (bounds.height === next) {
    return
  }
  const display = getTargetDisplay()
  const { y, height: workHeight } = display.workArea
  const maxHeight = Math.max(
    SPOTLIGHT_MIN_HEIGHT,
    Math.min(next, y + workHeight - bounds.y - 12),
  )
  spotlightWin.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: maxHeight,
  })
}

/**
 * Forwards a URL to the main window (in-app tab or `geocrm://` page).
 * @param url - Absolute http(s) or `geocrm://` URL.
 * @returns Nothing.
 */
function openUrlInMain(url: string): void {
  const main = getMainWindow?.() ?? null
  if (!main || main.isDestroyed()) {
    return
  }
  if (main.isMinimized()) {
    main.restore()
  }
  main.show()
  main.webContents.send(OPEN_URL_IN_APP_EVENT, url)
}

/**
 * Registers Spotlight IPC handlers (idempotent).
 * @returns Nothing.
 */
function registerSpotlightIpc(): void {
  ipcMain.removeHandler(SPOTLIGHT_IPC_CHANNEL)
  ipcMain.handle(SPOTLIGHT_IPC_CHANNEL, async (_event, method: string, ...args: unknown[]) => {
    switch (method) {
      case 'toggle':
        await toggleSpotlight()
        return null
      case 'hide':
        hideSpotlight()
        return null
      case 'setEnabled': {
        setSpotlightEnabled(Boolean(args[0]))
        return null
      }
      case 'usesGlobalShortcut':
        return globalShortcutRegistered
      case 'resize': {
        const height = typeof args[0] === 'number' ? args[0] : SPOTLIGHT_MIN_HEIGHT
        resizeSpotlight(height)
        return null
      }
      case 'openInMain': {
        const url = typeof args[0] === 'string' ? args[0] : ''
        if (
          url.startsWith('https:') ||
          url.startsWith('http:') ||
          /^geocrm:\s*\/\//i.test(url)
        ) {
          openUrlInMain(url)
          hideSpotlight()
        }
        return null
      }
      default:
        throw new Error(`Unknown spotlight method: ${method}`)
    }
  })
}

/**
 * Registers or unregisters the Spotlight global shortcut.
 * @param enabled - True after sign-in; false on the login screen.
 * @returns Nothing.
 */
export function setSpotlightEnabled(enabled: boolean): void {
  if (!enabled) {
    hideSpotlight()
    if (globalShortcut.isRegistered(SPOTLIGHT_ACCELERATOR)) {
      globalShortcut.unregister(SPOTLIGHT_ACCELERATOR)
    }
    globalShortcutRegistered = false
    return
  }

  if (globalShortcut.isRegistered(SPOTLIGHT_ACCELERATOR)) {
    globalShortcut.unregister(SPOTLIGHT_ACCELERATOR)
  }
  const registered = globalShortcut.register(SPOTLIGHT_ACCELERATOR, () => {
    void toggleSpotlight()
  })
  globalShortcutRegistered = registered
  if (!registered) {
    console.warn(
      `[geocrm] Could not register ${SPOTLIGHT_ACCELERATOR}; use in-window shortcut fallback.`,
    )
  }
}

/**
 * Configures Spotlight window loading and IPC. The global shortcut is armed
 * only after sign-in via {@link setSpotlightEnabled}.
 * @param options - Preload path, renderer URL/file, and main-window getter.
 * @returns Nothing.
 */
export function setupSpotlight(options: {
  preload: string
  viteDevServerUrl?: string
  indexHtml: string
  getMainWindow: () => BrowserWindow | null
}): void {
  preloadPath = options.preload
  loadUrl = options.viteDevServerUrl ?? ''
  loadFile = options.indexHtml
  getMainWindow = options.getMainWindow

  registerSpotlightIpc()
}

/**
 * Unregisters the Spotlight global shortcut and closes the window.
 * @returns Nothing.
 */
export function teardownSpotlight(): void {
  if (globalShortcut.isRegistered(SPOTLIGHT_ACCELERATOR)) {
    globalShortcut.unregister(SPOTLIGHT_ACCELERATOR)
  }
  globalShortcutRegistered = false
  ipcMain.removeHandler(SPOTLIGHT_IPC_CHANNEL)
  spotlightCreatePromise = null
  if (spotlightWin && !spotlightWin.isDestroyed()) {
    spotlightWin.destroy()
  }
  spotlightWin = null
}

/**
 * Returns whether a BrowserWindow is the Spotlight panel.
 * @param win - Candidate window.
 * @returns True when it is the Spotlight window.
 */
export function isSpotlightWindow(win: BrowserWindow | null): boolean {
  return Boolean(win && spotlightWin && win.id === spotlightWin.id)
}
