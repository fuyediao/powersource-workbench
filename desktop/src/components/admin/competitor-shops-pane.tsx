/**
 * Admin competitor shop list pane.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import {
  COMPETITOR_IMPORTANCE_VALUES,
  competitorImportanceBadgeClass,
} from '@/constants/competitor-constants'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  LucideListIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  COMPETITOR_SHOPS_PAGE_SIZE,
  deleteCompetitorShop,
  listCompetitorShops,
} from '@/services/competitor-shops-api'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import type {
  CompetitorImportanceFilter,
  CompetitorShop,
} from '@/types/competitor'
import {
  competitorShopCreatePath,
  competitorShopPath,
} from '@/utils/competitor-routes'
import { getCountryDisplayName } from '@/utils/map/country-alpha2'

interface CompetitorShopsPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Formats an update timestamp as a short local date.
 * @param iso - ISO timestamp.
 * @returns Localized date, or em dash.
 */
function formatDate(iso: string): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

/**
 * Competitor shop list with search, importance filter, and pagination.
 * @param props - Shell writes and navigation.
 * @returns List UI.
 */
export function CompetitorShopsPane({
  writes,
  onNavigate,
}: CompetitorShopsPaneProps) {
  const { t, i18n } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canDelete = Boolean(writes?.canDelete)

  const [rows, setRows] = useState<CompetitorShop[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [importanceFilter, setImportanceFilter] =
    useState<CompetitorImportanceFilter>('all')
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const [deleteTarget, setDeleteTarget] = useState<CompetitorShop | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deletePresence = useDialogPresence(Boolean(deleteTarget))

  const loadSerial = useRef(0)
  const groupsLoadedRef = useRef(false)
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const totalPages = Math.max(
    1,
    Math.ceil(totalCount / COMPETITOR_SHOPS_PAGE_SIZE),
  )

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * COMPETITOR_SHOPS_PAGE_SIZE + 1
    const to = Math.min(page * COMPETITOR_SHOPS_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  const importanceOptions = useMemo(
    () => [
      { value: 'all', label: t('admin.competitor.filter.allImportance') },
      { value: 'unset', label: t('admin.competitor.importance.unset') },
      ...COMPETITOR_IMPORTANCE_VALUES.map((level) => ({
        value: level,
        label: t(`admin.competitor.importance.${level}`),
      })),
    ],
    [t],
  )

  const groupFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllGroups') },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups, t],
  )

  const pageEnterClass =
    enterDirection === 'next' ? 'admin-list-enter-next' : 'admin-list-enter-prev'

  /**
   * Loads the current page from Supabase.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    const serial = ++loadSerial.current
    setLoading(true)
    setListError(null)
    try {
      if (domainWrites.isSystemAdmin && !groupsLoadedRef.current) {
        const allGroups = await listGroups()
        if (serial !== loadSerial.current) {
          return
        }
        setGroups(allGroups)
        groupsLoadedRef.current = true
      }
      const result = await listCompetitorShops({
        page,
        pageSize: COMPETITOR_SHOPS_PAGE_SIZE,
        searchQuery,
        importanceFilter,
        filterGroupId,
        isSystemAdmin: domainWrites.isSystemAdmin,
        groupId: domainWrites.groupId,
      })
      if (serial !== loadSerial.current) {
        return
      }
      setRows(result.rows)
      setTotalCount(result.totalCount)
    } catch (err) {
      if (serial !== loadSerial.current) {
        return
      }
      console.error('[CompetitorShopsPane] load:', err)
      setListError(t('admin.competitor.error.load'))
      setRows([])
      setTotalCount(0)
    } finally {
      if (serial === loadSerial.current) {
        setLoading(false)
      }
    }
  }, [
    domainWrites.groupId,
    domainWrites.isSystemAdmin,
    filterGroupId,
    importanceFilter,
    page,
    searchQuery,
    t,
  ])

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
   * @returns Nothing.
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
   * Navigates to a page with enter animation direction.
   * @param nextPage - Target page.
   * @param direction - Slide direction.
   * @returns Nothing.
   */
  function goToPage(nextPage: number, direction: PageSwipeDirection): void {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page || loading) {
      return
    }
    setEnterDirection(direction)
    setLoading(true)
    setPage(nextPage)
  }

  /**
   * Handles horizontal swipe between pages.
   * @param direction - Swipe direction.
   * @returns Nothing.
   */
  function handlePageSwipe(direction: PageSwipeDirection): void {
    if (direction === 'next') {
      goToPage(page + 1, 'next')
    } else {
      goToPage(page - 1, 'prev')
    }
  }

  const { swiping, dragOffset, pointerHandlers } = useHorizontalPageSwipe({
    canGoPrev: page > 1,
    canGoNext: page < totalPages,
    scrollRef: listScrollRef,
    enabled: !loading,
    onPageSwipe: handlePageSwipe,
  })

  /**
   * Deletes the confirmed shop and reloads the list.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || !canDelete || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteCompetitorShop(deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      console.error('[CompetitorShopsPane] delete:', err)
      setListError(t('admin.competitor.error.delete'))
    } finally {
      setDeleting(false)
    }
  }

  const hasFilters = Boolean(searchQuery) || importanceFilter !== 'all'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.competitor.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.customers.refresh')}
            onClick={() => {
              void reload()
            }}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('admin.customers.refresh')}</span>
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={() => onNavigate(competitorShopCreatePath())}
            >
              <PlusIcon className="size-4" />
              <span>{t('admin.competitor.addShop')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] max-w-sm flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('admin.competitor.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.competitor.searchPlaceholder')}
            />
          </div>
          <CrmFilterSelect
            className="min-w-36 max-w-52 shrink-0"
            value={importanceFilter}
            options={importanceOptions}
            ariaLabel={t('admin.competitor.filter.allImportance')}
            onChange={(next) => {
              setEnterDirection('next')
              setLoading(true)
              setPage(1)
              setImportanceFilter(next as CompetitorImportanceFilter)
            }}
          />
          {domainWrites.isSystemAdmin ? (
            <CrmFilterSelect
              className="min-w-36 max-w-52 shrink-0"
              value={filterGroupId ?? ''}
              options={groupFilterOptions}
              ariaLabel={t('admin.customers.filterAllGroups')}
              onChange={(next) => {
                setEnterDirection('next')
                setLoading(true)
                setPage(1)
                setFilterGroupId(next || null)
              }}
            />
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-medium text-muted">
          {rangeLabel}
        </p>
      </div>

      {listError ? (
        <p className="text-sm font-medium text-rose-500">{listError}</p>
      ) : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.competitor.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideListIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {hasFilters
                ? t('admin.competitor.noResults')
                : t('admin.competitor.empty')}
            </p>
          </div>
        ) : (
          <table
            className={`admin-list-rows ${loading ? '' : pageEnterClass} w-full min-w-[40rem] border-collapse text-left text-sm ${
              swiping || loading ? 'admin-list-transition-disabled' : ''
            }`}
            style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
          >
            <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
              <tr>
                <th className="px-4 py-3">{t('admin.competitor.col.storeName')}</th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.competitor.col.linkedCustomer')}
                </th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.competitor.col.reporter')}
                </th>
                <th className="px-4 py-3">
                  {t('admin.competitor.col.importance')}
                </th>
                <th className="hidden px-4 py-3 sm:table-cell">
                  {t('admin.competitor.col.country')}
                </th>
                <th className="hidden px-4 py-3 xl:table-cell">
                  {t('admin.competitor.col.updatedAt')}
                </th>
                {canDelete ? (
                  <th className="px-4 py-3 text-right">
                    {t('admin.kol.col.actions')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canDelete ? 8 : 7}
                    className="px-4 py-12 text-center text-muted"
                  >
                    {t('status.loading')}
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(competitorShopPath(row.id))}
                >
                  <td className="px-4 py-3">
                    <span className="block truncate font-semibold text-ink">
                      {row.storeName}
                    </span>
                    {row.city ? (
                      <span className="block truncate text-xs font-medium text-muted">
                        {row.city}
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 lg:table-cell">
                    {row.linkedCustomerName ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 lg:table-cell">
                    {row.reporterDisplayName ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {row.importanceLevel ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${competitorImportanceBadgeClass(row.importanceLevel)}`}
                      >
                        {t(`admin.competitor.importance.${row.importanceLevel}`)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 sm:table-cell">
                    {row.country
                      ? getCountryDisplayName(row.country, i18n.language) ||
                        row.country
                      : '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted xl:table-cell">
                    {formatDate(row.updatedAt)}
                  </td>
                  {canDelete ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                        title={t('admin.competitor.deleteShop')}
                        aria-label={t('admin.competitor.deleteShop')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(row)
                        }}
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaginationStrip
        currentPage={page}
        totalPages={totalPages}
        disabled={loading}
        onGoToPage={(nextPage) =>
          goToPage(nextPage, nextPage > page ? 'next' : 'prev')
        }
      />

      {deletePresence.mounted && deleteTarget
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                deletePresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in'
              }`}
              onClick={() => {
                if (!deleting) {
                  setDeleteTarget(null)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-base font-extrabold text-brand">
                  {t('admin.competitor.deleteShop')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.competitor.deleteShopConfirm')}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t('actions.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    onClick={() => void confirmDelete()}
                  >
                    {t('admin.customers.deleteConfirm.confirm')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
