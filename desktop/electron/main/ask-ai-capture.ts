/**
 * Captures the current page minus the Ask AI sidebar.
 * Uses Chromium full-page screenshot (beyond the visible viewport), matching
 * Chrome DevTools "Capture full size screenshot".
 */

import {
  BrowserWindow,
  desktopCapturer,
  nativeImage,
  screen,
  WebContentsView,
  type NativeImage,
  type WebContents,
} from 'electron'

/** JPEG payload returned to the renderer for POST /ai/aichat. */
export interface AskAiCaptureResult {
  mimeType: 'image/jpeg'
  data: string
  width: number
  height: number
}

const MAX_JPEG_WIDTH = 1440
const MAX_JPEG_HEIGHT = 8000
const JPEG_QUALITY = 72
const JPEG_MAX_BYTES = 1_800_000
const MAX_PAGE_HEIGHT = 12000

type LayoutMetrics = {
  cssContentSize?: { width?: number; height?: number }
  contentSize?: { width?: number; height?: number }
}

type ScreenshotResult = {
  data?: string
}

/**
 * Captures the current page (full scrollable height), crops the Ask AI column
 * when the shot is the main renderer, and returns a JPEG.
 *
 * @param win - Main BrowserWindow
 * @param excludeRightPx - Sidebar width in CSS pixels (DIP)
 * @returns JPEG capture, or null when the crop would be empty
 */
export async function captureAskAiMainContent(
  win: BrowserWindow,
  excludeRightPx: number,
): Promise<AskAiCaptureResult | null> {
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    return null
  }
  const [contentWidth, contentHeight] = win.getContentSize()
  const cropDipWidth = Math.max(1, Math.round(contentWidth - Math.max(0, excludeRightPx)))
  if (cropDipWidth < 8 || contentHeight < 8) {
    return null
  }

  const guest = findPrimaryGuestView(win, cropDipWidth, contentHeight)
  const contents = guest?.webContents && !guest.webContents.isDestroyed() ? guest.webContents : win.webContents
  const cropSidebar = guest == null

  let restoreScrollers: (() => Promise<void>) | null = null
  if (cropSidebar) {
    restoreScrollers = await expandLeftColumnScrollers(contents)
  }

  let image: NativeImage | null = null
  try {
    image =
      (await captureFullPageCdp(contents)) ??
      (await captureFullPageRect(contents)) ??
      (await captureWindowThumbnail(win, cropDipWidth, contentHeight)) ??
      (await captureViewportFallback(win, guest, cropDipWidth, contentHeight))
  } finally {
    if (restoreScrollers) {
      await restoreScrollers()
    }
  }

  if (!image || image.isEmpty()) {
    return null
  }
  if (cropSidebar) {
    image = cropKeepLeft(image, cropDipWidth / contentWidth)
  }
  return encodeJpeg(image)
}

/**
 * Finds the in-app browser / Clash view that covers most of the left column.
 *
 * @param win - Main window
 * @param cropDipWidth - Left column width in DIP
 * @param contentHeight - Content height in DIP
 * @returns Guest view, or null when the main renderer is the page
 */
function findPrimaryGuestView(
  win: BrowserWindow,
  cropDipWidth: number,
  contentHeight: number,
): WebContentsView | null {
  const cropArea = cropDipWidth * contentHeight
  let best: WebContentsView | null = null
  let bestArea = 0
  for (const child of win.contentView.children) {
    if (!(child instanceof WebContentsView) || child.webContents.isDestroyed()) {
      continue
    }
    try {
      if (!child.getVisible()) {
        continue
      }
    } catch {
      continue
    }
    const bounds = child.getBounds()
    const overlapW = Math.max(0, Math.min(bounds.x + bounds.width, cropDipWidth) - Math.max(bounds.x, 0))
    const overlapH = Math.max(0, Math.min(bounds.y + bounds.height, contentHeight) - Math.max(bounds.y, 0))
    const overlap = overlapW * overlapH
    if (overlap < cropArea * 0.35 || overlap <= bestArea) {
      continue
    }
    best = child
    bestArea = overlap
  }
  return best
}

/**
 * Temporarily unwraps overflow on left-column scrollers so a full-page capture
 * can include content below the fold (SPA shells often use 100dvh + overflow).
 *
 * @param contents - Main renderer
 * @returns Restore function
 */
async function expandLeftColumnScrollers(contents: WebContents): Promise<() => Promise<void>> {
  const restore = async (): Promise<void> => {
    try {
      await contents.executeJavaScript(`(() => {
        const rows = window.__workbenchAskAiOverflowRestore
        if (!Array.isArray(rows)) {
          return
        }
        for (const row of rows) {
          const el = row && row.el
          if (!el) continue
          if (typeof row.css === 'string' && row.css.length > 0) {
            el.setAttribute('style', row.css)
          } else {
            el.removeAttribute('style')
          }
        }
        delete window.__workbenchAskAiOverflowRestore
      })()`)
    } catch {
      // Renderer may have navigated.
    }
  }
  try {
    await contents.executeJavaScript(`(() => {
      const sidebar = document.querySelector('.ask-ai-sidebar')
      const cut = sidebar ? sidebar.getBoundingClientRect().left : Number.POSITIVE_INFINITY
      const rows = []
      const visit = (el) => {
        if (!(el instanceof HTMLElement)) return
        if (el.classList.contains('ask-ai-sidebar') || el.closest('.ask-ai-sidebar')) return
        const rect = el.getBoundingClientRect()
        if (rect.left >= cut) return
        const style = getComputedStyle(el)
        const overflowY = style.overflowY
        if (
          (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'hidden') &&
          el.scrollHeight > el.clientHeight + 8
        ) {
          rows.push({ el, css: el.getAttribute('style') || '' })
          el.style.setProperty('overflow', 'visible', 'important')
          el.style.setProperty('overflow-y', 'visible', 'important')
          el.style.setProperty('max-height', 'none', 'important')
          el.style.setProperty('height', el.scrollHeight + 'px', 'important')
        }
        for (const child of el.children) {
          visit(child)
        }
      }
      if (document.body) {
        visit(document.body)
      }
      window.__workbenchAskAiOverflowRestore = rows
    })()`)
  } catch {
    return restore
  }
  return restore
}

/**
 * Chrome DevTools-style full-page capture via CDP (beyond the visible viewport).
 *
 * @param contents - Page to capture
 * @returns Full-page image, or null
 */
async function captureFullPageCdp(contents: WebContents): Promise<NativeImage | null> {
  if (contents.isDestroyed()) {
    return null
  }
  const dbg = contents.debugger
  const attachedHere = !dbg.isAttached()
  try {
    if (attachedHere) {
      await dbg.attach('1.3')
    }
    const metrics = (await dbg.sendCommand('Page.getLayoutMetrics')) as LayoutMetrics
    const size = readCssSize(metrics.cssContentSize) ?? readCssSize(metrics.contentSize)
    if (!size) {
      return null
    }
    const width = Math.max(1, Math.ceil(size.width))
    const height = Math.max(1, Math.min(MAX_PAGE_HEIGHT, Math.ceil(size.height)))
    await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
      mobile: false,
      width,
      height,
      deviceScaleFactor: 1,
    })
    await waitNextPaint(contents)
    const shot = (await dbg.sendCommand('Page.captureScreenshot', {
      format: 'jpeg',
      quality: JPEG_QUALITY,
      fromSurface: true,
      captureBeyondViewport: true,
    })) as ScreenshotResult
    await dbg.sendCommand('Emulation.clearDeviceMetricsOverride')
    if (typeof shot.data !== 'string' || shot.data.length === 0) {
      return null
    }
    const image = nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64'))
    return image.isEmpty() ? null : image
  } catch {
    try {
      if (dbg.isAttached()) {
        await dbg.sendCommand('Emulation.clearDeviceMetricsOverride')
      }
    } catch {
      // Ignore restore failures.
    }
    return null
  } finally {
    if (attachedHere && dbg.isAttached()) {
      try {
        dbg.detach()
      } catch {
        // Ignore.
      }
    }
  }
}

/**
 * Reads a CDP content-size object.
 *
 * @param raw - cssContentSize or contentSize
 * @returns Positive width/height, or null
 */
function readCssSize(raw: { width?: number; height?: number } | undefined): { width: number; height: number } | null {
  if (!raw || typeof raw.width !== 'number' || typeof raw.height !== 'number') {
    return null
  }
  if (!(raw.width > 0) || !(raw.height > 0)) {
    return null
  }
  return { width: raw.width, height: raw.height }
}

/**
 * Waits two animation frames so layout can settle after metrics override.
 *
 * @param contents - Target webContents
 * @returns Nothing
 */
async function waitNextPaint(contents: WebContents): Promise<void> {
  try {
    await contents.executeJavaScript(
      'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
    )
  } catch {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50)
    })
  }
}

/**
 * capturePage with the document scroll size (best-effort beyond the viewport).
 *
 * @param contents - Page to capture
 * @returns Image, or null
 */
async function captureFullPageRect(contents: WebContents): Promise<NativeImage | null> {
  try {
    const size = (await contents.executeJavaScript(`({
      width: Math.max(
        document.documentElement.scrollWidth,
        document.body ? document.body.scrollWidth : 0,
        window.innerWidth
      ),
      height: Math.max(
        document.documentElement.scrollHeight,
        document.body ? document.body.scrollHeight : 0,
        window.innerHeight
      )
    })`)) as { width?: unknown; height?: unknown }
    const width = typeof size.width === 'number' ? Math.ceil(size.width) : 0
    const height = typeof size.height === 'number' ? Math.min(MAX_PAGE_HEIGHT, Math.ceil(size.height)) : 0
    if (width < 8 || height < 8) {
      return null
    }
    const shot = await contents.capturePage({ x: 0, y: 0, width, height })
    return shot.isEmpty() ? null : shot
  } catch {
    return null
  }
}

/**
 * Captures the whole window (including guest views) then crops the right strip.
 *
 * @param win - Main window
 * @param cropDipWidth - Remaining width in DIP
 * @param contentHeight - Content height in DIP
 * @returns Cropped image, or null
 */
async function captureWindowThumbnail(
  win: BrowserWindow,
  cropDipWidth: number,
  contentHeight: number,
): Promise<NativeImage | null> {
  const [contentWidth] = win.getContentSize()
  const scale = screen.getDisplayMatching(win.getBounds()).scaleFactor
  const pixelW = Math.max(1, Math.round(contentWidth * scale))
  const pixelH = Math.max(1, Math.round(contentHeight * scale))
  let sources
  try {
    sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: pixelW, height: pixelH },
    })
  } catch {
    return null
  }
  const mediaId = win.getMediaSourceId()
  const source = sources.find((row) => row.id === mediaId)
  if (!source || source.thumbnail.isEmpty()) {
    return null
  }
  const thumb = source.thumbnail
  const size = thumb.getSize()
  if (size.width < 8 || size.height < 8) {
    return null
  }
  const cropW = Math.max(1, Math.min(size.width, Math.round((size.width * cropDipWidth) / contentWidth)))
  return thumb.crop({ x: 0, y: 0, width: cropW, height: size.height })
}

/**
 * Visible-viewport capture when full-page CDP is unavailable.
 *
 * @param win - Main window
 * @param guest - Active guest view, if any
 * @param cropDipWidth - Left column width
 * @param contentHeight - Content height
 * @returns Viewport image, or null
 */
async function captureViewportFallback(
  win: BrowserWindow,
  guest: WebContentsView | null,
  cropDipWidth: number,
  contentHeight: number,
): Promise<NativeImage | null> {
  if (guest && !guest.webContents.isDestroyed()) {
    try {
      const shot = await guest.webContents.capturePage()
      if (!shot.isEmpty()) {
        return shot
      }
    } catch {
      // Fall through to the main renderer.
    }
  }
  try {
    const main = await win.webContents.capturePage({
      x: 0,
      y: 0,
      width: cropDipWidth,
      height: contentHeight,
    })
    return main.isEmpty() ? null : main
  } catch {
    return null
  }
}

/**
 * Keeps the left fraction of an image (drops the Ask AI column).
 *
 * @param image - Full-width capture
 * @param keepRatio - Left width / full width
 * @returns Cropped image
 */
function cropKeepLeft(image: NativeImage, keepRatio: number): NativeImage {
  const size = image.getSize()
  const ratio = Math.min(1, Math.max(0.1, keepRatio))
  const cropW = Math.max(1, Math.min(size.width, Math.round(size.width * ratio)))
  return image.crop({ x: 0, y: 0, width: cropW, height: size.height })
}

/**
 * Encodes a capture as a JPEG under the Ask image size cap.
 *
 * @param image - Source bitmap
 * @returns JPEG payload, or null
 */
function encodeJpeg(image: NativeImage): AskAiCaptureResult | null {
  let next = image
  const size = next.getSize()
  if (size.width > MAX_JPEG_WIDTH) {
    next = next.resize({ width: MAX_JPEG_WIDTH, quality: 'good' })
  }
  const afterWidth = next.getSize()
  if (afterWidth.height > MAX_JPEG_HEIGHT) {
    const width = Math.max(1, Math.round((afterWidth.width * MAX_JPEG_HEIGHT) / afterWidth.height))
    next = next.resize({ width, height: MAX_JPEG_HEIGHT, quality: 'good' })
  }
  for (const quality of [JPEG_QUALITY, 60, 50, 40]) {
    const jpeg = next.toJPEG(quality)
    if (jpeg.length === 0) {
      continue
    }
    if (jpeg.length > JPEG_MAX_BYTES) {
      continue
    }
    const out = next.getSize()
    return {
      mimeType: 'image/jpeg',
      data: jpeg.toString('base64'),
      width: out.width,
      height: out.height,
    }
  }
  next = next.resize({ width: Math.max(1, Math.round(next.getSize().width * 0.6)), quality: 'good' })
  const jpeg = next.toJPEG(40)
  if (jpeg.length === 0 || jpeg.length > JPEG_MAX_BYTES) {
    return null
  }
  const out = next.getSize()
  return {
    mimeType: 'image/jpeg',
    data: jpeg.toString('base64'),
    width: out.width,
    height: out.height,
  }
}
