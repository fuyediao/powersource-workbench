/** Isolated native Chromium preview for Harness Canvas HTML documents. */

import { BrowserWindow, WebContentsView, type WebContents } from 'electron'
import { HARNESS_CANVAS_CONSOLE_EVENT } from '../../shared/harness'

interface CanvasPreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

interface CanvasPreviewPane {
  host: BrowserWindow
  sender: WebContents
  view: WebContentsView
  document: string
}

const previews = new Map<number, CanvasPreviewPane>()
const PARK_BOUNDS = { x: -10000, y: -10000, width: 200, height: 200 }

/**
 * Normalizes untrusted renderer bounds to positive integer display coordinates.
 * @param value - Candidate bounds payload.
 * @returns Safe native view bounds, or null when unusable.
 */
function normalizeBounds(value: unknown): CanvasPreviewBounds | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const x = Number(record.x)
  const y = Number(record.y)
  const width = Number(record.width)
  const height = Number(record.height)
  if (![x, y, width, height].every(Number.isFinite) || width < 2 || height < 2) return null
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

/**
 * Creates or returns the isolated Canvas view owned by one renderer.
 * @param sender - Harness renderer web contents.
 * @returns Native preview pane, or null when the host window is unavailable.
 */
function ensureCanvasPreview(sender: WebContents): CanvasPreviewPane | null {
  const existing = previews.get(sender.id)
  if (existing && !existing.view.webContents.isDestroyed()) return existing
  const host = BrowserWindow.fromWebContents(sender)
  if (!host || host.isDestroyed()) return null
  const view = new WebContentsView({
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'harness-canvas-preview',
    },
  })
  view.setBounds(PARK_BOUNDS)
  view.setVisible(false)
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  view.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('data:text/html')) event.preventDefault()
  })
  const pane = { host, sender, view, document: '' }
  view.webContents.on('console-message', (_event, level, message) => {
    if (pane.sender.isDestroyed()) return
    pane.sender.send(HARNESS_CANVAS_CONSOLE_EVENT, {
      level: level === 'error' || level === 'warning' ? level : 'info',
      message,
    })
  })
  view.webContents.on('destroyed', () => {
    previews.delete(sender.id)
  })
  sender.once('destroyed', () => {
    if (previews.get(sender.id) === pane) disposeHarnessCanvasPreview(sender.id)
  })
  previews.set(sender.id, pane)
  return pane
}

/**
 * Reparents a live Canvas preview to the renderer receiving a Harness tab.
 * @param sourceId - Previous renderer id.
 * @param target - Destination renderer.
 * @returns Nothing.
 */
export function transferHarnessCanvasPreview(sourceId: number, target: WebContents): void {
  const pane = previews.get(sourceId)
  const host = BrowserWindow.fromWebContents(target)
  if (!pane || !host || host.isDestroyed()) return
  const existingTarget = previews.get(target.id)
  if (existingTarget && existingTarget !== pane) disposeHarnessCanvasPreview(target.id)
  previews.delete(sourceId)
  try {
    pane.host.contentView.removeChildView(pane.view)
  } catch {
    // The preview may already be detached.
  }
  pane.host = host
  pane.sender = target
  host.contentView.addChildView(pane.view)
  previews.set(target.id, pane)
  target.once('destroyed', () => {
    if (previews.get(target.id) === pane) disposeHarnessCanvasPreview(target.id)
  })
}

/**
 * Shows and updates the native Canvas preview at renderer-provided bounds.
 * @param sender - Harness renderer web contents.
 * @param rawBounds - DOM placeholder bounds in device-independent pixels.
 * @param document - Complete isolated preview document.
 * @returns Nothing.
 */
export async function showHarnessCanvasPreview(
  sender: WebContents,
  rawBounds: unknown,
  document: string,
): Promise<void> {
  const bounds = normalizeBounds(rawBounds)
  if (!bounds || !document.trim()) return
  const pane = ensureCanvasPreview(sender)
  if (!pane) return
  try {
    pane.host.contentView.removeChildView(pane.view)
  } catch {
    // The view was not attached yet.
  }
  pane.host.contentView.addChildView(pane.view)
  pane.view.setBounds(bounds)
  pane.view.setVisible(true)
  if (pane.document !== document) {
    pane.document = document
    await pane.view.webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(document)}`,
    )
  }
}

/**
 * Hides the native Canvas preview without destroying its current document.
 * @param senderId - Owning renderer web contents id.
 * @returns Nothing.
 */
export function hideHarnessCanvasPreview(senderId: number): void {
  const pane = previews.get(senderId)
  if (!pane || pane.view.webContents.isDestroyed()) return
  pane.view.setVisible(false)
  pane.view.setBounds(PARK_BOUNDS)
}

/**
 * Destroys the Canvas preview owned by one renderer.
 * @param senderId - Owning renderer web contents id.
 * @returns Nothing.
 */
export function disposeHarnessCanvasPreview(senderId: number): void {
  const pane = previews.get(senderId)
  if (!pane) return
  previews.delete(senderId)
  try {
    pane.host.contentView.removeChildView(pane.view)
  } catch {
    // The host already detached the view.
  }
  if (!pane.view.webContents.isDestroyed()) pane.view.webContents.close()
}
