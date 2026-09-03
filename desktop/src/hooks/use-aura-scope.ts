/**
 * Aura (Markdown editor) scope: personal vs group, role flags, and group
 * switcher options. Mirrors {@link import('@/hooks/use-office-scope').useOfficeScope}
 * bound to the fixed `desktop_aura` module key and the `aura` write domain
 * (`group_desktop_writes_aura`, single resource_key `files`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchCurrentGroup,
  fetchUserRole,
  isSystemAdminRole,
  type GroupRecord,
} from '@/services/groups-api'
import { getGroupAdmins } from '@/services/group-management-api'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { UserRole } from '@/types/crm-settings'
import type { ModuleWriteAction } from '@/constants/admin-modules'

const MODULE_KEY = 'desktop_aura'
const RESOURCE_KEY = 'files'

/** Aura workspace scope. */
export type AuraScopeMode = 'personal' | 'group'

/** Capability flags for the active Aura scope. */
export interface AuraCapabilities {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  readOnly: boolean
}

export interface AuraScopeState {
  mode: AuraScopeMode
  setMode: (mode: AuraScopeMode) => void
  userRole: UserRole | null
  isSystemAdmin: boolean
  isGlobalLeader: boolean
  isGroupAdminOfSelected: boolean
  membershipGroup: GroupRecord | null
  selectedGroupId: string | null
  setSelectedGroupId: (groupId: string | null) => void
  switchableGroups: GroupRecord[]
  canSwitchGroups: boolean
  capabilities: AuraCapabilities
  isLoading: boolean
  refresh: () => Promise<void>
}

/**
 * Loads Aura RBAC + group list for the signed-in user.
 * @param userId - Auth user id.
 * @returns Scope state for the Aura chrome.
 */
export function useAuraScope(userId: string | null | undefined): AuraScopeState {
  const [mode, setMode] = useState<AuraScopeMode>('personal')
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [membershipGroup, setMembershipGroup] = useState<GroupRecord | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [switchableGroups, setSwitchableGroups] = useState<GroupRecord[]>([])
  const [isGlobalLeader, setIsGlobalLeader] = useState(false)
  const [isGroupAdminOfSelected, setIsGroupAdminOfSelected] = useState(false)
  const [writeActions, setWriteActions] = useState<Set<ModuleWriteAction>>(new Set())
  const [isLoading, setIsLoading] = useState(Boolean(userId))

  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setUserRole(null)
      setMembershipGroup(null)
      setSelectedGroupId(null)
      setSwitchableGroups([])
      setIsGlobalLeader(false)
      setIsGroupAdminOfSelected(false)
      setWriteActions(new Set())
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const role = await fetchUserRole(userId)
      setUserRole(role)
      const systemAdmin = isSystemAdminRole(role)
      const group = await fetchCurrentGroup(userId)
      setMembershipGroup(group)

      const { data: leaderRow } = await supabase
        .from('global_leaders')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
      let leader = Boolean(leaderRow)
      if (leader) {
        const { data: access } = await supabase
          .from('global_leader_desktop_module_access')
          .select('module_key')
          .eq('user_id', userId)
          .eq('module_key', MODULE_KEY)
          .maybeSingle()
        leader = Boolean(access)
      }
      setIsGlobalLeader(leader)

      let groups: GroupRecord[] = []
      if (systemAdmin || leader) {
        const admins = await getGroupAdmins()
        const byId = new Map<string, GroupRecord>()
        for (const entry of admins) {
          byId.set(entry.group.id, entry.group)
        }
        if (byId.size === 0) {
          const { data: allGroups } = await supabase.from('groups').select('*')
          for (const row of allGroups ?? []) {
            byId.set(row.id as string, {
              id: row.id as string,
              name: row.name as string,
              description: (row.description as string | null) ?? null,
              groupAdminId: (row.group_admin_id as string | null) ?? null,
              isTempManaged: Boolean(row.is_temp_managed),
              pendingAdminEmail: (row.pending_admin_email as string | null) ?? null,
              createdAt: (row.created_at as string | null) ?? null,
            })
          }
        }
        groups = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
      } else if (group) {
        groups = [group]
      }
      setSwitchableGroups(groups)

      setSelectedGroupId((prev) => {
        if (prev && groups.some((g) => g.id === prev)) {
          return prev
        }
        return group?.id ?? groups[0]?.id ?? null
      })
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [userId])

  useEffect(() => {
    if (!userId || !selectedGroupId || !supabase) {
      return
    }
    void (async () => {
      const systemAdmin = isSystemAdminRole(userRole)
      const { data: memberRow } = await supabase
        .from('group_members')
        .select('is_group_admin')
        .eq('group_id', selectedGroupId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()
      const adminOfSelected =
        systemAdmin ||
        Boolean(memberRow?.is_group_admin) ||
        switchableGroups.find((g) => g.id === selectedGroupId)?.groupAdminId === userId
      setIsGroupAdminOfSelected(adminOfSelected)
      if (adminOfSelected || systemAdmin) {
        setWriteActions(new Set(['insert', 'update', 'delete']))
        return
      }
      const { data: grants } = await supabase
        .from('group_desktop_writes_aura')
        .select('action')
        .eq('group_id', selectedGroupId)
        .eq('user_id', userId)
        .eq('resource_key', RESOURCE_KEY)
      const actions = new Set<ModuleWriteAction>()
      for (const row of grants ?? []) {
        const action = row.action as string
        if (action === 'insert' || action === 'update' || action === 'delete') {
          actions.add(action)
        }
      }
      setWriteActions(actions)
    })()
  }, [selectedGroupId, userId, userRole, switchableGroups])

  const isSystemAdmin = isSystemAdminRole(userRole)
  const canSwitchGroups = isSystemAdmin || isGlobalLeader

  const capabilities = useMemo((): AuraCapabilities => {
    if (mode === 'personal') {
      return {
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canMoveToGroup: Boolean(membershipGroup || (canSwitchGroups && selectedGroupId)),
        canCopyToPersonal: false,
        readOnly: false,
      }
    }
    if (isSystemAdmin || isGroupAdminOfSelected) {
      return {
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canMoveToGroup: false,
        canCopyToPersonal: true,
        readOnly: false,
      }
    }
    if (isGlobalLeader) {
      return {
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canMoveToGroup: false,
        canCopyToPersonal: true,
        readOnly: true,
      }
    }
    return {
      canCreate: writeActions.has('insert'),
      canEdit: writeActions.has('update'),
      canDelete: writeActions.has('delete'),
      canMoveToGroup: false,
      canCopyToPersonal: true,
      readOnly: !writeActions.has('update'),
    }
  }, [
    mode,
    membershipGroup,
    canSwitchGroups,
    selectedGroupId,
    isSystemAdmin,
    isGroupAdminOfSelected,
    isGlobalLeader,
    writeActions,
  ])

  return {
    mode,
    setMode,
    userRole,
    isSystemAdmin,
    isGlobalLeader,
    isGroupAdminOfSelected,
    membershipGroup,
    selectedGroupId,
    setSelectedGroupId,
    switchableGroups,
    canSwitchGroups,
    capabilities,
    isLoading,
    refresh,
  }
}
