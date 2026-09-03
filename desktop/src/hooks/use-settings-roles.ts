import { useCallback, useEffect, useMemo, useState } from 'react'
import type { UserRole } from '@/types/crm-settings'
import { SECTION_ORDER, type SettingsSection } from '@/components/settings/settings-types'
import {
  fetchCurrentGroup,
  fetchGroupMembers,
  fetchUserRole,
  isSystemAdminRole,
  type GroupMemberRecord,
  type GroupRecord,
} from '@/services/groups-api'

export interface SettingsRolesState {
  visibleSections: SettingsSection[]
  userRole: UserRole | null
  isSystemAdmin: boolean
  isSuperAdmin: boolean
  isGroupAdmin: boolean
  isRegularUser: boolean
  currentGroup: GroupRecord | null
  groupMembers: GroupMemberRecord[]
  isRoleLoading: boolean
  refresh: () => Promise<void>
}

/**
 * Loads RBAC + current group and computes Settings nav visibility (web parity).
 * @param userId - Signed-in user id, or null when signed out.
 * @returns Role flags and visible section ids.
 */
export function useSettingsRoles(userId: string | null | undefined): SettingsRolesState {
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [currentGroup, setCurrentGroup] = useState<GroupRecord | null>(null)
  const [groupMembers, setGroupMembers] = useState<GroupMemberRecord[]>([])
  const [isRoleLoading, setIsRoleLoading] = useState(Boolean(userId))

  const refresh = useCallback(async () => {
    if (!userId) {
      setUserRole(null)
      setCurrentGroup(null)
      setGroupMembers([])
      setIsRoleLoading(false)
      return
    }
    setIsRoleLoading(true)
    try {
      const role = await fetchUserRole(userId)
      setUserRole(role)
      const group = await fetchCurrentGroup(userId)
      setCurrentGroup(group)
      if (group) {
        const members = await fetchGroupMembers(group.id, group.groupAdminId)
        setGroupMembers(members)
      } else {
        setGroupMembers([])
      }
    } finally {
      setIsRoleLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isSystemAdmin = isSystemAdminRole(userRole)
  const isSuperAdmin = userRole === 'super_admin'
  const isGroupAdmin = userRole === 'group_admin'
  const isRegularUser = userRole === 'user' || userRole === null

  const visibleSections = useMemo(() => {
    const show: Record<SettingsSection, boolean> = {
      profile: true,
      preferences: true,
      oaErp: true,
      ai: true,
      mcp: true,
      privacy: true,
      theme: true,
      page: true,
      widgets: true,
      background: true,
      aura: true,
      clash: true,
      feedback: true,
      openSource: true,
      groupManagement: isSystemAdmin,
      userManagement: isSystemAdmin,
      globalLeaders: isSystemAdmin,
      desktopAccess: isSystemAdmin,
      groupAdmin: isGroupAdmin,
      desktopWrites: isGroupAdmin,
      groupInfo: isRegularUser && currentGroup !== null,
    }
    return SECTION_ORDER.filter((id) => show[id])
  }, [isSystemAdmin, isGroupAdmin, isRegularUser, currentGroup])

  return {
    visibleSections,
    userRole,
    isSystemAdmin,
    isSuperAdmin,
    isGroupAdmin,
    isRegularUser,
    currentGroup,
    groupMembers,
    isRoleLoading,
    refresh,
  }
}
