/**
 * Supabase CRUD for shared media sets (OBM + T&E).
 * Each set has many images and at most one PDF; only one set may be active.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import {
  getSharedMediaPublicUrl,
  removeSharedMediaObjects,
  type SharedMediaKind,
} from '@/services/shared-media-storage'

export type { SharedMediaKind }

export type SharedMediaGroup = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  items: SharedMediaItem[]
}

export type SharedMediaItem = {
  id: string
  groupId: string
  kind: SharedMediaKind
  storagePath: string
  /** Derived JPEG thumbnail path; null for PDFs or legacy rows. */
  thumbnailPath: string | null
  fileName: string
  publicUrl: string
  thumbnailPublicUrl: string | null
  sortOrder: number
  fileSize: number | null
}

export type SharedMediaGroupInput = {
  name: string
  sortOrder: number
  isActive: boolean
}

const GROUP_SELECT =
  'id, name, sort_order, is_active, ' +
  'shared_media_items ( id, group_id, kind, storage_path, thumbnail_path, file_name, sort_order, file_size )'

/**
 * Map a nested item row from PostgREST.
 *
 * @param row - Raw item
 * @returns Normalized item
 */
function mapItem(row: Record<string, unknown>): SharedMediaItem {
  const storagePath = String(row.storage_path ?? '')
  const kindRaw = String(row.kind ?? '')
  const kind: SharedMediaKind =
    kindRaw === 'pdf' || storagePath.startsWith('pdfs/') ? 'pdf' : 'image'
  const thumbRaw =
    typeof row.thumbnail_path === 'string' && row.thumbnail_path.trim()
      ? row.thumbnail_path.trim()
      : null
  return {
    id: String(row.id),
    groupId: String(row.group_id ?? ''),
    kind,
    storagePath,
    thumbnailPath: thumbRaw,
    fileName: String(row.file_name ?? ''),
    publicUrl: getSharedMediaPublicUrl(storagePath) ?? '',
    thumbnailPublicUrl: thumbRaw ? getSharedMediaPublicUrl(thumbRaw) : null,
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    fileSize: typeof row.file_size === 'number' ? row.file_size : null,
  }
}

/**
 * Map a group row with nested items.
 *
 * @param row - Raw PostgREST record
 * @returns Normalized group
 */
function mapGroup(row: Record<string, unknown>): SharedMediaGroup {
  const itemsRaw = Array.isArray(row.shared_media_items) ? row.shared_media_items : []
  const items = (itemsRaw as Record<string, unknown>[])
    .map(mapItem)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.fileName.localeCompare(b.fileName))

  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    isActive: row.is_active !== false,
    items,
  }
}

/**
 * Image items in a set (ordered).
 *
 * @param group - Media set
 * @returns Image items
 */
export function sharedMediaImages(group: SharedMediaGroup): SharedMediaItem[] {
  return group.items.filter((i) => i.kind === 'image')
}

/**
 * The single PDF item in a set, if any.
 *
 * @param group - Media set
 * @returns PDF item or null
 */
export function sharedMediaPdf(group: SharedMediaGroup): SharedMediaItem | null {
  return group.items.find((i) => i.kind === 'pdf') ?? null
}

/**
 * Load all media sets with nested items.
 *
 * @returns Groups sorted by sort_order
 */
export async function fetchSharedMediaGroups(): Promise<SharedMediaGroup[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shared_media_groups')
    .select(GROUP_SELECT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error

  return (data ?? [])
    .map(mapGroup)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/**
 * Load one media set by id.
 *
 * @param id - Group id
 * @returns Group or null
 */
export async function fetchSharedMediaGroupById(id: string): Promise<SharedMediaGroup | null> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shared_media_groups')
    .select(GROUP_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapGroup(data)
}

/**
 * Deactivate every active set (allows zero active).
 */
async function deactivateAllSharedMediaGroups(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { error } = await fromLoose('shared_media_groups')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true)
  if (error) throw error
}

/**
 * Create a media set. Activating it deactivates any previously active set.
 *
 * @param input - Group fields
 * @returns Created group id
 */
export async function createSharedMediaGroup(input: SharedMediaGroupInput): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  if (input.isActive) {
    await deactivateAllSharedMediaGroups()
  }

  const { data, error } = await fromLoose('shared_media_groups')
    .insert({
      name: input.name.trim(),
      sort_order: input.sortOrder,
      is_active: input.isActive,
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

/**
 * Update a media set. Turning isActive on deactivates other sets first.
 *
 * @param id - Group id
 * @param input - Group fields
 */
export async function updateSharedMediaGroup(id: string, input: SharedMediaGroupInput): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  if (input.isActive) {
    await deactivateAllSharedMediaGroups()
  }

  const { error } = await fromLoose('shared_media_groups')
    .update({
      name: input.name.trim(),
      sort_order: input.sortOrder,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw error
}

/**
 * Set exactly one media set active (or deactivate all if active is false).
 *
 * @param id - Group id
 * @param active - Desired active flag
 */
export async function setSharedMediaGroupActive(id: string, active: boolean): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  await deactivateAllSharedMediaGroups()
  if (!active) return

  const { error } = await fromLoose('shared_media_groups')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/**
 * Delete a media album (cascades items). Callers should remove Storage objects first.
 *
 * @param id - Group id
 */
export async function deleteSharedMediaGroup(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await fromLoose('shared_media_groups').delete().eq('id', id)
  if (error) throw error
}

/**
 * Insert a file row into a set after Storage upload.
 *
 * @param input - Group id, kind, path, name, sort, optional size
 * @returns Created item id
 */
export async function createSharedMediaItem(input: {
  groupId: string
  kind: SharedMediaKind
  storagePath: string
  thumbnailPath: string | null
  fileName: string
  sortOrder: number
  fileSize: number | null
}): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await fromLoose('shared_media_items')
    .insert({
      group_id: input.groupId,
      kind: input.kind,
      storage_path: input.storagePath,
      thumbnail_path: input.thumbnailPath,
      file_name: input.fileName.trim(),
      sort_order: input.sortOrder,
      file_size: input.fileSize,
    })
    .select('id')
    .single()

  if (error) throw error
  return String(data.id)
}

/**
 * Delete a media item row and its Storage object(s).
 *
 * @param item - Item to remove
 */
export async function deleteSharedMediaItem(item: SharedMediaItem): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const paths = [item.storagePath, item.thumbnailPath].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  )
  const storageErr = await removeSharedMediaObjects(paths)
  if (storageErr) throw new Error(storageErr)

  const { error } = await fromLoose('shared_media_items').delete().eq('id', item.id)
  if (error) throw error
}

/**
 * Replace the PDF in a set (deletes the previous PDF row/files if present).
 *
 * @param group - Set with items loaded
 * @param uploaded - Storage upload result fields
 * @returns New PDF item
 */
export async function replaceSharedMediaPdf(
  group: SharedMediaGroup,
  uploaded: {
    path: string
    fileName: string
    fileSize: number
    publicUrl: string
  },
): Promise<SharedMediaItem> {
  const existing = sharedMediaPdf(group)
  if (existing) {
    await deleteSharedMediaItem(existing)
  }
  const sortOrder = 1
  const itemId = await createSharedMediaItem({
    groupId: group.id,
    kind: 'pdf',
    storagePath: uploaded.path,
    thumbnailPath: null,
    fileName: uploaded.fileName,
    sortOrder,
    fileSize: uploaded.fileSize,
  })
  return {
    id: itemId,
    groupId: group.id,
    kind: 'pdf',
    storagePath: uploaded.path,
    thumbnailPath: null,
    fileName: uploaded.fileName,
    publicUrl: uploaded.publicUrl,
    thumbnailPublicUrl: null,
    sortOrder,
    fileSize: uploaded.fileSize,
  }
}

/**
 * Persist album order (sort_order is 1-based).
 *
 * @param orderedIds - Group ids in display order
 */
export async function reorderSharedMediaGroups(orderedIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const updatedAt = new Date().toISOString()
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      fromLoose('shared_media_groups')
        .update({ sort_order: index + 1, updated_at: updatedAt })
        .eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Persist image order within a set (sort_order is 1-based).
 *
 * @param orderedItemIds - Item ids in display order
 */
export async function reorderSharedMediaItems(orderedItemIds: string[]): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const updatedAt = new Date().toISOString()
  const results = await Promise.all(
    orderedItemIds.map((id, index) =>
      fromLoose('shared_media_items')
        .update({ sort_order: index + 1, updated_at: updatedAt })
        .eq('id', id),
    ),
  )
  for (const { error } of results) {
    if (error) throw error
  }
}

/**
 * Delete a set and all Storage objects for its items.
 *
 * @param group - Group with items loaded
 */
export async function deleteSharedMediaGroupWithFiles(group: SharedMediaGroup): Promise<void> {
  const paths: string[] = []
  for (const item of group.items) {
    paths.push(item.storagePath)
    if (item.thumbnailPath) paths.push(item.thumbnailPath)
  }
  await removeSharedMediaObjects(paths)
  await deleteSharedMediaGroup(group.id)
}
