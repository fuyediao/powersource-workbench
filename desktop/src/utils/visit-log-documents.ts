import type { VisitLogDocumentFile } from '@/types/customer'

export type { VisitLogDocumentFile }

/** Private Storage bucket for visit-log documents. */
export const VISIT_LOG_DOCUMENTS_BUCKET = 'visit-log-documents'

/** Max document attachments per visit log. */
export const MAX_VISIT_LOG_DOCUMENTS = 5

/** Max bytes per document (50 MiB). */
export const VISIT_LOG_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const ALLOWED_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

/** Native file-input accept list for visit-log documents. */
export const VISIT_LOG_DOCUMENT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'

/**
 * Resolve MIME from the File type or extension.
 *
 * @param file - Browser File
 * @returns MIME string or null when unsupported
 */
export function resolveVisitLogDocumentMime(file: File): string | null {
  const typed = file.type.trim().toLowerCase()
  if (ALLOWED_MIME.has(typed)) return typed
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'doc') return 'application/msword'
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (ext === 'xls') return 'application/vnd.ms-excel'
  if (ext === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (ext === 'ppt') return 'application/vnd.ms-powerpoint'
  if (ext === 'pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  return null
}

/**
 * Return true when the file is an allowed visit-log document.
 *
 * @param file - Browser File
 * @returns Whether the file may be uploaded
 */
export function isAllowedVisitLogDocument(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return Boolean(resolveVisitLogDocumentMime(file) && ALLOWED_EXT.has(ext))
}

/**
 * File-name extension used in the storage object path.
 *
 * @param file - Browser File
 * @returns Lowercase extension or `bin`
 */
export function visitLogDocumentExt(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_EXT.has(ext) ? ext : 'bin'
}

/**
 * Map a `document_files` JSONB payload to typed attachments.
 *
 * @param raw - JSONB array from Postgres
 * @returns Typed attachments
 */
export function mapVisitLogDocumentFiles(raw: unknown): VisitLogDocumentFile[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const storagePath = String(row.storage_path ?? row.storagePath ?? '').trim()
    const fileName = String(row.file_name ?? row.fileName ?? '').trim()
    if (!storagePath || !fileName) return []
    const byteSizeRaw = row.byte_size ?? row.byteSize
    return [
      {
        storagePath,
        fileName,
        mimeType: String(row.mime_type ?? row.mimeType ?? ''),
        byteSize: typeof byteSizeRaw === 'number' ? byteSizeRaw : Number(byteSizeRaw ?? 0),
      },
    ]
  })
}

/**
 * Serialize attachments for the `document_files` JSONB column.
 *
 * @param files - Typed attachments
 * @returns JSONB-ready objects
 */
export function serializeVisitLogDocumentFiles(
  files: VisitLogDocumentFile[],
): Record<string, unknown>[] {
  return files.map((file) => ({
    storage_path: file.storagePath,
    file_name: file.fileName,
    mime_type: file.mimeType,
    byte_size: file.byteSize,
  }))
}
