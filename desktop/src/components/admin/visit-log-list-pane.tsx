/**
 * Admin visit-log global list (Vue VisitLogView parity).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  EyeIcon,
  LucideClipboardListIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  deleteVisitLog,
  listVisitLogs,
  VISIT_LOG_LIST_PAGE_SIZE,
} from '@/services/customer-visit-logs-api'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import type { CustomerVisitLog } from '@/types/customer'
import { visitLogCreatorLabel } from '@/utils/profile-display-label'

interface VisitLogListPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Formats an ISO date for list cells.
 * @param dateStr - ISO string or null.
 * @returns Locale date or em dash.
 */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) {
    return '—'
  }
  try {
    return new Date(dateStr).toLocaleDateString()
  } catch {
    return dateStr
  }
}

/**
 * Global visit-log list with search, creator/group filters, and pagination.
 * @param props - Writes and navigation.
 * @returns List UI.
 */
export function VisitLogListPane({ writes, onNavigate }: VisitLogListPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canDelete = Boolean(writes?.canDelete)

  const [rows, setRows] = useState<CustomerVisitLog[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCreatorEmail, setFilterCreatorEmail] = useState('')
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadSerial = useRef(0)
  const groupsLoadedRef = useRef(false)
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / VISIT_LOG_LIST_PAGE_SIZE))

  const creatorOptions = useMemo(() => {
    const byEmail = new Map<string, string>()
    for (const row of rows) {
      const email = (row.createdByEmail ?? '').trim()
      if (!email || byEmail.has(email)) {
        continue
      }
      byEmail.set(email, visitLogCreatorLabel(row))
    }
    return [
      { value: '', label: t('admin.visitLog.filterAll') },
      ...Array.from(byEmail.entries())
        .map(([email, label]) => ({ value: email, label }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
    ]
  }, [rows, t])

  const groupFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.customers.filterAllGroups') },
      ...groups.map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups, t],
  )

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * VISIT_LOG_LIST_PAGE_SIZE + 1
    const to = Math.min(page * VISIT_LOG_LIST_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  const pageEnterClass =
    enterDirection === 'next' ? 'admin-list-enter-next' : 'admin-list-enter-prev'

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
      const result = await listVisitLogs({
        page,
        pageSize: VISIT_LOG_LIST_PAGE_SIZE,
        searchQuery,
        filterCreatedByEmail: filterCreatorEmail || undefined,
        filterGroupId,
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
      console.error('[VisitLogListPane] load:', err)
      setListError(t('admin.visitLog.error.load'))
      setRows([])
      setTotalCount(0)
    } finally {
      if (serial === loadSerial.current) {
        setLoading(false)
      }
    }
  }, [
    domainWrites.isSystemAdmin,
    filterCreatorEmail,
    filterGroupId,
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
   * Debounces search input.
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
   * Navigates to a page.
   * @param nextPage - Target page.
   * @param direction - Enter animation.
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
   * Handles swipe paging.
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

  const canGoPrev = page > 1
  const canGoNext = page < totalPages
  const { swiping, dragOffset, pointerHandlers } = useHorizontalPageSwipe({
    canGoPrev,
    canGoNext,
    scrollRef: listScrollRef,
    enabled: !loading,
    onPageSwipe: handlePageSwipe,
  })

  /**
   * Opens detail for a visit log.
   * @param id - Visit log id.
   * @returns Nothing.
   */
  function goToDetail(id: string): void {
    onNavigate(`/admin/visit-log/${id}`)
  }

  /**
   * Confirms delete.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTargetId || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteVisitLog(deleteTargetId)
      setDeleteTargetId(null)
      await reload()
    } catch (err) {
      console.error('[VisitLogListPane] delete:', err)
      setListError(t('admin.visitLog.error.delete'))
      setDeleteTargetId(null)
    } finally {
      setDeleting(false)
    }
  }

  /**
   * Customer/KOL cell label.
   * @param log - Visit log.
   * @returns Display text.
   */
  function targetLabel(log: CustomerVisitLog): string {
    return (
      log.kolName ||
      log.companyName ||
      log.customerNameText ||
      t('admin.visitLog.noCustomer')
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">{t('admin.visitLog.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.visitLog.refresh')}
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('admin.visitLog.refresh')}</span>
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={() => onNavigate('/admin/visit-log/new')}
            >
              <PlusIcon className="size-4" aria-hidden />
              {t('admin.visitLog.addButton')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] max-w-xs flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('admin.visitLog.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.visitLog.searchPlaceholder')}
            />
          </div>
          <CrmFilterSelect
            className="min-w-44 max-w-56"
            value={filterCreatorEmail}
            options={creatorOptions}
            searchable
            searchPlaceholder={t('admin.visitLog.filterCreatorSearchPlaceholder')}
            ariaLabel={t('admin.visitLog.filterByCreator')}
            onChange={(next) => {
              setEnterDirection('next')
              setLoading(true)
              setPage(1)
              setFilterCreatorEmail(next)
            }}
          />
          {domainWrites.isSystemAdmin ? (
            <CrmFilterSelect
              className="min-w-36 max-w-52"
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
        <p className="shrink-0 text-sm font-medium leading-none text-muted">{rangeLabel}</p>
      </div>

      {listError ? <p className="text-sm font-medium text-rose-500">{listError}</p> : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.visitLog.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideClipboardListIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {searchQuery || filterCreatorEmail || filterGroupId
                ? t('admin.visitLog.noResults')
                : t('admin.visitLog.empty')}
            </p>
          </div>
        ) : (
          <table
            className={`admin-list-rows ${loading ? '' : pageEnterClass} w-full min-w-[48rem] border-collapse text-left text-sm ${
              swiping || loading ? 'admin-list-transition-disabled' : ''
            }`}
            style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
          >
            <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
              <tr>
                <th className="px-4 py-3">{t('admin.visitLog.col.customer')}</th>
                <th className="px-4 py-3">{t('admin.visitLog.col.subject')}</th>
                <th className="hidden px-4 py-3 xl:table-cell">
                  {t('admin.visitLog.col.interestedProducts')}
                </th>
                <th className="hidden px-4 py-3 sm:table-cell">
                  {t('admin.visitLog.col.visitDate')}
                </th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.visitLog.col.createdBy')}
                </th>
                <th className="hidden px-4 py-3 xl:table-cell">
                  {t('admin.visitLog.col.createdAt')}
                </th>
                <th className="px-4 py-3 text-right">{t('admin.visitLog.col.actions')}</th>
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
              {rows.map((log) => (
                <tr
                  key={log.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => goToDetail(log.id)}
                >
                  <td className="px-4 py-3 font-semibold text-brand">
                    {log.kolId ? (
                      <span className="mr-1.5 inline-flex rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                        {t('admin.visitLog.kolBadge')}
                      </span>
                    ) : null}
                    {targetLabel(log)}
                  </td>
                  <td className="px-4 py-3 text-ink/80">{log.subject || '—'}</td>
                  <td className="hidden px-4 py-3 xl:table-cell">
                    {log.interestedProducts?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {log.interestedProducts.slice(0, 3).map((product) => (
                          <span
                            key={product}
                            className="rounded-full bg-brand/15 px-1.5 py-0.5 text-xs font-semibold text-brand"
                          >
                            {product}
                          </span>
                        ))}
                        {log.interestedProducts.length > 3 ? (
                          <span className="rounded-full bg-ink/10 px-1.5 py-0.5 text-xs text-muted">
                            +{log.interestedProducts.length - 3}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 sm:table-cell">
                    {formatDate(log.visitDate)}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 lg:table-cell">
                    {visitLogCreatorLabel(log)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted xl:table-cell">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                        title={t('admin.visitLog.viewDetail')}
                        aria-label={t('admin.visitLog.viewDetail')}
                        onClick={() => goToDetail(log.id)}
                      >
                        <EyeIcon className="size-3.5" aria-hidden />
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                          title={t('admin.customers.deleteButton')}
                          aria-label={t('admin.customers.deleteButton')}
                          onClick={() => setDeleteTargetId(log.id)}
                        >
                          <TrashIcon className="size-3.5" aria-hidden />
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

      {deleteTargetId
        ? createPortal(
            <div className="fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]">
              <div className="w-full max-w-sm rounded-3xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
                <h4 className="text-base font-extrabold text-ink">
                  {t('admin.visitLog.deleteConfirmTitle')}
                </h4>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.visitLog.deleteConfirm')}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-ink dark:bg-white/10"
                    disabled={deleting}
                    onClick={() => setDeleteTargetId(null)}
                  >
                    {t('admin.customers.deleteConfirm.cancel')}
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-rose-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                    disabled={deleting}
                    onClick={() => void confirmDelete()}
                  >
                    {deleting
                      ? t('admin.customers.deleteConfirm.deleting')
                      : t('admin.customers.deleteConfirm.confirm')}
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
