/**
 * Group module whitelist (`group_module_access`) for system-admin editors.
 */

import { isAdminModuleKey, type AdminModuleKey } from '@/constants/admin-modules'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/**
 * Fetch the `/admin` module whitelist for a group.
 * @param groupId - Target group UUID.
 * @returns Set of allowed module keys.
 */
export async function fetchModuleAccessForGroup(groupId: string): Promise<Set<AdminModuleKey>> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return new Set()
  }
  try {
    const { data, error } = await supabase
      .from('group_module_access')
      .select('module_key')
      .eq('group_id', groupId)
    if (error) {
      throw error
    }
    return new Set(
      (data ?? [])
        .map((row) => row.module_key as string)
        .filter(isAdminModuleKey),
    )
  } catch (err) {
    console.error('[group-module-access-api] fetchModuleAccessForGroup:', err)
    return new Set()
  }
}

/**
 * Replace the module whitelist for a group (system_admin / super_admin only).
 * @param groupId - Target group UUID.
 * @param keys - Full set of module keys to grant.
 * @returns True on success.
 */
export async function setModuleAccessForGroup(
  groupId: string,
  keys: AdminModuleKey[],
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase || !groupId.trim()) {
    return false
  }
  try {
    const { error: deleteError } = await supabase
      .from('group_module_access')
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
      const { error: insertError } = await supabase.from('group_module_access').insert(rows)
      if (insertError) {
        throw insertError
      }
    }
    return true
  } catch (err) {
    console.error('[group-module-access-api] setModuleAccessForGroup:', err)
    return false
  }
}
