/** Longest edge for settings gallery wallpaper thumbnails (CSS pixels). */
export const WALLPAPER_THUMB_MAX_EDGE = 480

/**
 * Derives the companion thumbnail object path for a full wallpaper path.
 * Example: `userId/uuid.jpg` → `userId/uuid.thumb.webp`.
 * @param storagePath - Full wallpaper storage path.
 * @returns Thumbnail storage path.
 */
export function wallpaperThumbPath(storagePath: string): string {
  const slash = storagePath.lastIndexOf('/')
  const folder = slash >= 0 ? storagePath.slice(0, slash + 1) : ''
  const file = slash >= 0 ? storagePath.slice(slash + 1) : storagePath
  const base = file.replace(/\.[^.]+$/u, '')
  return `${folder}${base}.thumb.webp`
}

/**
 * Builds a small WebP (JPEG fallback) thumbnail blob from an image source.
 * @param source - Image blob or data URL.
 * @param maxEdge - Longest edge in CSS pixels.
 * @returns Encoded thumbnail blob.
 */
export async function createWallpaperThumbnail(
  source: Blob | string,
  maxEdge: number = WALLPAPER_THUMB_MAX_EDGE,
): Promise<Blob> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas unavailable.')
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    const webp = await canvasToBlob(canvas, 'image/webp', 0.78)
    if (webp) {
      return webp
    }
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.82)
    if (jpeg) {
      return jpeg
    }
    throw new Error('Thumbnail encode failed.')
  } finally {
    bitmap.close()
  }
}

/**
 * Encodes a canvas to a blob of the given MIME type.
 * @param canvas - Source canvas.
 * @param type - Output MIME type.
 * @param quality - Lossy quality 0–1.
 * @returns Blob, or null when encoding fails.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), type, quality)
  })
}
