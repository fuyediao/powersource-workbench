/**
 * Runtime desktop entry access. Permission gates are removed; remaining
 * Function tiles and feature tabs are always allowed.
 */

import { useCallback, useMemo } from 'react'
import type { FeatureTabId } from '@/constants/feature-tabs'
import {
  GO_MENU_TO_DESKTOP_ENTRY,
  type DesktopFunctionKey,
  type DesktopModuleKey,
} from '@/constants/desktop-modules'

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

/**
 * Returns unrestricted desktop Function access. Settings is never gated.
 * @param _userId - Auth user id (unused; kept for call-site compatibility).
 * @returns Access helpers for Home / Go / Feature pages.
 */
export function useDesktopModuleAccess(
  _userId: string | null | undefined,
): UseDesktopModuleAccessReturn {
  const isEntryAllowed = useCallback((_key: DesktopModuleKey): boolean => true, [])

  const isFunctionAppAllowed = useCallback((_appId: string): boolean => true, [])

  const isFeatureAllowed = useCallback((_feature: FeatureTabId): boolean => true, [])

  const isGoFeatureAllowed = useCallback((featureId: string): boolean => {
    return featureId in GO_MENU_TO_DESKTOP_ENTRY || featureId === 'home' || featureId === 'settings'
  }, [])

  const allowedGoFeatures = useMemo((): string[] => {
    return Object.keys(GO_MENU_TO_DESKTOP_ENTRY)
  }, [])

  const refresh = useCallback(async (): Promise<void> => undefined, [])

  return {
    isLoaded: true,
    hasUnrestrictedAccess: true,
    groupId: null,
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
 * @param _keys - Allowed keys.
 * @param _entry - Function entry key.
 * @returns True when allowed.
 */
export function hasDesktopFunctionEntry(
  _keys: ReadonlySet<DesktopModuleKey>,
  _entry: DesktopFunctionKey,
): boolean {
  return true
}
