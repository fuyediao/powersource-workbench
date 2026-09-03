/**
 * T&E local logistics orders list pane (web Order Hub T&E tab parity, read-only).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PaginationStrip } from '@/components/common/pagination-strip'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import { RefreshIcon, SearchIcon } from '@/icons/AllIcons'
import {
  fetchProductCatalogIdLabelMap,
  formatTeProductIds,
  listTeOrders,
  TE_ORDERS_PAGE_SIZE,
} from '@/services/orders-te-api'
import type { TeOrder } from '@/types/orders'
import { formatDisplayDateTime } from '@/utils/format-display-date'
import {
  clearOrdersListMenu,
  patchOrdersMenuHandlers,
  setOrdersMenuView,
  usesNativeOrdersMenu,
} from '@/utils/orders-menu'

interface OrdersTePaneProps {
  /** Shell path navigation (detail pages). */
  onNavigate: (path: string) => void
  /** ERP / NEXDOT / T&E module switcher (start of toolbar). */
  moduleSwitcher?: ReactNode
}

/**
 * Badge classes for a normalized tracking state.
 * @param status - Tracking status.
 * @returns Tailwind class string.
 */
function trackingStatusClass(status: TeOrder['trackingStatus']): string {
  switch (status) {
    case 'pending':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'in_transit':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
    case 'delivered':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    default:
      return 'border-ink/15 bg-ink/5 text-muted'
  }
}

/**
 * T&E order list with tracking search; row click opens in-Orders detail.
 * @param props - Navigation and optional module switcher.
 * @returns List UI.
 */
export function OrdersTePane({ onNavigate, moduleSwitcher }: OrdersTePaneProps) {
  const { t } = useTranslation()
  const nativeOrdersMenu = usesNativeOrdersMenu()
  const [rows, setRows] = useState<TeOrder[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [labelMap, setLabelMap] = useState<Record<string, string>>({})
  const searchTimer = useRef<number | null>(null)
  const loadSerial = useRef(0)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')

  const totalPages = Math.max(1, Math.ceil(totalCount / TE_ORDERS_PAGE_SIZE))
  const canGoPrev = page > 1 && !loading
  const canGoNext = page < totalPages && !loading
  const pageEnterClass =
    enterDirection === 'prev' ? 'admin-list-page-enter-prev' : 'admin-list-page-enter-next'

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
    const from = (page - 1) * TE_ORDERS_PAGE_SIZE + 1
    const to = Math.min(page * TE_ORDERS_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  useEffect(() => {
    let cancelled = false
    void fetchProductCatalogIdLabelMap()
      .then((map) => {
        if (!cancelled) setLabelMap(map)
      })
      .catch((err) => {
        console.error('Load product catalog labels error:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reload = useCallback(async (): Promise<void> => {
    const serial = ++loadSerial.current
    setLoading(true)
    setListError(null)
    try {
      const result = await listTeOrders({
        page,
        pageSize: TE_ORDERS_PAGE_SIZE,
        searchQuery,
      })
      if (serial !== loadSerial.current) return
      setRows(result.rows)
      setTotalCount(result.totalCount)
    } catch (err) {
      if (serial !== loadSerial.current) return
      console.error('Load T&E orders error:', err)
      setListError(t('admin.orders.hub.teOrders.error'))
      setRows([])
      setTotalCount(0)
    } finally {
      if (serial === loadSerial.current) setLoading(false)
    }
  }, [page, searchQuery, t])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) window.clearTimeout(searchTimer.current)
    }
  }, [])

  useEffect(() => {
    patchOrdersMenuHandlers({
      refresh: () => {
        void reload()
      },
    })
    return () => {
      clearOrdersListMenu()
    }
  }, [reload])

  useEffect(() => {
    setOrdersMenuView({
      groups: [],
      selectedGroupId: null,
      showGroupMenu: false,
      canSyncErp: false,
      isSyncing: false,
      canRefresh: true,
      isRefreshing: loading,
    })
  }, [loading])

  /**
   * Debounces search input.
   * @param value - Raw input.
   */
  function onSearchChange(value: string): void {
    setSearchInput(value)
    if (searchTimer.current != null) window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => {
      setEnterDirection('next')
      setLoading(true)
      setPage(1)
      setSearchQuery(value.trim())
    }, 300)
  }

  /**
   * Tracking status label.
   * @param status - Tracking status.
   * @returns Localized label.
   */
  function statusLabel(status: TeOrder['trackingStatus']): string {
    if (!status) return t('admin.orders.hub.teOrders.statusNotRegistered')
    return t(`admin.orders.teTracking.${status}`)
  }

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
              placeholder={t('admin.orders.hub.teOrders.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.orders.hub.teOrders.searchPlaceholder')}
            />
          </div>
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

      {listError ? <p className="text-sm font-medium text-rose-500">{listError}</p> : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.orders.teTitle')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        <table
          className={`admin-list-rows ${loading ? '' : pageEnterClass} w-full min-w-[56rem] border-collapse text-left text-sm ${
            swiping || loading ? 'admin-list-transition-disabled' : ''
          }`}
          style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
        >
          <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
            <tr>
              <th className="px-4 py-3">
                {t('admin.orders.hub.teOrders.col.approvedProducts')}
              </th>
              <th className="px-4 py-3">{t('admin.orders.hub.teOrders.col.tracking')}</th>
              <th className="hidden px-4 py-3 sm:table-cell">
                {t('admin.orders.hub.teOrders.col.carrier')}
              </th>
              <th className="hidden px-4 py-3 md:table-cell">
                {t('admin.orders.hub.teOrders.col.status')}
              </th>
              <th className="hidden px-4 py-3 lg:table-cell">
                {t('admin.orders.hub.teOrders.col.lastChecked')}
              </th>
              <th className="hidden px-4 py-3 xl:table-cell">
                {t('admin.orders.hub.teOrders.col.shippedAt')}
              </th>
              <th className="hidden px-4 py-3 xl:table-cell">
                {t('admin.orders.hub.teOrders.col.deliveredAt')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted">
                  {t('status.loading')}
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted">
                  {searchQuery
                    ? t('admin.orders.noResults')
                    : t('admin.orders.hub.teOrders.empty')}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                onClick={() => onNavigate(`/orders/te/${row.id}`)}
              >
                <td className="px-4 py-3 text-ink">
                  {formatTeProductIds(row.approvedProductIds, labelMap)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-brand">
                  {row.trackingNumber || '—'}
                </td>
                <td className="hidden px-4 py-3 text-ink sm:table-cell">
                  {row.carrier || '—'}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${trackingStatusClass(row.trackingStatus)}`}
                  >
                    {statusLabel(row.trackingStatus)}
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-muted lg:table-cell">
                  {formatDisplayDateTime(row.trackingLastCheckedAt)}
                </td>
                <td className="hidden px-4 py-3 text-muted xl:table-cell">
                  {formatDisplayDateTime(row.shippedAt)}
                </td>
                <td className="hidden px-4 py-3 text-muted xl:table-cell">
                  {formatDisplayDateTime(row.deliveredAt)}
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
