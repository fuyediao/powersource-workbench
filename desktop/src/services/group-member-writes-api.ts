/**
 * Per-member write grants (`group_member_module_writes`) for group-admin editors.
 */

import {
  isAdminModuleKey,
  isMemberWriteGrantableModule,
  MODULE_WRITE_ACTIONS,
  moduleWriteGrantKey,
  type AdminModuleKey,
  type ModuleWriteAction,
  type ModuleWriteGrantKey,
} from '@/constants/admin-modules'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Raw grant row shape. */
type WriteGrantRow = { module_key: string; action: string }

/** Per-action grant counts for one member. */
export type MemberWriteGrantSummary = Record<ModuleWriteAction, number>

/**
 * Whether a string is a known write action.
 * @param value - Raw action string.
 * @returns Type predicate.
 */
function isModuleWriteAction(value: string): value is ModuleWriteAction {
  return (MODULE_WRITE_ACTIONS as readonly string[]).includes(value)
}

/**
 * Map raw grant rows to composite `module:action` keys.
 * @param rows - Raw rows from `group_member_module_writes`.
 * @returns Set of valid composite grant keys.
 */
function rowsToGrantKeys(rows: WriteGrantRow[]): Set<ModuleWriteGrantKey> {
  const keys = new Set<ModuleWriteGrantKey>()
  for (const row of rows) {
    if (
      isAdminModuleKey(row.module_key) &&
      isMemberWriteGrantableModule(row.module_key) &&
      isModuleWriteAction(row.action)
    ) {
      keys.add(moduleWriteGrantKey(row.module_key, row.action))
    }
  }
  return keys
}

/**
 * Empty per-action summary.
 * @returns Zeroed summary.
 */
function emptySummary(): MemberWriteGrantSummary {
  return { insert: 0, update: 0, delete: 0 }
}

/**
 * Count how many modules are granted for each action in a composite-key set.
 * @param grantKeys - Pending or saved `module:action` grant keys.
 * @returns `{ insert, update, delete }` counts.
 */
export function summarizeWriteGrantKeys(
  grantKeys: Iterable<ModuleWriteGrantKey>,
): MemberWriteGrantSummary {
  const summary = emptySummary()
  for (const grant of grantKeys) {
    const [moduleKey, action] = grant.split(':') as [string, string]
    if (
      isAdminModuleKey(moduleKey) &&
      isMemberWriteGrantableModule(moduleKey) &&
      isModuleWriteAction(action)
    ) {
      summary[action] += 1
    }
  }
  return summary
}

/**
 * Fetch write grants for one member of a group.
 * @param groupId - Target group UUID.
 * @param userId - Target member user UUID.
 * @returns Set of composite `module:action` grant keys.
 */
export async function fetchMemberWriteGrants(
  groupId: string,
  userId: string,
): Promise<Set<ModuleWriteGrantKey>> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim() || !userId.trim()) {
    return new Set()
  }
  try {
    const { data, error } = await supabase
      .from('group_member_module_writes')
      .select('module_key, action')
      .eq('group_id', groupId)
      .eq('user_id', userId)
    if (error) {
      throw error
    }
    return rowsToGrantKeys((data ?? []) as WriteGrantRow[])
  } catch (err) {
    console.error('[group-member-writes-api] fetchMemberWriteGrants:', err)
    return new Set()
  }
}

/**
 * Fetch per-member create/edit/delete grant counts for an entire group.
 * @param groupId - Target group UUID.
 * @returns Map of `user_id` → `{ insert, update, delete }` counts.
 */
export async function fetchGroupWriteGrantSummaries(
  groupId: string,
): Promise<Map<string, MemberWriteGrantSummary>> {
  const result = new Map<string, MemberWriteGrantSummary>()
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return result
  }
  try {
    const { data, error } = await supabase
      .from('group_member_module_writes')
      .select('user_id, module_key, action')
      .eq('group_id', groupId)
    if (error) {
      throw error
    }
    for (const row of (data ?? []) as Array<{
      user_id: string
      module_key: string
      action: string
    }>) {
      if (
        !isAdminModuleKey(row.module_key) ||
        !isMemberWriteGrantableModule(row.module_key) ||
        !isModuleWriteAction(row.action)
      ) {
        continue
      }
      const summary = result.get(row.user_id) ?? emptySummary()
      summary[row.action] += 1
      result.set(row.user_id, summary)
    }
    return result
  } catch (err) {
    console.error('[group-member-writes-api] fetchGroupWriteGrantSummaries:', err)
    return result
  }
}

/**
 * Replace a member's write grants for a group.
 * @param groupId - Target group UUID.
 * @param userId - Target member user UUID.
 * @param grantKeys - Full set of composite `module:action` keys.
 * @returns True on success.
 */
export async function setMemberWriteGrants(
  groupId: string,
  userId: string,
  grantKeys: ModuleWriteGrantKey[],
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim() || !userId.trim()) {
    return false
  }
  try {
    const { error: deleteError } = await supabase
      .from('group_member_module_writes')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', userId)
    if (deleteError) {
      throw deleteError
    }

    if (grantKeys.length > 0) {
      const rows = grantKeys
        .map((grant) => {
          const [moduleKey, action] = grant.split(':') as [AdminModuleKey, ModuleWriteAction]
          return { group_id: groupId, user_id: userId, module_key: moduleKey, action }
        })
        .filter((row) => isMemberWriteGrantableModule(row.module_key))
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('group_member_module_writes').insert(rows)
        if (insertError) {
          throw insertError
        }
      }
    }
    return true
  } catch (err) {
    console.error('[group-member-writes-api] setMemberWriteGrants:', err)
    return false
  }
}
