/**
 * System-admin group management APIs (create/appoint/revoke admins, drill-down).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  fetchGroupMembers,
  fetchProfileSnippets,
  isSystemAdminRole,
  type GroupMemberRecord,
  type GroupRecord,
  type ProfileSnippet,
} from '@/services/groups-api'
import { fetchUserRole } from '@/services/groups-api'

/** One (group, admin) pair for the Group Management roster. */
export interface GroupAdminEntry {
  userId: string
  user: ProfileSnippet | null
  group: GroupRecord
  memberCount: number
}

/** Pending member invitation row. */
export interface GroupInvitationRecord {
  id: string
  email: string
  createdAt: string
}

/** Last add-member outcome when invitation was created instead of membership. */
let lastAddWasInvitation = false

/**
 * Whether the last successful add-by-email created a pending invitation.
 * @returns Invitation flag.
 */
export function getLastAddWasInvitation(): boolean {
  return lastAddWasInvitation
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

/**
 * Search profiles by email / display / full name (group_admin or system admin).
 * @param query - Search substring.
 * @returns Matching profile snippets (max 20).
 */
export async function searchProfilesForAdmin(query: string): Promise<ProfileSnippet[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  const q = query.trim()
  if (!q) {
    return []
  }
  try {
    const safe = q.replace(/,/g, ' ').trim() || ' '
    const pattern = `%${safe}%`
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, display_name, full_name, employee_id')
      .or(
        `email.ilike.${pattern},display_name.ilike.${pattern},full_name.ilike.${pattern},employee_id.ilike.${pattern}`,
      )
      .limit(20)
    if (fetchError) {
      console.error('searchProfilesForAdmin', fetchError)
      return []
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      email: (row.email as string | null) ?? null,
      full_name: (row.full_name as string | null) ?? null,
      display_name: (row.display_name as string | null) ?? null,
      employee_id: (row.employee_id as string | null) ?? null,
    }))
  } catch (err) {
    console.error('searchProfilesForAdmin', err)
    return []
  }
}

/**
 * List every group admin across every group (multi-admin aware).
 * @returns One entry per (group, admin) pair.
 */
export async function getGroupAdmins(): Promise<GroupAdminEntry[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  try {
    const { data: allGroups, error: fetchError } = await supabase.from('groups').select('*')
    if (fetchError) {
      throw fetchError
    }

    const { data: adminMemberRows, error: memberError } = await supabase
      .from('group_members')
      .select('group_id, user_id')
      .eq('is_group_admin', true)
      .eq('is_active', true)
    if (memberError) {
      throw memberError
    }

    const adminIdsByGroup = new Map<string, Set<string>>()
    const addAdmin = (groupId: string, userId: string) => {
      if (!adminIdsByGroup.has(groupId)) {
        adminIdsByGroup.set(groupId, new Set())
      }
      adminIdsByGroup.get(groupId)!.add(userId)
    }
    for (const group of allGroups ?? []) {
      if (group.group_admin_id) {
        addAdmin(group.id as string, group.group_admin_id as string)
      }
    }
    for (const row of adminMemberRows ?? []) {
      addAdmin(row.group_id as string, row.user_id as string)
    }

    const groupById = new Map((allGroups ?? []).map((g) => [g.id as string, g]))
    const allAdminUserIds = [
      ...new Set([...adminIdsByGroup.values()].flatMap((s) => [...s])),
    ]
    const profileMap = await fetchProfileSnippets(allAdminUserIds)

    const memberCountByGroup = new Map<string, number>()
    await Promise.all(
      [...adminIdsByGroup.keys()].map(async (groupId) => {
        const { count } = await supabase!
          .from('group_members')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', groupId)
          .eq('is_active', true)
        memberCountByGroup.set(groupId, count ?? 0)
      }),
    )

    const admins: GroupAdminEntry[] = []
    for (const [groupId, adminIds] of adminIdsByGroup.entries()) {
      const groupRow = groupById.get(groupId)
      if (!groupRow) {
        continue
      }
      const groupData = mapGroup(groupRow as Parameters<typeof mapGroup>[0])
      for (const adminId of adminIds) {
        admins.push({
          user: profileMap.get(adminId) ?? null,
          userId: adminId,
          group: groupData,
          memberCount: memberCountByGroup.get(groupId) ?? 0,
        })
      }
    }
    return admins
  } catch (err) {
    console.error('getGroupAdmins', err)
    return []
  }
}

/**
 * List temp-managed groups (pending admin assignment).
 * @returns Temp-managed groups.
 */
export async function getTempManagedGroups(): Promise<GroupRecord[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  try {
    const { data, error: fetchError } = await supabase
      .from('groups')
      .select('*')
      .eq('is_temp_managed', true)
    if (fetchError) {
      throw fetchError
    }
    return (data ?? []).map((row) => mapGroup(row as Parameters<typeof mapGroup>[0]))
  } catch (err) {
    console.error('getTempManagedGroups', err)
    return []
  }
}

/**
 * Create a group and appoint an admin by email (or pending invite).
 * @param email - Admin email.
 * @param groupName - New group name.
 * @param description - Optional description.
 * @returns True on success.
 */
export async function addGroupAdmin(
  email: string,
  groupName: string,
  description?: string,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()
    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError
    }

    if (profile) {
      const { error: groupError } = await supabase.from('groups').insert({
        name: groupName,
        group_admin_id: profile.id,
        description: description || null,
        is_temp_managed: false,
        pending_admin_email: null,
      })
      if (groupError) {
        throw groupError
      }
      const { error: roleError } = await supabase.from('user_roles').upsert(
        {
          user_id: profile.id,
          role: 'group_admin',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      if (roleError) {
        throw roleError
      }
      return true
    }

    const { error: groupError } = await supabase.from('groups').insert({
      name: groupName,
      group_admin_id: null,
      description: description || null,
      is_temp_managed: true,
      pending_admin_email: email.toLowerCase(),
    })
    if (groupError) {
      throw groupError
    }
    return true
  } catch (err) {
    console.error('addGroupAdmin', err)
    return false
  }
}

/**
 * Revoke a group admin via `rpc_set_group_admin(..., false)`.
 * @param groupAdminId - User id of the admin being revoked.
 * @returns True on success.
 */
export async function removeGroupAdmin(groupAdminId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  try {
    let groupId: string | null = null
    const { data: legacyGroup } = await supabase
      .from('groups')
      .select('id')
      .eq('group_admin_id', groupAdminId)
      .maybeSingle()
    if (legacyGroup) {
      groupId = legacyGroup.id as string
    } else {
      const { data: adminMembership } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', groupAdminId)
        .eq('is_group_admin', true)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      groupId = (adminMembership?.group_id as string) ?? null
    }
    if (!groupId) {
      return false
    }

    const { data, error: rpcError } = await supabase.rpc('rpc_set_group_admin', {
      p_group_id: groupId,
      p_user_id: groupAdminId,
      p_is_admin: false,
    })
    if (rpcError) {
      throw rpcError
    }
    const result = data as { success: boolean; error?: string }
    return Boolean(result?.success)
  } catch (err) {
    console.error('removeGroupAdmin', err)
    return false
  }
}

/**
 * Appoint an existing group member as an additional group admin.
 * @param groupId - Target group UUID.
 * @param targetUserId - Member user id to promote.
 * @returns True on success.
 */
export async function appointGroupAdmin(groupId: string, targetUserId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  try {
    const { data, error: rpcError } = await supabase.rpc('rpc_set_group_admin', {
      p_group_id: groupId,
      p_user_id: targetUserId,
      p_is_admin: true,
    })
    if (rpcError) {
      throw rpcError
    }
    const result = data as { success: boolean; error?: string }
    return Boolean(result?.success)
  } catch (err) {
    console.error('appointGroupAdmin', err)
    return false
  }
}

/**
 * Assign a new admin to a temp-managed group by email.
 * @param groupId - Target group UUID.
 * @param email - Admin email (existing profile or pending).
 * @returns True on success.
 */
export async function assignNewGroupAdmin(groupId: string, email: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle()
    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError
    }

    if (!profile) {
      const { error: updateError } = await supabase
        .from('groups')
        .update({
          pending_admin_email: email.toLowerCase(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', groupId)
      if (updateError) {
        throw updateError
      }
      return true
    }

    const { error: updateError } = await supabase
      .from('groups')
      .update({
        group_admin_id: profile.id,
        is_temp_managed: false,
        pending_admin_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', groupId)
    if (updateError) {
      throw updateError
    }

    const { error: roleError } = await supabase.from('user_roles').upsert(
      {
        user_id: profile.id,
        role: 'group_admin',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (roleError) {
      throw roleError
    }
    return true
  } catch (err) {
    console.error('assignNewGroupAdmin', err)
    return false
  }
}

/**
 * Fetch a single group by id (system-admin drill-down).
 * @param groupId - Group UUID.
 * @returns Group or null.
 */
export async function fetchGroupById(groupId: string): Promise<GroupRecord | null> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return null
  }
  try {
    const { data: groupRow, error: fetchError } = await supabase
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle()
    if (fetchError) {
      throw fetchError
    }
    if (!groupRow) {
      return null
    }
    const mapped = mapGroup(groupRow as Parameters<typeof mapGroup>[0])
    if (mapped.groupAdminId) {
      const profiles = await fetchProfileSnippets([mapped.groupAdminId])
      mapped.adminUser = profiles.get(mapped.groupAdminId) ?? null
    }
    return mapped
  } catch (err) {
    console.error('fetchGroupById', err)
    return null
  }
}

/**
 * Update name/description for a group (system admin).
 * @param groupId - Target group UUID.
 * @param name - New name.
 * @param description - Optional description.
 * @returns True on success.
 */
export async function updateGroupInfoForGroup(
  groupId: string,
  name: string,
  description?: string,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return false
  }
  try {
    const { error: updateError } = await supabase
      .from('groups')
      .update({
        name,
        description: description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', groupId)
    if (updateError) {
      throw updateError
    }
    return true
  } catch (err) {
    console.error('updateGroupInfoForGroup', err)
    return false
  }
}

/**
 * Soft-remove a member from a group (system admin).
 * @param groupId - Target group UUID.
 * @param targetUserId - Member user id.
 * @returns True on success.
 */
export async function removeUserFromGroupForGroup(
  groupId: string,
  targetUserId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim() || !targetUserId.trim()) {
    return false
  }
  try {
    const { error: updateError } = await supabase
      .from('group_members')
      .update({
        is_active: false,
        removed_at: new Date().toISOString(),
      })
      .eq('group_id', groupId)
      .eq('user_id', targetUserId)
    if (updateError) {
      throw updateError
    }
    return true
  } catch (err) {
    console.error('removeUserFromGroupForGroup', err)
    return false
  }
}

/**
 * Add a user to a group by email (membership or pending invitation).
 * @param groupId - Target group UUID.
 * @param email - Member email.
 * @returns True on success.
 */
export async function addUserToGroupForGroup(groupId: string, email: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return false
  }
  lastAddWasInvitation = false
  try {
    const emailNormalized = email.trim().toLowerCase()
    if (!emailNormalized) {
      return false
    }

    const { data: authData } = await supabase.auth.getUser()
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', emailNormalized)
      .maybeSingle()
    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError
    }

    if (profile) {
      const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_add_user_to_group', {
        p_group_id: groupId,
        p_user_id: profile.id,
      })
      if (rpcError) {
        throw rpcError
      }
      const rpcResult = rpcData as { success: boolean; error?: string }
      return Boolean(rpcResult?.success)
    }

    const { error: insertInviteError } = await supabase.from('group_invitations').insert({
      group_id: groupId,
      email: emailNormalized,
      invited_by_user_id: authData?.user?.id ?? null,
    })
    if (insertInviteError) {
      if (insertInviteError.code === '23505') {
        lastAddWasInvitation = true
        return true
      }
      throw insertInviteError
    }
    lastAddWasInvitation = true
    return true
  } catch (err) {
    console.error('addUserToGroupForGroup', err)
    return false
  }
}

/**
 * Add an existing user to a group by user id.
 * @param groupId - Target group UUID.
 * @param userId - Auth user id.
 * @returns True on success.
 */
export async function addUserToGroupByUserIdForGroup(
  groupId: string,
  userId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim() || !userId.trim()) {
    return false
  }
  lastAddWasInvitation = false
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_add_user_to_group', {
      p_group_id: groupId,
      p_user_id: userId,
    })
    if (rpcError) {
      throw rpcError
    }
    const rpcResult = rpcData as { success: boolean; error?: string }
    return Boolean(rpcResult?.success)
  } catch (err) {
    console.error('addUserToGroupByUserIdForGroup', err)
    return false
  }
}

/**
 * List pending member invitations for a group.
 * @param groupId - Target group UUID.
 * @returns Invitation rows.
 */
export async function getPendingMemberInvitationsForGroup(
  groupId: string,
): Promise<GroupInvitationRecord[]> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return []
  }
  try {
    const { data, error } = await supabase
      .from('group_invitations')
      .select('id, email, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
    if (error) {
      throw error
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      email: row.email as string,
      createdAt: (row.created_at as string) ?? '',
    }))
  } catch (err) {
    console.error('getPendingMemberInvitationsForGroup', err)
    return []
  }
}

/**
 * Delete a pending group invitation.
 * @param invitationId - Invitation row id.
 * @returns True on success.
 */
export async function removeGroupInvitation(invitationId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  try {
    const { error } = await supabase.from('group_invitations').delete().eq('id', invitationId)
    if (error) {
      throw error
    }
    return true
  } catch (err) {
    console.error('removeGroupInvitation', err)
    return false
  }
}

/**
 * Consume stuck invitations for a group via RPC.
 * @param groupId - Target group UUID.
 * @returns Consumed count (0 on failure).
 */
export async function consumeStuckInvitations(groupId: string): Promise<number> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return 0
  }
  try {
    const { data, error } = await supabase.rpc('rpc_consume_stuck_invitations', {
      p_group_id: groupId,
    })
    if (error) {
      throw error
    }
    const result = data as { success?: boolean; consumed_count?: number }
    return result?.consumed_count ?? 0
  } catch (err) {
    console.error('consumeStuckInvitations', err)
    return 0
  }
}

/**
 * Load members for drill-down (includes `isGroupAdmin` when available).
 * @param groupId - Group id.
 * @param groupAdminId - Optional legacy admin id.
 * @returns Members with profiles.
 */
export async function fetchGroupMembersForAdmin(
  groupId: string,
  groupAdminId?: string | null,
): Promise<Array<GroupMemberRecord & { isGroupAdmin?: boolean }>> {
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
  const ids = [
    ...new Set(rows.map((r) => r.user_id as string).concat(groupAdminId ? [groupAdminId] : [])),
  ]
  const profiles = await fetchProfileSnippets(ids)
  return rows.map((row) => ({
    id: row.id as string,
    groupId: row.group_id as string,
    userId: row.user_id as string,
    status: (row.status as string) ?? 'active',
    isGroupAdmin: Boolean(row.is_group_admin) || row.user_id === groupAdminId,
    user: profiles.get(row.user_id as string) ?? null,
  }))
}

/**
 * Assert the caller is a system admin (for UI gating before writes).
 * @param userId - Signed-in user id.
 * @returns Whether the caller is system_admin or super_admin.
 */
export async function callerIsSystemAdmin(userId: string): Promise<boolean> {
  const role = await fetchUserRole(userId)
  return isSystemAdminRole(role)
}

export { fetchGroupMembers }
