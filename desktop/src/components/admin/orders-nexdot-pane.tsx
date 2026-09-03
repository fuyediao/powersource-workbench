/**
 * NEXDOT (shop_orders / orders_obm) list pane — web OBM Order Hub parity, read-only.
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
  listObmOrders,
  OBM_ORDERS_PAGE_SIZE,
} from '@/services/orders-obm-api'
import type { ObmOrder, ShopOrderPaymentStatus } from '@/types/orders'
import { formatDisplayDateTime } from '@/utils/format-display-date'
import {
  clearOrdersListMenu,
  patchOrdersMenuHandlers,
  setOrdersMenuView,
  usesNativeOrdersMenu,
} from '@/utils/orders-menu'

interface OrdersNexdotPaneProps {
  onNavigate: (path: string) => void
  /** CRM / NEXDOT / T&E module switcher (start of toolbar). */
  moduleSwitcher?: ReactNode
}

/**
 * Badge classes for one payment status.
 * @param status - Payment status.
 * @returns Tailwind class string.
 */
function statusClass(status: ShopOrderPaymentStatus): string {
  switch (status) {
    case 'pending_payment':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'payment_processing':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
    case 'payment_succeeded':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'payment_failed':
      return 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300'
    case 'closed':
    case 'cancelled':
    default:
      return 'border-ink/15 bg-ink/5 text-muted'
  }
}

/**
 * Formats an amount with currency, or an em dash when missing.
 * @param amount - Whole currency units.
 * @param currency - Currency code.
 * @returns Formatted amount.
 */
function formatAmount(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return '—'
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * NEXDOT wholesale order list with order-number search and pagination.
 * @param props - Navigation callback.
 * @returns List UI.
 */
export function OrdersNexdotPane({ onNavigate, moduleSwitcher }: OrdersNexdotPaneProps) {
  const { t } = useTranslation()
  const nativeOrdersMenu = usesNativeOrdersMenu()
  const [rows, setRows] = useState<ObmOrder[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const searchTimer = useRef<number | null>(null)
  const loadSerial = useRef(0)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')

  const totalPages = Math.max(1, Math.ceil(totalCount / OBM_ORDERS_PAGE_SIZE))
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
    const from = (page - 1) * OBM_ORDERS_PAGE_SIZE + 1
    const to = Math.min(page * OBM_ORDERS_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  const reload = useCallback(async (): Promise<void> => {
    const serial = ++loadSerial.current
    setLoading(true)
    setListError(null)
    try {
      const result = await listObmOrders({
        page,
        pageSize: OBM_ORDERS_PAGE_SIZE,
        searchQuery,
      })
      if (serial !== loadSerial.current) return
      setRows(result.rows)
      setTotalCount(result.totalCount)
    } catch (err) {
      if (serial !== loadSerial.current) return
      console.error('Load NEXDOT orders error:', err)
      setListError(t('admin.orders.hub.obm.error'))
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
              placeholder={t('admin.orders.hub.obm.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.orders.hub.obm.searchPlaceholder')}
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
        aria-label={t('admin.orders.obmTitle')}
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
              <th className="px-4 py-3">{t('admin.orders.hub.obm.col.orderNumber')}</th>
              <th className="px-4 py-3">{t('admin.orders.hub.obm.col.customer')}</th>
              <th className="px-4 py-3">{t('admin.orders.hub.obm.col.items')}</th>
              <th className="px-4 py-3">{t('admin.orders.hub.obm.col.amount')}</th>
              <th className="px-4 py-3">{t('admin.orders.hub.obm.col.status')}</th>
              <th className="px-4 py-3">{t('admin.orders.hub.obm.col.createdAt')}</th>
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
                  {searchQuery
                    ? t('admin.orders.noResults')
                    : t('admin.orders.hub.obm.empty')}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                onClick={() => onNavigate(`/orders/nexdot/${row.id}`)}
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold text-brand">
                  {row.orderNumber}
                </td>
                <td className="px-4 py-3 text-ink">{row.companyName || '—'}</td>
                <td className="px-4 py-3 text-ink">{row.itemCount}</td>
                <td className="px-4 py-3 text-ink">
                  {formatAmount(row.totalAmount, row.currency)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(row.paymentStatus)}`}
                  >
                    {t(`admin.orders.hub.obm.status.${row.paymentStatus}`)}
                  </span>
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
 * Parses `/orders/nexdot/:id` detail paths.
 * @param path - Shell path.
 * @returns Order id or null.
 */
export function parseOrderNexdotDetailPath(path: string): string | null {
  const match = /^\/orders\/nexdot\/([^/]+)\/?$/.exec(path.trim())
  if (!match) return null
  const id = match[1]?.trim() ?? ''
  return id || null
}
