/**
 * Shared "open in Office" pipeline for external callers (Customer Management
 * documents, mail Office attachments, TE spreadsheet exports, product price
 * template). Replaces the old Univer-only `utils/univer/office-document-request.ts`:
 * every request is uploaded as a personal `office_files` row (native OOXML
 * bytes) and then opened through the same OnlyOffice session path as the
 * workspace library — never a second editor.
 */

import { LocaleType } from '@univerjs/core'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  officeSaveFileName,
  parseOfficeFile,
  serializeOfficeFile,
} from '@/office/office-exchange'
import { createOfficeFile } from '@/services/office-files-api'
import type { OfficeFeatureId } from '@/constants/office-folder'


/**
 * Maps a file name to Docs / Sheets / Slides for the OnlyOffice open pipeline.
 * @param fileName - Display or storage file name.
 * @returns Office feature id, or null when the extension is not Office.
 */
export function officeKindFromFileName(fileName: string): OfficeFeatureId | null {
  const name = fileName.toLowerCase()
  if (name.endsWith('.doc') || name.endsWith('.docx')) {
    return 'docs'
  }
  if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
    return 'sheets'
  }
  if (name.endsWith('.ppt') || name.endsWith('.pptx')) {
    return 'slides'
  }
  return null
}

/**
 * Returns whether a file should open as PDF (in-app viewer) instead of Office.
 * @param fileName - Display or storage file name.
 * @param mimeType - Optional MIME type.
 * @returns True for PDF files.
 */
export function isPdfFileName(fileName: string, mimeType?: string | null): boolean {
  if ((mimeType ?? '').toLowerCase().includes('pdf')) {
    return true
  }
  return /\.pdf$/i.test(fileName)
}

/** MIME types Chromium reports for Docs / Sheets / Slides files during a drag. */
const OFFICE_DRAG_MIME: Record<OfficeFeatureId, readonly string[]> = {
  docs: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  sheets: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  slides: [
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],
}

/**
 * Returns whether a dropped file belongs on this Docs / Sheets / Slides page.
 * @param kind - Active Office feature.
 * @param fileName - File name from the OS drag.
 * @returns True when the extension matches `kind`.
 */
export function isOfficeFileForKind(kind: OfficeFeatureId, fileName: string): boolean {
  return officeKindFromFileName(fileName) === kind
}

/**
 * Returns whether an in-flight OS drag likely contains files this Office page
 * should upload. Image drags are ignored so they do not steal the overlay.
 * Empty MIME (common on macOS Finder) is accepted and filtered by name on drop.
 * @param kind - Active Office feature.
 * @param dataTransfer - Drag payload.
 * @returns True when the overlay should appear.
 */
export function isOfficeFileDragForKind(kind: OfficeFeatureId, dataTransfer: DataTransfer): boolean {
  const named = Array.from(dataTransfer.files)
  if (named.some((file) => isOfficeFileForKind(kind, file.name))) {
    return true
  }
  const items = Array.from(dataTransfer.items).filter((item) => item.kind === 'file')
  if (items.length === 0) {
    return named.length === 0
  }
  const allowed = OFFICE_DRAG_MIME[kind]
  return items.some((item) => {
    const mime = item.type.toLowerCase()
    if (mime.startsWith('image/')) {
      return false
    }
    if (mime === '' || mime === 'application/octet-stream') {
      return true
    }
    return allowed.includes(mime)
  })
}

/**
 * Converts dropped Office bytes to the OOXML the Document Server expects.
 * Legacy `.doc` / `.xls` / `.ppt` go through Univer import → export.
 * @param kind - Docs / sheets / slides.
 * @param fileName - Source file name.
 * @param bytes - Source bytes.
 * @returns OOXML bytes for `createOfficeFile`.
 */
export async function officeBytesForLibraryUpload(
  kind: OfficeFeatureId,
  fileName: string,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  return resolveOoxmlBytes({ kind, name: fileName, bytes })
}


/** A document that should open in the OnlyOffice editor for one feature kind. */
export interface OfficeDocumentRequest {
  kind: OfficeFeatureId
  name: string
  /** Univer unit snapshot (serialized to OOXML via {@link serializeOfficeFile}). */
  snapshot?: Record<string, unknown>
  /** Already-native OOXML bytes (skips Univer serialization). */
  bytes?: Uint8Array
}

/** A document uploaded to Supabase and ready for the OnlyOffice host to open. */
export interface OfficeDocumentReady {
  kind: OfficeFeatureId
  fileId: string
}

const OPEN_OFFICE_EVENT = 'geocrm:open-office'
const OFFICE_DOCUMENT_EVENT = 'geocrm:office-document'
const OFFICE_DOCUMENT_ERROR_EVENT = 'geocrm:office-document-error'

const pendingReady = new Map<OfficeFeatureId, OfficeDocumentReady>()

/**
 * Returns whether a file name is a legacy binary Office format that must be
 * converted to OOXML before OnlyOffice can open it.
 * @param kind - Docs / sheets / slides.
 * @param fileName - Source file name.
 * @returns True for `.doc` / `.xls` / `.ppt`.
 */
function isLegacyOfficeFile(kind: OfficeFeatureId, fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (kind === 'docs') {
    return extension === 'doc'
  }
  if (kind === 'sheets') {
    return extension === 'xls'
  }
  return extension === 'ppt'
}

/**
 * Copies a `Uint8Array` into a standalone `ArrayBuffer` (avoids SharedArrayBuffer
 * typing issues when the view is a slice of a larger buffer).
 * @param bytes - Source bytes.
 * @returns Detached ArrayBuffer copy.
 */
function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

/**
 * Resolves native OOXML bytes for an open request. Legacy `.doc` / `.xls` /
 * `.ppt` bytes are converted through Univer import → OOXML export so the
 * Document Server receives a format matching `fileType` (docx/xlsx/pptx).
 * @param request - Open request.
 * @returns OOXML bytes.
 */
async function resolveOoxmlBytes(request: OfficeDocumentRequest): Promise<Uint8Array> {
  if (request.snapshot) {
    return new Uint8Array(
      await (await serializeOfficeFile(request.kind, request.snapshot)).arrayBuffer(),
    )
  }
  if (!request.bytes) {
    return new Uint8Array(
      await (await serializeOfficeFile(request.kind, {})).arrayBuffer(),
    )
  }
  if (!isLegacyOfficeFile(request.kind, request.name)) {
    return request.bytes
  }
  const { snapshot } = await parseOfficeFile(
    request.kind,
    request.name,
    bytesToArrayBuffer(request.bytes),
    LocaleType.EN_US,
  )
  return new Uint8Array(await (await serializeOfficeFile(request.kind, snapshot)).arrayBuffer())
}

/**
 * Uploads a document (Univer snapshot or raw OOXML bytes) as a new personal
 * `office_files` row, then activates the matching Office feature tab. Fire
 * and forget — failures are surfaced via {@link subscribeOfficeDocumentError}.
 * @param request - Editor kind, display name, and Univer snapshot or OOXML bytes.
 * @returns Nothing.
 */
export function openOfficeDocument(request: OfficeDocumentRequest): void {
  void (async () => {
    try {
      if (!isSupabaseConfigured || !supabase) {
        throw new Error('supabase_not_configured')
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('not_authenticated')
      }
      const bytes = await resolveOoxmlBytes(request)
      // Basename only — `createOfficeFile` appends the OOXML extension.
      const name = officeSaveFileName(request.name, request.kind)
      const created = await createOfficeFile(request.kind, name, { ownerUserId: user.id }, bytes)
      const ready: OfficeDocumentReady = { kind: request.kind, fileId: created.id }
      pendingReady.set(request.kind, ready)
      window.dispatchEvent(new CustomEvent(OFFICE_DOCUMENT_EVENT, { detail: ready }))
      window.dispatchEvent(new CustomEvent(OPEN_OFFICE_EVENT, { detail: request.kind }))
    } catch (error) {
      console.error('[office-document-request] openOfficeDocument:', error)
      window.dispatchEvent(
        new CustomEvent(OFFICE_DOCUMENT_ERROR_EVENT, { detail: { kind: request.kind } }),
      )
    }
  })()
}

/**
 * Reads and clears a document waiting for an Office tab to mount.
 * @param kind - Office editor kind.
 * @returns Pending ready file, or null.
 */
export function consumePendingOfficeDocument(kind: OfficeFeatureId): OfficeDocumentReady | null {
  const ready = pendingReady.get(kind) ?? null
  pendingReady.delete(kind)
  return ready
}

/**
 * Subscribes to requests that activate an Office feature tab.
 * @param listener - Receives the requested office kind.
 * @returns Unsubscribe function.
 */
export function subscribeOpenOfficeRequest(
  listener: (kind: OfficeFeatureId) => void,
): () => void {
  /**
   * Forwards a valid office kind from the window event.
   * @param event - Office open event.
   * @returns Nothing.
   */
  function handler(event: Event): void {
    const kind = (event as CustomEvent<OfficeFeatureId>).detail
    if (kind === 'docs' || kind === 'sheets' || kind === 'slides') {
      listener(kind)
    }
  }

  window.addEventListener(OPEN_OFFICE_EVENT, handler)
  return () => window.removeEventListener(OPEN_OFFICE_EVENT, handler)
}

/**
 * Subscribes to newly uploaded documents while an Office tab is already mounted.
 * @param kind - Office editor kind.
 * @param listener - Receives the ready file.
 * @returns Unsubscribe function.
 */
export function subscribeOfficeDocumentRequest(
  kind: OfficeFeatureId,
  listener: (ready: OfficeDocumentReady) => void,
): () => void {
  /**
   * Delivers a matching ready file and clears its pending copy.
   * @param event - Office document event.
   * @returns Nothing.
   */
  function handler(event: Event): void {
    const ready = (event as CustomEvent<OfficeDocumentReady>).detail
    if (!ready || ready.kind !== kind) {
      return
    }
    pendingReady.delete(kind)
    listener(ready)
  }

  window.addEventListener(OFFICE_DOCUMENT_EVENT, handler)
  return () => window.removeEventListener(OFFICE_DOCUMENT_EVENT, handler)
}

/**
 * Subscribes to upload/open failures for one Office editor kind.
 * @param kind - Office editor kind.
 * @param listener - Invoked with no payload; caller should show a generic error.
 * @returns Unsubscribe function.
 */
export function subscribeOfficeDocumentError(
  kind: OfficeFeatureId,
  listener: () => void,
): () => void {
  /**
   * Forwards a matching upload/open failure.
   * @param event - Office document error event.
   * @returns Nothing.
   */
  function handler(event: Event): void {
    const detail = (event as CustomEvent<{ kind: OfficeFeatureId }>).detail
    if (detail?.kind === kind) {
      listener()
    }
  }

  window.addEventListener(OFFICE_DOCUMENT_ERROR_EVENT, handler)
  return () => window.removeEventListener(OFFICE_DOCUMENT_ERROR_EVENT, handler)
}
