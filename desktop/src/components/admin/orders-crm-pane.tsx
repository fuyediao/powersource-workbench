/**
 * CRM ERP orders list pane (web Order Hub CRM tab parity, read-only).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import { RefreshIcon, SearchIcon } from '@/icons/AllIcons'
import {
  isErpOrdersApiConfigured,
  syncErpOrders,
} from '@/services/erp-orders-api'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import {
  listCrmOrders,
  ORDERS_PAGE_SIZE,
} from '@/services/orders-crm-api'
import type { Order } from '@/types/orders'
import { formatDisplayDateTime } from '@/utils/format-display-date'
import {
  clearOrdersListMenu,
  patchOrdersMenuHandlers,
  setOrdersMenuView,
  usesNativeOrdersMenu,
} from '@/utils/orders-menu'

/**
 * Formats an ERP order amount with its currency code.
 * @param amount - Order total, or null/undefined when not yet synced.
 * @param currency - Currency code, or null/undefined.
 * @returns Formatted amount string, or an em dash when absent.
 */
function formatOrderAmount(amount?: number | null, currency?: string | null): string {
  if (amount === null || amount === undefined) return '—'
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency ? `${currency} ${formatted}` : formatted
}

/** sessionStorage key for the ERP list group filter (survives detail / module remount). */
const ORDERS_CRM_GROUP_FILTER_KEY = 'geocrm-electron-orders-crm-group-filter'

/**
 * Reads the cached ERP group filter id.
 * @returns Group id, or null for “all groups”.
 */
function readOrdersCrmGroupFilter(): string | null {
  try {
    const raw = sessionStorage.getItem(ORDERS_CRM_GROUP_FILTER_KEY)
    return typeof raw === 'string' && raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

/**
 * Persists the ERP group filter id (or clears “all groups”).
 * @param groupId - Selected group id, or null.
 */
function writeOrdersCrmGroupFilter(groupId: string | null): void {
  try {
    if (!groupId) {
      sessionStorage.removeItem(ORDERS_CRM_GROUP_FILTER_KEY)
    } else {
      sessionStorage.setItem(ORDERS_CRM_GROUP_FILTER_KEY, groupId)
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
}

interface OrdersCrmPaneProps {
  /** Shell path navigation (detail pages). */
  onNavigate: (path: string) => void
  /** CRM / NEXDOT / T&E module switcher (rendered at the start of the toolbar). */
  moduleSwitcher?: ReactNode
}

/**
 * CRM ERP order index list with search, Sync ERP, and system-admin group filter.
 * @param props - Navigation callback.
 * @returns List UI.
 */
export function OrdersCrmPane({ onNavigate, moduleSwitcher }: OrdersCrmPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const [rows, setRows] = useState<Order[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterGroupId, setFilterGroupId] = useState<string | null>(() =>
    readOrdersCrmGroupFilter(),
  )
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const groupsLoadedRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncIsError, setSyncIsError] = useState(false)
  const searchTimer = useRef<number | null>(null)
  const loadSerial = useRef(0)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')

  const erpSyncEnabled = isErpOrdersApiConfigured()
  const nativeOrdersMenu = usesNativeOrdersMenu()
  const totalPages = Math.max(1, Math.ceil(totalCount / ORDERS_PAGE_SIZE))
  const canGoPrev = page > 1 && !loading
  const canGoNext = page < totalPages && !loading
  const pageEnterClass =
    enterDirection === 'prev' ? 'admin-list-page-enter-prev' : 'admin-list-page-enter-next'

  const groupFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllGroups') },
      ...groups.map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups, t],
  )

  /**
   * Moves to a page and records enter animation direction.
   * @param nextPage - Target page (1-based).
   * @param direction - Optional override for row pull-in side.
   */
  const goToPage = useCallback(
    (nextPage: number, direction?: PageSwipeDirection): void => {
      setPage((current) => {
        const clamped = Math.max(1, Math.min(totalPages, nextPage))
        if (clamped === current) return current
        setEnterDirection(direction ?? (clamped > current ? 'next' : 'prev'))
        setLoading(true)
        return clamped
      })
    },
    [totalPages],
  )

  /**
   * Handles a committed horizontal page swipe.
   * @param direction - Swipe direction.
   */
  const handlePageSwipe = useCallback(
    (direction: PageSwipeDirection): void => {
      setEnterDirection(direction)
      setPage((current) => {
        const clamped =
          direction === 'next'
            ? Math.min(totalPages, current + 1)
            : Math.max(1, current - 1)
        if (clamped === current) return current
        setLoading(true)
        return clamped
      })
    },
    [totalPages],
  )

  const { dragOffset, swiping, pointerHandlers } = useHorizontalPageSwipe({
    canGoPrev,
    canGoNext,
    scrollRef: listScrollRef,
    enabled: !loading,
    onPageSwipe: handlePageSwipe,
  })

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * ORDERS_PAGE_SIZE + 1
    const to = Math.min(page * ORDERS_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  /**
   * Loads the current page from Supabase.
   */
  const reload = useCallback(async (): Promise<void> => {
    const serial = ++loadSerial.current
    setLoading(true)
    setListError(null)
    try {
      if (domainWrites.isSystemAdmin && !groupsLoadedRef.current) {
        const allGroups = await listGroups()
        if (serial !== loadSerial.current) return
        setGroups(allGroups)
        groupsLoadedRef.current = true
      }
      const result = await listCrmOrders({
        page,
        pageSize: ORDERS_PAGE_SIZE,
        searchQuery,
        filterGroupId,
        isSystemAdmin: domainWrites.isSystemAdmin,
      })
      if (serial !== loadSerial.current) return
      setRows(result.rows)
      setTotalCount(result.totalCount)
    } catch (err) {
      if (serial !== loadSerial.current) return
      console.error('Load CRM orders error:', err)
      setListError(t('admin.orders.error.load'))
      setRows([])
      setTotalCount(0)
    } finally {
      if (serial === loadSerial.current) {
        setLoading(false)
      }
    }
  }, [domainWrites.isSystemAdmin, filterGroupId, page, searchQuery, t])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) {
        window.clearTimeout(searchTimer.current)
      }
    }
  }, [])

  /**
   * Debounces search input into the committed query.
   * @param value - Raw input.
   */
  function onSearchChange(value: string): void {
    setSearchInput(value)
    if (searchTimer.current != null) {
      window.clearTimeout(searchTimer.current)
    }
    searchTimer.current = window.setTimeout(() => {
      setEnterDirection('next')
      setLoading(true)
      setPage(1)
      setSearchQuery(value.trim())
    }, 300)
  }

  /**
   * Applies the ERP group filter from the toolbar or the native Group menu.
   * @param groupId - Selected group id, or null for all groups.
   * @returns Nothing.
   */
  const applyGroupFilter = useCallback((groupId: string | null): void => {
    writeOrdersCrmGroupFilter(groupId)
    setEnterDirection('next')
    setLoading(true)
    setPage(1)
    setFilterGroupId(groupId)
  }, [])

  /**
   * Triggers ERP index sync, then reloads the list.
   * @returns Nothing.
   */
  const handleSyncErp = useCallback(async (): Promise<void> => {
    if (syncing || !erpSyncEnabled) return
    setSyncing(true)
    setSyncMessage(null)
    setSyncIsError(false)
    try {
      const result = await syncErpOrders()
      setSyncMessage(
        t('admin.orders.erp.syncDone', {
          orders: result.orders,
          customers: result.customers,
        }),
      )
      await reload()
    } catch (e) {
      setSyncIsError(true)
      setSyncMessage(e instanceof Error ? e.message : t('admin.orders.erp.syncError'))
    } finally {
      setSyncing(false)
    }
  }, [erpSyncEnabled, reload, syncing, t])

  useEffect(() => {
    patchOrdersMenuHandlers({
      selectGroup: applyGroupFilter,
      syncErp: () => {
        void handleSyncErp()
      },
      refresh: () => {
        void reload()
      },
    })
    return () => {
      clearOrdersListMenu()
    }
  }, [applyGroupFilter, handleSyncErp, reload])

  useEffect(() => {
    setOrdersMenuView({
      groups: groups.map((group) => ({ id: group.id, label: group.name })),
      selectedGroupId: filterGroupId,
      showGroupMenu: domainWrites.isSystemAdmin,
      canSyncErp: erpSyncEnabled,
      isSyncing: syncing,
      canRefresh: true,
      isRefreshing: loading,
    })
  }, [
    domainWrites.isSystemAdmin,
    erpSyncEnabled,
    filterGroupId,
    groups,
    loading,
    syncing,
  ])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {nativeOrdersMenu ? null : moduleSwitcher}
          <div className="relative min-w-[12rem] max-w-xs flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('admin.orders.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.orders.searchPlaceholder')}
            />
          </div>
          {!nativeOrdersMenu && domainWrites.isSystemAdmin ? (
            <CrmFilterSelect
              className="min-w-36 max-w-52"
              value={filterGroupId ?? ''}
              options={groupFilterOptions}
              ariaLabel={t('admin.customers.filterAllGroups')}
              onChange={(next) => {
                applyGroupFilter(next || null)
              }}
            />
          ) : null}
          {!nativeOrdersMenu && erpSyncEnabled ? (
            <button
              type="button"
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
              onClick={() => void handleSyncErp()}
            >
              <RefreshIcon className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? t('admin.orders.erp.syncing') : t('admin.orders.erp.syncButton')}
            </button>
          ) : null}
          {nativeOrdersMenu ? null : (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
              title={t('admin.orders.refresh')}
              onClick={() => void reload()}
            >
              <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{t('admin.orders.refresh')}</span>
            </button>
          )}
        </div>
        <p className="shrink-0 text-right text-sm font-medium leading-none text-muted">
          {rangeLabel}
        </p>
      </div>

      {syncMessage ? (
        <p
          className={`text-sm font-medium ${
            syncIsError ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {syncMessage}
        </p>
      ) : null}
      {listError ? <p className="text-sm font-medium text-rose-500">{listError}</p> : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.orders.crmTitle')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        <table
          className={`admin-list-rows ${loading ? '' : pageEnterClass} w-full min-w-[48rem] border-collapse text-left text-sm ${
            swiping || loading ? 'admin-list-transition-disabled' : ''
          }`}
          style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
        >
          <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
            <tr>
              <th className="px-4 py-3">{t('admin.orders.col.customerCode')}</th>
              <th className="px-4 py-3">{t('admin.orders.col.customer')}</th>
              <th className="px-4 py-3">{t('admin.orders.col.orderNo')}</th>
              <th className="px-4 py-3">{t('admin.orders.col.group')}</th>
              <th className="px-4 py-3">{t('admin.orders.col.amount')}</th>
              <th className="px-4 py-3">{t('admin.orders.col.createdAt')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  {t('status.loading')}
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  {searchQuery || filterGroupId
                    ? t('admin.orders.noResults')
                    : t('admin.orders.empty')}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                onClick={() => onNavigate(`/orders/crm/${row.id}`)}
              >
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {row.customerCode || '—'}
                </td>
                <td className="px-4 py-3 font-semibold text-brand">
                  {row.companyName || '—'}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-ink">{row.externalId || '—'}</span>
                  {row.source === 'erp' ? (
                    <span className="ml-2 inline-flex rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-sky-700 uppercase dark:text-sky-300">
                      ERP
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-ink">{row.groupName || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink">
                  {formatOrderAmount(row.amount, row.currency)}
                </td>
                <td className="px-4 py-3 text-muted">
                  {formatDisplayDateTime(row.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginationStrip
        currentPage={page}
        totalPages={totalPages}
        disabled={loading}
        onGoToPage={(nextPage) =>
          goToPage(nextPage, nextPage > page ? 'next' : 'prev')
        }
      />
    </div>
  )
}

/**
 * Parses `/orders/crm/:id` detail paths.
 * @param path - Shell path.
 * @returns Order id or null.
 */
export function parseOrderCrmDetailPath(path: string): string | null {
  const match = /^\/orders\/crm\/([^/]+)\/?$/.exec(path.trim())
  if (!match) return null
  const id = match[1]?.trim() ?? ''
  if (!id || id === 'new') return null
  return id
}
