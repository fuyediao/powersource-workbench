/**
 * Composer attachment types: documents, Office files, and images.
 * Keep the renderer copy in `src/utils/harness/harness-attachments.ts` in sync.
 */

const IMAGE_EXTENSIONS = [
  'gif',
  'jpeg',
  'jpg',
  'png',
  'webp',
  'bmp',
  'svg',
  'ico',
  'heic',
  'heif',
  'tif',
  'tiff',
]

const DOCUMENT_EXTENSIONS = ['pdf', 'txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'rtf']

const OFFICE_EXTENSIONS = [
  'doc',
  'docx',
  'docm',
  'xls',
  'xlsx',
  'xlsm',
  'ppt',
  'pptx',
  'pptm',
  'odt',
  'ods',
  'odp',
]

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/json',
  'application/rtf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'text/rtf',
])

/** Extension list for the native file picker (no leading dots). */
export const HARNESS_ATTACHMENT_DIALOG_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...OFFICE_EXTENSIONS,
]

/**
 * Returns the lowercased file extension without a leading dot.
 * @param name - File name or absolute path.
 * @returns Extension, or an empty string when missing.
 */
export function harnessAttachmentExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * Returns whether a path is an attachable document, Office file, or image.
 * @param name - File name or absolute path.
 * @returns True when the composer should accept the file.
 */
export function isHarnessAttachmentFileName(name: string): boolean {
  return HARNESS_ATTACHMENT_DIALOG_EXTENSIONS.includes(harnessAttachmentExtension(name))
}

/**
 * Returns whether a path is a previewable image attachment.
 * @param name - File name or absolute path.
 * @returns True for image extensions.
 */
export function isHarnessAttachmentImageName(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(harnessAttachmentExtension(name))
}

/**
 * Returns whether a path is an Office document.
 * @param name - File name or absolute path.
 * @returns True for Word, Excel, PowerPoint, and OpenDocument files.
 */
export function isHarnessAttachmentOfficeName(name: string): boolean {
  return OFFICE_EXTENSIONS.includes(harnessAttachmentExtension(name))
}

/**
 * Returns whether a browser MIME type is a document, Office file, or image.
 * @param mimeType - `File.type` from a drop payload.
 * @returns True when the composer should accept the file.
 */
export function isHarnessAttachmentMimeType(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase()
  if (!mime) return false
  if (mime.startsWith('image/')) return true
  if (DOCUMENT_MIME_TYPES.has(mime)) return true
  return (
    mime.includes('officedocument') ||
    mime.includes('msword') ||
    mime.includes('ms-excel') ||
    mime.includes('spreadsheetml') ||
    mime.includes('presentationml') ||
    mime.includes('ms-powerpoint') ||
    mime.includes('opendocument')
  )
}
