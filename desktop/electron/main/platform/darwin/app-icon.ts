import path from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'

/** Light squircle Dock / window icon (`public/app-icon.png`). */
export const MAC_APP_ICON_DEFAULT = 'app-icon.png'

/**
 * Apple macOS icon grid inset (~96px on a 1024 canvas).
 * `dock.setIcon` fills the whole Dock slot; bundled .icon / .icns do not.
 */
const DOCK_ICON_INSET_RATIO = 96 / 1024

/**
 * Resolves the Mac app icon (light squircle PNG).
 * @param iconDir - Public assets directory (`VITE_PUBLIC`).
 * @returns Absolute path to `app-icon.png`.
 */
export function resolveMacAppIconPath(iconDir: string): string {
  return path.join(iconDir, MAC_APP_ICON_DEFAULT)
}

/**
 * Shrinks artwork to the macOS icon well so `dock.setIcon` matches neighboring apps.
 * @param source - Squircle app icon (plate to the image edges).
 * @returns Padded native image, or `source` when it cannot be padded.
 */
function padMacDockIcon(source: NativeImage): NativeImage {
  const { width, height } = source.getSize()
  if (width <= 0 || height <= 0) {
    return source
  }
  const inset = Math.round(Math.max(width, height) * DOCK_ICON_INSET_RATIO)
  const innerW = width - inset * 2
  const innerH = height - inset * 2
  if (innerW <= 0 || innerH <= 0) {
    return source
  }
  const resized = source.resize({ width: innerW, height: innerH, quality: 'best' })
  const inner = resized.getSize()
  const src = resized.toBitmap()
  const dst = Buffer.alloc(width * height * 4, 0)
  const offsetX = Math.round((width - inner.width) / 2)
  const offsetY = Math.round((height - inner.height) / 2)
  for (let y = 0; y < inner.height; y += 1) {
    const srcStart = y * inner.width * 4
    const dstStart = ((y + offsetY) * width + offsetX) * 4
    src.copy(dst, dstStart, srcStart, srcStart + inner.width * 4)
  }
  return nativeImage.createFromBitmap(dst, { width, height })
}

/**
 * Sets the Dock icon to the light squircle PNG, inset to the system icon well.
 * Packaged builds use Icon Composer / icns from electron-builder instead.
 * @param iconDir - Public assets directory.
 * @returns Nothing.
 */
export function applyMacDockIcon(iconDir: string): void {
  if (app.isPackaged) {
    return
  }
  const icon = nativeImage.createFromPath(resolveMacAppIconPath(iconDir))
  if (icon.isEmpty()) {
    return
  }
  app.dock?.setIcon(padMacDockIcon(icon))
}

/**
 * Applies the light Dock icon once at launch.
 * @param iconDir - Public assets directory.
 * @returns Nothing.
 */
export function syncMacDockIconWithAppearance(iconDir: string): void {
  applyMacDockIcon(iconDir)
}
