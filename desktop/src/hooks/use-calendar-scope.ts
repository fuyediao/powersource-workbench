/**
 * Calendar scope: personal vs group, role flags, and write grants for module `calendar`.
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
import {
  loadCalendarScopeGroupId,
  loadCalendarScopeMode,
  saveCalendarScopeGroupId,
  saveCalendarScopeMode,
} from '@/utils/calendar/calendar-prefs'

/** Calendar workspace scope. */
export type CalendarScopeMode = 'personal' | 'group'

/** Capability flags for the active Calendar scope. */
export interface CalendarCapabilities {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  readOnly: boolean
}

export interface CalendarScopeState {
  mode: CalendarScopeMode
  setMode: (mode: CalendarScopeMode) => void
  userRole: UserRole | null
  isSystemAdmin: boolean
  isGlobalLeader: boolean
  isGroupAdminOfSelected: boolean
  membershipGroup: GroupRecord | null
  selectedGroupId: string | null
  setSelectedGroupId: (groupId: string | null) => void
  switchableGroups: GroupRecord[]
  canSwitchGroups: boolean
  capabilities: CalendarCapabilities
  isLoading: boolean
  refresh: () => Promise<void>
}

/**
 * Loads Calendar RBAC + group list for the signed-in user.
 * @param userId - Auth user id.
 * @returns Scope state for Calendar chrome.
 */
export function useCalendarScope(userId: string | null | undefined): CalendarScopeState {
  const [mode, setModeState] = useState<CalendarScopeMode>(() => loadCalendarScopeMode(userId))
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [membershipGroup, setMembershipGroup] = useState<GroupRecord | null>(null)
  const [selectedGroupId, setSelectedGroupIdState] = useState<string | null>(() =>
    loadCalendarScopeGroupId(userId),
  )
  const [switchableGroups, setSwitchableGroups] = useState<GroupRecord[]>([])
  const [isGlobalLeader, setIsGlobalLeader] = useState(false)
  const [isGroupAdminOfSelected, setIsGroupAdminOfSelected] = useState(false)
  const [writeActions, setWriteActions] = useState<Set<ModuleWriteAction>>(new Set())
  const [isLoading, setIsLoading] = useState(Boolean(userId))

  /**
   * Updates scope mode and persists it for this user.
   * @param next - Personal or group.
   * @returns Nothing.
   */
  const setMode = useCallback(
    (next: CalendarScopeMode) => {
      setModeState(next)
      saveCalendarScopeMode(userId, next)
    },
    [userId],
  )

  /**
   * Updates the selected group and persists it for this user.
   * @param groupId - Group uuid, or null.
   * @returns Nothing.
   */
  const setSelectedGroupId = useCallback(
    (groupId: string | null) => {
      setSelectedGroupIdState(groupId)
      saveCalendarScopeGroupId(userId, groupId)
    },
    [userId],
  )

  useEffect(() => {
    setModeState(loadCalendarScopeMode(userId))
    setSelectedGroupIdState(loadCalendarScopeGroupId(userId))
  }, [userId])

  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setUserRole(null)
      setMembershipGroup(null)
      setSelectedGroupIdState(null)
      setSwitchableGroups([])
      setIsGlobalLeader(false)
      setIsGroupAdminOfSelected(false)
      setWriteActions(new Set())
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const [role, group, leaderRowResult] = await Promise.all([
        fetchUserRole(userId),
        fetchCurrentGroup(userId),
        supabase
          .from('global_leaders')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle(),
      ])
      setUserRole(role)
      const systemAdmin = isSystemAdminRole(role)
      setMembershipGroup(group)

      const leaderRow = leaderRowResult.data
      let leader = Boolean(leaderRow)
      if (leader) {
        const { data: access } = await supabase
          .from('global_leader_desktop_module_access')
          .select('module_key')
          .eq('user_id', userId)
          .eq('module_key', 'desktop_calendar')
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

      setSelectedGroupIdState((prev) => {
        if (prev && groups.some((g) => g.id === prev)) {
          saveCalendarScopeGroupId(userId, prev)
          return prev
        }
        const stored = loadCalendarScopeGroupId(userId)
        if (stored && groups.some((g) => g.id === stored)) {
          saveCalendarScopeGroupId(userId, stored)
          return stored
        }
        const fallback = group?.id ?? groups[0]?.id ?? null
        saveCalendarScopeGroupId(userId, fallback)
        return fallback
      })

      if (groups.length === 0) {
        setModeState('personal')
        saveCalendarScopeMode(userId, 'personal')
      }
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
        .from('group_desktop_writes_calendar')
        .select('action')
        .eq('group_id', selectedGroupId)
        .eq('user_id', userId)
        .eq('resource_key', 'events')
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

  const capabilities = useMemo((): CalendarCapabilities => {
    if (mode === 'personal') {
      return {
        canCreate: true,
        canEdit: true,
        canDelete: true,
        readOnly: false,
      }
    }
    if (isSystemAdmin || isGroupAdminOfSelected) {
      return {
        canCreate: true,
        canEdit: true,
        canDelete: true,
        readOnly: false,
      }
    }
    if (isGlobalLeader) {
      return {
        canCreate: false,
        canEdit: false,
        canDelete: false,
        readOnly: true,
      }
    }
    return {
      canCreate: writeActions.has('insert'),
      canEdit: writeActions.has('update'),
      canDelete: writeActions.has('delete'),
      readOnly: !writeActions.has('update') && !writeActions.has('insert'),
    }
  }, [mode, isSystemAdmin, isGroupAdminOfSelected, isGlobalLeader, writeActions])

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
