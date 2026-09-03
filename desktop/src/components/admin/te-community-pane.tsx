/**
 * Admin T&E community post list (Vue TeCommunityManagementView list chrome):
 * search, status filter, reported-only, pagination.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import {
  useHorizontalPageSwipe,
  type PageSwipeDirection,
} from '@/hooks/use-horizontal-page-swipe'
import { useTeCommunityPosts } from '@/hooks/use-te-community-posts'
import {
  LucideMessagesSquareIcon,
  PinIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
} from '@/icons/AllIcons'
import {
  isPostPinActive,
  type TeCommunityPost,
  type TeCommunityPostStatus,
} from '@/services/te-community-posts-repository'
import { teCommunityDetailPath } from '@/utils/te-community-routes'

const STATUS_VALUES: TeCommunityPostStatus[] = [
  'published',
  'hidden',
  'deleted',
  'draft',
]

interface TeCommunityPaneProps {
  /** When true, the list is the visible slide (refetch on return from detail). */
  listActive: boolean
  onNavigate: (path: string) => void
}

/**
 * Returns whether a filter value is a post status slug.
 *
 * @param value - Filter string.
 * @returns True when the value is a known status.
 */
function isPostStatus(value: string): value is TeCommunityPostStatus {
  return value === 'published' || value === 'hidden' || value === 'deleted' || value === 'draft'
}

/**
 * Author display label for a post.
 *
 * @param post - Community post.
 * @returns Display name or email.
 */
function authorLabel(post: TeCommunityPost): string {
  const name = post.author?.displayName?.trim()
  return name || post.author?.email || '—'
}

/**
 * Badge classes for a post status.
 *
 * @param status - Post status.
 * @returns Tailwind class string.
 */
function statusClass(status: TeCommunityPostStatus): string {
  switch (status) {
    case 'published':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'hidden':
      return 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300'
    case 'deleted':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'draft':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
    default:
      return 'border-ink/15 bg-ink/5 text-muted'
  }
}

/**
 * Format an ISO timestamp for display.
 *
 * @param iso - ISO string or null.
 * @returns Localized date-time, or em dash.
 */
function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

/**
 * Community post list with filters and pagination.
 *
 * @param props - List visibility and navigation.
 * @returns List UI.
 */
export function TeCommunityPane({
  listActive,
  onNavigate,
}: TeCommunityPaneProps): ReactNode {
  const { t } = useTranslation()

  const {
    posts,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    searchQuery,
    statusFilter,
    reportFilter,
    fetchPosts,
    setSearch,
    setStatusFilter,
    setReportFilter,
    goToPage,
  } = useTeCommunityPosts()

  const [searchInput, setSearchInput] = useState('')
  const [enterDirection, setEnterDirection] = useState<PageSwipeDirection>('next')

  const searchTimer = useRef<number | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const fetchPostsRef = useRef(fetchPosts)
  fetchPostsRef.current = fetchPosts
  const prevActiveRef = useRef(listActive)

  useEffect(() => {
    void fetchPostsRef.current()
  }, [])

  useEffect(() => {
    if (listActive && !prevActiveRef.current) {
      void fetchPostsRef.current()
    }
    prevActiveRef.current = listActive
  }, [listActive])

  useEffect(() => {
    return () => {
      if (searchTimer.current != null) {
        window.clearTimeout(searchTimer.current)
      }
    }
  }, [])

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.teCommunity.statusAll') },
      ...STATUS_VALUES.map((status) => ({
        value: status,
        label: t(`admin.teCommunity.status.${status}`),
      })),
    ],
    [t],
  )

  const pageEnterClass =
    enterDirection === 'next' ? 'admin-list-enter-next' : 'admin-list-enter-prev'

  const hasFilters = Boolean(searchQuery.trim() || statusFilter || reportFilter)

  /**
   * Debounces search input into the committed query.
   *
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
      void setSearch(value)
    }, 300)
  }

  /**
   * Navigates to a page with enter animation direction.
   *
   * @param nextPage - Target page.
   * @param direction - Slide direction.
   * @returns Nothing.
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
   * @param direction - Swipe direction.
   * @returns Nothing.
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.teCommunity.title')}
        </h1>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
          title={t('admin.teCommunity.refresh')}
          aria-label={t('admin.teCommunity.refresh')}
          disabled={isLoading}
          onClick={() => void fetchPosts()}
        >
          <RefreshIcon className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('admin.teCommunity.refresh')}</span>
        </button>
      </div>

      <div className="relative z-20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-sm min-w-[12rem] flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t('admin.teCommunity.searchPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.teCommunity.searchPlaceholder')}
            />
          </div>
          <CrmFilterSelect
            className="min-w-36 max-w-52 shrink-0"
            value={statusFilter}
            options={statusOptions}
            ariaLabel={t('admin.teCommunity.statusAll')}
            onChange={(next) => {
              setEnterDirection('next')
              void setStatusFilter(isPostStatus(next) ? next : '')
            }}
          />
          <button
            type="button"
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              reportFilter === 'reported'
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-ink/15 text-ink hover:border-brand/40'
            }`}
            onClick={() => {
              setEnterDirection('next')
              void setReportFilter(reportFilter === 'reported' ? '' : 'reported')
            }}
          >
            <ShieldIcon className="size-3.5" />
            {t('admin.teCommunity.reportedOnly')}
          </button>
        </div>
        <p className="shrink-0 text-xs text-muted tabular-nums sm:mr-3 sm:text-right">
          {t('admin.teCommunity.totalCount', { count: totalCount })}
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-rose-500">
          {error}
        </p>
      ) : null}

      <div
        ref={listScrollRef}
        role="region"
        aria-label={t('admin.teCommunity.title')}
        className={`admin-list-swipe-surface min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5 ${
          swiping ? 'admin-list-swiping' : ''
        }`}
        {...pointerHandlers}
      >
        {!isLoading && posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideMessagesSquareIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {hasFilters ? t('admin.teCommunity.noResults') : t('admin.teCommunity.empty')}
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
                <th className="px-4 py-3">{t('admin.teCommunity.col.title')}</th>
                <th className="px-4 py-3">{t('admin.teCommunity.col.author')}</th>
                <th className="hidden px-4 py-3 md:table-cell">
                  {t('admin.teCommunity.col.attachments')}
                </th>
                <th className="hidden px-4 py-3 md:table-cell">
                  {t('admin.teCommunity.col.likes')}
                </th>
                <th className="hidden px-4 py-3 md:table-cell">
                  {t('admin.teCommunity.col.comments')}
                </th>
                <th className="px-4 py-3">{t('admin.teCommunity.col.status')}</th>
                <th className="px-4 py-3">{t('admin.teCommunity.col.reports')}</th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.teCommunity.col.commentReports')}
                </th>
                <th className="hidden px-4 py-3 xl:table-cell">
                  {t('admin.teCommunity.col.createdAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && posts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted">
                    {t('status.loading')}
                  </td>
                </tr>
              ) : null}
              {posts.map((post) => (
                <tr
                  key={post.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(teCommunityDetailPath(post.id))}
                >
                  <td className="max-w-md px-4 py-3">
                    <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                      {isPostPinActive(post) ? (
                        <PinIcon className="size-3 shrink-0 text-brand" />
                      ) : null}
                      {post.title?.trim() || t('admin.teCommunity.untitled')}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-ink/80">
                    {authorLabel(post)}
                  </td>
                  <td className="hidden px-4 py-3 whitespace-nowrap text-ink/80 tabular-nums md:table-cell">
                    {post.media.length}
                  </td>
                  <td className="hidden px-4 py-3 whitespace-nowrap text-ink/80 tabular-nums md:table-cell">
                    {post.likeCount}
                  </td>
                  <td className="hidden px-4 py-3 whitespace-nowrap text-ink/80 tabular-nums md:table-cell">
                    {post.commentCount}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(post.status)}`}
                    >
                      {t(`admin.teCommunity.status.${post.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${
                        post.openReportCount > 0
                          ? 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-300'
                          : 'border-ink/15 bg-transparent text-muted'
                      }`}
                    >
                      <ShieldIcon className="size-3" />
                      {post.openReportCount}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums ${
                        post.commentReportCount > 0
                          ? 'border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-300'
                          : 'border-ink/15 bg-transparent text-muted'
                      }`}
                    >
                      <ShieldIcon className="size-3" />
                      {post.commentReportCount}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-xs whitespace-nowrap text-muted tabular-nums xl:table-cell">
                    {formatDate(post.createdAt)}
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
  )
}
