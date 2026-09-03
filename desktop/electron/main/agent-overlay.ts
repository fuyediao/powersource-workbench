import {
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  type BrowserWindowConstructorOptions,
} from 'electron'
import { AGENT_OVERLAY_IPC_CHANNEL, AGENT_OVERLAY_SHOWN_EVENT } from '../shared/ipc'
import { AGENT_OVERLAY_ACCELERATOR, PLATFORM } from '../shared/platform'

/** Compact Gemini-style Agent overlay width (px). Horizontal size is fixed. */
const AGENT_OVERLAY_WIDTH = 420

/** Compact Agent overlay height (px). */
const AGENT_OVERLAY_HEIGHT = 640

/** Smallest overlay height. */
const AGENT_OVERLAY_MIN_HEIGHT = 480

/** Gap from the work-area top / right when the overlay is fully shown (px). */
const OVERLAY_MARGIN = 16

/**
 * Pixels of the window that stay on-screen when slid up into the top edge.
 * Windows / Linux include the frameless transparent padding so the card is visible.
 */
const OVERLAY_DOCK_VISIBLE_PX = PLATFORM === 'darwin' ? 8 : 20

/** When the window top is within this of the work-area top, snap into the dock. */
const OVERLAY_DOCK_THRESHOLD = 15

/** When docked, pointer within this many px of the work-area top slides the overlay down. */
const OVERLAY_DOCK_HOVER_ZONE_PX = 30

/** When shown at the top, pointer outside the window/zone for this long (ms) slides it up. */
const OVERLAY_DOCK_LEAVE_DELAY_MS = 500

/** If window y is within this of the default top, it is still considered "at the top edge". */
const OVERLAY_EDGE_POSITION_TOLERANCE_PX = 15

const OVERLAY_DOCK_POLL_MS = 100

/** Duration for dock / undock slide animations (ms). */
const OVERLAY_DOCK_ANIMATION_DURATION_MS = 220

const OVERLAY_DOCK_ANIMATION_FRAME_MS = 16

let agentOverlayWin: BrowserWindow | null = null
/** In-flight create so warm preload + first toggle cannot open two windows. */
let agentOverlayCreatePromise: Promise<BrowserWindow> | null = null
let preloadPath = ''
let loadUrl = ''
let loadFile = ''
let overlayEnabled = false
let globalShortcutRegistered = false
let lastToggleAt = 0
/** True while teardown may destroy the overlay (native close otherwise hides). */
let overlayDestroying = false
/** True when the overlay is slid up into the top edge. */
let overlayDocked = false
let overlayAnimating = false
/** First time the cursor was seen outside the window and top hover zone; null if inside. */
let overlayCursorOutsideSince: number | null = null
let overlayHoverCheckInterval: ReturnType<typeof setInterval> | null = null
let overlayAnimationInterval: ReturnType<typeof setInterval> | null = null
/** True while setBounds is driven by show / dock animation, not a user drag. */
let ignoreProgrammaticMove = false

/** Ignore duplicate shortcut / menu / IPC toggles within this window (ms). */
const TOGGLE_DEBOUNCE_MS = 280

/**
 * Builds BrowserWindow options for the floating Agent overlay.
 * macOS uses a hidden title bar with native traffic lights; Windows / Linux
 * stay frameless so the renderer can paint a single red close light.
 * @returns Constructor options.
 */
function agentOverlayWindowOptions(): BrowserWindowConstructorOptions {
  const darwinNative = PLATFORM === 'darwin'
  return {
    title: 'Ask Agent',
    width: AGENT_OVERLAY_WIDTH,
    height: AGENT_OVERLAY_HEIGHT,
    minWidth: AGENT_OVERLAY_WIDTH,
    maxWidth: AGENT_OVERLAY_WIDTH,
    minHeight: AGENT_OVERLAY_MIN_HEIGHT,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    ...(darwinNative
      ? {
          titleBarStyle: 'hidden' as const,
          trafficLightPosition: { x: 16, y: 10 },
          hasShadow: true,
        }
      : {
          frame: false,
          transparent: true,
          backgroundColor: '#00000000',
          hasShadow: false,
        }),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  }
}

/**
 * Resolves the display under the pointer (the screen the overlay should sit on).
 * @returns Electron display.
 */
function getTargetDisplay(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

/**
 * Returns the display that contains the overlay window.
 * @param win - Overlay window.
 * @returns Electron display.
 */
function getDisplayForWindow(win: BrowserWindow): Electron.Display {
  return screen.getDisplayMatching(win.getBounds())
}

/**
 * Locks overlay width and clamps height to the target display work area.
 * @param win - Overlay window.
 * @param workAreaHeight - Display work-area height in pixels.
 * @returns Nothing.
 */
function constrainAgentOverlaySize(win: BrowserWindow, workAreaHeight: number): void {
  const maxHeight = Math.max(AGENT_OVERLAY_MIN_HEIGHT, workAreaHeight - 32)
  win.setMinimumSize(AGENT_OVERLAY_WIDTH, AGENT_OVERLAY_MIN_HEIGHT)
  win.setMaximumSize(AGENT_OVERLAY_WIDTH, maxHeight)
}

/**
 * Default undocked origin (top-right of the work area).
 * @param display - Target display.
 * @param overlayHeight - Current overlay height.
 * @returns Bounds origin and max height.
 */
function undockedOrigin(
  display: Electron.Display,
  overlayHeight: number,
): { x: number; y: number; height: number } {
  const { x, y, width, height } = display.workArea
  const maxHeight = Math.max(AGENT_OVERLAY_MIN_HEIGHT, height - 32)
  const clampedHeight = Math.min(
    Math.max(AGENT_OVERLAY_MIN_HEIGHT, overlayHeight || AGENT_OVERLAY_HEIGHT),
    maxHeight,
  )
  const left = Math.round(x + width - AGENT_OVERLAY_WIDTH - OVERLAY_MARGIN)
  return {
    x: Math.max(x + 8, left),
    y: Math.round(y + OVERLAY_MARGIN),
    height: clampedHeight,
  }
}

/**
 * Places the overlay in the top-right of the target display work area (fully shown).
 * @param win - Overlay window.
 * @returns Nothing.
 */
function placeAgentOverlayWindow(win: BrowserWindow): void {
  const display = getTargetDisplay()
  constrainAgentOverlaySize(win, display.workArea.height)
  const origin = undockedOrigin(display, win.getBounds().height)
  ignoreProgrammaticMove = true
  win.setBounds({
    x: origin.x,
    y: origin.y,
    width: AGENT_OVERLAY_WIDTH,
    height: origin.height,
  })
  setTimeout(() => {
    ignoreProgrammaticMove = false
  }, 80)
}

/**
 * Ease-out cubic: fast start, smooth deceleration (slide down / undock).
 * @param t - Progress from 0 to 1.
 * @returns Eased value.
 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Ease-in cubic: smooth start, faster at end (slide up / dock).
 * @param t - Progress from 0 to 1.
 * @returns Eased value.
 */
function easeInCubic(t: number): number {
  return t * t * t
}

/**
 * Stops an in-flight dock / undock slide.
 * @returns Nothing.
 */
function stopOverlayAnimation(): void {
  if (overlayAnimationInterval != null) {
    clearInterval(overlayAnimationInterval)
    overlayAnimationInterval = null
  }
  overlayAnimating = false
}

/**
 * Animates the overlay from its current position to (targetX, targetY).
 * @param targetX - Target x.
 * @param targetY - Target y.
 * @param durationMs - Animation duration in ms.
 * @param easing - Easing function (0..1 → 0..1).
 * @param onComplete - Called when the animation finishes.
 * @returns Nothing.
 */
function animateOverlayWindow(
  targetX: number,
  targetY: number,
  durationMs: number,
  easing: (t: number) => number,
  onComplete: () => void,
): void {
  if (!agentOverlayWin || agentOverlayWin.isDestroyed()) {
    onComplete()
    return
  }
  stopOverlayAnimation()
  overlayAnimating = true
  ignoreProgrammaticMove = true
  const start = agentOverlayWin.getBounds()
  const startTime = Date.now()

  overlayAnimationInterval = setInterval(() => {
    if (!agentOverlayWin || agentOverlayWin.isDestroyed()) {
      stopOverlayAnimation()
      onComplete()
      return
    }
    const elapsed = Date.now() - startTime
    const t = Math.min(elapsed / durationMs, 1)
    const e = easing(t)
    agentOverlayWin.setBounds({
      x: Math.round(start.x + (targetX - start.x) * e),
      y: Math.round(start.y + (targetY - start.y) * e),
      width: start.width,
      height: start.height,
    })
    if (t >= 1) {
      stopOverlayAnimation()
      onComplete()
      setTimeout(() => {
        ignoreProgrammaticMove = false
      }, 80)
    }
  }, OVERLAY_DOCK_ANIMATION_FRAME_MS)
}

/**
 * Returns whether the overlay is on screen (fully shown or slid up).
 * @returns True when the BrowserWindow is visible.
 */
function overlayIsShowing(): boolean {
  return Boolean(
    agentOverlayWin && !agentOverlayWin.isDestroyed() && agentOverlayWin.isVisible(),
  )
}

/**
 * Returns whether the cursor is over the overlay bounds.
 * @param cursor - Screen point.
 * @param bounds - Overlay bounds.
 * @returns True when the point is inside the window.
 */
function cursorInBounds(
  cursor: Electron.Point,
  bounds: Electron.Rectangle,
): boolean {
  return (
    cursor.x >= bounds.x &&
    cursor.x < bounds.x + bounds.width &&
    cursor.y >= bounds.y &&
    cursor.y < bounds.y + bounds.height
  )
}

/**
 * Returns whether the cursor is in the top-edge hover zone above this overlay.
 * @param cursor - Screen point.
 * @param display - Display that owns the overlay.
 * @param bounds - Overlay bounds (x/width still used when slid up).
 * @returns True when hover should slide the overlay down.
 */
function cursorInTopHoverZone(
  cursor: Electron.Point,
  display: Electron.Display,
  bounds: Electron.Rectangle,
): boolean {
  const top = display.workArea.y
  const inTop = cursor.y >= top - 2 && cursor.y <= top + OVERLAY_DOCK_HOVER_ZONE_PX
  const inX =
    cursor.x >= bounds.x - OVERLAY_DOCK_HOVER_ZONE_PX &&
    cursor.x <= bounds.x + bounds.width + OVERLAY_DOCK_HOVER_ZONE_PX
  return inTop && inX
}

/**
 * Returns whether the overlay is still sitting at the top rest position (not dragged down).
 * @param bounds - Overlay bounds.
 * @param display - Display that owns the overlay.
 * @returns True when leave-to-dock should still run.
 */
function overlayIsAtTopEdge(bounds: Electron.Rectangle, display: Electron.Display): boolean {
  return bounds.y <= display.workArea.y + OVERLAY_MARGIN + OVERLAY_EDGE_POSITION_TOLERANCE_PX
}

/**
 * Slides the overlay up so only a thin strip remains at the top of the display.
 * @returns Nothing.
 */
function dockAgentOverlay(): void {
  if (!agentOverlayWin || agentOverlayWin.isDestroyed() || overlayAnimating) {
    return
  }
  overlayDocked = true
  overlayCursorOutsideSince = null
  const display = getDisplayForWindow(agentOverlayWin)
  const bounds = agentOverlayWin.getBounds()
  const targetY = display.workArea.y + OVERLAY_DOCK_VISIBLE_PX - bounds.height
  agentOverlayWin.setResizable(false)
  animateOverlayWindow(
    bounds.x,
    targetY,
    OVERLAY_DOCK_ANIMATION_DURATION_MS,
    easeInCubic,
    () => {
      if (!agentOverlayWin || agentOverlayWin.isDestroyed()) {
        return
      }
      agentOverlayWin.setBounds({
        x: bounds.x,
        y: targetY,
        width: bounds.width,
        height: bounds.height,
      })
      startOverlayHoverCheck()
    },
  )
}

/**
 * Slides the overlay back down to the top-right rest position.
 * @param focus - True when the shortcut should focus the composer.
 * @returns Nothing.
 */
function undockAgentOverlay(focus: boolean): void {
  if (!agentOverlayWin || agentOverlayWin.isDestroyed()) {
    return
  }
  overlayDocked = false
  overlayCursorOutsideSince = null
  const display = getDisplayForWindow(agentOverlayWin)
  constrainAgentOverlaySize(agentOverlayWin, display.workArea.height)
  agentOverlayWin.setResizable(true)
  const bounds = agentOverlayWin.getBounds()
  const origin = undockedOrigin(display, bounds.height)
  animateOverlayWindow(
    bounds.x,
    origin.y,
    OVERLAY_DOCK_ANIMATION_DURATION_MS,
    easeOutCubic,
    () => {
      if (!agentOverlayWin || agentOverlayWin.isDestroyed()) {
        return
      }
      agentOverlayWin.setBounds({
        x: bounds.x,
        y: origin.y,
        width: AGENT_OVERLAY_WIDTH,
        height: origin.height,
      })
      if (focus) {
        agentOverlayWin.show()
        agentOverlayWin.focus()
        agentOverlayWin.webContents.focus()
        agentOverlayWin.webContents.send(AGENT_OVERLAY_SHOWN_EVENT)
      }
    },
  )
}

/**
 * Polls the cursor: hover at the top slides down; leave while at the top slides up.
 * @returns Nothing.
 */
function startOverlayHoverCheck(): void {
  if (overlayHoverCheckInterval != null) {
    return
  }
  overlayHoverCheckInterval = setInterval(() => {
    if (!agentOverlayWin || agentOverlayWin.isDestroyed() || !agentOverlayWin.isVisible()) {
      return
    }
    if (overlayAnimating) {
      return
    }
    const cursor = screen.getCursorScreenPoint()
    const display = getDisplayForWindow(agentOverlayWin)
    const bounds = agentOverlayWin.getBounds()
    const inTopZone = cursorInTopHoverZone(cursor, display, bounds)

    if (overlayDocked) {
      if (inTopZone) {
        undockAgentOverlay(true)
      }
      return
    }

    if (!overlayIsAtTopEdge(bounds, display)) {
      overlayCursorOutsideSince = null
      return
    }

    const inWindow = cursorInBounds(cursor, bounds)
    if (inWindow || inTopZone) {
      overlayCursorOutsideSince = null
      return
    }
    const now = Date.now()
    if (overlayCursorOutsideSince == null) {
      overlayCursorOutsideSince = now
      return
    }
    if (now - overlayCursorOutsideSince >= OVERLAY_DOCK_LEAVE_DELAY_MS) {
      dockAgentOverlay()
    }
  }, OVERLAY_DOCK_POLL_MS)
}

/**
 * Stops the cursor poll used for top-edge dock / undock.
 * @returns Nothing.
 */
function stopOverlayHoverCheck(): void {
  if (overlayHoverCheckInterval != null) {
    clearInterval(overlayHoverCheckInterval)
    overlayHoverCheckInterval = null
  }
}

/**
 * Loads the Agent overlay renderer route into the window.
 * @param win - Overlay window.
 * @returns Nothing.
 */
async function loadAgentOverlayContents(win: BrowserWindow): Promise<void> {
  if (loadUrl) {
    await win.loadURL(`${loadUrl}#agent`)
    return
  }
  await win.loadFile(loadFile, { hash: 'agent' })
}

/**
 * Creates the Agent overlay BrowserWindow if needed.
 * @returns Overlay window.
 */
async function ensureAgentOverlayWindow(): Promise<BrowserWindow> {
  if (agentOverlayWin && !agentOverlayWin.isDestroyed()) {
    return agentOverlayWin
  }
  if (agentOverlayCreatePromise) {
    return agentOverlayCreatePromise
  }

  agentOverlayCreatePromise = (async (): Promise<BrowserWindow> => {
    const win = new BrowserWindow(agentOverlayWindowOptions())
    if (process.platform !== 'darwin' && !win.isDestroyed()) {
      win.setAutoHideMenuBar(true)
      win.setMenuBarVisibility(false)
    }
    win.setAlwaysOnTop(true, 'floating')
    constrainAgentOverlaySize(win, getTargetDisplay().workArea.height)
    agentOverlayWin = win

    win.on('close', (event) => {
      if (overlayDestroying) {
        return
      }
      event.preventDefault()
      hideAgentOverlay()
    })
    win.on('closed', () => {
      if (agentOverlayWin === win) {
        agentOverlayWin = null
      }
    })
    win.on('moved', () => {
      if (
        !agentOverlayWin ||
        overlayDocked ||
        overlayAnimating ||
        ignoreProgrammaticMove
      ) {
        return
      }
      const display = getDisplayForWindow(agentOverlayWin)
      const bounds = agentOverlayWin.getBounds()
      if (bounds.y - display.workArea.y <= OVERLAY_DOCK_THRESHOLD) {
        dockAgentOverlay()
      }
    })

    await loadAgentOverlayContents(win)
    return win
  })()

  try {
    return await agentOverlayCreatePromise
  } finally {
    agentOverlayCreatePromise = null
  }
}

/**
 * Shows the overlay fully dropped down and focuses the composer.
 * @returns Nothing.
 */
async function showAgentOverlay(): Promise<void> {
  const win = await ensureAgentOverlayWindow()
  overlayDocked = false
  overlayCursorOutsideSince = null
  stopOverlayAnimation()
  placeAgentOverlayWindow(win)
  win.setResizable(true)
  if (!win.isVisible()) {
    win.show()
  }
  win.setAlwaysOnTop(true, 'floating')
  win.focus()
  win.webContents.focus()
  win.webContents.send(AGENT_OVERLAY_SHOWN_EVENT)
  startOverlayHoverCheck()
}

/**
 * Fully hides the Agent overlay (no docked strip).
 * @returns Nothing.
 */
export function hideAgentOverlay(): void {
  stopOverlayAnimation()
  stopOverlayHoverCheck()
  overlayDocked = false
  overlayCursorOutsideSince = null
  ignoreProgrammaticMove = false
  if (agentOverlayWin && !agentOverlayWin.isDestroyed() && agentOverlayWin.isVisible()) {
    agentOverlayWin.hide()
  }
}

/**
 * Toggles the Agent overlay. A docked strip slides down instead of hiding.
 * @returns Nothing.
 */
export async function toggleAgentOverlay(): Promise<void> {
  const now = Date.now()
  if (now - lastToggleAt < TOGGLE_DEBOUNCE_MS) {
    return
  }
  lastToggleAt = now
  if (!overlayEnabled) {
    return
  }
  if (overlayIsShowing()) {
    if (overlayDocked) {
      undockAgentOverlay(true)
      return
    }
    hideAgentOverlay()
    return
  }
  await showAgentOverlay()
}

/**
 * Registers Agent overlay IPC handlers (idempotent).
 * @returns Nothing.
 */
function registerAgentOverlayIpc(): void {
  ipcMain.removeHandler(AGENT_OVERLAY_IPC_CHANNEL)
  ipcMain.handle(AGENT_OVERLAY_IPC_CHANNEL, async (_event, method: string, ...args: unknown[]) => {
    switch (method) {
      case 'toggle':
        await toggleAgentOverlay()
        return null
      case 'hide':
        hideAgentOverlay()
        return null
      case 'setEnabled': {
        setAgentOverlayEnabled(Boolean(args[0]))
        return null
      }
      case 'usesGlobalShortcut':
        return globalShortcutRegistered
      default:
        throw new Error(`Unknown agent overlay method: ${method}`)
    }
  })
}

/**
 * Registers or unregisters the global overlay shortcut (Alt+G / Control+G).
 * @param enabled - True after sign-in; false on the login screen.
 * @returns Nothing.
 */
export function setAgentOverlayEnabled(enabled: boolean): void {
  overlayEnabled = enabled
  if (!enabled) {
    hideAgentOverlay()
    if (globalShortcut.isRegistered(AGENT_OVERLAY_ACCELERATOR)) {
      globalShortcut.unregister(AGENT_OVERLAY_ACCELERATOR)
    }
    globalShortcutRegistered = false
    return
  }

  if (globalShortcut.isRegistered(AGENT_OVERLAY_ACCELERATOR)) {
    globalShortcut.unregister(AGENT_OVERLAY_ACCELERATOR)
  }
  const registered = globalShortcut.register(AGENT_OVERLAY_ACCELERATOR, () => {
    void toggleAgentOverlay()
  })
  globalShortcutRegistered = registered
  if (!registered) {
    console.warn(
      `[geocrm] Could not register ${AGENT_OVERLAY_ACCELERATOR}; use in-window shortcut fallback.`,
    )
  }
}

/**
 * Configures Agent overlay window loading and IPC. The shortcut is armed only
 * after sign-in via {@link setAgentOverlayEnabled}.
 * @param options - Preload path and renderer URL/file.
 * @returns Nothing.
 */
export function setupAgentOverlay(options: {
  preload: string
  viteDevServerUrl?: string
  indexHtml: string
}): void {
  preloadPath = options.preload
  loadUrl = options.viteDevServerUrl ?? ''
  loadFile = options.indexHtml

  registerAgentOverlayIpc()
}

/**
 * Unregisters the overlay shortcut and closes the window.
 * @returns Nothing.
 */
export function teardownAgentOverlay(): void {
  if (globalShortcut.isRegistered(AGENT_OVERLAY_ACCELERATOR)) {
    globalShortcut.unregister(AGENT_OVERLAY_ACCELERATOR)
  }
  globalShortcutRegistered = false
  overlayEnabled = false
  stopOverlayAnimation()
  stopOverlayHoverCheck()
  ipcMain.removeHandler(AGENT_OVERLAY_IPC_CHANNEL)
  agentOverlayCreatePromise = null
  overlayDestroying = true
  if (agentOverlayWin && !agentOverlayWin.isDestroyed()) {
    agentOverlayWin.destroy()
  }
  overlayDestroying = false
  agentOverlayWin = null
}

/**
 * Returns whether a BrowserWindow is the Agent overlay.
 * @param win - Candidate window.
 * @returns True when it is the overlay window.
 */
export function isAgentOverlayWindow(win: BrowserWindow | null): boolean {
  return Boolean(win && agentOverlayWin && win.id === agentOverlayWin.id)
}
