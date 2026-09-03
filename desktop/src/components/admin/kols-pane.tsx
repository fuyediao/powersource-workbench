/**
 * Admin KOL list pane (web KolsView parity): search, tier / status filters,
 * system-admin group filter, pagination, and row drill-down.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import {
  KOL_COOPERATION_STATUS_VALUES,
  KOL_TIER_VALUES,
  kolCooperationBadgeClass,
  kolCurrentStatusBadgeClass,
  kolTierBadgeClass,
} from '@/constants/kol-constants'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  LucideMegaphoneIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import { ChannelPlatformIcon } from '@/utils/channel-platform-icon'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import { deleteKol, KOLS_PAGE_SIZE, listKols } from '@/services/kols-api'
import type {
  KolCooperationStatus,
  KolListRow,
  KolTier,
} from '@/types/kol'
import { kolCreatePath, kolDetailPath } from '@/utils/kol-routes'

interface KolsPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Formats a follower count compactly (1.2K / 3.4M).
 * @param value - Raw count.
 * @returns Compact string, or em dash.
 */
function formatCompactCount(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * Builds up to two uppercase initials for the avatar fallback.
 * @param name - KOL name.
 * @returns Initials string.
 */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Renders a handle with exactly one leading `@`.
 * @param raw - Stored account name.
 * @returns Display handle, or empty string.
 */
function formatHandle(raw: string | null): string {
  const value = (raw ?? '').trim()
  if (!value) {
    return ''
  }
  return value.startsWith('@') ? value : `@${value}`
}

/**
 * Formats last contact as Vue-style relative time.
 * @param iso - ISO timestamp or null.
 * @param t - i18n function.
 * @returns Relative label, or em dash.
 */
function formatLastContact(
  iso: string | null,
  t: (key: string, opts?: Record<string, number>) => string,
): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  const now = Date.now()
  const diffMs = now - date.getTime()
  const days = Math.floor(diffMs / 86_400_000)
  if (days <= 0) {
    return t('admin.kol.time.today')
  }
  if (days === 1) {
    return t('admin.kol.time.yesterday')
  }
  if (days < 30) {
    return t('admin.kol.time.daysAgo', { n: days })
  }
  const months = Math.floor(days / 30)
  if (months < 12) {
    return t('admin.kol.time.monthsAgo', { n: months })
  }
  return t('admin.kol.time.yearsAgo', { n: Math.floor(months / 12) })
}

/**
 * KOL list with filters and pagination.
 * @param props - Shell writes and navigation.
 * @returns List UI.
 */
export function KolsPane({ writes, onNavigate }: KolsPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canDelete = Boolean(writes?.canDelete)

  const [rows, setRows] = useState<KolListRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [tierFilter, setTierFilter] = useState<KolTier | ''>('')
  const [statusFilter, setStatusFilter] = useState<KolCooperationStatus | ''>('')
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const [deleteTarget, setDeleteTarget] = useState<KolListRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deletePresence = useDialogPresence(Boolean(deleteTarget))

  const loadSerial = useRef(0)
  const groupsLoadedRef = useRef(false)
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / KOLS_PAGE_SIZE))

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * KOLS_PAGE_SIZE + 1
    const to = Math.min(page * KOLS_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  const tierOptions = useMemo(
    () => [
      { value: '', label: t('admin.kol.filter.allTiers') },
      ...KOL_TIER_VALUES.map((tier) => ({
        value: tier,
        label: t(`admin.kol.tier.${tier}`),
      })),
    ],
    [t],
  )

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.kol.filter.allStatuses') },
      ...KOL_COOPERATION_STATUS_VALUES.map((status) => ({
        value: status,
        label: t(`admin.kol.cooperationStatus.${status}`),
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
        const result = await listKols({
          page: pageToLoad,
          pageSize: KOLS_PAGE_SIZE,
          searchQuery,
          filters: {
            tier: tierFilter || null,
            cooperationStatus: statusFilter || null,
            filterGroupId,
          },
          isSystemAdmin: domainWrites.isSystemAdmin,
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
        console.error('[KolsPane] load:', err)
        setListError(t('admin.kol.error.load'))
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
      searchQuery,
      statusFilter,
      t,
      tierFilter,
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
   * Deletes the confirmed KOL and reloads the list.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || !canDelete || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteKol(deleteTarget.id)
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      console.error('[KolsPane] delete:', err)
      setListError(t('admin.kol.error.delete'))
    } finally {
      setDeleting(false)
    }
  }

  const hasFilters = Boolean(searchQuery || tierFilter || statusFilter)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-brand">
            {t('admin.kol.title')}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.kol.refresh')}
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('admin.kol.refresh')}</span>
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={() => onNavigate(kolCreatePath())}
            >
              <PlusIcon className="size-4" />
              <span>{t('admin.kol.addButton')}</span>
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
              placeholder={t('admin.kol.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.kol.searchPlaceholder')}
            />
          </div>
          <CrmFilterSelect
            className="min-w-28 max-w-40 shrink-0"
            value={tierFilter}
            options={tierOptions}
            ariaLabel={t('admin.kol.filter.allTiers')}
            onChange={(next) => {
              resetToFirstPage()
              setTierFilter(next as KolTier | '')
            }}
          />
          <CrmFilterSelect
            className="min-w-36 max-w-52 shrink-0"
            value={statusFilter}
            options={statusOptions}
            ariaLabel={t('admin.kol.filter.allStatuses')}
            onChange={(next) => {
              resetToFirstPage()
              setStatusFilter(next as KolCooperationStatus | '')
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
        aria-label={t('admin.kol.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideMegaphoneIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {hasFilters ? t('admin.kol.noResults') : t('admin.kol.empty')}
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
                <th className="px-4 py-3">{t('admin.kol.col.name')}</th>
                <th className="px-4 py-3">{t('admin.kol.col.tier')}</th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.kol.col.platform')}
                </th>
                <th className="px-4 py-3">{t('admin.kol.col.currentStatus')}</th>
                <th className="hidden px-4 py-3 xl:table-cell">
                  {t('admin.kol.col.status')}
                </th>
                <th className="hidden px-4 py-3 xl:table-cell">
                  {t('admin.kol.col.lastContact')}
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
                  <td colSpan={7} className="px-4 py-12 text-center text-muted">
                    {t('status.loading')}
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(kolDetailPath(row.id))}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {row.avatarUrl ? (
                        <img
                          src={row.avatarUrl}
                          alt=""
                          className="size-9 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 text-xs font-bold text-brand">
                          {initials(row.name) || '—'}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">
                          {row.name}
                        </span>
                        {row.accountName ? (
                          <span className="block truncate text-xs font-medium text-muted">
                            {formatHandle(row.accountName)}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {row.tier ? (
                      <span
                        className={`inline-flex size-7 items-center justify-center rounded-md text-xs font-bold ${kolTierBadgeClass(row.tier)}`}
                      >
                        {row.tier}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span className="flex items-center gap-2 text-xs text-ink/80">
                      {row.primaryPlatformKey ? (
                        <>
                          <ChannelPlatformIcon
                            platformKey={row.primaryPlatformKey}
                            className="size-4 shrink-0"
                          />
                          <span className="font-semibold">
                            {t(`admin.kol.platform.${row.primaryPlatformKey}`, {
                              defaultValue: row.primaryPlatformKey,
                            })}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                      <span className="tabular-nums">
                        {formatCompactCount(
                          row.primaryChannelFollowers ?? row.followers,
                        )}
                      </span>
                      {row.extraChannelCount > 0 ? (
                        <span className="text-muted">+{row.extraChannelCount}</span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.currentStatus ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${kolCurrentStatusBadgeClass(row.currentStatus)}`}
                      >
                        {t(`admin.kol.currentStatus.${row.currentStatus}`)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 xl:table-cell">
                    {row.cooperationStatus ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${kolCooperationBadgeClass(row.cooperationStatus)}`}
                      >
                        {t(`admin.kol.cooperationStatus.${row.cooperationStatus}`)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted xl:table-cell">
                    {formatLastContact(row.lastContactAt, t)}
                  </td>
                  {canDelete ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                        title={t('admin.kol.deleteConfirmTitle')}
                        aria-label={t('admin.kol.deleteConfirmTitle')}
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
                  {t('admin.kol.deleteConfirmTitle')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.kol.deleteConfirm')}
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
