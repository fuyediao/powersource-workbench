/**
 * Global leader desktop entry whitelist (`global_leader_desktop_module_access`).
 */

import {
  isDesktopModuleKey,
  type DesktopModuleKey,
} from '@/constants/desktop-modules'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/**
 * Fetch desktop entry keys for one global leader.
 * @param userId - Leader auth user id.
 * @returns Set of desktop module keys.
 */
export async function fetchGlobalLeaderDesktopModuleAccess(
  userId: string,
): Promise<Set<DesktopModuleKey>> {
  if (!isSupabaseConfigured || !supabase || !userId.trim()) {
    return new Set()
  }
  try {
    const { data, error } = await supabase
      .from('global_leader_desktop_module_access')
      .select('module_key')
      .eq('user_id', userId)
    if (error) {
      throw error
    }
    return new Set(
      (data ?? [])
        .map((row) => row.module_key as string)
        .filter(isDesktopModuleKey),
    )
  } catch (err) {
    console.error(
      '[global-leader-desktop-access-api] fetchGlobalLeaderDesktopModuleAccess:',
      err,
    )
    return new Set()
  }
}

/**
 * Fetch desktop entry keys for many global leaders.
 * @param userIds - Leader auth user ids.
 * @returns Map of user id → desktop keys.
 */
export async function fetchGlobalLeaderDesktopModuleAccessBatch(
  userIds: string[],
): Promise<Map<string, Set<DesktopModuleKey>>> {
  const result = new Map<string, Set<DesktopModuleKey>>()
  if (!isSupabaseConfigured || !supabase || userIds.length === 0) {
    return result
  }
  try {
    const { data, error } = await supabase
      .from('global_leader_desktop_module_access')
      .select('user_id, module_key')
      .in('user_id', userIds)
    if (error) {
      throw error
    }
    for (const row of data ?? []) {
      const uid = row.user_id as string
      const key = row.module_key as string
      if (!isDesktopModuleKey(key)) {
        continue
      }
      if (!result.has(uid)) {
        result.set(uid, new Set())
      }
      result.get(uid)!.add(key)
    }
    return result
  } catch (err) {
    console.error(
      '[global-leader-desktop-access-api] fetchGlobalLeaderDesktopModuleAccessBatch:',
      err,
    )
    return result
  }
}

/**
 * Replace a global leader's desktop entry whitelist (system admin only).
 * @param userId - Leader auth user id.
 * @param keys - Full set of desktop keys.
 * @returns True on success.
 */
export async function setGlobalLeaderDesktopModuleAccess(
  userId: string,
  keys: DesktopModuleKey[],
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !userId.trim()) {
    return false
  }
  try {
    const { error: deleteError } = await supabase
      .from('global_leader_desktop_module_access')
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
      const { error: insertError } = await supabase
        .from('global_leader_desktop_module_access')
        .insert(rows)
      if (insertError) {
        throw insertError
      }
    }
    return true
  } catch (err) {
    console.error(
      '[global-leader-desktop-access-api] setGlobalLeaderDesktopModuleAccess:',
      err,
    )
    return false
  }
}
