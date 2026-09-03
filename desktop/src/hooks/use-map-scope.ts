/**
 * Map sidebar scope: explore vs CRM layers, and system-admin group switcher.
 * Layer visibility uses desktop map keys (`desktop_map_*`), not web modules.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MAP_SOURCE_TO_DESKTOP_LAYER } from '@/constants/desktop-modules'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'
import {
  fetchCurrentGroup,
  fetchUserRole,
  isSystemAdminRole,
  type GroupRecord,
} from '@/services/groups-api'
import { getGroupAdmins } from '@/services/group-management-api'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Map sidebar data source (menubar “Map” menu). */
export type MapSidebarSource = 'map' | 'customer_map' | 'crm_map' | 'competitor_map'

/** CRM sources gated by desktop layer keys (favorites uses explore `map` + layer). */
const CRM_MAP_SOURCES: readonly Exclude<MapSidebarSource, 'map'>[] = [
  'customer_map',
  'crm_map',
  'competitor_map',
]

export interface UseMapScopeReturn {
  /** Active sidebar source; defaults to explore map. */
  source: MapSidebarSource
  setSource: (source: MapSidebarSource) => void
  /** Sources the current user may pick (map always when entry open; CRM via layers). */
  availableSources: MapSidebarSource[]
  /** True when favorites / custom pins layer is allowed. */
  favoritesLayerAllowed: boolean
  /** True for system_admin / super_admin — show Group menu. */
  canSwitchGroups: boolean
  /** Groups for the admin switcher. */
  switchableGroups: GroupRecord[]
  /** Selected group id; `null` means all groups (admin only). */
  selectedGroupId: string | null
  setSelectedGroupId: (groupId: string | null) => void
  /** Membership group for non-admins (hidden Group menu). */
  membershipGroup: GroupRecord | null
  isLoading: boolean
  refresh: () => Promise<void>
}

/**
 * Loads Map menubar scope (source + optional group switcher).
 * Group menu is hidden for ordinary group members.
 * @param userId - Auth user id.
 * @returns Scope state for the Map sidebar menubar.
 */
export function useMapScope(userId: string | null | undefined): UseMapScopeReturn {
  const access = useDesktopModuleAccess(userId)
  const [source, setSourceState] = useState<MapSidebarSource>('map')
  const [canSwitchGroups, setCanSwitchGroups] = useState(false)
  const [switchableGroups, setSwitchableGroups] = useState<GroupRecord[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [membershipGroup, setMembershipGroup] = useState<GroupRecord | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(userId))

  const mapEntryAllowed = access.isEntryAllowed('desktop_map')

  const favoritesLayerAllowed =
    access.hasUnrestrictedAccess || access.isEntryAllowed('desktop_map_favorites')

  const availableSources = useMemo((): MapSidebarSource[] => {
    if (!access.isLoaded || !mapEntryAllowed) {
      return []
    }
    const sources: MapSidebarSource[] = ['map']
    for (const key of CRM_MAP_SOURCES) {
      const layerKey = MAP_SOURCE_TO_DESKTOP_LAYER[key]
      if (access.isEntryAllowed(layerKey)) {
        sources.push(key)
      }
    }
    return sources
  }, [access, mapEntryAllowed])

  /**
   * Sets the map source when it is allowed for the user.
   * @param next - Requested source.
   */
  const setSource = useCallback(
    (next: MapSidebarSource) => {
      if (next === 'map' || availableSources.includes(next)) {
        setSourceState(next)
      }
    },
    [availableSources],
  )

  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setCanSwitchGroups(false)
      setSwitchableGroups([])
      setSelectedGroupId(null)
      setMembershipGroup(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const role = await fetchUserRole(userId)
      const systemAdmin = isSystemAdminRole(role)
      setCanSwitchGroups(systemAdmin)
      const group = await fetchCurrentGroup(userId)
      setMembershipGroup(group)

      if (!systemAdmin) {
        setSwitchableGroups(group ? [group] : [])
        setSelectedGroupId(group?.id ?? null)
        return
      }

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
      const groups = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
      setSwitchableGroups(groups)
      setSelectedGroupId((prev) => {
        if (prev === null) {
          return null
        }
        if (prev && groups.some((g) => g.id === prev)) {
          return prev
        }
        return null
      })
    } catch (err) {
      console.error('[use-map-scope] refresh:', err)
      setCanSwitchGroups(false)
      setSwitchableGroups([])
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (availableSources.length === 0) {
      return
    }
    if (!availableSources.includes(source)) {
      setSourceState(availableSources[0] ?? 'map')
    }
  }, [availableSources, source])

  return {
    source,
    setSource,
    availableSources,
    favoritesLayerAllowed,
    canSwitchGroups,
    switchableGroups,
    selectedGroupId,
    setSelectedGroupId,
    membershipGroup,
    isLoading: isLoading || !access.isLoaded,
    refresh,
  }
}
