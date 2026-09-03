/**
 * Admin follow-ups list pane: company-grouped rows, search, pagination, create modal.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { FollowUpCreateDialog } from '@/components/admin/follow-up-create-dialog'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  LucideBuilding2Icon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
} from '@/icons/AllIcons'
import { FOLLOW_UPS_PAGE_SIZE, listFollowUps } from '@/services/follow-ups-api'
import type { FollowUp, FollowUpEntityType } from '@/types/follow-up'
import {
  followUpCompanyPath,
  followUpEntityPath,
} from '@/utils/follow-up-routes'

interface FollowUpsPaneProps {
  userId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

interface EntityRef {
  type: FollowUpEntityType
  id: string
}

interface CompanyRow {
  name: string
  entities: EntityRef[]
  count: number
}

/**
 * Groups follow-ups by entity, then merges rows that share the same company name.
 * @param fuList - Current page of follow-ups.
 * @returns Company rows sorted by name.
 */
function buildCompanyRows(fuList: FollowUp[]): CompanyRow[] {
  const byEntity = new Map<
    string,
    { name: string; type: FollowUpEntityType; id: string; count: number }
  >()

  for (const fu of fuList) {
    let type: FollowUpEntityType | null = null
    let id = ''
    let name = ''
    if (fu.customerId) {
      type = 'customer'
      id = fu.customerId
      name = (fu.customerName ?? '').trim()
    } else if (fu.leadId) {
      type = 'lead'
      id = fu.leadId
      name = (fu.leadName ?? '').trim()
    } else if (fu.opportunityId) {
      type = 'opportunity'
      id = fu.opportunityId
      name = (fu.opportunityName ?? '').trim()
    } else if (fu.kolId) {
      type = 'kol'
      id = fu.kolId
      name = (fu.kolName ?? '').trim()
    } else if (fu.competitorShopId) {
      type = 'competitor'
      id = fu.competitorShopId
      name = (fu.competitorShopName ?? '').trim()
    }
    if (!type || !id) {
      continue
    }
    const key = `${type}:${id}`
    const existing = byEntity.get(key)
    if (existing) {
      existing.count += 1
      if (!existing.name && name) {
        existing.name = name
      }
    } else {
      byEntity.set(key, { name: name || id, type, id, count: 1 })
    }
  }

  const byCompany = new Map<string, CompanyRow>()
  for (const entry of byEntity.values()) {
    const mergeKey = entry.name.toLowerCase() || entry.id
    const existing = byCompany.get(mergeKey)
    if (existing) {
      existing.entities.push({ type: entry.type, id: entry.id })
      existing.count += entry.count
    } else {
      byCompany.set(mergeKey, {
        name: entry.name,
        entities: [{ type: entry.type, id: entry.id }],
        count: entry.count,
      })
    }
  }

  return [...byCompany.values()].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )
}

/**
 * Admin CRM follow-ups list with create modal.
 * @param props - User, writes, navigation.
 * @returns List UI.
 */
export function FollowUpsPane({
  userId,
  writes,
  onNavigate,
}: FollowUpsPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)

  const [rows, setRows] = useState<FollowUp[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const [createOpen, setCreateOpen] = useState(false)

  const loadSerial = useRef(0)
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / FOLLOW_UPS_PAGE_SIZE))
  const companyRows = useMemo(() => buildCompanyRows(rows), [rows])

  const rangeLabel = useMemo(() => {
    if (totalCount === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * FOLLOW_UPS_PAGE_SIZE + 1
    const to = Math.min(page * FOLLOW_UPS_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

  const pageEnterClass =
    enterDirection === 'next' ? 'admin-list-enter-next' : 'admin-list-enter-prev'

  /**
   * Reloads the follow-ups list.
   * @param options - Optional page override (avoids stale closure after setPage).
   * @returns Nothing.
   */
  const reload = useCallback(
    async (options?: { page?: number }): Promise<void> => {
      const pageToLoad = options?.page ?? page
      const serial = ++loadSerial.current
      setLoading(true)
      setListError(null)
      try {
        const result = await listFollowUps(userId, {
          page: pageToLoad,
          pageSize: FOLLOW_UPS_PAGE_SIZE,
          searchQuery,
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
        console.error('[FollowUpsPane] load:', err)
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : ''
        if (/relation.*does not exist|42P01/i.test(msg)) {
          setListError(t('admin.followUps.errorTableMissing'))
        } else {
          setListError(t('admin.followUps.errorLoad'))
        }
        setRows([])
        setTotalCount(0)
      } finally {
        if (serial === loadSerial.current) {
          setLoading(false)
        }
      }
    },
    [page, searchQuery, t, userId],
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
   * Debounces search into the committed query.
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
   * Opens company or entity timeline for a list row.
   * @param row - Company row.
   * @returns Nothing.
   */
  function openRow(row: CompanyRow): void {
    if (row.entities.length === 1) {
      const only = row.entities[0]
      onNavigate(followUpEntityPath(only.type, only.id, row.name))
      return
    }
    onNavigate(followUpCompanyPath(row.name, row.entities))
  }

  /**
   * Opens the create modal when the user may create follow-ups.
   * @returns Nothing.
   */
  function openCreate(): void {
    if (!canCreate) {
      return
    }
    setCreateOpen(true)
  }

  /**
   * Reloads page 1 after a successful create.
   * @returns Nothing.
   */
  async function onCreated(): Promise<void> {
    setEnterDirection('next')
    setPage(1)
    await reload({ page: 1 })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.followUps.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.customers.refresh')}
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('admin.customers.refresh')}</span>
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
              onClick={openCreate}
            >
              <PlusIcon className="size-4" />
              <span>{t('admin.followUps.addFollowUp')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[12rem] max-w-sm flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('admin.followUps.searchPlaceholder')}
            className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
            aria-label={t('admin.followUps.searchPlaceholder')}
          />
        </div>
        <p className="shrink-0 text-sm font-medium text-muted">{rangeLabel}</p>
      </div>

      {listError ? (
        <p className="text-sm font-medium text-rose-500">{listError}</p>
      ) : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.followUps.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!loading && companyRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideBuilding2Icon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">{t('admin.followUps.empty')}</p>
          </div>
        ) : (
          <ul
            className={`admin-list-rows ${loading ? '' : pageEnterClass} divide-y divide-ink/5 ${
              swiping || loading ? 'admin-list-transition-disabled' : ''
            }`}
            style={{
              transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
            }}
          >
            {loading && companyRows.length === 0 ? (
              <li className="px-4 py-12 text-center text-sm text-muted">
                {t('status.loading')}
              </li>
            ) : null}
            {companyRows.map((row) => {
              const entityHint =
                row.entities[0] != null
                  ? t(`admin.followUps.entityType.${row.entities[0].type}`)
                  : null
              return (
                <li
                  key={`${row.name}:${row.entities.map((e) => `${e.type}:${e.id}`).join(',')}`}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-brand/5"
                    onClick={() => openRow(row)}
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <LucideBuilding2Icon
                        className="size-4 shrink-0 text-brand/70"
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">
                          {row.name}
                        </span>
                        {entityHint ? (
                          <span className="block truncate text-[11px] font-medium text-muted">
                            {entityHint}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold tracking-wide text-muted uppercase">
                      {t('admin.followUps.followUpCount', { count: row.count })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
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

      {canCreate ? (
        <FollowUpCreateDialog
          open={createOpen}
          userId={userId}
          groupId={domainWrites.groupId}
          isSystemAdmin={domainWrites.isSystemAdmin}
          onClose={() => setCreateOpen(false)}
          onCreated={onCreated}
        />
      ) : null}
    </div>
  )
}
