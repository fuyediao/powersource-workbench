/**
 * Read-only CRM affiliation labels for auth users (User Management).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Affiliation kinds surfaced in the user-management table. */
export type UserAffiliationKind =
  | 'super_admin'
  | 'system_admin'
  | 'global_leader'
  | 'group_admin'
  | 'group_member'

/** One affiliation line for a user (group name omitted for system admins). */
export interface UserAffiliationEntry {
  kind: UserAffiliationKind
  groupName?: string
}

/** Map of auth user id → ordered affiliation entries. */
export type UserAffiliationMap = Record<string, UserAffiliationEntry[]>

interface GroupRow {
  id: string
  name: string
  group_admin_id: string | null
}

interface RoleRow {
  user_id: string
  role: string
}

interface MemberRow {
  user_id: string
  group_id: string
  is_group_admin: boolean
}

/**
 * Compare affiliation entries for stable display order.
 * @param a - First entry.
 * @param b - Second entry.
 * @returns Sort comparator result.
 */
function compareAffiliationEntries(a: UserAffiliationEntry, b: UserAffiliationEntry): number {
  const rank = (k: UserAffiliationKind): number => {
    if (k === 'super_admin') {
      return 0
    }
    if (k === 'system_admin') {
      return 1
    }
    if (k === 'global_leader') {
      return 2
    }
    if (k === 'group_admin') {
      return 3
    }
    return 4
  }
  const diff = rank(a.kind) - rank(b.kind)
  if (diff !== 0) {
    return diff
  }
  return (a.groupName ?? '').localeCompare(b.groupName ?? '', undefined, { sensitivity: 'base' })
}

/**
 * Load CRM affiliations for the given auth user ids.
 * @param userIds - Supabase auth user ids on the current page.
 * @returns Affiliation map; missing users have no key.
 */
export async function fetchUserAffiliations(userIds: string[]): Promise<UserAffiliationMap> {
  if (!isSupabaseConfigured || !supabase || userIds.length === 0) {
    return {}
  }

  const uniqueIds = [...new Set(userIds.filter(Boolean))]

  const [rolesResult, groupsResult, membersResult, globalLeadersResult] = await Promise.all([
    supabase.from('user_roles').select('user_id, role').in('user_id', uniqueIds),
    supabase.from('groups').select('id, name, group_admin_id'),
    supabase
      .from('group_members')
      .select('user_id, group_id, is_group_admin')
      .in('user_id', uniqueIds)
      .eq('is_active', true),
    supabase.from('global_leaders').select('user_id').in('user_id', uniqueIds),
  ])

  if (rolesResult.error) {
    throw new Error(rolesResult.error.message)
  }
  if (groupsResult.error) {
    throw new Error(groupsResult.error.message)
  }
  if (membersResult.error) {
    throw new Error(membersResult.error.message)
  }
  if (globalLeadersResult.error) {
    throw new Error(globalLeadersResult.error.message)
  }

  const groups = (groupsResult.data ?? []) as GroupRow[]
  const groupNameById = new Map<string, string>()
  const adminGroupIdsByUser = new Map<string, Set<string>>()

  for (const group of groups) {
    const name = (group.name ?? '').trim() || group.id
    groupNameById.set(group.id, name)
    if (group.group_admin_id) {
      const set = adminGroupIdsByUser.get(group.group_admin_id) ?? new Set<string>()
      set.add(group.id)
      adminGroupIdsByUser.set(group.group_admin_id, set)
    }
  }

  const globalLeaderIds = new Set<string>(
    ((globalLeadersResult.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id),
  )

  const superAdminIds = new Set<string>()
  const systemAdminIds = new Set<string>()
  for (const row of (rolesResult.data ?? []) as RoleRow[]) {
    if (row.role === 'super_admin') {
      superAdminIds.add(row.user_id)
    } else if (row.role === 'system_admin') {
      systemAdminIds.add(row.user_id)
    }
  }

  const memberGroupIdsByUser = new Map<string, Set<string>>()
  for (const row of (membersResult.data ?? []) as MemberRow[]) {
    const set = memberGroupIdsByUser.get(row.user_id) ?? new Set<string>()
    set.add(row.group_id)
    memberGroupIdsByUser.set(row.user_id, set)

    if (row.is_group_admin) {
      const adminSet = adminGroupIdsByUser.get(row.user_id) ?? new Set<string>()
      adminSet.add(row.group_id)
      adminGroupIdsByUser.set(row.user_id, adminSet)
    }
  }

  const result: UserAffiliationMap = {}

  for (const userId of uniqueIds) {
    const entries: UserAffiliationEntry[] = []

    if (superAdminIds.has(userId)) {
      entries.push({ kind: 'super_admin' })
    } else if (systemAdminIds.has(userId)) {
      entries.push({ kind: 'system_admin' })
    }

    if (globalLeaderIds.has(userId)) {
      entries.push({ kind: 'global_leader' })
    }

    const adminGroupIds = adminGroupIdsByUser.get(userId)
    if (adminGroupIds) {
      for (const groupId of [...adminGroupIds].sort((a, b) =>
        (groupNameById.get(a) ?? a).localeCompare(groupNameById.get(b) ?? b, undefined, {
          sensitivity: 'base',
        }),
      )) {
        entries.push({
          kind: 'group_admin',
          groupName: groupNameById.get(groupId) ?? groupId,
        })
      }
    }

    const memberGroupIds = memberGroupIdsByUser.get(userId)
    if (memberGroupIds) {
      const adminIds = adminGroupIds ?? new Set<string>()
      const memberOnly = [...memberGroupIds]
        .filter((groupId) => !adminIds.has(groupId))
        .sort((a, b) =>
          (groupNameById.get(a) ?? a).localeCompare(groupNameById.get(b) ?? b, undefined, {
            sensitivity: 'base',
          }),
        )
      for (const groupId of memberOnly) {
        entries.push({
          kind: 'group_member',
          groupName: groupNameById.get(groupId) ?? groupId,
        })
      }
    }

    entries.sort(compareAffiliationEntries)
    if (entries.length > 0) {
      result[userId] = entries
    }
  }

  return result
}
