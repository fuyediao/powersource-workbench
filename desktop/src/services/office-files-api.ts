/**
 * Supabase CRUD + Storage for `office_files` (Docs/Sheets/Slides library).
 * Personal (`owner_user_id`) XOR group (`group_id`) rows, Folio-style;
 * native OOXML bytes live in the private `office-files` bucket at
 * `{id}/{filename}` (supabase/sql/migrations/20260828_office_files.sql).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { OfficeFeatureId } from '@/constants/office-folder'
import { stripExtension } from '@/office/office-file-io'

export const OFFICE_FILES_BUCKET = 'office-files'

/** Extensions stripped from display names before Storage / DB write. */
const OFFICE_NAME_EXTENSIONS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] as const

export interface OfficeFile {
  id: string
  kind: OfficeFeatureId
  name: string
  storagePath: string
  color: string | null
  ownerUserId: string | null
  groupId: string | null
  createdBy: string | null
  updatedBy: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** OOXML extension for a Docs/Sheets/Slides kind. */
export function officeFileExtension(kind: OfficeFeatureId): string {
  return kind === 'docs' ? 'docx' : kind === 'sheets' ? 'xlsx' : 'pptx'
}

/** OOXML MIME type for a Docs/Sheets/Slides kind. */
export function officeFileContentType(kind: OfficeFeatureId): string {
  if (kind === 'docs') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (kind === 'sheets') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

function mapRow(row: Record<string, unknown>): OfficeFile {
  return {
    id: String(row.id),
    kind: row.kind as OfficeFeatureId,
    name: String(row.name ?? ''),
    storagePath: String(row.storage_path),
    color: (row.color as string | null) ?? null,
    ownerUserId: (row.owner_user_id as string | null) ?? null,
    groupId: (row.group_id as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    updatedBy: (row.updated_by as string | null) ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

function requireSupabase(): NonNullable<typeof supabase> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  return supabase
}

/**
 * Lists Office library rows for one scope (personal owner or one group),
 * newest first within manual sort order.
 * @param kind - Docs / sheets / slides.
 * @param scope - Personal owner id, or a group id.
 * @returns Office file rows.
 */
export async function listOfficeFiles(
  kind: OfficeFeatureId,
  scope: { ownerUserId: string } | { groupId: string },
): Promise<OfficeFile[]> {
  const sb = requireSupabase()
  let query = sb.from('office_files').select('*').eq('kind', kind)
  query = 'ownerUserId' in scope ? query.eq('owner_user_id', scope.ownerUserId) : query.eq('group_id', scope.groupId)
  const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false })
  if (error) {
    console.error('[office-files-api] list:', error)
    throw error
  }
  return (data ?? []).map(mapRow)
}

/**
 * Loads one Office file row by id.
 * @param id - Row id.
 * @returns Row, or null when missing / not visible under RLS.
 */
export async function getOfficeFile(id: string): Promise<OfficeFile | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('office_files').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('[office-files-api] get:', error)
    throw error
  }
  return data ? mapRow(data) : null
}

/**
 * Creates a new Office file: inserts the metadata row (owner XOR group), then
 * uploads OOXML bytes. Storage RLS requires the `office_files` row to exist
 * before `storage.objects` insert (path `{id}/{filename}`).
 * @param kind - Docs / sheets / slides.
 * @param name - Display name (without extension).
 * @param scope - Personal owner id, or a group id to create the file in.
 * @param bytes - Native OOXML bytes (a blank template when creating new).
 * @returns Created row.
 */
export async function createOfficeFile(
  kind: OfficeFeatureId,
  name: string,
  scope: { ownerUserId: string } | { groupId: string },
  bytes: Uint8Array,
): Promise<OfficeFile> {
  const sb = requireSupabase()
  const id = crypto.randomUUID()
  // Callers sometimes pass `officeSaveFileName` (with .docx/.xlsx/.pptx). Strip
  // so the `name` column does not end up with a double extension.
  const baseName =
    stripExtension(name.trim() || 'Untitled', OFFICE_NAME_EXTENSIONS).trim() || 'Untitled'
  // Storage object name is always ASCII ("file.<ext>"), independent from the
  // (possibly non-Latin) display name: Supabase Storage rejects keys with
  // non-ASCII characters (e.g. "未命名.pptx"), and renames never move the
  // Storage object — only the `name` column changes.
  const storagePath = `${id}/file.${officeFileExtension(kind)}`
  const {
    data: { user },
  } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('office_files')
    .insert({
      id,
      kind,
      name: baseName,
      storage_path: storagePath,
      owner_user_id: 'ownerUserId' in scope ? scope.ownerUserId : null,
      group_id: 'groupId' in scope ? scope.groupId : null,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[office-files-api] insert:', error)
    throw error ?? new Error('insert_failed')
  }
  const { error: uploadError } = await sb.storage
    .from(OFFICE_FILES_BUCKET)
    .upload(storagePath, bytes, { upsert: true, contentType: officeFileContentType(kind) })
  if (uploadError) {
    await sb.from('office_files').delete().eq('id', id)
    console.error('[office-files-api] upload:', uploadError)
    throw uploadError
  }
  return mapRow(data)
}

/**
 * Renames an Office file.
 * @param id - Row id.
 * @param name - New display name.
 * @returns Updated row.
 */
export async function renameOfficeFile(id: string, name: string): Promise<OfficeFile | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('office_files').update({ name }).eq('id', id).select('*').maybeSingle()
  if (error) {
    console.error('[office-files-api] rename:', error)
    throw error
  }
  return data ? mapRow(data) : null
}

/**
 * Sets (or clears) an Office file's sidebar color tag.
 * @param id - Row id.
 * @param color - Hex color, or null to clear.
 * @returns Updated row.
 */
export async function setOfficeFileColor(id: string, color: string | null): Promise<OfficeFile | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('office_files').update({ color }).eq('id', id).select('*').maybeSingle()
  if (error) {
    console.error('[office-files-api] setColor:', error)
    throw error
  }
  return data ? mapRow(data) : null
}

/**
 * Persists a new manual sort order for a scope's file list (drag reorder).
 * @param orderedIds - File ids in the desired display order.
 * @returns Nothing.
 */
export async function reorderOfficeFiles(orderedIds: string[]): Promise<void> {
  const sb = requireSupabase()
  await Promise.all(
    orderedIds.map((id, index) => sb.from('office_files').update({ sort_order: index }).eq('id', id)),
  )
}

/**
 * Moves a personal file into a group (clears owner_user_id, sets group_id).
 * Requires an `insert` write grant on the target group (RLS-enforced).
 * @param id - Row id.
 * @param groupId - Destination group.
 * @returns Updated row.
 */
export async function moveOfficeFileToGroup(id: string, groupId: string): Promise<OfficeFile | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('office_files')
    .update({ owner_user_id: null, group_id: groupId })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) {
    console.error('[office-files-api] moveToGroup:', error)
    throw error
  }
  return data ? mapRow(data) : null
}

/**
 * Downloads the native OOXML bytes for one visible (personal or group) file.
 * @param file - File to download.
 * @returns Raw `.docx` / `.xlsx` / `.pptx` bytes.
 */
export async function downloadOfficeFileBytes(file: OfficeFile): Promise<Uint8Array> {
  const sb = requireSupabase()
  const { data: blob, error } = await sb.storage.from(OFFICE_FILES_BUCKET).download(file.storagePath)
  if (error || !blob) {
    console.error('[office-files-api] download:', error)
    throw error ?? new Error('download_failed')
  }
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Copies a visible (personal or group) file into the caller's personal
 * library — duplicates the Storage bytes under a new row id.
 * @param source - File to copy.
 * @param ownerUserId - Caller's user id.
 * @returns The new personal row.
 */
export async function copyOfficeFileToPersonal(
  source: OfficeFile,
  ownerUserId: string,
): Promise<OfficeFile> {
  const bytes = await downloadOfficeFileBytes(source)
  return createOfficeFile(source.kind, source.name, { ownerUserId }, bytes)
}

/**
 * Deletes an Office file: removes the metadata row, then best-effort removes
 * the Storage object.
 * @param file - File to delete.
 * @returns Nothing.
 */
export async function deleteOfficeFile(file: OfficeFile): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('office_files').delete().eq('id', file.id)
  if (error) {
    console.error('[office-files-api] delete row:', error)
    throw error
  }
  const { error: storageError } = await sb.storage.from(OFFICE_FILES_BUCKET).remove([file.storagePath])
  if (storageError) {
    console.warn('[office-files-api] delete storage:', storageError)
  }
}
