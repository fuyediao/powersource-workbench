/**
 * Team Function scope: current group, role flags, and desktop Team write
 * grants (`group_desktop_writes_team`, resource `boards`).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchDesktopResourceWriteActions } from '@/services/group-desktop-writes-api'
import {
  fetchCurrentGroup,
  fetchUserRole,
  isSystemAdminRole,
  type GroupRecord,
} from '@/services/groups-api'
import type { ModuleWriteAction } from '@/constants/admin-modules'
import type { UserRole } from '@/types/crm-settings'

const TEAM_WRITE_RESOURCE = 'boards'

export interface TeamScopeState {
  userRole: UserRole | null
  isSystemAdmin: boolean
  isGroupAdmin: boolean
  currentGroup: GroupRecord | null
  /** True while role/group is still resolving. */
  isLoading: boolean
  /**
   * Can manage BSC / Retro / group PBC / manager eval when the member has
   * any desktop Team write action (insert / update / delete).
   */
  canManageTeam: boolean
  refresh: () => Promise<void>
}

/**
 * Loads RBAC + current workspace group and whether the user can edit Team boards.
 * @param userId - Signed-in user id.
 * @returns Scope flags for TeamPage.
 */
export function useTeamScope(userId: string): TeamScopeState {
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [currentGroup, setCurrentGroup] = useState<GroupRecord | null>(null)
  const [writeActions, setWriteActions] = useState<Set<ModuleWriteAction>>(
    () => new Set(),
  )
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      setUserRole(null)
      setCurrentGroup(null)
      setWriteActions(new Set())
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const role = await fetchUserRole(userId)
      setUserRole(role)
      const systemAdmin = isSystemAdminRole(role)
      const groupAdmin = role === 'group_admin'
      const group = await fetchCurrentGroup(userId)
      setCurrentGroup(group)

      if (systemAdmin || groupAdmin || !group) {
        setWriteActions(new Set())
      } else {
        const actions = await fetchDesktopResourceWriteActions(
          group.id,
          userId,
          'team',
          TEAM_WRITE_RESOURCE,
        )
        setWriteActions(actions)
      }
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isSystemAdmin = isSystemAdminRole(userRole)
  const isGroupAdmin = userRole === 'group_admin'

  const canManageTeam = useMemo(() => {
    if (isSystemAdmin || isGroupAdmin) return true
    return (
      writeActions.has('insert') ||
      writeActions.has('update') ||
      writeActions.has('delete')
    )
  }, [isGroupAdmin, isSystemAdmin, writeActions])

  return {
    userRole,
    isSystemAdmin,
    isGroupAdmin,
    currentGroup,
    isLoading,
    canManageTeam,
    refresh,
  }
}
