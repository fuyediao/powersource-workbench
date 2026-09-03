/**
 * Image helpers for Storage uploads (WebP convert + size check).
 */

/** Max file size for customer logos (5MB). */
export const MAX_CUSTOMER_LOGO_SIZE_BYTES = 5 * 1024 * 1024

const DEFAULT_WEBP_QUALITY = 0.85
const MAX_CANVAS_DIM = 4096

/** Default max edge length for shared-media JPEG thumbnails. */
export const DEFAULT_THUMBNAIL_MAX_EDGE = 480

/**
 * True when the file size is within the given limit.
 * @param file - File to check.
 * @param maxBytes - Max size in bytes.
 * @returns Whether size is allowed.
 */
export function isImageSizeWithinLimit(
  file: File,
  maxBytes: number = MAX_CUSTOMER_LOGO_SIZE_BYTES,
): boolean {
  return file.size <= maxBytes
}

/**
 * Build a JPEG thumbnail from an image File (does not replace the original).
 *
 * @param file - Source image (any browser-decodable format)
 * @param maxEdge - Longest side in pixels
 * @param quality - JPEG quality 0–1
 * @returns Promise resolving to a JPEG File named `*.thumb.jpg`
 */
export function createImageThumbnail(
  file: File,
  maxEdge: number = DEFAULT_THUMBNAIL_MAX_EDGE,
  quality: number = 0.82,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w <= 0 || h <= 0) {
        reject(new Error('Invalid image dimensions'))
        return
      }
      const scale = Math.min(1, maxEdge / Math.max(w, h))
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2d context not available'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to export thumbnail as JPEG'))
            return
          }
          const base = file.name.includes('.')
            ? file.name.slice(0, file.name.lastIndexOf('.'))
            : file.name
          resolve(new File([blob], `${base}.thumb.jpg`, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    img.src = objectUrl
  })
}

/**
 * Converts an image File to WebP via canvas.
 * @param file - Source image.
 * @param quality - WebP quality 0–1.
 * @returns WebP File.
 */
export function convertImageToWebP(
  file: File,
  quality: number = DEFAULT_WEBP_QUALITY,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > MAX_CANVAS_DIM || h > MAX_CANVAS_DIM) {
        const scale = MAX_CANVAS_DIM / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2d context not available'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to export image as WebP'))
            return
          }
          const name = file.name.includes('.')
            ? `${file.name.slice(0, file.name.lastIndexOf('.'))}.webp`
            : `${file.name}.webp`
          resolve(new File([blob], name, { type: 'image/webp' }))
        },
        'image/webp',
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    img.src = objectUrl
  })
}
