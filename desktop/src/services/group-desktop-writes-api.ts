/**
 * Per-domain desktop write grants (`group_desktop_writes_*`).
 */

import { MODULE_WRITE_ACTIONS, type ModuleWriteAction } from '@/constants/admin-modules'
import {
  DESKTOP_WRITE_DOMAINS,
  DESKTOP_WRITE_RESOURCES,
  DESKTOP_WRITE_TABLE,
  desktopWriteGrantKey,
  parseDesktopWriteGrantKey,
  type DesktopWriteDomain,
  type DesktopWriteGrantKey,
} from '@/constants/desktop-modules'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/**
 * Canonical typed table for Supabase `.from` (all write tables share the same shape).
 * Dynamic domain → table mapping still uses {@link DESKTOP_WRITE_TABLE} at runtime.
 */
const WRITE_TABLE_TYPED = 'group_desktop_writes_admin' as const

/**
 * Runtime table name for a domain, asserted to the shared typed table name.
 * @param domain - Write domain.
 * @returns Table name accepted by the typed Supabase client.
 */
function writeTableName(
  domain: DesktopWriteDomain,
): typeof WRITE_TABLE_TYPED {
  void DESKTOP_WRITE_TABLE[domain]
  return DESKTOP_WRITE_TABLE[domain] as typeof WRITE_TABLE_TYPED
}

/** Per-action grant counts for one member (across open domains). */
export type DesktopWriteGrantSummary = Record<ModuleWriteAction, number>

/**
 * Whether a string is a known write action.
 * @param value - Raw action.
 * @returns Type predicate.
 */
function isModuleWriteAction(value: string): value is ModuleWriteAction {
  return (MODULE_WRITE_ACTIONS as readonly string[]).includes(value)
}

/**
 * Empty per-action summary.
 * @returns Zeroed summary.
 */
function emptySummary(): DesktopWriteGrantSummary {
  return { insert: 0, update: 0, delete: 0 }
}

/**
 * Count actions in a grant-key set.
 * @param grantKeys - Composite grant keys.
 * @returns Per-action counts.
 */
export function summarizeDesktopWriteGrantKeys(
  grantKeys: Iterable<DesktopWriteGrantKey>,
): DesktopWriteGrantSummary {
  const summary = emptySummary()
  for (const grant of grantKeys) {
    const parsed = parseDesktopWriteGrantKey(grant)
    if (parsed) {
      summary[parsed.action] += 1
    }
  }
  return summary
}

/**
 * Fetch write grants for one member across the given domains.
 * @param groupId - Target group UUID.
 * @param userId - Target member UUID.
 * @param domains - Domains to load (typically those with open entry).
 * @returns Set of composite grant keys.
 */
export async function fetchDesktopMemberWriteGrants(
  groupId: string,
  userId: string,
  domains: readonly DesktopWriteDomain[] = DESKTOP_WRITE_DOMAINS,
): Promise<Set<DesktopWriteGrantKey>> {
  const keys = new Set<DesktopWriteGrantKey>()
  if (!isSupabaseConfigured || !supabase || !groupId.trim() || !userId.trim()) {
    return keys
  }
  const client = supabase!
  try {
    await Promise.all(
      domains.map(async (domain) => {
        const { data, error } = await client
          .from(writeTableName(domain))
          .select('resource_key, action')
          .eq('group_id', groupId)
          .eq('user_id', userId)
        if (error) {
          throw error
        }
        for (const row of data ?? []) {
          const resourceKey = row.resource_key
          const action = row.action
          if (
            DESKTOP_WRITE_RESOURCES[domain].includes(resourceKey) &&
            isModuleWriteAction(action)
          ) {
            keys.add(desktopWriteGrantKey(domain, resourceKey, action))
          }
        }
      }),
    )
    return keys
  } catch (err) {
    console.error('[group-desktop-writes-api] fetchDesktopMemberWriteGrants:', err)
    return new Set()
  }
}

/**
 * Fetch per-member action counts across domains for a group.
 * @param groupId - Target group UUID.
 * @param domains - Domains to include.
 * @returns Map of user id → action counts.
 */
export async function fetchDesktopGroupWriteGrantSummaries(
  groupId: string,
  domains: readonly DesktopWriteDomain[] = DESKTOP_WRITE_DOMAINS,
): Promise<Map<string, DesktopWriteGrantSummary>> {
  const result = new Map<string, DesktopWriteGrantSummary>()
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return result
  }
  const client = supabase!
  try {
    await Promise.all(
      domains.map(async (domain) => {
        const { data, error } = await client
          .from(writeTableName(domain))
          .select('user_id, resource_key, action')
          .eq('group_id', groupId)
        if (error) {
          throw error
        }
        for (const row of data ?? []) {
          const resourceKey = row.resource_key
          const action = row.action
          if (
            !DESKTOP_WRITE_RESOURCES[domain].includes(resourceKey) ||
            !isModuleWriteAction(action)
          ) {
            continue
          }
          const uid = row.user_id
          const summary = result.get(uid) ?? emptySummary()
          summary[action] += 1
          result.set(uid, summary)
        }
      }),
    )
    return result
  } catch (err) {
    console.error('[group-desktop-writes-api] fetchDesktopGroupWriteGrantSummaries:', err)
    return result
  }
}

/**
 * Replace a member's desktop write grants for the given domains.
 * Only domains listed are replaced; other domain tables are left untouched.
 * @param groupId - Target group UUID.
 * @param userId - Target member UUID.
 * @param grantKeys - Full set of grants for the domains being edited.
 * @param domains - Domains whose tables should be rewritten.
 * @returns True on success.
 */
export async function setDesktopMemberWriteGrants(
  groupId: string,
  userId: string,
  grantKeys: DesktopWriteGrantKey[],
  domains: readonly DesktopWriteDomain[],
): Promise<boolean> {
  if (
    !isSupabaseConfigured ||
    !supabase ||
    !groupId.trim() ||
    !userId.trim() ||
    domains.length === 0
  ) {
    return false
  }
  try {
    const { data: authData } = await supabase.auth.getUser()
    const grantedBy = authData?.user?.id ?? null

    for (const domain of domains) {
      const table = writeTableName(domain)
      const { error: deleteError } = await supabase
        .from(table)
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId)
      if (deleteError) {
        throw deleteError
      }

      const rows = grantKeys
        .map(parseDesktopWriteGrantKey)
        .filter(
          (parsed): parsed is NonNullable<typeof parsed> =>
            parsed !== null && parsed.domain === domain,
        )
        .map((parsed) => ({
          group_id: groupId,
          user_id: userId,
          resource_key: parsed.resourceKey,
          action: parsed.action,
          granted_by: grantedBy,
        }))

      if (rows.length > 0) {
        const { error: insertError } = await supabase.from(table).insert(rows)
        if (insertError) {
          throw insertError
        }
      }
    }
    return true
  } catch (err) {
    console.error('[group-desktop-writes-api] setDesktopMemberWriteGrants:', err)
    return false
  }
}

/**
 * Fetch granted write actions for one domain resource (runtime capabilities).
 * @param groupId - Group UUID.
 * @param userId - Member UUID.
 * @param domain - Write domain.
 * @param resourceKey - Resource within the domain.
 * @returns Set of granted actions.
 */
export async function fetchDesktopResourceWriteActions(
  groupId: string,
  userId: string,
  domain: DesktopWriteDomain,
  resourceKey: string,
): Promise<Set<ModuleWriteAction>> {
  const actions = new Set<ModuleWriteAction>()
  if (!isSupabaseConfigured || !supabase) {
    return actions
  }
  try {
    const { data, error } = await supabase
      .from(writeTableName(domain))
      .select('action')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('resource_key', resourceKey)
    if (error) {
      throw error
    }
    for (const row of data ?? []) {
      const action = row.action
      if (isModuleWriteAction(action)) {
        actions.add(action)
      }
    }
    return actions
  } catch (err) {
    console.error('[group-desktop-writes-api] fetchDesktopResourceWriteActions:', err)
    return actions
  }
}
