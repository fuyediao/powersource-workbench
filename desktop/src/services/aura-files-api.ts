/**
 * Supabase CRUD + Storage for `aura_files` (Aura Markdown editor library).
 * Personal (`owner_user_id`) XOR group (`group_id`) rows, Folio/Office-style;
 * UTF-8 Markdown text lives in the private `aura-files` bucket at
 * `{id}/file.md` (supabase/sql/migrations/20260829_aura_files.sql). Fully
 * separate from `office_files` / the `office-files` bucket.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { stripExtension } from '@/office/office-file-io'

export const AURA_FILES_BUCKET = 'aura-files'

/** Storage Content-Type. The bucket allowlist is exact-match (`text/markdown`);
 * a `;charset=` suffix is rejected as unsupported. */
const AURA_MARKDOWN_CONTENT_TYPE = 'text/markdown'

/** Extensions stripped from display names before Storage / DB write. */
const AURA_NAME_EXTENSIONS = ['md', 'markdown', 'txt'] as const

export interface AuraFile {
  id: string
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

function mapRow(row: Record<string, unknown>): AuraFile {
  return {
    id: String(row.id),
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
 * Lists Aura library rows for one scope (personal owner or one group),
 * manual sort order first, newest first within that.
 * @param scope - Personal owner id, or a group id.
 * @returns Aura file rows.
 */
export async function listAuraFiles(
  scope: { ownerUserId: string } | { groupId: string },
): Promise<AuraFile[]> {
  const sb = requireSupabase()
  let query = sb.from('aura_files').select('*')
  query = 'ownerUserId' in scope ? query.eq('owner_user_id', scope.ownerUserId) : query.eq('group_id', scope.groupId)
  const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: false })
  if (error) {
    console.error('[aura-files-api] list:', error)
    throw error
  }
  return (data ?? []).map(mapRow)
}

/**
 * Loads one Aura file row by id.
 * @param id - Row id.
 * @returns Row, or null when missing / not visible under RLS.
 */
export async function getAuraFile(id: string): Promise<AuraFile | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('aura_files').select('*').eq('id', id).maybeSingle()
  if (error) {
    console.error('[aura-files-api] get:', error)
    throw error
  }
  return data ? mapRow(data) : null
}

/**
 * Creates a new Aura file: inserts the metadata row (owner XOR group), then
 * uploads Markdown bytes. Storage RLS requires the `aura_files` row to exist
 * before `storage.objects` insert (path `{id}/file.md`).
 * @param name - Display name (without extension).
 * @param scope - Personal owner id, or a group id to create the file in.
 * @param markdown - Initial Markdown text (empty for a blank new file).
 * @returns Created row.
 */
export async function createAuraFile(
  name: string,
  scope: { ownerUserId: string } | { groupId: string },
  markdown = '',
): Promise<AuraFile> {
  const sb = requireSupabase()
  const id = crypto.randomUUID()
  const baseName =
    stripExtension(name.trim() || 'Untitled', AURA_NAME_EXTENSIONS).trim() || 'Untitled'
  // Storage object name is always ASCII ("file.md"), independent from the
  // (possibly non-Latin) display name: Supabase Storage rejects keys with
  // non-ASCII characters, and renames never move the Storage object — only
  // the `name` column changes.
  const storagePath = `${id}/file.md`
  const {
    data: { user },
  } = await sb.auth.getUser()
  const { data, error } = await sb
    .from('aura_files')
    .insert({
      id,
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
    console.error('[aura-files-api] insert:', error)
    throw error ?? new Error('insert_failed')
  }
  const bytes = new TextEncoder().encode(markdown)
  const { error: uploadError } = await sb.storage
    .from(AURA_FILES_BUCKET)
    .upload(storagePath, bytes, { upsert: true, contentType: AURA_MARKDOWN_CONTENT_TYPE })
  if (uploadError) {
    await sb.from('aura_files').delete().eq('id', id)
    console.error('[aura-files-api] upload:', uploadError)
    throw uploadError
  }
  return mapRow(data)
}

/**
 * Renames an Aura file.
 * @param id - Row id.
 * @param name - New display name.
 * @returns Updated row.
 */
export async function renameAuraFile(id: string, name: string): Promise<AuraFile | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('aura_files').update({ name }).eq('id', id).select('*').maybeSingle()
  if (error) {
    console.error('[aura-files-api] rename:', error)
    throw error
  }
  return data ? mapRow(data) : null
}

/**
 * Sets (or clears) an Aura file's sidebar color tag.
 * @param id - Row id.
 * @param color - Hex color, or null to clear.
 * @returns Updated row.
 */
export async function setAuraFileColor(id: string, color: string | null): Promise<AuraFile | null> {
  const sb = requireSupabase()
  const { data, error } = await sb.from('aura_files').update({ color }).eq('id', id).select('*').maybeSingle()
  if (error) {
    console.error('[aura-files-api] setColor:', error)
    throw error
  }
  return data ? mapRow(data) : null
}

/**
 * Persists a new manual sort order for a scope's file list (drag reorder).
 * @param orderedIds - File ids in the desired display order.
 * @returns Nothing.
 */
export async function reorderAuraFiles(orderedIds: string[]): Promise<void> {
  const sb = requireSupabase()
  await Promise.all(
    orderedIds.map((id, index) => sb.from('aura_files').update({ sort_order: index }).eq('id', id)),
  )
}

/**
 * Moves a personal file into a group (clears owner_user_id, sets group_id).
 * Requires an `insert` write grant on the target group (RLS-enforced).
 * @param id - Row id.
 * @param groupId - Destination group.
 * @returns Updated row.
 */
export async function moveAuraFileToGroup(id: string, groupId: string): Promise<AuraFile | null> {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('aura_files')
    .update({ owner_user_id: null, group_id: groupId })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) {
    console.error('[aura-files-api] moveToGroup:', error)
    throw error
  }
  return data ? mapRow(data) : null
}

/**
 * Downloads the Markdown text for one visible (personal or group) file.
 * @param file - File to download.
 * @returns UTF-8 Markdown text.
 */
export async function downloadAuraFileMarkdown(file: AuraFile): Promise<string> {
  const sb = requireSupabase()
  const { data: blob, error } = await sb.storage.from(AURA_FILES_BUCKET).download(file.storagePath)
  if (error || !blob) {
    console.error('[aura-files-api] download:', error)
    throw error ?? new Error('download_failed')
  }
  return await blob.text()
}

/**
 * Uploads (upserts) Markdown text to an existing Aura file's Storage object.
 * Used for save / debounced autosave; does not touch the metadata row.
 * @param file - Target file (existing row).
 * @param markdown - Markdown text to persist.
 * @returns Nothing.
 */
export async function uploadAuraFileMarkdown(file: AuraFile, markdown: string): Promise<void> {
  const sb = requireSupabase()
  const bytes = new TextEncoder().encode(markdown)
  const { error } = await sb.storage
    .from(AURA_FILES_BUCKET)
    .upload(file.storagePath, bytes, { upsert: true, contentType: AURA_MARKDOWN_CONTENT_TYPE })
  if (error) {
    console.error('[aura-files-api] save:', error)
    throw error
  }
}

/**
 * Copies a visible (personal or group) file into the caller's personal
 * library — duplicates the Storage bytes under a new row id.
 * @param source - File to copy.
 * @param ownerUserId - Caller's user id.
 * @returns The new personal row.
 */
export async function copyAuraFileToPersonal(
  source: AuraFile,
  ownerUserId: string,
): Promise<AuraFile> {
  const markdown = await downloadAuraFileMarkdown(source)
  return createAuraFile(source.name, { ownerUserId }, markdown)
}

/**
 * Deletes an Aura file: removes the metadata row, then best-effort removes
 * the Storage object.
 * @param file - File to delete.
 * @returns Nothing.
 */
export async function deleteAuraFile(file: AuraFile): Promise<void> {
  const sb = requireSupabase()
  const { error } = await sb.from('aura_files').delete().eq('id', file.id)
  if (error) {
    console.error('[aura-files-api] delete row:', error)
    throw error
  }
  const { error: storageError } = await sb.storage.from(AURA_FILES_BUCKET).remove([file.storagePath])
  if (storageError) {
    console.warn('[aura-files-api] delete storage:', storageError)
  }
}
