const PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

export interface RemoteImageRewrite {
  html: string
  blocked: number
}

/**
 * Parses a positive CSS pixel length from an HTML width/height attribute.
 * @param value - Raw attribute value (e.g. "600" or "600px").
 * @returns Pixel number, or null when missing/invalid/percentage.
 */
function parsePixelAttr(value: string | null): number | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.endsWith('%')) {
    return null
  }
  const n = Number.parseFloat(trimmed)
  if (!Number.isFinite(n) || n <= 0) {
    return null
  }
  return Math.round(n)
}

/**
 * Reserves layout space for a blocked remote image so marketing HTML
 * (tables of spacer/hero images) does not collapse to a tiny iframe.
 * @param img - Image element being blocked.
 */
function reserveBlockedImageSpace(img: HTMLImageElement): void {
  const width = parsePixelAttr(img.getAttribute('width'))
  const height = parsePixelAttr(img.getAttribute('height'))
  img.style.maxWidth = '100%'
  img.style.boxSizing = 'border-box'
  img.style.background = '#f4f4f5'
  img.style.outline = '1px dashed #d4d4d8'
  img.style.objectFit = 'contain'
  if (width && height) {
    // Prefer aspect-ratio so max-width:100% can shrink width without the
    // 1×1 placeholder's intrinsic ratio collapsing the reserved height.
    img.style.width = `${width}px`
    img.style.aspectRatio = `${width} / ${height}`
    img.style.height = 'auto'
    return
  }
  if (height) {
    img.style.minHeight = `${height}px`
  } else {
    img.style.minHeight = '72px'
  }
  if (width) {
    img.style.width = `${width}px`
  } else {
    img.style.minWidth = '120px'
    img.style.width = '100%'
  }
}

/**
 * Clears layout hints applied while the image was blocked.
 * @param img - Image element being restored.
 */
function clearBlockedImageSpace(img: HTMLImageElement): void {
  img.style.maxWidth = ''
  img.style.boxSizing = ''
  img.style.background = ''
  img.style.outline = ''
  img.style.objectFit = ''
  img.style.width = ''
  img.style.height = ''
  img.style.minWidth = ''
  img.style.minHeight = ''
  img.style.aspectRatio = ''
}

/**
 * Blocks or restores remote http(s) images in a mail body.
 * @param html - Sanitized HTML.
 * @param loadRemote - When true, restore previously blocked srcs.
 * @returns Rewritten HTML and blocked count.
 */
export function rewriteRemoteMailImages(html: string, loadRemote: boolean): RemoteImageRewrite {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html')
  const root = doc.getElementById('root')
  if (!root) {
    return { html, blocked: 0 }
  }
  let blocked = 0
  root.querySelectorAll('img').forEach((img) => {
    const current = img.getAttribute('src') ?? ''
    const stored = img.getAttribute('data-mail-remote-src') ?? ''
    const remote = stored || current
    if (!/^https?:\/\//i.test(remote)) {
      return
    }
    if (loadRemote) {
      img.setAttribute('src', remote)
      img.removeAttribute('data-mail-remote-src')
      clearBlockedImageSpace(img)
      return
    }
    blocked += 1
    img.setAttribute('data-mail-remote-src', remote)
    img.setAttribute('src', PLACEHOLDER)
    img.setAttribute('alt', img.getAttribute('alt') || '')
    reserveBlockedImageSpace(img)
  })
  return { html: root.innerHTML, blocked }
}

/**
 * Whether an attachment can preview in-app (image or PDF).
 * @param contentType - MIME type.
 * @param filename - File name fallback.
 * @returns True when a lightbox preview is supported.
 */
export function canPreviewMailAttachment(contentType: string | null, filename: string): boolean {
  const type = (contentType ?? '').toLowerCase()
  if (type.startsWith('image/') || type === 'application/pdf') {
    return true
  }
  return /\.(png|jpe?g|gif|webp|bmp|svg|pdf)$/i.test(filename)
}
