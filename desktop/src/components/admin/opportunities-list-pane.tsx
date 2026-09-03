/**
 * Admin Opportunities list pane (web OpportunitiesTableView parity, list-only):
 * search, sales-process / stage filters, system-admin group filter, and
 * pagination. The Freeform board lives at `/kanban/opportunities` in the Kanban app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  LucideBriefcaseIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import {
  deleteOpportunity,
  listOpportunities,
  OPPORTUNITIES_PAGE_SIZE,
} from '@/services/opportunities-api'
import {
  pipelineStagesForSalesProcess,
  SALES_PROCESS_VALUES,
  type Opportunity,
  type OpportunitySalesProcess,
} from '@/types/opportunity'
import { opportunityCreatePath, opportunityDetailPath } from '@/utils/opportunity-list-routes'

interface OpportunitiesListPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Formats an amount with the opportunity's currency code.
 * @param amount - Numeric amount, or null.
 * @param currencyCode - ISO-ish currency code.
 * @returns Formatted string, or em dash.
 */
function formatAmount(amount: number | null, currencyCode: string): string {
  if (amount == null || !Number.isFinite(amount)) {
    return '—'
  }
  return `${currencyCode} ${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(amount)}`
}

/**
 * Formats an ISO date as a short local date.
 * @param iso - ISO date or null.
 * @returns Localized date, or em dash.
 */
function formatDate(iso: string | null): string {
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
 * Opportunities list with search, filters, and pagination.
 * @param props - Current user, shell writes, and navigation.
 * @returns List UI.
 */
export function OpportunitiesListPane({
  writes,
  onNavigate,
}: OpportunitiesListPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canDelete = Boolean(writes?.canDelete)

  const [rows, setRows] = useState<Opportunity[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [salesProcessFilter, setSalesProcessFilter] = useState<OpportunitySalesProcess | ''>('')
  const [stageFilter, setStageFilter] = useState('')
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const [deleteTarget, setDeleteTarget] = useState<Opportunity | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deletePresence = useDialogPresence(Boolean(deleteTarget))

  const loadSerial = useRef(0)
  const groupsLoadedRef = useRef(false)
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / OPPORTUNITIES_PAGE_SIZE))

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * OPPORTUNITIES_PAGE_SIZE + 1
    const to = Math.min(page * OPPORTUNITIES_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  const salesProcessOptions = useMemo(
    () => [
      { value: '', label: t('admin.opportunities.filters.allSalesProcesses') },
      ...SALES_PROCESS_VALUES.map((process) => ({
        value: process,
        label: t(`admin.opportunities.salesProcess.${process}`),
      })),
    ],
    [t],
  )

  const stageOptions = useMemo(() => {
    const base = [{ value: '', label: t('admin.opportunities.filters.allStages') }]
    if (!salesProcessFilter) {
      return base
    }
    return [
      ...base,
      ...pipelineStagesForSalesProcess(salesProcessFilter).map((row) => ({
        value: row.stage,
        label: t(`admin.opportunities.stage.${row.stage}`),
      })),
    ]
  }, [salesProcessFilter, t])

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
   * @param options - Optional page override.
   * @returns Nothing.
   */
  const reload = useCallback(
    async (options?: { page?: number }): Promise<void> => {
      const pageToLoad = options?.page ?? page
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
        const result = await listOpportunities({
          page: pageToLoad,
          pageSize: OPPORTUNITIES_PAGE_SIZE,
          searchQuery,
          salesProcessFilter: salesProcessFilter || undefined,
          stageFilter: stageFilter || undefined,
          groupFilter: domainWrites.isSystemAdmin ? filterGroupId : undefined,
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
        console.error('[OpportunitiesListPane] load:', err)
        setListError(t('admin.opportunities.errorLoad'))
        setRows([])
        setTotalCount(0)
      } finally {
        if (serial === loadSerial.current) {
          setLoading(false)
        }
      }
    },
    [
      domainWrites.isSystemAdmin,
      filterGroupId,
      page,
      salesProcessFilter,
      searchQuery,
      stageFilter,
      t,
    ],
  )

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
   * Resets to page 1 after a filter change.
   * @returns Nothing.
   */
  function resetToFirstPage(): void {
    setEnterDirection('next')
    setLoading(true)
    setPage(1)
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
   * Deletes the confirmed opportunity and reloads the list.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || !canDelete || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteOpportunity(deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      console.error('[OpportunitiesListPane] delete:', err)
      setListError(t('admin.opportunities.errorDelete'))
    } finally {
      setDeleting(false)
    }
  }

  const hasFilters = Boolean(searchQuery || salesProcessFilter || stageFilter)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.opportunities.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.leadsTable.refresh')}
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('admin.leadsTable.refresh')}</span>
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={() => onNavigate(opportunityCreatePath())}
            >
              <PlusIcon className="size-4" />
              <span>{t('admin.opportunities.addOpportunity')}</span>
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
              placeholder={t('admin.opportunities.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.opportunities.searchPlaceholder')}
            />
          </div>
          <CrmFilterSelect
            className="min-w-40 max-w-56 shrink-0"
            value={salesProcessFilter}
            options={salesProcessOptions}
            ariaLabel={t('admin.opportunities.filters.allSalesProcesses')}
            onChange={(next) => {
              resetToFirstPage()
              setSalesProcessFilter(next as OpportunitySalesProcess | '')
              setStageFilter('')
            }}
          />
          <CrmFilterSelect
            className="min-w-36 max-w-52 shrink-0"
            value={stageFilter}
            options={stageOptions}
            placeholder={
              salesProcessFilter
                ? undefined
                : t('admin.opportunities.filters.selectSalesProcessFirst')
            }
            ariaLabel={t('admin.opportunities.filters.allStages')}
            disabled={!salesProcessFilter}
            onChange={(next) => {
              resetToFirstPage()
              setStageFilter(next)
            }}
          />
          {domainWrites.isSystemAdmin ? (
            <CrmFilterSelect
              className="min-w-36 max-w-52 shrink-0"
              value={filterGroupId ?? ''}
              options={groupFilterOptions}
              ariaLabel={t('admin.customers.filterAllGroups')}
              onChange={(next) => {
                resetToFirstPage()
                setFilterGroupId(next || null)
              }}
            />
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-medium text-muted">{rangeLabel}</p>
      </div>

      {listError ? (
        <p className="text-sm font-medium text-rose-500">{listError}</p>
      ) : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.opportunities.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideBriefcaseIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {hasFilters ? t('admin.opportunities.noResults') : t('admin.opportunities.empty')}
            </p>
          </div>
        ) : (
          <table
            className={`admin-list-rows ${loading ? '' : pageEnterClass} w-full min-w-[44rem] border-collapse text-left text-sm ${
              swiping || loading ? 'admin-list-transition-disabled' : ''
            }`}
            style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
          >
            <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
              <tr>
                <th className="px-4 py-3">{t('admin.opportunities.col.stage')}</th>
                <th className="px-4 py-3">{t('admin.opportunities.col.name')}</th>
                <th className="hidden px-4 py-3 sm:table-cell">
                  {t('admin.opportunities.col.account')}
                </th>
                <th className="hidden px-4 py-3 md:table-cell">
                  {t('admin.opportunities.col.amount')}
                </th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.opportunities.col.closeDate')}
                </th>
                <th className="px-4 py-3 text-right">
                  {t('admin.opportunities.col.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    {t('admin.leadsTable.loading')}
                  </td>
                </tr>
              ) : null}
              {rows.map((opportunity) => (
                <tr
                  key={opportunity.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(opportunityDetailPath(opportunity.id))}
                >
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex max-w-full items-center rounded-lg border border-ink/10 bg-white/70 px-2 py-1 text-xs font-medium text-ink dark:bg-white/5"
                      title={t('admin.opportunities.stageReadOnlyHint')}
                    >
                      <span className="truncate">
                        {t(`admin.opportunities.stage.${opportunity.stage}`, {
                          defaultValue: opportunity.stage,
                        })}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="rounded font-semibold text-ink hover:text-brand hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        onNavigate(opportunityDetailPath(opportunity.id))
                      }}
                    >
                      {opportunity.name}
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 sm:table-cell">
                    {opportunity.companyName ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 tabular-nums md:table-cell">
                    {opportunity.amount != null ? (
                      <span className="font-medium text-emerald-600">
                        {formatAmount(opportunity.amount, opportunity.currencyCode)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted lg:table-cell">
                    {formatDate(opportunity.expectedCloseDate)}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                        title={t('admin.opportunities.edit')}
                        aria-label={t('admin.opportunities.edit')}
                        onClick={() => onNavigate(opportunityDetailPath(opportunity.id))}
                      >
                        <PencilIcon className="size-3.5" />
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                          title={t('admin.opportunities.delete')}
                          aria-label={t('admin.opportunities.delete')}
                          onClick={() => setDeleteTarget(opportunity)}
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </td>
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
                  {t('admin.opportunities.deleteConfirm.title')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.opportunities.deleteConfirm.message')}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t('admin.leadsTable.deleteConfirm.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    onClick={() => void confirmDelete()}
                  >
                    {t('admin.leadsTable.deleteConfirm.confirm')}
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
