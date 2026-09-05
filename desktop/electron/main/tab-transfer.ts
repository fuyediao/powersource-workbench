/**
 * Chrome-style title-bar tab tear-off / merge between Workbench app windows.
 *
 * The renderer decides *that* a drag ended outside its own title-bar strip
 * (see `MacStyleTitleBar.tsx`); this module decides *where* the tab lands:
 * onto another window's caption (merge) or into a brand-new window (tear-off).
 * Screen-point hit-testing has to live in the main process — while dragging,
 * only the source `BrowserWindow` receives pointer events.
 */

import {
  BrowserWindow,
  ipcMain,
  screen,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron'
import {
  TAB_TRANSFER_IPC_CHANNEL,
  TAB_TRANSFER_RECEIVE_EVENT,
  isTabTransferPayload,
  type AppWindowPeer,
  type TabTransferPayload,
} from '../shared/ipc'
import { APP_SHORT_NAME } from '../shared/app-identity'
import { appWindowById, appWindows, createAppWindow, windowAtScreenPoint } from './app-windows'
import { showBrowserWindow } from './platform'

/** New-window offset so the dropped tab's caption lands near the cursor, not under it. */
const NEW_WINDOW_CURSOR_OFFSET_X = 80
const NEW_WINDOW_CURSOR_OFFSET_Y = 24

/** Cascade offset when "Open in new window" clones from the source window. */
const NEW_WINDOW_CASCADE_OFFSET = 32

/** Renderers that have subscribed to {@link TAB_TRANSFER_RECEIVE_EVENT}. */
const readyRenderers = new WeakSet<WebContents>()

/** Tabs waiting for a new window's renderer to call `tabs.ready()`. */
const pendingTransfers = new WeakMap<WebContents, TabTransferPayload[]>()

/** Active-tab labels reported by each app window (for the Move-to submenu). */
const windowLabels = new WeakMap<BrowserWindow, string>()

interface ScreenPoint {
  x: number
  y: number
}

/**
 * Returns whether a value is a `{ x, y }` screen point.
 * @param value - Candidate payload.
 * @returns True when both fields are finite numbers.
 */
function isScreenPoint(value: unknown): value is ScreenPoint {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.x === 'number' && typeof record.y === 'number'
}

/**
 * Resolves the authoritative drop point, preferring the OS cursor (still at
 * the drop location on mouse-up) over the renderer's converted coordinates.
 * @param fallback - Renderer-supplied screen point.
 * @returns Screen point, or null when neither source is usable.
 */
function cursorOrFallbackPoint(fallback: unknown): ScreenPoint | null {
  try {
    const cursor = screen.getCursorScreenPoint()
    if (Number.isFinite(cursor.x) && Number.isFinite(cursor.y)) {
      return cursor
    }
  } catch {
    // No display server / cursor unavailable: fall back to the renderer point.
  }
  return isScreenPoint(fallback) ? fallback : null
}

/**
 * Drops a torn-off tab at a screen point: merges into another window's title
 * bar when the point lands on one, otherwise spawns a brand-new app window.
 *
 * The live cursor position wins over the renderer-supplied point: the renderer
 * reports CSS pixels offset by `window.screenX/Y`, which drifts from DIP screen
 * coordinates under a non-default zoom factor or across mixed-DPI displays.
 * @param event - IPC event (sender resolves the drag source window).
 * @param payload - Serialized tab.
 * @param point - Renderer's screen point fallback for where the drag ended.
 * @returns Whether the tab was accepted elsewhere (the caller should then remove it locally).
 */
async function dropTab(
  event: IpcMainInvokeEvent,
  payload: unknown,
  point: unknown,
): Promise<{ accepted: boolean }> {
  if (!isTabTransferPayload(payload)) {
    return { accepted: false }
  }
  const dropPoint = cursorOrFallbackPoint(point)
  if (!dropPoint) {
    return { accepted: false }
  }
  const source = BrowserWindow.fromWebContents(event.sender)
  const target = windowAtScreenPoint(dropPoint, { excluding: source, captionOnly: true })
  if (target) {
    sendTransferredTab(target, payload)
    showBrowserWindow(target)
    return { accepted: true }
  }

  const created = await createAppWindow({
    x: Math.round(dropPoint.x - NEW_WINDOW_CURSOR_OFFSET_X),
    y: Math.max(0, Math.round(dropPoint.y - NEW_WINDOW_CURSOR_OFFSET_Y)),
    showHomeButton: false,
  })
  sendTransferredTab(created, payload)
  showBrowserWindow(created)
  return { accepted: true }
}

/**
 * Always opens a new app window for the tab (context-menu "Open in new
 * window"). Unlike {@link dropTab}, this never merges onto another caption.
 * @param event - IPC event (sender is the source window).
 * @param payload - Serialized tab.
 * @returns Whether the new window was created (caller should then remove the tab locally).
 */
async function openInNewWindow(
  event: IpcMainInvokeEvent,
  payload: unknown,
): Promise<{ accepted: boolean }> {
  if (!isTabTransferPayload(payload)) {
    return { accepted: false }
  }
  const source = BrowserWindow.fromWebContents(event.sender)
  const bounds = source && !source.isDestroyed() ? source.getBounds() : null
  const created = await createAppWindow({
    x: bounds ? bounds.x + NEW_WINDOW_CASCADE_OFFSET : undefined,
    y: bounds ? bounds.y + NEW_WINDOW_CASCADE_OFFSET : undefined,
    showHomeButton: false,
  })
  sendTransferredTab(created, payload)
  showBrowserWindow(created)
  return { accepted: true }
}

/**
 * Moves a tab into an existing peer window (context-menu "Move to …").
 * @param event - IPC event (sender is the source window, never a valid target).
 * @param payload - Serialized tab.
 * @param windowId - Destination `BrowserWindow.id`.
 * @returns Whether the destination accepted the tab.
 */
function moveToWindow(
  event: IpcMainInvokeEvent,
  payload: unknown,
  windowId: unknown,
): { accepted: boolean } {
  if (!isTabTransferPayload(payload) || typeof windowId !== 'number' || !Number.isInteger(windowId)) {
    return { accepted: false }
  }
  const target = appWindowById(windowId)
  const source = BrowserWindow.fromWebContents(event.sender)
  if (!target || target === source) {
    return { accepted: false }
  }
  sendTransferredTab(target, payload)
  showBrowserWindow(target)
  return { accepted: true }
}

/**
 * Lists other live app windows so the renderer can build a Chrome-style
 * "Move tab to another window" submenu. Empty when this is the only window.
 * @param event - IPC event (sender is excluded from the list).
 * @returns Peer windows with their reported titles.
 */
function listPeerWindows(event: IpcMainInvokeEvent): AppWindowPeer[] {
  const source = BrowserWindow.fromWebContents(event.sender)
  const peers: AppWindowPeer[] = []
  for (const win of appWindows()) {
    if (win === source) {
      continue
    }
    const title = windowLabels.get(win)?.trim() || win.getTitle().trim() || APP_SHORT_NAME
    peers.push({ id: win.id, title })
  }
  return peers
}

/**
 * Stores the active-tab (or Home) label for the sender's window.
 * @param event - IPC event.
 * @param label - Display title.
 * @returns Nothing.
 */
function setWindowLabel(event: IpcMainInvokeEvent, label: unknown): void {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed() || typeof label !== 'string') {
    return
  }
  const title = label.trim() || APP_SHORT_NAME
  windowLabels.set(win, title)
  win.setTitle(title)
}

/**
 * Pushes a transferred tab to a window's renderer.
 *
 * `loadURL` resolving is not enough: React subscribes in `useEffect`, which
 * runs after first paint, so a send at `did-finish-load` is dropped. Queue
 * until that renderer invokes `ready`, then flush.
 * @param target - Destination window.
 * @param payload - Serialized tab.
 * @returns Nothing.
 */
function sendTransferredTab(target: BrowserWindow, payload: TabTransferPayload): void {
  if (target.isDestroyed()) {
    return
  }
  const contents = target.webContents
  if (readyRenderers.has(contents)) {
    contents.send(TAB_TRANSFER_RECEIVE_EVENT, payload)
    return
  }
  const queued = pendingTransfers.get(contents) ?? []
  queued.push(payload)
  pendingTransfers.set(contents, queued)
}

/**
 * Marks a renderer as listening for transferred tabs and flushes any that
 * arrived while the window was still starting (Chrome-style tear-off).
 * @param contents - The window's webContents (`event.sender`).
 * @returns Nothing.
 */
function markRendererReady(contents: WebContents): void {
  readyRenderers.add(contents)
  const queued = pendingTransfers.get(contents)
  pendingTransfers.delete(contents)
  if (!queued || contents.isDestroyed()) {
    return
  }
  for (const payload of queued) {
    contents.send(TAB_TRANSFER_RECEIVE_EVENT, payload)
  }
}

/**
 * Drops the ready flag so a React Strict Mode remount (subscribe → cleanup →
 * subscribe) cannot make main think a listener still exists and drop the tab.
 * @param contents - The window's webContents (`event.sender`).
 * @returns Nothing.
 */
function markRendererUnready(contents: WebContents): void {
  readyRenderers.delete(contents)
}

/**
 * Registers the tab-transfer IPC handler. Call once before the first window loads.
 * @returns Nothing.
 */
export function registerTabTransferIpc(): void {
  ipcMain.removeHandler(TAB_TRANSFER_IPC_CHANNEL)
  ipcMain.handle(TAB_TRANSFER_IPC_CHANNEL, async (event, method: string, ...args: unknown[]) => {
    if (method === 'ready') {
      markRendererReady(event.sender)
      return
    }
    if (method === 'unready') {
      markRendererUnready(event.sender)
      return
    }
    if (method === 'dropTab') {
      return dropTab(event, args[0], args[1])
    }
    if (method === 'openInNewWindow') {
      return openInNewWindow(event, args[0])
    }
    if (method === 'moveToWindow') {
      return moveToWindow(event, args[0], args[1])
    }
    if (method === 'listPeerWindows') {
      return listPeerWindows(event)
    }
    if (method === 'setWindowLabel') {
      setWindowLabel(event, args[0])
      return
    }
    throw new Error(`Unknown tab transfer method: ${method}`)
  })
}
