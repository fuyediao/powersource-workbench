/**
 * Admin CRM contacts list pane (web ContactsListView parity).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  LucideBuilding2Icon,
  LucideCircleUserIcon,
  RefreshIcon,
  SearchIcon,
} from '@/icons/AllIcons'
import {
  CONTACTS_LIST_PAGE_SIZE,
  listAllCustomerContacts,
} from '@/services/customer-contacts-api'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import type { CustomerContactListRow } from '@/types/customer'

interface ContactsListPaneProps {
  /** Shell path navigation (open parent customer detail). */
  onNavigate: (path: string) => void
}

/**
 * Global contacts list with search, system-admin group filter, and pagination.
 * Row click opens the parent customer detail under Customers.
 * @param props - Navigation callback.
 * @returns Contacts list UI.
 */
export function ContactsListPane({ onNavigate }: ContactsListPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()

  const [rows, setRows] = useState<CustomerContactListRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterGroupId, setFilterGroupId] = useState<string | null>(null)
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')

  const loadSerial = useRef(0)
  const groupsLoadedRef = useRef(false)
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const totalPages = Math.max(1, Math.ceil(totalCount / CONTACTS_LIST_PAGE_SIZE))

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
    const from = (page - 1) * CONTACTS_LIST_PAGE_SIZE + 1
    const to = Math.min(page * CONTACTS_LIST_PAGE_SIZE, totalCount)
    return t('admin.customers.countText', { from, to, total: totalCount })
  }, [page, t, totalCount])

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
      const result = await listAllCustomerContacts({
        page,
        pageSize: CONTACTS_LIST_PAGE_SIZE,
        searchQuery,
        filterGroupId,
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
      console.error('[ContactsListPane] load:', err)
      setListError(t('admin.customers.detail.errorLoadContacts'))
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
   * Opens the parent customer detail (Customers module).
   * @param customerId - Customer UUID.
   * @returns Nothing.
   */
  function goToCustomer(customerId: string): void {
    onNavigate(`/admin/customers/${customerId}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.contactsList.title')}
        </h1>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
          title={t('admin.customers.refresh')}
          onClick={() => void reload()}
        >
          <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('admin.customers.refresh')}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] max-w-sm flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('admin.contactsList.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.contactsList.searchPlaceholder')}
            />
          </div>
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
        <p className="shrink-0 text-sm font-medium text-muted">{rangeLabel}</p>
      </div>

      {listError ? <p className="text-sm font-medium text-rose-500">{listError}</p> : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.contactsList.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!loading && rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideCircleUserIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {searchQuery || filterGroupId
                ? t('admin.contactsList.noResults')
                : t('admin.contactsList.empty')}
            </p>
          </div>
        ) : (
          <table
            className={`admin-list-rows ${loading ? '' : pageEnterClass} w-full min-w-[36rem] border-collapse text-left text-sm ${
              swiping || loading ? 'admin-list-transition-disabled' : ''
            }`}
            style={{ transform: dragOffset ? `translateX(${dragOffset}px)` : undefined }}
          >
            <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
              <tr>
                <th className="px-4 py-3">
                  {t('admin.customers.contacts.col.name')}
                </th>
                <th className="hidden px-4 py-3 sm:table-cell">
                  {t('admin.customers.contacts.col.title')}
                </th>
                <th className="px-4 py-3">{t('admin.contactsList.col.company')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-muted">
                    {t('status.loading')}
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => goToCustomer(row.customerId)}
                >
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="text-left font-semibold text-brand hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        goToCustomer(row.customerId)
                      }}
                    >
                      {row.name}
                    </button>
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 sm:table-cell">
                    {row.title?.trim() || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="inline-flex max-w-[12rem] items-center gap-1.5 text-left font-medium text-brand hover:underline"
                      onClick={(e) => {
                        e.stopPropagation()
                        goToCustomer(row.customerId)
                      }}
                    >
                      <LucideBuilding2Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
                      <span className="truncate">
                        {row.companyName?.trim() || row.customerId}
                      </span>
                    </button>
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
    </div>
  )
}
