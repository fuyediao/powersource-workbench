/**
 * Shared Admin Function shell: entry gate + optional desktop write capabilities.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ADMIN_CRM_NAV_GROUPS,
  resolveAdminModuleKey,
  type AdminModuleKey,
  type AdminNavItem,
} from '@/constants/admin-modules'
import type { DesktopWriteDomain } from '@/constants/desktop-modules'
import { resolveKanbanDesktopBoardKey } from '@/constants/desktop-modules'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { StatusLoading } from '@/components/common/status-loading'
import {
  DesktopDomainWritesProvider,
  useDesktopDomainWritesContext,
} from '@/hooks/use-desktop-domain-writes'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'
import { useSidebarMode } from '@/hooks/use-sidebar-mode'
import { useSidebarRailMenuHost } from '@/hooks/use-sidebar-rail-menu'
import { longestMatchingSidebarItemId } from '@/utils/sidebar-rail-menu'
import {
  adminActivePathStorageKey,
  readAdminActivePath,
  writeAdminActivePath,
} from '@/utils/admin-active-path'

/** Function entry key → desktop write domain for mutation gating. */
const ENTRY_WRITE_DOMAIN: Record<
  | 'desktop_admin'
  | 'desktop_orders'
  | 'desktop_products'
  | 'desktop_nexdot'
  | 'desktop_te_admin'
  | 'desktop_kanban',
  DesktopWriteDomain
> = {
  desktop_admin: 'admin',
  desktop_orders: 'orders',
  desktop_products: 'products',
  desktop_nexdot: 'nexdot',
  desktop_te_admin: 'te',
  // Kanban reuses Admin CRM write grants (e.g. opportunities); sales_board is read-only.
  desktop_kanban: 'admin',
}

const DEFAULT_ADMIN_SIDEBAR_MODE_KEY = 'workbench-electron-admin-sidebar-mode'
const DEFAULT_ADMIN_TITLE_KEY = 'admin.sidebar.title'

/** Active pane write flags passed to content renderers. */
export interface AdminShellWrites {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  readOnly: boolean
}

interface AdminShellProps {
  userId: string
  /** Desktop Function entry key that gates this entire app (sidebar all-or-nothing). */
  entryKey: keyof typeof ENTRY_WRITE_DOMAIN
  /** Optional initial path when the page mounts (e.g. `/admin/customers`). */
  initialPath?: string | null
  /** Sidebar nav groups for this Function app (defaults to CRM-only Admin). */
  navGroups?: AdminNavItem[][]
  /** localStorage key for sidebar expand/collapse/hover mode. */
  storageKey?: string
  /** i18n key for the sidebar aria-label / app title. */
  titleKey?: string
  /**
   * Renders the main pane for the active nav item.
   * @param active - Selected path, module key, write flags, and path navigation.
   */
  children?: (active: {
    path: string | null
    moduleKey: AdminModuleKey | null
    writes: AdminShellWrites | null
    /** Navigates the shell to a Function path (list or nested form routes). */
    navigate: (path: string) => void
  }) => ReactNode
}

/**
 * Shell chrome that always runs under {@link DesktopDomainWritesProvider}.
 * @param props - Shell props.
 * @returns Shell UI.
 */
function AdminShellContent({
  entryKey,
  initialPath = null,
  navGroups = ADMIN_CRM_NAV_GROUPS,
  storageKey = DEFAULT_ADMIN_SIDEBAR_MODE_KEY,
  titleKey = DEFAULT_ADMIN_TITLE_KEY,
  children,
  userId,
}: AdminShellProps) {
  const { t } = useTranslation()
  const access = useDesktopModuleAccess(userId)
  const writes = useDesktopDomainWritesContext()
  const sidebar = useSidebarMode({
    storageKey,
    defaultMode: 'hover',
  })
  const pathCacheKey = adminActivePathStorageKey(storageKey)
  const [activePath, setActivePath] = useState<string | null>(
    () => initialPath ?? readAdminActivePath(pathCacheKey),
  )

  useEffect(() => {
    if (initialPath) {
      setActivePath(initialPath)
    }
  }, [initialPath])

  const functionAllowed =
    access.hasUnrestrictedAccess || (access.isLoaded && access.isEntryAllowed(entryKey))

  /**
   * Desktop Function entry gates the app. Kanban additionally filters sidebar
   * rows by `desktop_kanban_*` board keys (map-layer pattern). Other Function
   * apps stay all-or-nothing once the entry is open.
   */
  const visibleNavGroups = useMemo((): AdminNavItem[][] => {
    if (!access.isLoaded) {
      return []
    }
    if (!functionAllowed) {
      return []
    }
    if (entryKey !== 'desktop_kanban' || access.hasUnrestrictedAccess) {
      return navGroups
    }
    return navGroups
      .map((group) =>
        group.filter((item) => {
          const boardKey = resolveKanbanDesktopBoardKey(item.path)
          return boardKey !== null && access.isEntryAllowed(boardKey)
        }),
      )
      .filter((group) => group.length > 0)
  }, [
    access.hasUnrestrictedAccess,
    access.isEntryAllowed,
    access.isLoaded,
    entryKey,
    functionAllowed,
    navGroups,
  ])

  const railItems = useMemo(
    () =>
      visibleNavGroups.flatMap((group, groupIndex) =>
        group.map((item, itemIndex) => ({
          id: item.path,
          label: t(item.labelKey),
          separatorBefore: groupIndex > 0 && itemIndex === 0,
        })),
      ),
    [t, visibleNavGroups],
  )
  const railSelectedId = longestMatchingSidebarItemId(railItems, activePath)
  const onSelectRailItem = useCallback((id: string) => {
    setActivePath(id)
  }, [])
  useSidebarRailMenuHost({
    mode: sidebar.mode,
    setMode: sidebar.setMode,
    items: railItems,
    selectedId: railSelectedId,
    onSelectItem: onSelectRailItem,
  })

  const firstAllowedItem = useMemo((): AdminNavItem | null => {
    for (const group of visibleNavGroups) {
      const first = group[0]
      if (first) {
        return first
      }
    }
    return null
  }, [visibleNavGroups])

  const activeModule = useMemo((): AdminModuleKey | null => {
    if (!activePath) {
      return null
    }
    return resolveAdminModuleKey(activePath)
  }, [activePath])

  const activeWrites = useMemo((): AdminShellWrites | null => {
    if (!activeModule) {
      return null
    }
    const resource = writes.resourceForModule(activeModule)
    if (!resource) {
      return null
    }
    return writes.capabilitiesFor(resource)
  }, [activeModule, writes])

  useEffect(() => {
    if (activePath) {
      writeAdminActivePath(activePath, pathCacheKey)
    }
  }, [activePath, pathCacheKey])

  useEffect(() => {
    if (!access.isLoaded) {
      return
    }
    if (!functionAllowed) {
      setActivePath(null)
      return
    }
    if (activePath === null && firstAllowedItem) {
      setActivePath(firstAllowedItem.path)
      return
    }
    if (activePath) {
      // Allow nested routes under a visible nav item (e.g. /admin/customers/new).
      const pathOnly =
        (activePath.split('#')[0] ?? activePath).split('?')[0] ?? activePath
      const stillVisible = visibleNavGroups.some((group) =>
        group.some(
          (item) =>
            item.path === pathOnly || pathOnly.startsWith(`${item.path}/`),
        ),
      )
      if (!stillVisible) {
        setActivePath(firstAllowedItem?.path ?? null)
      }
    }
  }, [
    access.isLoaded,
    activePath,
    firstAllowedItem,
    functionAllowed,
    visibleNavGroups,
  ])

  const showEmptyAccess =
    access.isLoaded &&
    (!functionAllowed || (entryKey === 'desktop_kanban' && visibleNavGroups.length === 0))
  const isBootstrapping = !access.isLoaded || writes.isLoading

  return (
    <div className="admin-page feature-page relative flex h-dvh max-h-dvh min-h-0 overflow-hidden text-ink">
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="relative z-10 shrink-0" style={{ width: sidebar.reservedPx }}>
          {sidebar.mode === 'hidden' ? null : (
          <AdminSidebar
            groups={visibleNavGroups}
            titleKey={titleKey}
            activePath={activePath}
            expanded={sidebar.expanded}
            mode={sidebar.mode}
            onSelectPath={setActivePath}
            onSetMode={sidebar.setMode}
            onPointerEnter={sidebar.onPointerEnter}
            onPointerLeave={sidebar.onPointerLeave}
            onFocusIn={sidebar.onFocusIn}
            onFocusOut={sidebar.onFocusOut}
          />
          )}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5">
          <div className="glass-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
            <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {isBootstrapping ? (
                <StatusLoading />
              ) : showEmptyAccess ? (
                <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                  <h2 className="text-lg font-bold text-ink">
                    {t('admin.moduleAccess.noModulesTitle')}
                  </h2>
                  <p className="text-sm font-medium text-muted">
                    {t('admin.moduleAccess.noModulesDescription')}
                  </p>
                </div>
              ) : children ? (
                children({
                  path: activePath,
                  moduleKey: activeModule,
                  writes: activeWrites,
                  navigate: setActivePath,
                })
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                  {activeWrites?.readOnly || writes.isGlobalLeaderReadOnly ? (
                    <p className="text-sm font-semibold text-muted">
                      {t('admin.moduleAccess.readOnly', {
                        defaultValue:
                          'Read-only — you do not have write access for this module.',
                      })}
                    </p>
                  ) : null}
                  <p className="text-sm font-medium text-muted">
                    {t('admin.content.comingSoon')}
                  </p>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Shared Admin layout used by CRM Admin and Orders / Products / NEXDOT / T&E
 * Function apps: same sidebar chrome; only nav, title, and mode storage differ.
 * Visibility is gated by the desktop Function entry key. Kanban also filters
 * each sidebar board via `desktop_kanban_*` (same pattern as map layers).
 * Write capabilities come from `group_desktop_writes_*` for the Function domain.
 * Last selected sidebar path is cached in sessionStorage (survives reload).
 * @param props - Signed-in user, desktop entry key, optional nav subset, and content renderer.
 * @returns Shell UI.
 */
export function AdminShell(props: AdminShellProps) {
  const domain = ENTRY_WRITE_DOMAIN[props.entryKey]
  return (
    <DesktopDomainWritesProvider userId={props.userId} domain={domain}>
      <AdminShellContent {...props} />
    </DesktopDomainWritesProvider>
  )
}
