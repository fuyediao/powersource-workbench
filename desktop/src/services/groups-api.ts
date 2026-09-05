import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { UserRole } from '@/types/crm-settings'
import { isRemoteOaUserId } from '@/utils/auth/workbench-username'

export interface ProfileSnippet {
  id: string
  email: string | null
  full_name: string | null
  display_name: string | null
  employee_id: string | null
}

export interface GroupRecord {
  id: string
  name: string
  description: string | null
  groupAdminId: string | null
  isTempManaged: boolean
  pendingAdminEmail?: string | null
  createdAt: string | null
  adminUser?: ProfileSnippet | null
}

export interface GroupMemberRecord {
  id: string
  groupId: string
  userId: string
  status: string
  user?: ProfileSnippet | null
}

/**
 * True for system_admin and super_admin.
 * @param role - Role value.
 * @returns Whether the role is system-level admin.
 */
export function isSystemAdminRole(role: UserRole | null): boolean {
  return role === 'system_admin' || role === 'super_admin'
}

const ROLE_TTL_MS = 30_000
const roleCache = new Map<string, { value: UserRole; at: number }>()
const roleInflight = new Map<string, Promise<UserRole>>()
const groupCache = new Map<string, { value: GroupRecord | null; at: number }>()
const groupInflight = new Map<string, Promise<GroupRecord | null>>()

/**
 * Loads the caller's role from `user_roles`.
 * @param userId - Auth user id.
 * @returns Role or `user` default.
 */
export async function fetchUserRole(userId: string): Promise<UserRole> {
  const cached = roleCache.get(userId)
  if (cached && Date.now() - cached.at < ROLE_TTL_MS) {
    return cached.value
  }
  const pending = roleInflight.get(userId)
  if (pending) {
    return pending
  }
  const promise = (async (): Promise<UserRole> => {
    if (!isSupabaseConfigured || !supabase || isRemoteOaUserId(userId)) {
      return 'user'
    }
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data?.role) {
      return 'user'
    }
    return data.role as UserRole
  })()
    .then((value) => {
      roleCache.set(userId, { value, at: Date.now() })
      return value
    })
    .finally(() => {
      roleInflight.delete(userId)
    })
  roleInflight.set(userId, promise)
  return promise
}

/**
 * Loads profile snippets for a set of user ids.
 * @param userIds - Auth user ids.
 * @returns Map of id → snippet.
 */
export async function fetchProfileSnippets(
  userIds: string[],
): Promise<Map<string, ProfileSnippet>> {
  const map = new Map<string, ProfileSnippet>()
  if (!isSupabaseConfigured || !supabase || userIds.length === 0) {
    return map
  }
  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, display_name, employee_id')
    .in('id', userIds)
  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      display_name: row.display_name,
      employee_id: row.employee_id ?? null,
    })
  }
  return map
}

/**
 * Searches profiles by email / display name / full name (RLS-scoped).
 * Used for calendar invitees and similar pickers.
 * @param query - Free-text query.
 * @returns Matching profile snippets (max 20).
 */
export async function searchProfilesForInvite(query: string): Promise<ProfileSnippet[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  const q = query.trim()
  if (!q) {
    return []
  }
  const safe = q.replace(/,/g, ' ').trim() || ' '
  const pattern = `%${safe}%`
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, full_name, employee_id')
    .or(
      `email.ilike.${pattern},display_name.ilike.${pattern},full_name.ilike.${pattern},employee_id.ilike.${pattern}`,
    )
    .limit(20)
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    full_name: (row.full_name as string | null) ?? null,
    display_name: (row.display_name as string | null) ?? null,
    employee_id: (row.employee_id as string | null) ?? null,
  }))
}

/**
 * Lists all CRM groups (system-admin group filter).
 * @returns Groups ordered by name.
 */
export async function listGroups(): Promise<GroupRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  const { data, error } = await supabase.from('groups').select('*').order('name')
  if (error) {
    console.error('[groups-api] listGroups:', error)
    throw error
  }
  return (data ?? []).map((row) => mapGroup(row))
}

/**
 * Resolves the caller's current group (admin-owned or membership).
 * @param userId - Auth user id.
 * @returns Group or null.
 */
export async function fetchCurrentGroup(userId: string): Promise<GroupRecord | null> {
  const cached = groupCache.get(userId)
  if (cached && Date.now() - cached.at < ROLE_TTL_MS) {
    return cached.value
  }
  const pending = groupInflight.get(userId)
  if (pending) {
    return pending
  }
  const promise = (async (): Promise<GroupRecord | null> => {
    if (!isSupabaseConfigured || !supabase || isRemoteOaUserId(userId)) {
      return null
    }
    const { data: adminGroup } = await supabase
      .from('groups')
      .select('*')
      .eq('group_admin_id', userId)
      .limit(1)
      .maybeSingle()
    if (adminGroup) {
      return mapGroup(adminGroup)
    }
    const { data: member } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    if (!member) {
      return null
    }
    const { data: group } = await supabase
      .from('groups')
      .select('*')
      .eq('id', member.group_id)
      .maybeSingle()
    return group ? mapGroup(group) : null
  })()
    .then((value) => {
      groupCache.set(userId, { value, at: Date.now() })
      return value
    })
    .finally(() => {
      groupInflight.delete(userId)
    })
  groupInflight.set(userId, promise)
  return promise
}

/**
 * Lists active members for a group with profile snippets.
 * @param groupId - Group id.
 * @param groupAdminId - Optional admin id to include in profile fetch.
 * @returns Members.
 */
export async function fetchGroupMembers(
  groupId: string,
  groupAdminId?: string | null,
): Promise<GroupMemberRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  const { data } = await supabase
    .from('group_members')
    .select('*')
    .eq('group_id', groupId)
    .eq('is_active', true)
    .order('added_at', { ascending: false })
  const rows = data ?? []
  const ids = [...new Set(rows.map((r) => r.user_id as string).concat(groupAdminId ? [groupAdminId] : []))]
  const profiles = await fetchProfileSnippets(ids)
  return rows.map((row) => ({
    id: row.id as string,
    groupId: row.group_id as string,
    userId: row.user_id as string,
    status: (row.status as string) ?? 'active',
    user: profiles.get(row.user_id as string) ?? null,
  }))
}

/**
 * Adds a user to a group via RPC (by auth user id).
 * @param groupId - Group id.
 * @param userId - Target user id.
 * @returns True on success.
 */
export async function addUserToGroup(groupId: string, userId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  const { error } = await supabase.rpc('rpc_add_user_to_group', {
    p_group_id: groupId,
    p_user_id: userId,
  })
  if (error) {
    console.error('addUserToGroup', error)
    return false
  }
  return true
}

/**
 * Resolves a profile by exact email (case-insensitive) then adds them to a group.
 * @param groupId - Group id.
 * @param email - Target email.
 * @returns True on success.
 */
export async function addUserToGroupByEmail(groupId: string, email: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  const normalized = email.trim().toLowerCase()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', normalized)
    .maybeSingle()
  if (!data?.id) {
    return false
  }
  return addUserToGroup(groupId, data.id)
}

/**
 * Maps a groups table row to {@link GroupRecord}.
 * @param row - Raw row.
 * @returns Mapped group.
 */
function mapGroup(row: {
  id: string
  name: string
  description: string | null
  group_admin_id: string | null
  is_temp_managed: boolean | null
  pending_admin_email?: string | null
  created_at: string | null
}): GroupRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    groupAdminId: row.group_admin_id,
    isTempManaged: Boolean(row.is_temp_managed),
    pendingAdminEmail: row.pending_admin_email ?? null,
    createdAt: row.created_at,
  }
}
