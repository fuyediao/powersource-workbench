/**
 * Admin T&E applications list pane (Vue TeManagementView list parity):
 * search, status filter, category sidebar with counts, exclude categories,
 * CSV/JSON export, pagination, and row drill-down.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  categoryBadgeClass,
  categoryLabel,
  displayName,
  formatListDate,
  statusClass,
  TE_CATEGORY_OPTIONS,
} from '@/components/admin/te-application-shared'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { TE_ADMIN_STATUSES, teStatusLabelKey } from '@/constants/te-tracking-stages'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import { useTeSubmissions, type TeEmailCategory, type TeStatus } from '@/hooks/use-te-submissions'
import {
  ChevronDownIcon,
  DownloadIcon,
  LucideClipboardCheckIcon,
  RefreshIcon,
  SearchIcon,
} from '@/icons/AllIcons'
import {
  buildTeProductIdLabelMap,
  fetchTeProductCategories,
  formatTeProductIds,
} from '@/services/te-products-api'
import { teApplicationDetailPath } from '@/utils/te-application-routes'

type ListDropdownId = 'excludeFilter' | 'export' | null

type TeSubmissionsState = ReturnType<typeof useTeSubmissions>

interface TeApplicationsPaneProps {
  writes: AdminShellWrites | null
  submissionsState: TeSubmissionsState
  onNavigate: (path: string) => void
}

/**
 * T&E applications list with filters, category sidebar, and pagination.
 *
 * @param props - Shell writes and navigation
 * @returns List UI
 */
export function TeApplicationsPane({
  submissionsState,
  onNavigate,
}: TeApplicationsPaneProps) {
  const { t } = useTranslation()
  const {
    submissions,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    searchQuery,
    statusFilter,
    categoryFilter,
    excludedCategories,
    categoryCounts,
    fetchSubmissions,
    setSearch,
    setStatusFilter,
    setCategoryFilter,
    toggleExcludedCategory,
    clearExcludedCategories,
    goToPage,
    exportCsv,
    exportJson,
    exportSheets,
  } = submissionsState

  const [localSearch, setLocalSearch] = useState('')
  const [openDropdown, setOpenDropdown] = useState<ListDropdownId>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const [productLabelMap, setProductLabelMap] = useState<Record<string, string>>({})
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.te.statusAll') },
      ...TE_ADMIN_STATUSES.map((status) => ({
        value: status,
        label: t(teStatusLabelKey(status)),
      })),
    ],
    [t],
  )

  const sidebarActive: TeEmailCategory | 'all' = categoryFilter || 'all'

  const excludeFilterLabel = useMemo(() => {
    if (excludedCategories.length === 0) return t('admin.te.excludeNone')
    if (excludedCategories.length === 1) {
      const first = excludedCategories[0]
      return t('admin.te.excludeSingle', {
        category: first ? categoryLabel(t, first) : '',
      })
    }
    return t('admin.te.excludeCount', { count: excludedCategories.length })
  }, [excludedCategories, t])

  const pageEnterClass =
    enterDirection === 'next' ? 'admin-list-enter-next' : 'admin-list-enter-prev'

  const hasFilters = Boolean(
    searchQuery || statusFilter || categoryFilter || excludedCategories.length,
  )

  const fetchSubmissionsRef = useRef(fetchSubmissions)
  fetchSubmissionsRef.current = fetchSubmissions

  useEffect(() => {
    void fetchSubmissionsRef.current()
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchTeProductCategories()
      .then((categories) => {
        if (!cancelled) setProductLabelMap(buildTeProductIdLabelMap(categories))
      })
      .catch((err: unknown) => {
        console.error('[TeApplicationsPane] load catalog:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) window.clearTimeout(searchTimer.current)
    }
  }, [])

  useEffect(() => {
    /**
     * Close toolbar dropdowns when clicking elsewhere.
     *
     * @param event - Document click event
     */
    function onDocumentClick(event: MouseEvent): void {
      const target = event.target as HTMLElement
      if (!target.closest('[data-dropdown]')) setOpenDropdown(null)
    }
    document.addEventListener('click', onDocumentClick)
    return () => document.removeEventListener('click', onDocumentClick)
  }, [])

  /**
   * Debounces search input into the committed query.
   *
   * @param value - Raw input
   */
  function onSearchChange(value: string): void {
    setLocalSearch(value)
    if (searchTimer.current != null) window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => {
      setEnterDirection('next')
      void setSearch(value)
    }, 350)
  }

  /**
   * Resolve the count shown beside one sidebar category.
   *
   * @param value - Sidebar category or all
   * @returns Matching count
   */
  function sidebarCount(value: TeEmailCategory | 'all'): number {
    return categoryCounts[value] ?? 0
  }

  /**
   * Apply or clear the sidebar category.
   *
   * @param value - Sidebar category or all
   */
  async function setSidebarCategory(value: TeEmailCategory | 'all'): Promise<void> {
    setEnterDirection('next')
    if (value === 'all' || categoryFilter === value) {
      await setCategoryFilter('')
      return
    }
    await setCategoryFilter(value)
  }

  /**
   * Apply the toolbar status filter.
   *
   * @param value - Exact status or empty string
   */
  async function setToolbarStatus(value: TeStatus | ''): Promise<void> {
    setEnterDirection('next')
    await setStatusFilter(value)
  }

  /**
   * Navigate to a page with enter animation direction.
   *
   * @param nextPage - Target page
   * @param direction - Slide direction
   */
  function handleGoToPage(nextPage: number, direction: PageSwipeDirection): void {
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage || isLoading) {
      return
    }
    setEnterDirection(direction)
    void goToPage(nextPage)
  }

  /**
   * Handles horizontal swipe between pages.
   *
   * @param direction - Swipe direction
   */
  function handlePageSwipe(direction: PageSwipeDirection): void {
    if (direction === 'next') {
      handleGoToPage(currentPage + 1, 'next')
    } else {
      handleGoToPage(currentPage - 1, 'prev')
    }
  }

  const { swiping, dragOffset, pointerHandlers } = useHorizontalPageSwipe({
    canGoPrev: currentPage > 1,
    canGoNext: currentPage < totalPages,
    scrollRef: listScrollRef,
    enabled: !isLoading,
    onPageSwipe: handlePageSwipe,
  })

  /**
   * Toggle one toolbar dropdown.
   *
   * @param id - Dropdown identifier
   */
  const toggleDropdown = useCallback((id: ListDropdownId): void => {
    setOpenDropdown((current) => (current === id ? null : id))
  }, [])

  /**
   * Format stored product ids using the loaded catalog map.
   *
   * @param productIds - Requested or approved product ids
   * @returns Comma-separated labels
   */
  function formatProducts(productIds: string[] | null | undefined): string {
    return formatTeProductIds(productIds, productLabelMap)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">{t('admin.te.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.te.refresh')}
            aria-label={t('admin.te.refresh')}
            disabled={isLoading}
            onClick={() => void fetchSubmissions()}
          >
            <RefreshIcon className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('admin.te.refresh')}</span>
          </button>
          <div className="relative" data-dropdown="export">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm font-bold text-brand transition-colors hover:bg-brand/20"
              onClick={(event) => {
                event.stopPropagation()
                toggleDropdown('export')
              }}
            >
              <DownloadIcon className="size-4" />
              <span>{t('admin.te.export')}</span>
              <ChevronDownIcon
                className={`size-3.5 transition ${openDropdown === 'export' ? 'rotate-180' : ''}`}
              />
            </button>
            {openDropdown === 'export' ? (
              <div className="absolute right-0 z-30 mt-2 min-w-44 overflow-hidden rounded-2xl border border-ink/10 bg-white/95 shadow-xl dark:border-white/10 dark:bg-zinc-950/95">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-white/5"
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenDropdown(null)
                    void exportCsv()
                  }}
                >
                  {t('admin.te.exportCsv')}
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-white/5"
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenDropdown(null)
                    void exportJson()
                  }}
                >
                  {t('admin.te.exportJson')}
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-white/5"
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenDropdown(null)
                    void exportSheets()
                  }}
                >
                  {t('admin.te.exportSheets')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col overflow-hidden rounded-3xl border border-ink/10 bg-white/60 lg:w-56 lg:max-w-60 lg:self-stretch dark:border-white/10 dark:bg-white/5">
          <nav
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3"
            aria-label={t('admin.te.sidebar.heading')}
          >
            <div>
              <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-muted uppercase">
                {t('admin.te.sidebar.sectionView')}
              </p>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  sidebarActive === 'all'
                    ? 'border-brand/50 bg-brand/10 text-brand'
                    : 'border-transparent text-ink hover:bg-white/5'
                }`}
                onClick={() => void setSidebarCategory('all')}
              >
                <span>{t('admin.te.sidebar.filter.all')}</span>
                <span className="text-xs text-muted tabular-nums">{sidebarCount('all')}</span>
              </button>
            </div>
            <div>
              <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-muted uppercase">
                {t('admin.te.sidebar.sectionCategory')}
              </p>
              <div className="flex flex-col gap-0.5">
                {TE_CATEGORY_OPTIONS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      sidebarActive === item.value
                        ? 'border-brand/50 bg-brand/10 text-brand'
                        : 'border-transparent text-ink hover:bg-white/5'
                    }`}
                    onClick={() => void setSidebarCategory(item.value)}
                  >
                    <span>{t(item.labelKey)}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {sidebarCount(item.value)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <div className="relative z-20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] max-w-sm flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input
                  type="search"
                  value={localSearch}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder={t('admin.te.searchPlaceholder')}
                  className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
                  aria-label={t('admin.te.searchPlaceholder')}
                />
              </div>
              <CrmFilterSelect
                className="min-w-36 max-w-52 shrink-0"
                value={statusFilter}
                options={statusOptions}
                ariaLabel={t('admin.te.statusFilterLabel')}
                onChange={(next) => {
                  void setToolbarStatus(next as TeStatus | '')
                }}
              />
              <div className="relative shrink-0" data-dropdown="excludeFilter">
                <button
                  type="button"
                  className={`inline-flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-sm font-medium transition-colors sm:w-44 ${
                    excludedCategories.length
                      ? 'border-rose-500/40 text-rose-500'
                      : 'border-ink/10 text-ink hover:border-brand/40 dark:border-white/10'
                  }`}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggleDropdown('excludeFilter')
                  }}
                >
                  <span className="truncate">{excludeFilterLabel}</span>
                  <ChevronDownIcon className="size-3.5 text-muted" />
                </button>
                {openDropdown === 'excludeFilter' ? (
                  <div
                    className="absolute top-[calc(100%+0.35rem)] left-0 z-30 min-w-52 rounded-2xl border border-ink/10 bg-white/95 py-1 shadow-xl dark:border-white/10 dark:bg-zinc-950/95"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p className="px-3 py-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">
                      {t('admin.te.excludeMenuTitle')}
                    </p>
                    {TE_CATEGORY_OPTIONS.map((item) => (
                      <label
                        key={`exclude-${item.value}`}
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          className="size-3.5 rounded border-ink/20"
                          checked={excludedCategories.includes(item.value)}
                          onChange={() => {
                            setEnterDirection('next')
                            void toggleExcludedCategory(item.value)
                          }}
                        />
                        <span>{t(item.labelKey)}</span>
                      </label>
                    ))}
                    {excludedCategories.length ? (
                      <button
                        type="button"
                        className="mt-1 w-full border-t border-ink/10 px-3 py-2 text-left text-sm text-muted hover:bg-white/5 hover:text-ink dark:border-white/10"
                        onClick={(event) => {
                          event.stopPropagation()
                          setOpenDropdown(null)
                          setEnterDirection('next')
                          void clearExcludedCategories()
                        }}
                      >
                        {t('admin.te.clearExclude')}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <p className="shrink-0 text-xs text-muted tabular-nums">
              {t('admin.te.totalCount', { count: totalCount })}
            </p>
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-500">
              {error}
            </p>
          ) : null}

          <div
            ref={listScrollRef}
            role="region"
            aria-label={t('admin.te.title')}
            className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:border-white/10 dark:bg-white/5 ${
              swiping ? 'admin-list-swiping' : ''
            }`}
            {...pointerHandlers}
          >
            {!isLoading && submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
                <LucideClipboardCheckIcon className="size-10 opacity-30" aria-hidden />
                <p className="text-sm font-medium">
                  {hasFilters ? t('admin.te.noResults') : t('admin.te.empty')}
                </p>
              </div>
            ) : (
              <table
                className={`admin-list-rows ${isLoading ? '' : pageEnterClass} w-full min-w-[44rem] border-collapse text-left text-sm ${
                  swiping || isLoading ? 'admin-list-transition-disabled' : ''
                }`}
                style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
              >
                <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
                  <tr>
                    <th className="px-4 py-3">{t('admin.te.col.name')}</th>
                    <th className="hidden px-4 py-3 md:table-cell">{t('admin.te.col.agency')}</th>
                    <th className="hidden px-4 py-3 lg:table-cell">{t('admin.te.col.products')}</th>
                    <th className="px-4 py-3">{t('admin.te.col.status')}</th>
                    <th className="hidden px-4 py-3 xl:table-cell">
                      {t('admin.te.col.emailCategory')}
                    </th>
                    <th className="px-4 py-3">{t('admin.te.col.submittedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && submissions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted">
                        <RefreshIcon className="mr-2 inline-block size-5 animate-spin" />
                        {t('common.loading')}
                      </td>
                    </tr>
                  ) : null}
                  {submissions.map((submission) => (
                    <tr
                      key={submission.id}
                      className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                      onClick={() => onNavigate(teApplicationDetailPath(submission.id))}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-brand">
                          {displayName(submission)}
                        </p>
                        <p className="text-xs text-muted">{submission.email ?? '—'}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-muted md:table-cell">
                        {submission.agency ?? '—'}
                      </td>
                      <td className="hidden px-4 py-3 text-xs text-ink lg:table-cell">
                        {formatProducts(submission.approvedProductIds ?? submission.product)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${statusClass(submission.status)}`}
                        >
                          {t(teStatusLabelKey(submission.status))}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 xl:table-cell">
                        <span
                          className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${categoryBadgeClass(submission.emailCategory)}`}
                        >
                          {categoryLabel(t, submission.emailCategory)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {formatListDate(submission.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <PaginationStrip
            currentPage={currentPage}
            totalPages={totalPages}
            disabled={isLoading}
            onGoToPage={(nextPage) =>
              handleGoToPage(nextPage, nextPage > currentPage ? 'next' : 'prev')
            }
          />
        </div>
      </div>
    </div>
  )
}
