/**
 * Supabase CRUD + Storage for customer_documents (PDF / PPT / Excel).
 */

import { fromLoose } from '@/lib/supabase-loose'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export const CUSTOMER_DOCUMENTS_BUCKET = 'customer-documents'
export const CUSTOMER_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const ALLOWED_EXT = new Set(['pdf', 'ppt', 'pptx', 'xls', 'xlsx', 'doc', 'docx'])

export type CustomerDocument = {
  id: string
  customerId: string
  groupId: string | null
  storagePath: string
  fileName: string
  byteSize: number | null
  mimeType: string | null
  uploadedBy: string | null
  createdAt: string
}

/**
 * Maps a raw row to CustomerDocument.
 * @param row - Supabase row.
 * @returns Document.
 */
function mapRow(row: Record<string, unknown>): CustomerDocument {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    groupId: (row.group_id as string | null) ?? null,
    storagePath: String(row.storage_path),
    fileName: String(row.file_name),
    byteSize: row.byte_size != null ? Number(row.byte_size) : null,
    mimeType: (row.mime_type as string | null) ?? null,
    uploadedBy: (row.uploaded_by as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
  }
}

/**
 * Resolves MIME from file type or extension.
 * @param file - Browser File.
 * @returns MIME or null when unsupported.
 */
function resolveMime(file: File): string | null {
  const typed = file.type.trim().toLowerCase()
  if (ALLOWED_MIME.has(typed)) {
    return typed
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') {
    return 'application/pdf'
  }
  if (ext === 'ppt') {
    return 'application/vnd.ms-powerpoint'
  }
  if (ext === 'pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  if (ext === 'xls') {
    return 'application/vnd.ms-excel'
  }
  if (ext === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  if (ext === 'doc') {
    return 'application/msword'
  }
  if (ext === 'docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  return null
}

/**
 * Returns true when the file is an allowed PDF/Office document.
 * @param file - Browser File.
 * @returns Whether the file may be uploaded.
 */
export function isAllowedCustomerDocument(file: File): boolean {
  const mime = resolveMime(file)
  if (!mime) {
    return false
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ALLOWED_EXT.has(ext) || ALLOWED_MIME.has(file.type.toLowerCase())
}

/**
 * Returns true when the document is a PDF.
 * @param doc - Document row.
 * @returns Whether PDF preview applies.
 */
export function isCustomerDocumentPdf(doc: CustomerDocument): boolean {
  const mime = (doc.mimeType ?? '').toLowerCase()
  if (mime.includes('pdf')) {
    return true
  }
  return /\.pdf$/i.test(doc.fileName)
}

/**
 * Lists documents for a customer (newest first).
 * @param customerId - Parent customer id.
 * @returns Document rows.
 */
export async function listCustomerDocuments(
  customerId: string,
): Promise<CustomerDocument[]> {
  const { data, error } = await fromLoose('customer_documents')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[customer-documents-api] list:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row))
}

/**
 * Uploads a PDF/PPT and inserts the metadata row.
 * @param customerId - Parent customer id.
 * @param groupId - Workspace group id.
 * @param file - File to upload.
 * @returns Created document.
 */
export async function uploadCustomerDocument(
  customerId: string,
  groupId: string | null,
  file: File,
): Promise<CustomerDocument> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  if (!groupId) {
    throw new Error('group_required')
  }
  if (file.size <= 0 || file.size > CUSTOMER_DOCUMENT_MAX_BYTES) {
    throw new Error('file_too_large')
  }
  const mime = resolveMime(file)
  if (!mime) {
    throw new Error('invalid_file_type')
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    throw userError ?? new Error('not_signed_in')
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
  const path = `${customerId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`

  const { error: upErr } = await supabase.storage
    .from(CUSTOMER_DOCUMENTS_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: mime,
    })
  if (upErr) {
    console.error('[customer-documents-api] upload:', upErr)
    throw upErr
  }

  const { data, error } = await fromLoose('customer_documents')
    .insert({
      customer_id: customerId,
      group_id: groupId,
      storage_path: path,
      file_name: file.name,
      byte_size: file.size,
      mime_type: mime,
      uploaded_by: user.id,
    })
    .select('*')
    .single()
  if (error || !data) {
    await supabase.storage.from(CUSTOMER_DOCUMENTS_BUCKET).remove([path])
    console.error('[customer-documents-api] insert:', error)
    throw error ?? new Error('insert_failed')
  }
  return mapRow(data)
}

/**
 * Creates a time-limited signed URL for download/preview.
 * @param storagePath - Object path in the bucket.
 * @param expiresInSeconds - TTL (default 1 hour).
 * @returns Signed URL.
 */
export async function createCustomerDocumentSignedUrl(
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase.storage
    .from(CUSTOMER_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error || !data?.signedUrl) {
    console.error('[customer-documents-api] signedUrl:', error)
    throw error ?? new Error('signed_url_failed')
  }
  return data.signedUrl
}

/**
 * Downloads object bytes from Storage.
 * @param storagePath - Object path in the bucket.
 * @returns File blob.
 */
export async function fetchCustomerDocumentBlob(
  storagePath: string,
): Promise<Blob> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase.storage
    .from(CUSTOMER_DOCUMENTS_BUCKET)
    .download(storagePath)
  if (error || !data) {
    console.error('[customer-documents-api] download blob:', error)
    throw error ?? new Error('download_failed')
  }
  return data
}

/**
 * Downloads a document into a blob object URL for in-app PDF preview.
 * Callers must revoke the URL when done.
 * @param storagePath - Object path in the bucket.
 * @returns Object URL (`blob:…`).
 */
export async function createCustomerDocumentBlobUrl(
  storagePath: string,
): Promise<string> {
  const blob = await fetchCustomerDocumentBlob(storagePath)
  return URL.createObjectURL(blob)
}

/**
 * Deletes the metadata row and best-effort removes the storage object.
 * @param doc - Document to delete.
 * @returns Nothing.
 */
export async function deleteCustomerDocument(doc: CustomerDocument): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await fromLoose('customer_documents').delete().eq('id', doc.id)
  if (error) {
    console.error('[customer-documents-api] delete row:', error)
    throw error
  }
  const { error: storageError } = await supabase.storage
    .from(CUSTOMER_DOCUMENTS_BUCKET)
    .remove([doc.storagePath])
  if (storageError) {
    console.warn('[customer-documents-api] delete storage:', storageError)
  }
}
