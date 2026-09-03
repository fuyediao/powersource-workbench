/**
 * Admin T&E community-user list (Vue TeCommunityUsersView list chrome).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import {
  useTeCommunityAccounts,
  type TeCommunityAccountStatus,
} from '@/hooks/use-te-community-accounts'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import {
  ChevronDownIcon,
  LucideUsersRoundIcon,
  RefreshIcon,
  SearchIcon,
} from '@/icons/AllIcons'
import { formatDisplayDateTime } from '@/utils/format-display-date'
import { teUserDetailPath } from '@/utils/te-user-routes'

/** Account statuses that can be assigned in the admin UI. */
export const TE_ACCOUNT_STATUSES: TeCommunityAccountStatus[] = [
  'active',
  'suspended',
  'banned',
]

interface TeUsersPaneProps {
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
  /** When true, the list is visible and should refresh after returning from detail. */
  listActive?: boolean
}

interface RowStatusMenuRect {
  top: number
  left: number
  width: number
}

/**
 * Badge classes for a community account status (readable on light and dark chrome).
 *
 * @param status - Account status.
 * @returns Tailwind class string.
 */
export function teAccountStatusClass(status: TeCommunityAccountStatus): string {
  switch (status) {
    case 'active':
      return 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'suspended':
      return 'border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'banned':
      return 'border border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300'
    default:
      return 'border border-ink/15 bg-ink/5 text-muted'
  }
}

/**
 * T&E community-user list with search, status filter, pagination, and status edits.
 *
 * @param props - Shell writes, navigation, and list-visibility flag.
 * @returns List UI.
 */
export function TeUsersPane({
  writes,
  onNavigate,
  listActive = true,
}: TeUsersPaneProps) {
  const { t } = useTranslation()
  const canEdit = Boolean(writes?.canEdit)
  const {
    accounts,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    searchQuery,
    statusFilter,
    fetchAccounts,
    setSearch,
    setStatusFilter,
    goToPage,
    updateAccountStatus,
  } = useTeCommunityAccounts()

  const [searchInput, setSearchInput] = useState('')
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [rowStatusAnchorId, setRowStatusAnchorId] = useState<string | null>(null)
  const [rowStatusMenuRect, setRowStatusMenuRect] = useState<RowStatusMenuRect | null>(
    null,
  )

  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const prevListActive = useRef(listActive)
  const tableColSpan = canEdit ? 8 : 7

  const statusFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.teUsers.statusAll') },
      ...TE_ACCOUNT_STATUSES.map((status) => ({
        value: status,
        label: t(`admin.teUsers.status.${status}`),
      })),
    ],
    [t],
  )

  const pageEnterClass =
    enterDirection === 'next' ? 'admin-list-enter-next' : 'admin-list-enter-prev'

  const hasFilters = Boolean(searchQuery || statusFilter)

  useEffect(() => {
    if (listActive) {
      void fetchAccounts()
    }
    // Initial load only; search / filter / page already fetch inside the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount
  }, [])

  useEffect(() => {
    if (listActive && !prevListActive.current) {
      void fetchAccounts()
    }
    prevListActive.current = listActive
  }, [fetchAccounts, listActive])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) {
        window.clearTimeout(searchTimer.current)
      }
    }
  }, [])

  /**
   * Closes the row status portal menu.
   */
  const closeRowStatusMenu = useCallback((): void => {
    setRowStatusAnchorId(null)
    setRowStatusMenuRect(null)
  }, [])

  useEffect(() => {
    if (!rowStatusAnchorId) {
      return
    }

    /**
     * Closes the portal when the click is outside the menu.
     *
     * @param event - Document click.
     */
    function onDocumentClick(event: MouseEvent): void {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }
      if (!target.closest('[data-te-user-status-menu]')) {
        closeRowStatusMenu()
      }
    }

    document.addEventListener('click', onDocumentClick)
    window.addEventListener('scroll', closeRowStatusMenu, true)
    return () => {
      document.removeEventListener('click', onDocumentClick)
      window.removeEventListener('scroll', closeRowStatusMenu, true)
    }
  }, [closeRowStatusMenu, rowStatusAnchorId])

  /**
   * Debounces search input into the committed query.
   *
   * @param value - Raw input.
   */
  function onSearchChange(value: string): void {
    setSearchInput(value)
    if (searchTimer.current != null) {
      window.clearTimeout(searchTimer.current)
    }
    searchTimer.current = window.setTimeout(() => {
      setEnterDirection('next')
      void setSearch(value)
    }, 300)
  }

  /**
   * Navigates to a page with enter animation direction.
   *
   * @param nextPage - Target page.
   * @param direction - Slide direction.
   */
  function handleGoToPage(nextPage: number, direction: PageSwipeDirection): void {
    if (
      nextPage < 1 ||
      nextPage > totalPages ||
      nextPage === currentPage ||
      isLoading
    ) {
      return
    }
    setEnterDirection(direction)
    void goToPage(nextPage)
  }

  /**
   * Handles horizontal swipe between pages.
   *
   * @param direction - Swipe direction.
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
   * Opens or closes the row status menu via a body portal (avoids table clipping).
   *
   * @param accountId - Community account id.
   * @param event - Click from the trigger button.
   */
  function toggleRowStatusMenu(
    accountId: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void {
    if (!canEdit) {
      return
    }
    event.stopPropagation()
    if (rowStatusAnchorId === accountId) {
      closeRowStatusMenu()
      return
    }
    const trigger = event.currentTarget
    const rect = trigger.getBoundingClientRect()
    const menuWidth = 144
    const menuHeight = 110
    const gap = 6
    const shouldOpenUp = window.innerHeight - rect.bottom < menuHeight + 12
    setRowStatusMenuRect({
      top: shouldOpenUp
        ? Math.max(8, rect.top - menuHeight - gap)
        : rect.bottom + gap,
      left: Math.max(8, rect.right - menuWidth),
      width: menuWidth,
    })
    setRowStatusAnchorId(accountId)
  }

  /**
   * Updates a row's account status from the portal menu.
   *
   * @param accountId - Community account id.
   * @param status - New status.
   */
  async function setRowStatus(
    accountId: string,
    status: TeCommunityAccountStatus,
  ): Promise<void> {
    if (!canEdit) {
      return
    }
    closeRowStatusMenu()
    const account = accounts.find((row) => row.id === accountId)
    if (!account || account.status === status) {
      return
    }
    setUpdatingId(accountId)
    await updateAccountStatus(accountId, status)
    setUpdatingId(null)
  }

  const rowMenuAccount = accounts.find((row) => row.id === rowStatusAnchorId) ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.teUsers.title')}
        </h1>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
          title={t('admin.teUsers.refresh')}
          aria-label={t('admin.teUsers.refresh')}
          disabled={isLoading}
          onClick={() => void fetchAccounts()}
        >
          <RefreshIcon className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('admin.teUsers.refresh')}</span>
        </button>
      </div>

      <div className="relative z-20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm min-w-[12rem] flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t('admin.teUsers.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.teUsers.searchPlaceholder')}
            />
          </div>
          <CrmFilterSelect
            className="min-w-36 max-w-52 shrink-0"
            value={statusFilter}
            options={statusFilterOptions}
            ariaLabel={t('admin.teUsers.statusAll')}
            onChange={(next) => {
              setEnterDirection('next')
              void setStatusFilter((next as TeCommunityAccountStatus | '') || '')
            }}
          />
        </div>
        <p className="shrink-0 text-xs font-medium text-muted tabular-nums sm:text-right">
          {t('admin.teUsers.totalCount', { count: totalCount })}
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-500">
          {error}
        </p>
      ) : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.teUsers.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!isLoading && accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideUsersRoundIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {hasFilters
                ? t('admin.teUsers.noResults')
                : t('admin.teUsers.empty')}
            </p>
          </div>
        ) : (
          <table
            className={`admin-list-rows ${isLoading ? '' : pageEnterClass} w-full min-w-[44rem] border-collapse text-left text-sm ${
              swiping || isLoading ? 'admin-list-transition-disabled' : ''
            }`}
            style={{
              transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
            }}
          >
            <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
              <tr>
                <th className="px-4 py-3">{t('admin.teUsers.col.email')}</th>
                <th className="px-4 py-3">{t('admin.teUsers.col.displayName')}</th>
                <th className="px-4 py-3">{t('admin.teUsers.col.nickname')}</th>
                <th className="hidden px-4 py-3 md:table-cell">
                  {t('admin.teUsers.col.organization')}
                </th>
                <th className="px-4 py-3">{t('admin.teUsers.col.status')}</th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.teUsers.col.lastLogin')}
                </th>
                <th className="hidden px-4 py-3 xl:table-cell">
                  {t('admin.teUsers.col.createdAt')}
                </th>
                {canEdit ? (
                  <th className="px-4 py-3 text-right">
                    {t('admin.teUsers.col.actions')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {isLoading && accounts.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColSpan}
                    className="px-4 py-12 text-center text-muted"
                  >
                    <RefreshIcon className="mr-2 inline-block size-5 animate-spin" />
                    {t('admin.teUsers.loading')}
                  </td>
                </tr>
              ) : null}
              {accounts.map((account) => (
                <tr
                  key={account.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(teUserDetailPath(account.id))}
                >
                  <td className="px-4 py-3 font-mono text-xs text-ink">
                    {account.email}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {account.displayName || '—'}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {account.nickname || '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">
                    {account.organization || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${teAccountStatusClass(account.status)}`}
                    >
                      {t(`admin.teUsers.status.${account.status}`)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted lg:table-cell">
                    {formatDisplayDateTime(account.lastLoginAt)}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted xl:table-cell">
                    {formatDisplayDateTime(account.createdAt)}
                  </td>
                  {canEdit ? (
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        data-te-user-status-menu="trigger"
                        disabled={updatingId === account.id}
                        className="inline-flex items-center gap-1 rounded-xl border border-ink/15 px-2.5 py-1.5 text-xs font-bold text-ink hover:border-brand/40 disabled:opacity-50"
                        onClick={(event) =>
                          toggleRowStatusMenu(account.id, event)
                        }
                      >
                        {t('admin.teUsers.changeStatus')}
                        <ChevronDownIcon
                          className={`size-3 transition-transform ${
                            rowStatusAnchorId === account.id ? 'rotate-180' : ''
                          }`}
                        />
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
        currentPage={currentPage}
        totalPages={totalPages}
        disabled={isLoading}
        onGoToPage={(nextPage) =>
          handleGoToPage(nextPage, nextPage > currentPage ? 'next' : 'prev')
        }
      />

      {canEdit && rowStatusAnchorId && rowStatusMenuRect
        ? createPortal(
            <div
              data-te-user-status-menu="menu"
              className="fixed z-[130] min-w-36 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900"
              style={{
                top: rowStatusMenuRect.top,
                left: rowStatusMenuRect.left,
                width: rowStatusMenuRect.width,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {TE_ACCOUNT_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={rowMenuAccount?.status === status}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-brand/5 disabled:opacity-40"
                  onClick={() => void setRowStatus(rowStatusAnchorId, status)}
                >
                  {t(`admin.teUsers.status.${status}`)}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
