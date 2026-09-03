/**
 * Global leader appointment + module whitelist (Supabase RLS).
 */

import {
  ADMIN_MODULE_KEYS,
  isAdminModuleKey,
  type AdminModuleKey,
} from '@/constants/admin-modules'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fetchProfileSnippets, type ProfileSnippet } from '@/services/groups-api'

/** One global leader row with profile and module whitelist. */
export interface GlobalLeaderEntry {
  userId: string
  profile: ProfileSnippet | null
  moduleKeys: Set<AdminModuleKey>
  appointedAt: string
}

/**
 * List every appointed global leader with profile and module whitelist.
 * @returns Leader roster (empty when unauthorized or none appointed).
 */
export async function listGlobalLeaders(): Promise<GlobalLeaderEntry[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }
  try {
    const { data: leaderRows, error: leaderError } = await supabase
      .from('global_leaders')
      .select('user_id, created_at')
      .order('created_at', { ascending: false })
    if (leaderError) {
      throw leaderError
    }

    const userIds = (leaderRows ?? []).map((row) => row.user_id as string)
    if (userIds.length === 0) {
      return []
    }

    const [{ data: accessRows }, profiles] = await Promise.all([
      supabase.from('global_leader_module_access').select('user_id, module_key').in('user_id', userIds),
      fetchProfileSnippets(userIds),
    ])

    const modulesByUser = new Map<string, Set<AdminModuleKey>>()
    for (const row of accessRows ?? []) {
      const uid = row.user_id as string
      const key = row.module_key as string
      if (!isAdminModuleKey(key)) {
        continue
      }
      if (!modulesByUser.has(uid)) {
        modulesByUser.set(uid, new Set())
      }
      modulesByUser.get(uid)!.add(key)
    }

    return (leaderRows ?? []).map((row) => ({
      userId: row.user_id as string,
      profile: profiles.get(row.user_id as string) ?? null,
      moduleKeys: modulesByUser.get(row.user_id as string) ?? new Set(),
      appointedAt: row.created_at as string,
    }))
  } catch (err) {
    console.error('[global-leaders-api] listGlobalLeaders:', err)
    return []
  }
}

/**
 * Appoint an existing user as a global leader (empty module whitelist).
 * @param userId - Target auth user id.
 * @returns True on success.
 */
export async function appointGlobalLeader(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  try {
    const { data: authData } = await supabase.auth.getUser()
    const { error: insertError } = await supabase.from('global_leaders').insert({
      user_id: userId,
      appointed_by: authData?.user?.id ?? null,
    })
    if (insertError && insertError.code !== '23505') {
      throw insertError
    }
    return true
  } catch (err) {
    console.error('[global-leaders-api] appointGlobalLeader:', err)
    return false
  }
}

/**
 * Revoke a global leader entirely (cascades module access via FK).
 * @param userId - Target auth user id.
 * @returns True on success.
 */
export async function revokeGlobalLeader(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  try {
    const { error: deleteError } = await supabase.from('global_leaders').delete().eq('user_id', userId)
    if (deleteError) {
      throw deleteError
    }
    return true
  } catch (err) {
    console.error('[global-leaders-api] revokeGlobalLeader:', err)
    return false
  }
}

/**
 * Replace a global leader's module whitelist.
 * @param userId - Target auth user id (must already be a global leader).
 * @param keys - Full set of module keys the leader should read cross-group.
 * @returns True on success.
 */
export async function setGlobalLeaderModuleAccess(
  userId: string,
  keys: AdminModuleKey[],
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    return false
  }
  try {
    const { error: deleteError } = await supabase
      .from('global_leader_module_access')
      .delete()
      .eq('user_id', userId)
    if (deleteError) {
      throw deleteError
    }

    if (keys.length > 0) {
      const { data: authData } = await supabase.auth.getUser()
      const rows = keys.map((moduleKey) => ({
        user_id: userId,
        module_key: moduleKey,
        granted_by: authData?.user?.id ?? null,
      }))
      const { error: insertError } = await supabase.from('global_leader_module_access').insert(rows)
      if (insertError) {
        throw insertError
      }
    }
    return true
  } catch (err) {
    console.error('[global-leaders-api] setGlobalLeaderModuleAccess:', err)
    return false
  }
}

/** Re-export module key list for UI editors. */
export { ADMIN_MODULE_KEYS }
