import { sanitizeMailHtml } from '@/utils/mail/sanitize-mail-html'

const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Whether the MIME type can be inlined as an HTML image.
 * @param mime - File MIME type.
 * @returns True for common raster images.
 */
export function isInlineComposeImage(mime: string): boolean {
  return mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/gif' || mime === 'image/webp'
}

/**
 * Whether an inline image is small enough to embed in the HTML body.
 * @param size - File size in bytes.
 * @returns True when under the compose cap.
 */
export function isInlineImageSizeOk(size: number): boolean {
  return size > 0 && size <= MAX_INLINE_IMAGE_BYTES
}

/**
 * Strips tags from compose HTML for the plain-text MIME part.
 * @param html - Composer inner HTML.
 * @returns Plain text.
 */
export function htmlToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').trim()
}

/**
 * Sanitizes composer HTML before send.
 * @param html - Composer inner HTML.
 * @returns Safer HTML fragment.
 */
export function sanitizeComposeHtml(html: string): string {
  return sanitizeMailHtml(html)
}

/**
 * True when the composer has no visible text or inline images.
 * @param html - Composer inner HTML.
 * @returns True if empty.
 */
export function isComposeHtmlEmpty(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const text = (doc.body.textContent ?? '').replace(/\u00a0/g, ' ').trim()
  return text.length === 0 && doc.querySelectorAll('img').length === 0
}
