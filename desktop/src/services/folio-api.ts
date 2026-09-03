/**
 * Folio page CRUD against `folio_pages` (Supabase RLS).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Folio page row for tree and editor shells. */
export interface FolioPageRecord {
  id: string
  title: string
  parentId: string | null
  ownerUserId: string | null
  groupId: string | null
  sortOrder: number
  updatedAt: string
  createdAt: string
  deletedAt: string | null
  primaryMode: FolioEditorMode
  /** Base64-encoded Yjs update, or null when empty. */
  yjsStateBase64: string | null
}

/** Supported default editor hosts for a Folio page. */
export type FolioEditorMode = 'page' | 'edgeless'

/** Version-history snapshot row. */
export interface FolioPageVersionRecord {
  id: string
  pageId: string
  title: string
  yjsStateBase64: string
  createdAt: string
  createdBy: string
}

const PAGE_SELECT =
  'id, title, parent_id, owner_user_id, group_id, sort_order, created_at, updated_at, deleted_at, primary_mode, yjs_state'

/**
 * Decode a Postgres bytea / base64 payload from PostgREST into bytes.
 * @param value - Raw column value (hex `\x…`, base64, or null).
 * @returns Uint8Array or null.
 */
export function decodeYjsState(value: string | null | undefined): Uint8Array | null {
  if (!value) {
    return null
  }
  if (value.startsWith('\\x') || value.startsWith('\\X')) {
    const hex = value.slice(2)
    if (hex.length % 2 !== 0) {
      return null
    }
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < out.length; i += 1) {
      out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    }
    return out
  }
  try {
    const binary = atob(value)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i)
    }
    return out
  } catch {
    return null
  }
}

/**
 * Encode Yjs bytes for PostgREST bytea (hex escape form).
 * @param bytes - Yjs update.
 * @returns `\x` hex string.
 */
export function encodeYjsState(bytes: Uint8Array): string {
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return `\\x${hex}`
}

/**
 * Map a DB row to {@link FolioPageRecord}.
 * @param row - Raw folio_pages row.
 * @returns Mapped record.
 */
function mapPage(row: {
  id: string
  title: string
  parent_id: string | null
  owner_user_id: string | null
  group_id: string | null
  sort_order: number
  updated_at: string
  created_at: string
  deleted_at: string | null
  primary_mode: FolioEditorMode
  yjs_state?: string | null
}): FolioPageRecord {
  return {
    id: row.id,
    title: row.title || '',
    parentId: row.parent_id,
    ownerUserId: row.owner_user_id,
    groupId: row.group_id,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    primaryMode: row.primary_mode,
    yjsStateBase64: row.yjs_state ?? null,
  }
}

/**
 * List personal Folio pages for the signed-in user.
 * @param userId - Auth user id.
 * @returns Pages ordered by sort_order then title.
 */
export async function listPersonalFolioPages(userId: string): Promise<FolioPageRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  const { data, error } = await supabase
    .from('folio_pages')
    .select(PAGE_SELECT)
    .eq('owner_user_id', userId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })
  if (error) {
    console.error('listPersonalFolioPages', error)
    return []
  }
  return (data ?? []).map(mapPage)
}

/**
 * List group Folio pages.
 * @param groupId - Group id.
 * @returns Pages ordered by sort_order then title.
 */
export async function listGroupFolioPages(groupId: string): Promise<FolioPageRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  const { data, error } = await supabase
    .from('folio_pages')
    .select(PAGE_SELECT)
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true })
  if (error) {
    console.error('listGroupFolioPages', error)
    return []
  }
  return (data ?? []).map(mapPage)
}

/**
 * Load one Folio page by id.
 * @param pageId - Page id.
 * @returns Page or null.
 */
export async function fetchFolioPage(pageId: string): Promise<FolioPageRecord | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('folio_pages')
    .select(PAGE_SELECT)
    .eq('id', pageId)
    .maybeSingle()
  if (error || !data) {
    return null
  }
  return mapPage(data)
}

/**
 * Create a personal Folio page.
 * @param userId - Owner user id.
 * @param title - Initial title.
 * @param parentId - Optional parent page.
 * @returns Created page or null.
 */
export async function createPersonalFolioPage(
  userId: string,
  title: string,
  parentId?: string | null,
): Promise<FolioPageRecord | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('folio_pages')
    .insert({
      title: title.trim() || 'Untitled',
      owner_user_id: userId,
      group_id: null,
      parent_id: parentId ?? null,
    })
    .select(PAGE_SELECT)
    .single()
  if (error || !data) {
    console.error('createPersonalFolioPage', error)
    return null
  }
  return mapPage(data)
}

/**
 * Create a group Folio page (requires folio insert grant).
 * @param groupId - Group id.
 * @param title - Initial title.
 * @param parentId - Optional parent page.
 * @returns Created page or null.
 */
export async function createGroupFolioPage(
  groupId: string,
  title: string,
  parentId?: string | null,
): Promise<FolioPageRecord | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('folio_pages')
    .insert({
      title: title.trim() || 'Untitled',
      owner_user_id: null,
      group_id: groupId,
      parent_id: parentId ?? null,
    })
    .select(PAGE_SELECT)
    .single()
  if (error || !data) {
    console.error('createGroupFolioPage', error)
    return null
  }
  return mapPage(data)
}

/**
 * Update Folio page title and/or Yjs state.
 * @param pageId - Page id.
 * @param patch - Fields to update.
 * @returns True on success.
 */
export async function updateFolioPage(
  pageId: string,
  patch: { title?: string; yjsState?: Uint8Array | null; primaryMode?: FolioEditorMode },
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  const body: { title?: string; yjs_state?: string | null; primary_mode?: FolioEditorMode } = {}
  if (patch.title !== undefined) {
    body.title = patch.title
  }
  if (patch.yjsState !== undefined) {
    body.yjs_state = patch.yjsState ? encodeYjsState(patch.yjsState) : null
  }
  if (patch.primaryMode !== undefined) {
    body.primary_mode = patch.primaryMode
  }
  const { error } = await supabase.from('folio_pages').update(body).eq('id', pageId)
  if (error) {
    console.error('updateFolioPage', error)
    return false
  }
  return true
}

/**
 * Delete a Folio page (cascades children via FK).
 * @param pageId - Page id.
 * @returns True on success.
 */
export async function purgeFolioPage(pageId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  const { error } = await supabase.from('folio_pages').delete().eq('id', pageId)
  if (error) {
    console.error('purgeFolioPage', error)
    return false
  }
  return true
}

/**
 * Move a page to soft trash.
 * @param pageId - Page id.
 * @returns True on success.
 */
export async function trashFolioPage(pageId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('folio_pages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', pageId)
  if (error) console.error('trashFolioPage', error)
  return !error
}

/**
 * Restore a page from soft trash.
 * @param pageId - Page id.
 * @returns True on success.
 */
export async function restoreFolioPage(pageId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('folio_pages')
    .update({ deleted_at: null })
    .eq('id', pageId)
  if (error) console.error('restoreFolioPage', error)
  return !error
}

/**
 * List trash for one personal or group scope.
 * @param scope - Owner or group filter.
 * @returns Deleted pages, newest first.
 */
export async function listFolioTrash(
  scope: { ownerUserId: string } | { groupId: string },
): Promise<FolioPageRecord[]> {
  if (!isSupabaseConfigured || !supabase) return []
  let query = supabase.from('folio_pages').select(PAGE_SELECT).not('deleted_at', 'is', null)
  query = 'ownerUserId' in scope
    ? query.eq('owner_user_id', scope.ownerUserId)
    : query.eq('group_id', scope.groupId)
  const { data, error } = await query.order('deleted_at', { ascending: false })
  if (error) {
    console.error('listFolioTrash', error)
    return []
  }
  return (data ?? []).map(mapPage)
}

/**
 * Duplicate a page within its existing ownership scope.
 * @param source - Fully loaded source page.
 * @param title - Duplicate title.
 * @returns New independent page.
 */
export async function duplicateFolioPage(
  source: FolioPageRecord,
  title: string,
): Promise<FolioPageRecord | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('folio_pages')
    .insert({
      title,
      owner_user_id: source.ownerUserId,
      group_id: source.groupId,
      parent_id: source.parentId,
      primary_mode: source.primaryMode,
      yjs_state: source.yjsStateBase64,
    })
    .select(PAGE_SELECT)
    .single()
  if (error || !data) {
    console.error('duplicateFolioPage', error)
    return null
  }
  return mapPage(data)
}

/**
 * Reorder or reparent a page.
 * @param pageId - Page id.
 * @param parentId - New parent, or null for root.
 * @param sortOrder - New sibling order.
 * @returns True on success.
 */
export async function reorderFolioPage(
  pageId: string,
  parentId: string | null,
  sortOrder: number,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase
    .from('folio_pages')
    .update({ parent_id: parentId, sort_order: sortOrder })
    .eq('id', pageId)
  if (error) console.error('reorderFolioPage', error)
  return !error
}

/**
 * Search active page titles within one scope.
 * @param scope - Owner or group filter.
 * @param queryText - User-entered title fragment.
 * @returns Matching active pages.
 */
export async function searchFolioPageTitles(
  scope: { ownerUserId: string } | { groupId: string },
  queryText: string,
): Promise<FolioPageRecord[]> {
  if (!isSupabaseConfigured || !supabase) return []
  let query = supabase
    .from('folio_pages')
    .select(PAGE_SELECT)
    .is('deleted_at', null)
    .ilike('title', `%${queryText.trim()}%`)
  query = 'ownerUserId' in scope
    ? query.eq('owner_user_id', scope.ownerUserId)
    : query.eq('group_id', scope.groupId)
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(100)
  if (error) {
    console.error('searchFolioPageTitles', error)
    return []
  }
  return (data ?? []).map(mapPage)
}

/**
 * List the current user's favourite page ids.
 * @param userId - Auth user id.
 * @returns Favourite page ids.
 */
export async function listFolioFavoriteIds(userId: string): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('folio_page_favorites')
    .select('page_id')
    .eq('user_id', userId)
  if (error) {
    console.error('listFolioFavoriteIds', error)
    return []
  }
  return (data ?? []).map((row) => row.page_id)
}

/**
 * Add or remove one page favourite.
 * @param userId - Auth user id.
 * @param pageId - Page id.
 * @param favorite - Desired state.
 * @returns True on success.
 */
export async function setFolioFavorite(
  userId: string,
  pageId: string,
  favorite: boolean,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const result = favorite
    ? await supabase.from('folio_page_favorites').upsert({ user_id: userId, page_id: pageId })
    : await supabase.from('folio_page_favorites').delete().eq('user_id', userId).eq('page_id', pageId)
  if (result.error) console.error('setFolioFavorite', result.error)
  return !result.error
}

/**
 * Create a full Yjs version snapshot.
 * @param pageId - Page id.
 * @param title - Page title at snapshot time.
 * @param yjsState - Full encoded Yjs state.
 * @returns True on success.
 */
export async function createFolioPageVersion(
  pageId: string,
  title: string,
  yjsState: Uint8Array,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  const { error } = await supabase.from('folio_page_versions').insert({
    page_id: pageId,
    title,
    yjs_state: encodeYjsState(yjsState),
  })
  if (error) console.error('createFolioPageVersion', error)
  return !error
}

/**
 * List page versions newest first.
 * @param pageId - Page id.
 * @returns Version rows.
 */
export async function listFolioPageVersions(pageId: string): Promise<FolioPageVersionRecord[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase
    .from('folio_page_versions')
    .select('id, page_id, yjs_state, title, created_at, created_by')
    .eq('page_id', pageId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('listFolioPageVersions', error)
    return []
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    pageId: row.page_id,
    title: row.title,
    yjsStateBase64: row.yjs_state,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }))
}

/**
 * Restore a version onto its page; history remains append-only.
 * @param version - Version snapshot.
 * @returns True on success.
 */
export async function restoreFolioPageVersion(
  version: FolioPageVersionRecord,
): Promise<boolean> {
  const bytes = decodeYjsState(version.yjsStateBase64)
  if (!bytes || !isSupabaseConfigured || !supabase) return false
  const { error } = await supabase.from('folio_page_updates').delete().eq('page_id', version.pageId)
  if (error) {
    console.error('restoreFolioPageVersion', error)
    return false
  }
  return updateFolioPage(version.pageId, { title: version.title, yjsState: bytes })
}

/**
 * Move a personal page into a group (ownership transfer).
 * @param pageId - Page id.
 * @param groupId - Destination group id.
 * @returns True on success.
 */
export async function moveFolioPageToGroup(pageId: string, groupId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  const { error } = await supabase
    .from('folio_pages')
    .update({ owner_user_id: null, group_id: groupId, parent_id: null })
    .eq('id', pageId)
  if (error) {
    console.error('moveFolioPageToGroup', error)
    return false
  }
  return true
}

/** One row of the `folio_page_updates` incremental Yjs log. */
export interface FolioPageUpdateRecord {
  id: number
  updateBase64: string
}

/**
 * Append one incremental Yjs update to the page's log (cheaper than rewriting `yjs_state`).
 * @param pageId - Page id.
 * @param bytes - Merged Yjs update bytes since the last flush.
 * @returns The inserted row's id (used as the compaction cursor), or null on failure.
 */
export async function appendFolioPageUpdate(
  pageId: string,
  bytes: Uint8Array,
): Promise<number | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('folio_page_updates')
    .insert({ page_id: pageId, update: encodeYjsState(bytes) })
    .select('id')
    .single()
  if (error || !data) {
    console.error('appendFolioPageUpdate', error)
    return null
  }
  return data.id
}

/**
 * List pending (not yet compacted) Yjs updates for a page, oldest first.
 * @param pageId - Page id.
 * @returns Ordered update rows.
 */
export async function fetchFolioPageUpdates(pageId: string): Promise<FolioPageUpdateRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  const { data, error } = await supabase
    .from('folio_page_updates')
    .select('id, update')
    .eq('page_id', pageId)
    .order('id', { ascending: true })
  if (error) {
    console.error('fetchFolioPageUpdates', error)
    return []
  }
  return (data ?? []).map((row) => ({ id: row.id, updateBase64: row.update as string }))
}

/**
 * Fold pending `folio_page_updates` rows into `folio_pages.yjs_state` and delete them.
 * Runs as a `SECURITY INVOKER` RPC, so it only succeeds if the caller's own RLS allows it.
 * @param pageId - Page id.
 * @param mergedState - Full Yjs state to persist as the new baseline.
 * @param upToId - Delete update rows with id <= this cursor.
 * @returns True on success.
 */
export async function compactFolioPageUpdates(
  pageId: string,
  mergedState: Uint8Array,
  upToId: number,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  const { error } = await supabase.rpc('folio_compact_page_updates', {
    p_page_id: pageId,
    p_merged_state: encodeYjsState(mergedState),
    p_up_to_id: upToId,
  })
  if (error) {
    console.error('compactFolioPageUpdates', error)
    return false
  }
  return true
}

/**
 * Copy a page into the caller's personal Folio (independent clone).
 * @param source - Source page (with yjs state).
 * @param userId - Destination owner.
 * @returns New page or null.
 */
export async function copyFolioPageToPersonal(
  source: FolioPageRecord,
  userId: string,
): Promise<FolioPageRecord | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data, error } = await supabase
    .from('folio_pages')
    .insert({
      title: source.title,
      owner_user_id: userId,
      group_id: null,
      parent_id: null,
      yjs_state: source.yjsStateBase64,
    })
    .select(PAGE_SELECT)
    .single()
  if (error || !data) {
    console.error('copyFolioPageToPersonal', error)
    return null
  }
  return mapPage(data)
}
