/**
 * Orders Function page: full-bleed layout with module dropdown in the list toolbar.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { StatusLoading } from '@/components/common/status-loading'
import { OrderCrmDetailPane } from '@/components/admin/order-crm-detail-pane'
import { OrderNexdotDetailPane } from '@/components/admin/order-nexdot-detail-pane'
import {
  OrderTeDetailPane,
  parseOrderTeDetailPath,
} from '@/components/admin/order-te-detail-pane'
import {
  OrdersCrmPane,
  parseOrderCrmDetailPath,
} from '@/components/admin/orders-crm-pane'
import {
  OrdersNexdotPane,
  parseOrderNexdotDetailPath,
} from '@/components/admin/orders-nexdot-pane'
import { OrdersTePane } from '@/components/admin/orders-te-pane'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import {
  ORDERS_NAV_GROUPS,
  resolveAdminModuleKey,
} from '@/constants/admin-modules'
import {
  DesktopDomainWritesProvider,
  useDesktopDomainWritesContext,
} from '@/hooks/use-desktop-domain-writes'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'
import {
  adminActivePathStorageKey,
  readAdminActivePath,
  writeAdminActivePath,
} from '@/utils/admin-active-path'
import {
  patchOrdersMenuHandlers,
  setOrdersMenuView,
  unregisterOrdersMenuHost,
  usesNativeOrdersMenu,
} from '@/utils/orders-menu'
import {
  consumePendingOrdersPath,
  ORDERS_PATH_STORAGE_KEY,
  subscribeOrdersPathRequest,
} from '@/utils/orders/orders-open-request'

/** Flat list paths for the module dropdown. */
const ORDERS_MODULE_PATHS = ORDERS_NAV_GROUPS.flat().map((item) => item.path)

interface OrdersPageProps {
  userId: string
  user: User
}

/**
 * Resolves the list-root path for the module dropdown from any nested Orders path.
 * @param path - Current shell path.
 * @returns One of `/orders/crm` | `/orders/nexdot` | `/orders/te`.
 */
function ordersModuleRootPath(path: string): string {
  for (const root of ORDERS_MODULE_PATHS) {
    if (path === root || path.startsWith(`${root}/`)) {
      return root
    }
  }
  return ORDERS_MODULE_PATHS[0] ?? '/orders/crm'
}

/**
 * Orders Home Function: ERP / NEXDOT / T&E via a toolbar dropdown (no sidebar).
 * @param props - Signed-in user.
 * @returns Orders UI.
 */
export function OrdersPage({ userId }: OrdersPageProps) {
  return (
    <DesktopDomainWritesProvider userId={userId} domain="orders">
      <OrdersPageContent userId={userId} />
    </DesktopDomainWritesProvider>
  )
}

interface OrdersPageContentProps {
  userId: string
}

/**
 * Access-gated Orders chrome with module dropdown and path-routed panes.
 * @param props - User id.
 * @returns Page body.
 */
function OrdersPageContent({ userId }: OrdersPageContentProps) {
  const { t } = useTranslation()
  const access = useDesktopModuleAccess(userId)
  const writes = useDesktopDomainWritesContext()
  const pathCacheKey = adminActivePathStorageKey(ORDERS_PATH_STORAGE_KEY)
  const [activePath, setActivePath] = useState<string>(
    () => consumePendingOrdersPath() ?? readAdminActivePath(pathCacheKey) ?? '/orders/crm',
  )

  const functionAllowed =
    access.hasUnrestrictedAccess ||
    (access.isLoaded && access.isEntryAllowed('desktop_orders'))

  const moduleOptions = useMemo(
    () =>
      ORDERS_NAV_GROUPS.flat().map((item) => ({
        value: item.path,
        label: t(item.labelKey),
      })),
    [t],
  )

  const moduleRoot = ordersModuleRootPath(activePath)
  const moduleKey = resolveAdminModuleKey(activePath)
  const nativeOrdersMenu = usesNativeOrdersMenu()

  useEffect(() => {
    writeAdminActivePath(activePath, pathCacheKey)
  }, [activePath, pathCacheKey])

  useEffect(() => {
    if (!access.isLoaded || !functionAllowed) return
    if (
      !ORDERS_MODULE_PATHS.some(
        (root) => activePath === root || activePath.startsWith(`${root}/`),
      )
    ) {
      setActivePath('/orders/crm')
    }
  }, [access.isLoaded, activePath, functionAllowed])

  /**
   * Navigates within Orders (list or nested detail).
   * @param path - Target path.
   */
  const navigate = useCallback((path: string): void => {
    setActivePath(path)
  }, [])

  useEffect(() => {
    return subscribeOrdersPathRequest((path) => {
      setActivePath(path)
    })
  }, [])

  /**
   * Switches module via dropdown or the native Orders menu (always lands on the list root).
   * @param nextRoot - List path.
   */
  const onModuleChange = useCallback((nextRoot: string): void => {
    if (!nextRoot) return
    setActivePath(nextRoot)
  }, [])

  useEffect(() => {
    return () => unregisterOrdersMenuHost()
  }, [])

  useEffect(() => {
    patchOrdersMenuHandlers({
      selectModule: onModuleChange,
    })
  }, [onModuleChange])

  useEffect(() => {
    setOrdersMenuView({
      modules: moduleOptions.map((option) => ({
        id: option.value,
        label: option.label,
      })),
      selectedModuleId: moduleRoot,
    })
  }, [moduleOptions, moduleRoot])

  const moduleSwitcher = nativeOrdersMenu ? undefined : (
    <CrmFilterSelect
      className="min-w-44 max-w-64 shrink-0"
      value={moduleRoot}
      options={moduleOptions}
      ariaLabel={t('orders.moduleSwitcherAria')}
      onChange={onModuleChange}
    />
  )

  if (!access.isLoaded || writes.isLoading) {
    return (
      <div className="feature-page h-dvh max-h-dvh">
        <StatusLoading />
      </div>
    )
  }

  if (!functionAllowed) {
    return (
      <div className="feature-page flex h-dvh max-h-dvh flex-col overflow-hidden text-ink">
        <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <h2 className="text-lg font-bold text-ink">
            {t('admin.moduleAccess.noModulesTitle')}
          </h2>
          <p className="text-sm font-medium text-muted">
            {t('admin.moduleAccess.noModulesDescription')}
          </p>
        </div>
      </div>
    )
  }

  const crmDetailId = parseOrderCrmDetailPath(activePath)
  const nexdotDetailId = parseOrderNexdotDetailPath(activePath)
  const teDetailId = parseOrderTeDetailPath(activePath)

  let pane: ReactNode
  if (crmDetailId) {
    pane = <OrderCrmDetailPane orderId={crmDetailId} onNavigate={navigate} />
  } else if (nexdotDetailId) {
    pane = (
      <OrderNexdotDetailPane orderId={nexdotDetailId} onNavigate={navigate} />
    )
  } else if (teDetailId) {
    pane = <OrderTeDetailPane orderId={teDetailId} onNavigate={navigate} />
  } else if (moduleRoot === '/orders/crm' || moduleKey === 'orders_crm') {
    pane = <OrdersCrmPane moduleSwitcher={moduleSwitcher} onNavigate={navigate} />
  } else if (moduleRoot === '/orders/nexdot' || moduleKey === 'orders_obm') {
    pane = (
      <OrdersNexdotPane moduleSwitcher={moduleSwitcher} onNavigate={navigate} />
    )
  } else if (moduleRoot === '/orders/te' || moduleKey === 'orders_te') {
    pane = <OrdersTePane moduleSwitcher={moduleSwitcher} onNavigate={navigate} />
  } else {
    pane = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-muted">{t('admin.content.comingSoon')}</p>
      </div>
    )
  }

  return (
    <div className="admin-page feature-page flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden text-ink">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5">
        <div className="glass-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
          <main className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {pane}
          </main>
        </div>
      </div>
    </div>
  )
}
