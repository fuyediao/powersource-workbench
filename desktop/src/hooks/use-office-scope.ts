/**
 * Office (Docs/Sheets/Slides) scope: personal vs group, role flags, and group
 * switcher options. Mirrors {@link import('@/hooks/use-folio-scope').useFolioScope}
 * with `resource_key` bound to the active `OfficeFeatureId` (`docs` | `sheets` | `slides`)
 * against the `office` write domain (`group_desktop_writes_office`).
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
import type { OfficeFeatureId } from '@/constants/office-folder'

/** Office workspace scope. */
export type OfficeScopeMode = 'personal' | 'group'

/** Capability flags for the active Office scope. */
export interface OfficeCapabilities {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  readOnly: boolean
}

export interface OfficeScopeState {
  mode: OfficeScopeMode
  setMode: (mode: OfficeScopeMode) => void
  userRole: UserRole | null
  isSystemAdmin: boolean
  isGlobalLeader: boolean
  isGroupAdminOfSelected: boolean
  membershipGroup: GroupRecord | null
  selectedGroupId: string | null
  setSelectedGroupId: (groupId: string | null) => void
  switchableGroups: GroupRecord[]
  canSwitchGroups: boolean
  capabilities: OfficeCapabilities
  isLoading: boolean
  refresh: () => Promise<void>
}

/**
 * Loads Office RBAC + group list for the signed-in user, scoped to one
 * Docs/Sheets/Slides kind.
 * @param userId - Auth user id.
 * @param kind - Office feature kind (write resource_key + entry module key suffix).
 * @returns Scope state for the Office chrome.
 */
export function useOfficeScope(
  userId: string | null | undefined,
  kind: OfficeFeatureId,
): OfficeScopeState {
  const [mode, setMode] = useState<OfficeScopeMode>('personal')
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [membershipGroup, setMembershipGroup] = useState<GroupRecord | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [switchableGroups, setSwitchableGroups] = useState<GroupRecord[]>([])
  const [isGlobalLeader, setIsGlobalLeader] = useState(false)
  const [isGroupAdminOfSelected, setIsGroupAdminOfSelected] = useState(false)
  const [writeActions, setWriteActions] = useState<Set<ModuleWriteAction>>(new Set())
  const [isLoading, setIsLoading] = useState(Boolean(userId))

  const moduleKey = `desktop_${kind}` as const

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
          .eq('module_key', moduleKey)
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
  }, [userId, moduleKey])

  useEffect(() => {
    void refresh()
  }, [userId, kind])

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
        .from('group_desktop_writes_office')
        .select('action')
        .eq('group_id', selectedGroupId)
        .eq('user_id', userId)
        .eq('resource_key', kind)
      const actions = new Set<ModuleWriteAction>()
      for (const row of grants ?? []) {
        const action = row.action as string
        if (action === 'insert' || action === 'update' || action === 'delete') {
          actions.add(action)
        }
      }
      setWriteActions(actions)
    })()
  }, [selectedGroupId, userId, userRole, switchableGroups, kind])

  const isSystemAdmin = isSystemAdminRole(userRole)
  const canSwitchGroups = isSystemAdmin || isGlobalLeader

  const capabilities = useMemo((): OfficeCapabilities => {
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
