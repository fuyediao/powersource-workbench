/**
 * Group desktop entry whitelist (`group_desktop_module_access`).
 */

import {
  isDesktopModuleKey,
  type DesktopModuleKey,
} from '@/constants/desktop-modules'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/**
 * Fetch the Electron entry whitelist for a group.
 * @param groupId - Target group UUID.
 * @returns Set of allowed desktop module keys.
 */
export async function fetchDesktopModuleAccessForGroup(
  groupId: string,
): Promise<Set<DesktopModuleKey>> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return new Set()
  }
  try {
    const { data, error } = await supabase
      .from('group_desktop_module_access')
      .select('module_key')
      .eq('group_id', groupId)
    if (error) {
      throw error
    }
    return new Set(
      (data ?? [])
        .map((row) => row.module_key as string)
        .filter(isDesktopModuleKey),
    )
  } catch (err) {
    console.error('[group-desktop-module-access-api] fetchDesktopModuleAccessForGroup:', err)
    return new Set()
  }
}

/**
 * Replace the desktop entry whitelist for a group (system admin only).
 * @param groupId - Target group UUID.
 * @param keys - Full set of desktop keys to grant.
 * @returns True on success.
 */
export async function setDesktopModuleAccessForGroup(
  groupId: string,
  keys: DesktopModuleKey[],
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return false
  }
  try {
    const { error: deleteError } = await supabase
      .from('group_desktop_module_access')
      .delete()
      .eq('group_id', groupId)
    if (deleteError) {
      throw deleteError
    }

    if (keys.length > 0) {
      const { data: authData } = await supabase.auth.getUser()
      const rows = keys.map((moduleKey) => ({
        group_id: groupId,
        module_key: moduleKey,
        granted_by: authData?.user?.id ?? null,
      }))
      const { error: insertError } = await supabase
        .from('group_desktop_module_access')
        .insert(rows)
      if (insertError) {
        throw insertError
      }
    }
    return true
  } catch (err) {
    console.error('[group-desktop-module-access-api] setDesktopModuleAccessForGroup:', err)
    return false
  }
}
