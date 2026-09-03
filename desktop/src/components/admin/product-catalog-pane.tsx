/**
 * Product Electronic Catalog list pane (web ProductCatalogView parity).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import { RefreshIcon, SearchIcon, UniverSheetsIcon } from '@/icons/AllIcons'
import {
  createProductPriceTemplateWorkbook,
  getProductPricePeriod,
  productPriceTemplateFileName,
} from '@/office/product-price-template'
import {
  isProductCatalogApiConfigured,
  listAllProductCatalogCodes,
  listProductCatalog,
  PRODUCT_CATALOG_PAGE_SIZE,
  syncProductCatalog,
  type ProductCatalogItem,
} from '@/services/product-catalog-api'
import { univerLocaleFromAppLanguage } from '@/utils/univer/univer-locale'
import { openOfficeDocument } from '@/utils/office/office-document-request'

type StatusFilterValue = 'all' | 'active' | 'inactive'

interface ProductCatalogPaneProps {
  /** Navigate to catalog detail. */
  onNavigate: (path: string) => void
}

/**
 * Formats qty for display (trim trailing zeros).
 * @param qty - Numeric quantity.
 * @returns Display string.
 */
function formatQty(qty: number): string {
  if (!Number.isFinite(qty)) {
    return '—'
  }
  return Number.isInteger(qty) ? String(qty) : String(qty)
}

/**
 * Formats a nullable USD price for display.
 * @param value - Price in U.S. dollars.
 * @returns Formatted price or em dash.
 */
function formatUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Product catalog index with search, status filter, Sync from ERP, and pagination.
 * @param props - Navigation callback.
 * @returns List UI.
 */
export function ProductCatalogPane({ onNavigate }: ProductCatalogPaneProps) {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<ProductCatalogItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncIsError, setSyncIsError] = useState(false)
  const [openingTemplate, setOpeningTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const searchTimer = useRef<number | null>(null)
  const loadSerial = useRef(0)
  const listScrollRef = useRef<HTMLDivElement>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')

  const erpSyncEnabled = isProductCatalogApiConfigured()
  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCT_CATALOG_PAGE_SIZE))
  const canGoPrev = page > 1 && !loading
  const canGoNext = page < totalPages && !loading
  const pageEnterClass =
    enterDirection === 'prev' ? 'admin-list-page-enter-prev' : 'admin-list-page-enter-next'

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: t('admin.productCatalog.statusFilterAll') },
      { value: 'active', label: t('admin.productCatalog.statusActive') },
      { value: 'inactive', label: t('admin.productCatalog.statusInactive') },
    ],
    [t],
  )

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * PRODUCT_CATALOG_PAGE_SIZE + 1
    const to = Math.min(page * PRODUCT_CATALOG_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  /**
   * Moves to a page and records enter animation direction.
   * @param nextPage - Target page (1-based).
   * @param direction - Optional override for row pull-in side.
   */
  const goToPage = useCallback(
    (nextPage: number, direction?: PageSwipeDirection): void => {
      setPage((current) => {
        const clamped = Math.max(1, Math.min(totalPages, nextPage))
        if (clamped === current) {
          return current
        }
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
        if (clamped === current) {
          return current
        }
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

  /**
   * Loads the current page from Supabase.
   */
  const reload = useCallback(async (): Promise<void> => {
    const serial = ++loadSerial.current
    setLoading(true)
    setListError(null)
    try {
      const result = await listProductCatalog({
        search: searchQuery,
        page,
        pageSize: PRODUCT_CATALOG_PAGE_SIZE,
        status: statusFilter,
      })
      if (serial !== loadSerial.current) {
        return
      }
      if (page > 1 && result.items.length === 0 && result.total > 0) {
        setPage(1)
        return
      }
      setItems(result.items)
      setTotalCount(result.total)
    } catch (e) {
      if (serial !== loadSerial.current) {
        return
      }
      setListError(e instanceof Error ? e.message : t('admin.productCatalog.errorLoad'))
      setItems([])
      setTotalCount(0)
    } finally {
      if (serial === loadSerial.current) {
        setLoading(false)
      }
    }
  }, [page, searchQuery, statusFilter, t])

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
   * Pulls GetItemStock + GetItemPrice via workbench-api, then reloads.
   */
  async function handleSyncErp(): Promise<void> {
    if (syncing || !erpSyncEnabled) {
      return
    }
    setSyncing(true)
    setSyncMessage(null)
    setSyncIsError(false)
    try {
      const result = await syncProductCatalog()
      setSyncMessage(
        t('admin.productCatalog.syncDone', {
          upserted: result.upserted,
          deactivated: result.deactivated,
        }),
      )
      setEnterDirection('next')
      setPage(1)
      await reload()
    } catch (e) {
      setSyncIsError(true)
      setSyncMessage(e instanceof Error ? e.message : t('admin.productCatalog.syncError'))
    } finally {
      setSyncing(false)
    }
  }

  /**
   * Opens an English quarterly price template in the built-in spreadsheet editor.
   * @returns Promise resolved after the spreadsheet open request is dispatched.
   */
  async function handleOpenPriceTemplate(): Promise<void> {
    if (openingTemplate) {
      return
    }
    setOpeningTemplate(true)
    setTemplateError(null)
    try {
      const productCodes = await listAllProductCatalogCodes()
      const period = getProductPricePeriod()
      const snapshot = createProductPriceTemplateWorkbook(
        productCodes,
        univerLocaleFromAppLanguage(i18n.language),
        period,
      )
      openOfficeDocument({
        kind: 'sheets',
        name: productPriceTemplateFileName(period),
        snapshot: snapshot as unknown as Record<string, unknown>,
      })
    } catch (error) {
      setTemplateError(
        error instanceof Error ? error.message : t('admin.productCatalog.templateOpenError'),
      )
    } finally {
      setOpeningTemplate(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight text-ink">
            {t('admin.productCatalog.title')}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={openingTemplate}
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={() => void handleOpenPriceTemplate()}
          >
            <UniverSheetsIcon className="size-4" />
            {openingTemplate
              ? t('admin.productCatalog.templateOpening')
              : t('admin.productCatalog.openPriceTemplate')}
          </button>
          {erpSyncEnabled ? (
            <button
              type="button"
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
              onClick={() => void handleSyncErp()}
            >
              <RefreshIcon className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? t('admin.productCatalog.syncing') : t('admin.productCatalog.syncButton')}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            disabled={loading}
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            {t('admin.productCatalog.refresh')}
          </button>
        </div>
      </header>

      {syncMessage ? (
        <p
          className={`text-sm font-medium ${
            syncIsError ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {syncMessage}
        </p>
      ) : null}
      {listError ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-600 dark:text-rose-300">
          {listError}
        </p>
      ) : null}
      {templateError ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-600 dark:text-rose-300">
          {templateError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] max-w-md flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('admin.productCatalog.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.productCatalog.searchPlaceholder')}
            />
          </div>
          <CrmFilterSelect
            className="min-w-36 max-w-48"
            value={statusFilter}
            options={statusOptions}
            ariaLabel={t('admin.productCatalog.col.status')}
            onChange={(next) => {
              setEnterDirection('next')
              setLoading(true)
              setPage(1)
              setStatusFilter((next as StatusFilterValue) || 'all')
            }}
          />
        </div>
        <p className="shrink-0 text-sm font-medium text-muted">{rangeLabel}</p>
      </div>

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.productCatalog.title')}
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
              <th className="px-4 py-3">{t('admin.productCatalog.col.code')}</th>
              <th className="px-4 py-3">{t('admin.productCatalog.col.name')}</th>
              <th className="px-4 py-3">{t('admin.productCatalog.col.displayName')}</th>
              <th className="px-4 py-3">{t('admin.productCatalog.col.spec')}</th>
              <th className="px-4 py-3">{t('admin.productCatalog.col.unit')}</th>
              <th className="px-4 py-3 text-right">{t('admin.productCatalog.col.qty')}</th>
              <th className="px-4 py-3 text-right">
                {t('admin.productCatalog.col.customerPriceUsd')}
              </th>
              <th className="px-4 py-3 text-right">{t('admin.productCatalog.col.tePriceUsd')}</th>
              <th className="px-4 py-3">{t('admin.productCatalog.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  {t('admin.productCatalog.loading')}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  {t('admin.productCatalog.empty')}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  role="link"
                  tabIndex={0}
                  className="cursor-pointer border-t border-ink/5 text-ink transition-colors hover:bg-brand/5"
                  onClick={() => onNavigate(`/products/catalog/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onNavigate(`/products/catalog/${item.id}`)
                    }
                  }}
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-brand">{item.itemCode}</td>
                  <td className="max-w-xs truncate px-4 py-2.5" title={item.itemName}>
                    {item.itemName}
                  </td>
                  <td
                    className="max-w-xs truncate px-4 py-2.5 text-muted"
                    title={item.displayName ?? undefined}
                  >
                    {item.displayName || '—'}
                  </td>
                  <td className="max-w-[12rem] px-4 py-2.5 text-muted">
                    <span className="line-clamp-2">{item.itemSpec || '—'}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{item.unit || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    {formatQty(item.qty)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted">
                    {formatUsd(item.customerPriceUsd)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted">
                    {formatUsd(item.tePriceUsd)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                        item.isActive
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-zinc-500/15 text-muted'
                      }`}
                    >
                      {item.isActive
                        ? t('admin.productCatalog.statusActive')
                        : t('admin.productCatalog.statusInactive')}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <PaginationStrip
          currentPage={page}
          totalPages={totalPages}
          onGoToPage={(p) => goToPage(p)}
        />
      ) : null}
    </div>
  )
}

/**
 * Parses `/products/catalog/:id` detail paths.
 * @param path - Shell path.
 * @returns Catalog id or null.
 */
export function parseProductCatalogDetailPath(path: string | null): string | null {
  if (!path) {
    return null
  }
  const match = /^\/products\/catalog\/([^/]+)\/?$/.exec(path)
  const id = match?.[1]?.trim()
  return id && id.length > 0 ? decodeURIComponent(id) : null
}
