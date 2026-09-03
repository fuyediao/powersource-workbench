/**
 * T&E Marketing list: applications that opted in to marketing emails.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  displayName,
  formatListDate,
  statusClass,
} from '@/components/admin/te-application-shared'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { teStatusLabelKey } from '@/constants/te-tracking-stages'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import { useTeMarketingSubscribers } from '@/hooks/use-te-marketing-subscribers'
import {
  LucideTargetIcon,
  RefreshIcon,
  SearchIcon,
} from '@/icons/AllIcons'
import { teApplicationDetailPath } from '@/utils/te-application-routes'

interface TeMarketingPaneProps {
  onNavigate: (path: string) => void
}

/**
 * Read-only list of T&E applicants who consented to marketing emails.
 *
 * @param props - Shell navigation.
 * @returns List UI.
 */
export function TeMarketingPane({ onNavigate }: TeMarketingPaneProps) {
  const { t } = useTranslation()
  const {
    submissions,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    searchQuery,
    fetchSubscribers,
    setSearch,
    goToPage,
  } = useTeMarketingSubscribers()

  const [searchInput, setSearchInput] = useState('')
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')
  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)

  const pageEnterClass =
    enterDirection === 'next' ? 'admin-list-enter-next' : 'admin-list-enter-prev'
  const hasSearch = Boolean(searchQuery.trim())

  useEffect(() => {
    void fetchSubscribers()
    // Initial load only; search / page already fetch inside the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount
  }, [])

  useEffect(() => {
    return () => {
      if (searchTimer.current !== null) {
        window.clearTimeout(searchTimer.current)
      }
    }
  }, [])

  /**
   * Debounce search input and reload page one.
   *
   * @param value - Raw search field value.
   */
  function onSearchChange(value: string): void {
    setSearchInput(value)
    if (searchTimer.current !== null) {
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

  const emptyCopy = useMemo(
    () =>
      hasSearch
        ? t('teAdmin.marketing.noResults')
        : t('teAdmin.marketing.empty'),
    [hasSearch, t],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('teAdmin.marketing.title')}
        </h1>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
          title={t('teAdmin.marketing.refresh')}
          aria-label={t('teAdmin.marketing.refresh')}
          disabled={isLoading}
          onClick={() => void fetchSubscribers()}
        >
          <RefreshIcon className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('teAdmin.marketing.refresh')}</span>
        </button>
      </div>

      <div className="relative z-20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm min-w-[12rem] flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t('teAdmin.marketing.searchPlaceholder')}
            className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
            aria-label={t('teAdmin.marketing.searchPlaceholder')}
          />
        </div>
        <p className="shrink-0 text-xs font-medium text-muted tabular-nums sm:text-right">
          {t('teAdmin.marketing.totalCount', { count: totalCount })}
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
        aria-label={t('teAdmin.marketing.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!isLoading && submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideTargetIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">{emptyCopy}</p>
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
                <th className="px-4 py-3">{t('teAdmin.marketing.columns.name')}</th>
                <th className="px-4 py-3">{t('teAdmin.marketing.columns.email')}</th>
                <th className="hidden px-4 py-3 md:table-cell">
                  {t('teAdmin.marketing.columns.agency')}
                </th>
                <th className="px-4 py-3">{t('teAdmin.marketing.columns.status')}</th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('teAdmin.marketing.columns.submittedAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && submissions.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-muted"
                  >
                    <RefreshIcon className="mr-2 inline-block size-5 animate-spin" />
                    {t('teAdmin.marketing.loading')}
                  </td>
                </tr>
              ) : null}
              {submissions.map((submission) => (
                <tr
                  key={submission.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(teApplicationDetailPath(submission.id))}
                >
                  <td className="px-4 py-3 font-medium text-ink">
                    {displayName(submission)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink">
                    {submission.email || '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-ink md:table-cell">
                    {submission.agency || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(submission.status)}`}
                    >
                      {t(teStatusLabelKey(submission.status))}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted lg:table-cell">
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
        onGoToPage={(page) =>
          handleGoToPage(page, page > currentPage ? 'next' : 'prev')
        }
        disabled={isLoading}
      />
    </div>
  )
}
