/**
 * Runtime desktop write capabilities for Admin Function apps
 * (CRM / Orders / Products / NEXDOT / T&E).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { AdminModuleKey, ModuleWriteAction } from '@/constants/admin-modules'
import {
  DESKTOP_WRITE_RESOURCES,
  DESKTOP_WRITE_TABLE,
  type DesktopWriteDomain,
} from '@/constants/desktop-modules'
import {
  fetchCurrentGroup,
  fetchUserRole,
  isSystemAdminRole,
} from '@/services/groups-api'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Write capability flags for one resource. */
export interface DesktopResourceCapabilities {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  readOnly: boolean
}

/** Context value for a Function app's write domain. */
export interface DesktopDomainWritesValue {
  domain: DesktopWriteDomain
  groupId: string | null
  isLoading: boolean
  isSystemAdmin: boolean
  isGroupAdmin: boolean
  isGlobalLeaderReadOnly: boolean
  /**
   * Whether the user may perform an action on a desktop resource key.
   * @param resourceKey - Domain resource (e.g. `customers`).
   * @param action - Insert / update / delete.
   */
  canWrite: (resourceKey: string, action: ModuleWriteAction) => boolean
  /**
   * Capability bag for a resource.
   * @param resourceKey - Domain resource.
   */
  capabilitiesFor: (resourceKey: string) => DesktopResourceCapabilities
  /**
   * Map a website Admin module key to the desktop resource for this domain.
   * @param moduleKey - Sidebar / web module key.
   * @returns Resource key, or null when not in this domain.
   */
  resourceForModule: (moduleKey: AdminModuleKey | null) => string | null
  refresh: () => Promise<void>
}

const DesktopDomainWritesContext = createContext<DesktopDomainWritesValue | null>(null)

/** Website Admin module key → desktop (domain, resource). */
const ADMIN_MODULE_TO_DESKTOP: Partial<
  Record<AdminModuleKey, { domain: DesktopWriteDomain; resource: string }>
> = {
  customers: { domain: 'admin', resource: 'customers' },
  contacts: { domain: 'admin', resource: 'contacts' },
  leads: { domain: 'admin', resource: 'leads' },
  visit_log: { domain: 'admin', resource: 'visit_log' },
  opportunities: { domain: 'admin', resource: 'opportunities' },
  follow_ups: { domain: 'admin', resource: 'follow_ups' },
  kol: { domain: 'admin', resource: 'kol' },
  agent: { domain: 'admin', resource: 'agent' },
  competitor_map: { domain: 'admin', resource: 'competitors' },
  orders_crm: { domain: 'orders', resource: 'crm' },
  orders_obm: { domain: 'orders', resource: 'nexdot' },
  orders_te: { domain: 'orders', resource: 'te' },
  product_catalog: { domain: 'products', resource: 'catalog' },
  obm_products: { domain: 'products', resource: 'nexdot' },
  te_products: { domain: 'products', resource: 'te' },
  obm: { domain: 'nexdot', resource: 'management' },
  obm_users: { domain: 'nexdot', resource: 'users' },
  te: { domain: 'te', resource: 'applications' },
  te_users: { domain: 'te', resource: 'users' },
  te_community: { domain: 'te', resource: 'community' },
  media: { domain: 'te', resource: 'media' },
}

/**
 * Resolve the desktop resource for a module within a domain.
 * @param domain - Active Function write domain.
 * @param moduleKey - Admin module key.
 * @returns Resource key or null.
 */
export function desktopResourceForAdminModule(
  domain: DesktopWriteDomain,
  moduleKey: AdminModuleKey | null,
): string | null {
  if (!moduleKey) {
    return null
  }
  const mapped = ADMIN_MODULE_TO_DESKTOP[moduleKey]
  if (!mapped || mapped.domain !== domain) {
    return null
  }
  return mapped.resource
}

/**
 * Loads desktop write grants for one domain for the caller's current group.
 * @param userId - Auth user id.
 * @param domain - Write domain tied to the open Function app.
 * @returns Domain writes state.
 */
export function useDesktopDomainWrites(
  userId: string | null | undefined,
  domain: DesktopWriteDomain,
): DesktopDomainWritesValue {
  const [groupId, setGroupId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(userId))
  const [isSystemAdmin, setIsSystemAdmin] = useState(false)
  const [isGroupAdmin, setIsGroupAdmin] = useState(false)
  const [isGlobalLeaderReadOnly, setIsGlobalLeaderReadOnly] = useState(false)
  const [grantsByResource, setGrantsByResource] = useState<
    Map<string, Set<ModuleWriteAction>>
  >(new Map())

  const refresh = useCallback(async () => {
    if (!userId || !isSupabaseConfigured || !supabase) {
      setGroupId(null)
      setIsSystemAdmin(false)
      setIsGroupAdmin(false)
      setIsGlobalLeaderReadOnly(false)
      setGrantsByResource(new Map())
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const role = await fetchUserRole(userId)
      const systemAdmin = isSystemAdminRole(role)
      setIsSystemAdmin(systemAdmin)

      const group = await fetchCurrentGroup(userId)
      const nextGroupId = group?.id ?? null
      setGroupId(nextGroupId)

      const adminOfGroup =
        Boolean(group?.groupAdminId && group.groupAdminId === userId) ||
        (nextGroupId
          ? await (async () => {
              const { data } = await supabase
                .from('group_members')
                .select('is_group_admin')
                .eq('group_id', nextGroupId)
                .eq('user_id', userId)
                .eq('is_active', true)
                .maybeSingle()
              return Boolean(data?.is_group_admin)
            })()
          : false)
      setIsGroupAdmin(adminOfGroup)

      let leaderReadOnly = false
      if (!systemAdmin && !adminOfGroup && nextGroupId) {
        const { data: leaderRow } = await supabase
          .from('global_leaders')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle()
        leaderReadOnly = Boolean(leaderRow)
      }
      setIsGlobalLeaderReadOnly(leaderReadOnly)

      if (systemAdmin || adminOfGroup) {
        const full = new Map<string, Set<ModuleWriteAction>>()
        for (const resource of DESKTOP_WRITE_RESOURCES[domain]) {
          full.set(resource, new Set(['insert', 'update', 'delete']))
        }
        setGrantsByResource(full)
        return
      }

      if (!nextGroupId || leaderReadOnly) {
        setGrantsByResource(new Map())
        return
      }

      const table = DESKTOP_WRITE_TABLE[domain] as 'group_desktop_writes_admin'
      const { data, error } = await supabase
        .from(table)
        .select('resource_key, action')
        .eq('group_id', nextGroupId)
        .eq('user_id', userId)
      if (error) {
        throw error
      }
      const next = new Map<string, Set<ModuleWriteAction>>()
      for (const row of data ?? []) {
        const resource = row.resource_key as string
        const action = row.action as string
        if (action !== 'insert' && action !== 'update' && action !== 'delete') {
          continue
        }
        let set = next.get(resource)
        if (!set) {
          set = new Set()
          next.set(resource, set)
        }
        set.add(action)
      }
      setGrantsByResource(next)
    } catch (err) {
      console.error('[use-desktop-domain-writes] refresh:', err)
      setGrantsByResource(new Map())
    } finally {
      setIsLoading(false)
    }
  }, [domain, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const canWrite = useCallback(
    (resourceKey: string, action: ModuleWriteAction): boolean => {
      if (isSystemAdmin || isGroupAdmin) {
        return true
      }
      if (isGlobalLeaderReadOnly) {
        return false
      }
      return grantsByResource.get(resourceKey)?.has(action) ?? false
    },
    [grantsByResource, isGlobalLeaderReadOnly, isGroupAdmin, isSystemAdmin],
  )

  const capabilitiesFor = useCallback(
    (resourceKey: string): DesktopResourceCapabilities => {
      const canCreate = canWrite(resourceKey, 'insert')
      const canEdit = canWrite(resourceKey, 'update')
      const canDelete = canWrite(resourceKey, 'delete')
      return {
        canCreate,
        canEdit,
        canDelete,
        readOnly: !canEdit && !canCreate && !canDelete,
      }
    },
    [canWrite],
  )

  const resourceForModule = useCallback(
    (moduleKey: AdminModuleKey | null): string | null =>
      desktopResourceForAdminModule(domain, moduleKey),
    [domain],
  )

  return useMemo(
    (): DesktopDomainWritesValue => ({
      domain,
      groupId,
      isLoading,
      isSystemAdmin,
      isGroupAdmin,
      isGlobalLeaderReadOnly,
      canWrite,
      capabilitiesFor,
      resourceForModule,
      refresh,
    }),
    [
      canWrite,
      capabilitiesFor,
      domain,
      groupId,
      isGlobalLeaderReadOnly,
      isGroupAdmin,
      isLoading,
      isSystemAdmin,
      refresh,
      resourceForModule,
    ],
  )
}

interface DesktopDomainWritesProviderProps {
  userId: string
  domain: DesktopWriteDomain
  children: ReactNode
}

/**
 * Provides desktop domain write capabilities to Admin Function shells.
 * @param props - User, domain, and children.
 * @returns Provider element.
 */
export function DesktopDomainWritesProvider({
  userId,
  domain,
  children,
}: DesktopDomainWritesProviderProps): ReactElement {
  const value = useDesktopDomainWrites(userId, domain)
  return (
    <DesktopDomainWritesContext.Provider value={value}>
      {children}
    </DesktopDomainWritesContext.Provider>
  )
}

/**
 * Reads the nearest desktop domain writes context.
 * @returns Context value.
 * @throws When used outside {@link DesktopDomainWritesProvider}.
 */
export function useDesktopDomainWritesContext(): DesktopDomainWritesValue {
  const value = useContext(DesktopDomainWritesContext)
  if (!value) {
    throw new Error('useDesktopDomainWritesContext requires DesktopDomainWritesProvider')
  }
  return value
}
