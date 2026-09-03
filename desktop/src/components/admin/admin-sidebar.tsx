import { useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminNavItem } from '@/constants/admin-modules'
import { SidebarModeControl } from '@/components/layout/sidebar-mode-control'
import {
  SIDEBAR_COLLAPSED_PX,
  SIDEBAR_EXPANDED_PX,
  type SidebarMode,
} from '@/hooks/use-sidebar-mode'
import {
  LucideBookOpenIcon,
  LucideBoxesIcon,
  LucideBriefcaseIcon,
  LucideBuilding2Icon,
  LucideCalendarCheckIcon,
  LucideCircleUserIcon,
  LucideClipboardCheckIcon,
  LucideClipboardListIcon,
  LucideHandshakeIcon,
  LucideImagesIcon,
  LucideLayersIcon,
  LucideListChecksIcon,
  LucideListIcon,
  LucideMegaphoneIcon,
  LucideMessagesSquareIcon,
  LucidePackageIcon,
  LucideStoreIcon,
  LucideTargetIcon,
  LucideTruckIcon,
  LucideUserCogIcon,
  LucideUsersIcon,
  LucideUsersRoundIcon,
  KanbanIcon,
} from '@/icons/AllIcons'

/**
 * Whether `activePath` is this nav item or a nested route under it.
 * @param itemPath - Sidebar item path (e.g. `/nexdot`).
 * @param activePath - Current admin path.
 * @returns True when the path matches exactly or is nested under `itemPath`.
 */
function pathMatchesNavItem(itemPath: string, activePath: string): boolean {
  const pathOnly = (activePath.split('#')[0] ?? activePath).split('?')[0] ?? activePath
  return pathOnly === itemPath || pathOnly.startsWith(`${itemPath}/`)
}

/**
 * Active highlight for a sidebar item. Prefers the longest matching nav path so
 * `/nexdot` does not stay lit when the route is `/nexdot/users`.
 * @param itemPath - Candidate sidebar path.
 * @param activePath - Current admin path.
 * @param allItemPaths - All visible sidebar paths in this shell.
 * @returns True when this item should show as active.
 */
function isAdminNavItemActive(
  itemPath: string,
  activePath: string | null,
  allItemPaths: string[],
): boolean {
  if (!activePath || !pathMatchesNavItem(itemPath, activePath)) {
    return false
  }
  let best = itemPath
  for (const path of allItemPaths) {
    if (pathMatchesNavItem(path, activePath) && path.length > best.length) {
      best = path
    }
  }
  return best === itemPath
}

interface AdminSidebarProps {
  groups: AdminNavItem[][]
  /** i18n key for the nav region label (e.g. Admin vs Orders). */
  titleKey?: string
  activePath: string | null
  expanded: boolean
  mode: SidebarMode
  onSelectPath: (path: string) => void
  onSetMode: (mode: SidebarMode) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocusIn: () => void
  onFocusOut: (event: {
    currentTarget: EventTarget | null
    relatedTarget: EventTarget | null
  }) => void
}

/**
 * Icon for an Admin CRM sidebar row (web AdminLayout Lucide set; unique per path).
 * @param path - Nav path.
 * @returns Icon node.
 */
function adminModuleIcon(path: string): ReactNode {
  const iconClass = 'size-[18px] shrink-0'
  switch (path) {
    case '/admin/customers':
      return <LucideUsersIcon className={iconClass} aria-hidden />
    case '/admin/contacts':
      return <LucideCircleUserIcon className={iconClass} aria-hidden />
    case '/admin/leads':
      return <LucideListChecksIcon className={iconClass} aria-hidden />
    case '/admin/visit-log':
      return <LucideClipboardListIcon className={iconClass} aria-hidden />
    case '/admin/opportunities-list':
      return <LucideListIcon className={iconClass} aria-hidden />
    case '/kanban/workbench':
      return <LucideBriefcaseIcon className={iconClass} aria-hidden />
    case '/kanban/opportunities':
      return <KanbanIcon className={iconClass} aria-hidden />
    case '/kanban/sales':
      return <LucideTargetIcon className={iconClass} aria-hidden />
    case '/admin/follow-ups':
      return <LucideCalendarCheckIcon className={iconClass} aria-hidden />
    case '/admin/kol':
      return <LucideMegaphoneIcon className={iconClass} aria-hidden />
    case '/admin/agent':
      return <LucideHandshakeIcon className={iconClass} aria-hidden />
    case '/admin/competitor-list':
      return <LucideListIcon className={iconClass} aria-hidden />
    case '/nexdot':
      return <LucideStoreIcon className={iconClass} aria-hidden />
    case '/nexdot/users':
      return <LucideUserCogIcon className={iconClass} aria-hidden />
    case '/te-admin/media':
      return <LucideImagesIcon className={iconClass} aria-hidden />
    case '/orders/crm':
      return <LucidePackageIcon className={iconClass} aria-hidden />
    case '/orders/nexdot':
      return <LucideBuilding2Icon className={iconClass} aria-hidden />
    case '/orders/te':
      return <LucideTruckIcon className={iconClass} aria-hidden />
    case '/products/catalog':
      return <LucideBookOpenIcon className={iconClass} aria-hidden />
    case '/products/nexdot':
      return <LucideBoxesIcon className={iconClass} aria-hidden />
    case '/products/te':
      return <LucideLayersIcon className={iconClass} aria-hidden />
    case '/te-admin':
      return <LucideClipboardCheckIcon className={iconClass} aria-hidden />
    case '/te-admin/users':
      return <LucideUsersRoundIcon className={iconClass} aria-hidden />
    case '/te-admin/community':
      return <LucideMessagesSquareIcon className={iconClass} aria-hidden />
    case '/te-admin/marketing':
      return <LucideTargetIcon className={iconClass} aria-hidden />
    case '/te-admin/partner-departments':
      return <LucideBuilding2Icon className={iconClass} aria-hidden />
    default:
      return <LucideListIcon className={iconClass} aria-hidden />
  }
}

/**
 * CRM Admin module rail (mail-sidebar chrome: expand / collapse / hover).
 * On macOS the footer control is hidden; mode is chosen from the native
 * application menu instead.
 * @param props - Filtered nav groups and mode handlers.
 * @returns Sidebar.
 */
export function AdminSidebar({
  groups,
  titleKey = 'admin.sidebar.title',
  activePath,
  expanded,
  mode,
  onSelectPath,
  onSetMode,
  onPointerEnter,
  onPointerLeave,
  onFocusIn,
  onFocusOut,
}: AdminSidebarProps) {
  const { t } = useTranslation()
  const nativeApplicationMenu = Boolean(window.workbench?.window?.usesNativeApplicationMenu)
  const asideRef = useRef<HTMLElement>(null)
  const allItemPaths = useMemo(
    () => groups.flatMap((group) => group.map((item) => item.path)),
    [groups],
  )
  const hoverOverlay = mode === 'hover'

  return (
    <aside
      ref={asideRef}
      className={[
        'glass-panel flex h-full min-h-0 flex-col border-y-0 border-l-0 transition-[width,box-shadow] duration-300 ease-out',
        hoverOverlay ? 'absolute inset-y-0 left-0 z-20' : 'w-full',
        hoverOverlay && expanded ? 'shadow-xl shadow-black/20' : '',
      ].join(' ')}
      style={
        hoverOverlay
          ? { width: expanded ? SIDEBAR_EXPANDED_PX : SIDEBAR_COLLAPSED_PX }
          : undefined
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={(event) => {
        onPointerLeave()
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
          return
        }
        const root = asideRef.current
        const active = document.activeElement
        if (root && active instanceof HTMLElement && root.contains(active)) {
          active.blur()
        }
      }}
      onFocusCapture={onFocusIn}
      onBlurCapture={(event) =>
        onFocusOut({
          currentTarget: asideRef.current,
          relatedTarget: event.relatedTarget,
        })
      }
    >
      <nav
        className={[
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          expanded ? 'px-1.5 pr-2.5' : 'px-1.5',
        ].join(' ')}
        aria-label={t(titleKey)}
      >
        {groups.map((group, groupIndex) => (
          <div key={`group-${groupIndex}`}>
            {groupIndex > 0 ? (
              <div className="mx-1 my-1 h-px shrink-0 bg-ink/10" role="separator" />
            ) : null}
            {group.map((item) => {
              const active = isAdminNavItemActive(item.path, activePath, allItemPaths)
              const label = t(item.labelKey)
              return (
                <button
                  key={item.path}
                  type="button"
                  title={expanded ? undefined : label}
                  className={[
                    'flex min-h-8 w-full items-center text-left text-sm',
                    expanded && active
                      ? 'rounded-lg bg-brand/10 pr-1 font-semibold text-brand'
                      : expanded
                        ? 'rounded-lg pr-1 font-medium text-ink hover:bg-ink/5'
                        : 'text-ink',
                  ].join(' ')}
                  onClick={() => onSelectPath(item.path)}
                >
                  <span
                    className={[
                      'relative box-border grid size-8 shrink-0 place-items-center border border-transparent',
                      expanded
                        ? ''
                        : `rounded-md ${active ? 'bg-brand/10 text-brand' : 'hover:bg-ink/5'}`,
                    ].join(' ')}
                  >
                    {adminModuleIcon(item.path)}
                  </span>
                  <span
                    className={`min-w-0 truncate transition-[max-width,opacity,padding] duration-300 ease-out ${
                      expanded
                        ? 'flex-1 pr-2 pl-2 opacity-100'
                        : 'pointer-events-none w-0 max-w-0 flex-none overflow-hidden pr-0 pl-0 opacity-0'
                    }`}
                    aria-hidden={!expanded}
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {nativeApplicationMenu ? null : (
        <SidebarModeControl expanded={expanded} mode={mode} onSetMode={onSetMode} />
      )}
    </aside>
  )
}
