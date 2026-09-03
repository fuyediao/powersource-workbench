/**
 * Runtime desktop entry access (Home tiles, Go menu, Feature deep links).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FeatureTabId } from '@/constants/feature-tabs'
import {
  DESKTOP_MODULE_KEYS,
  FEATURE_TO_DESKTOP_ENTRY,
  FUNCTION_APP_TO_DESKTOP_ENTRY,
  GO_MENU_TO_DESKTOP_ENTRY,
  type DesktopFunctionKey,
  type DesktopModuleKey,
} from '@/constants/desktop-modules'
import { fetchDesktopModuleAccessForGroup } from '@/services/group-desktop-module-access-api'
import { fetchGlobalLeaderDesktopModuleAccess } from '@/services/global-leader-desktop-access-api'
import {
  fetchCurrentGroup,
  fetchUserRole,
  isSystemAdminRole,
} from '@/services/groups-api'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export interface UseDesktopModuleAccessReturn {
  /** True after the first probe finishes. */
  isLoaded: boolean
  /** System admin / super_admin — all entry keys allowed. */
  hasUnrestrictedAccess: boolean
  /** Current membership group id when known. */
  groupId: string | null
  /** Whether the given desktop entry key is allowed. */
  isEntryAllowed: (key: DesktopModuleKey) => boolean
  /** Whether a Home Function app tile may appear. */
  isFunctionAppAllowed: (appId: string) => boolean
  /** Whether a feature tab / deep link may open content. */
  isFeatureAllowed: (feature: FeatureTabId) => boolean
  /** Whether a Go-menu feature id may appear. */
  isGoFeatureAllowed: (featureId: string) => boolean
  /** Allowed Go-menu feature ids (excludes home/settings). */
  allowedGoFeatures: string[]
  /** Re-fetch role and whitelist. */
  refresh: () => Promise<void>
}

type DesktopAccessSnapshot = {
  userId: string
  hasUnrestrictedAccess: boolean
  groupId: string | null
  whitelist: ReadonlySet<DesktopModuleKey>
}

let accessSnapshot: DesktopAccessSnapshot | null = null
let accessInflight: { userId: string; promise: Promise<DesktopAccessSnapshot> } | null =
  null

/**
 * Reads the last successful desktop ACL snapshot for this user.
 * @param userId - Auth user id.
 * @returns Snapshot, or null.
 */
function readAccessSnapshot(userId: string): DesktopAccessSnapshot | null {
  return accessSnapshot?.userId === userId ? accessSnapshot : null
}

/**
 * Loads desktop ACL for a user, sharing in-flight work across hook instances.
 * @param userId - Auth user id.
 * @returns Access snapshot.
 */
async function loadDesktopAccessSnapshot(userId: string): Promise<DesktopAccessSnapshot> {
  if (accessInflight?.userId === userId) {
    return accessInflight.promise
  }
  const promise = (async (): Promise<DesktopAccessSnapshot> => {
    const role = await fetchUserRole(userId)
    const unrestricted = isSystemAdminRole(role)
    if (unrestricted) {
      return {
        userId,
        hasUnrestrictedAccess: true,
        groupId: null,
        whitelist: new Set(DESKTOP_MODULE_KEYS),
      }
    }

    const group = await fetchCurrentGroup(userId)
    const nextGroupId = group?.id ?? null
    let keys = new Set<DesktopModuleKey>()
    if (nextGroupId) {
      keys = await fetchDesktopModuleAccessForGroup(nextGroupId)
    }

    if (isSupabaseConfigured && supabase) {
      const { data: leaderRow } = await supabase
        .from('global_leaders')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (leaderRow) {
        const leaderKeys = await fetchGlobalLeaderDesktopModuleAccess(userId)
        for (const key of leaderKeys) {
          keys.add(key)
        }
      }
    }

    return {
      userId,
      hasUnrestrictedAccess: false,
      groupId: nextGroupId,
      whitelist: keys,
    }
  })()
  accessInflight = { userId, promise }
  try {
    const snapshot = await promise
    accessSnapshot = snapshot
    return snapshot
  } finally {
    if (accessInflight?.promise === promise) {
      accessInflight = null
    }
  }
}

/**
 * Loads Electron Function / map-layer entry access from desktop ACL tables.
 * Fails closed until loaded; Settings is never gated by this hook.
 * Cached snapshots keep Feature pages from blocking on a second ACL round-trip.
 * @param userId - Auth user id.
 * @returns Access helpers for Home / Go / Feature pages.
 */
export function useDesktopModuleAccess(
  userId: string | null | undefined,
): UseDesktopModuleAccessReturn {
  const cached = userId ? readAccessSnapshot(userId) : null
  const [isLoaded, setIsLoaded] = useState(() => !userId || cached !== null)
  const [hasUnrestrictedAccess, setHasUnrestrictedAccess] = useState(
    () => cached?.hasUnrestrictedAccess ?? false,
  )
  const [groupId, setGroupId] = useState<string | null>(() => cached?.groupId ?? null)
  const [whitelist, setWhitelist] = useState<Set<DesktopModuleKey>>(
    () => new Set(cached?.whitelist ?? []),
  )

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) {
      accessSnapshot = null
      accessInflight = null
      setHasUnrestrictedAccess(false)
      setGroupId(null)
      setWhitelist(new Set())
      setIsLoaded(true)
      return
    }
    const hadCache = readAccessSnapshot(userId) !== null
    if (!hadCache) {
      setIsLoaded(false)
    }
    try {
      const snapshot = await loadDesktopAccessSnapshot(userId)
      setHasUnrestrictedAccess(snapshot.hasUnrestrictedAccess)
      setGroupId(snapshot.groupId)
      setWhitelist(new Set(snapshot.whitelist))
    } catch (err) {
      console.error('[use-desktop-module-access] refresh:', err)
      if (!hadCache) {
        setHasUnrestrictedAccess(false)
        setWhitelist(new Set())
      }
    } finally {
      setIsLoaded(true)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isEntryAllowed = useCallback(
    (key: DesktopModuleKey): boolean => {
      if (hasUnrestrictedAccess) {
        return true
      }
      return whitelist.has(key)
    },
    [hasUnrestrictedAccess, whitelist],
  )

  const isFunctionAppAllowed = useCallback(
    (appId: string): boolean => {
      if (appId === 'function-settings') {
        return true
      }
      const entry = FUNCTION_APP_TO_DESKTOP_ENTRY[appId]
      if (!entry) {
        return true
      }
      return isEntryAllowed(entry)
    },
    [isEntryAllowed],
  )

  const isFeatureAllowed = useCallback(
    (feature: FeatureTabId): boolean => {
      const entry = FEATURE_TO_DESKTOP_ENTRY[feature]
      return isEntryAllowed(entry)
    },
    [isEntryAllowed],
  )

  const isGoFeatureAllowed = useCallback(
    (featureId: string): boolean => {
      const entry = GO_MENU_TO_DESKTOP_ENTRY[featureId]
      if (!entry) {
        return true
      }
      return isEntryAllowed(entry)
    },
    [isEntryAllowed],
  )

  const allowedGoFeatures = useMemo((): string[] => {
    return Object.keys(GO_MENU_TO_DESKTOP_ENTRY).filter((id) =>
      isGoFeatureAllowed(id),
    )
  }, [isGoFeatureAllowed])

  return {
    isLoaded,
    hasUnrestrictedAccess,
    groupId,
    isEntryAllowed,
    isFunctionAppAllowed,
    isFeatureAllowed,
    isGoFeatureAllowed,
    allowedGoFeatures,
    refresh,
  }
}

/**
 * Resolve whether a Function entry key is granted (non-hook helper for tests).
 * @param keys - Allowed keys.
 * @param entry - Function entry key.
 * @returns True when allowed.
 */
export function hasDesktopFunctionEntry(
  keys: ReadonlySet<DesktopModuleKey>,
  entry: DesktopFunctionKey,
): boolean {
  return keys.has(entry)
}
