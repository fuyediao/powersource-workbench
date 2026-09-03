/**
 * Numbered pagination strip (web `PaginationStrip.vue` parity).
 */

import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon, ArrowRightIcon } from '@/icons/AllIcons'

interface PaginationStripProps {
  /** Current page (1-based). */
  currentPage: number
  /** Total number of pages. */
  totalPages: number
  /**
   * Called when the user picks a page.
   * @param page - Target page (1-based).
   */
  onGoToPage: (page: number) => void
  /** When true, show even if there is only one page. */
  showWhenSinglePage?: boolean
  /** Extra classes on the root. */
  className?: string
  disabled?: boolean
}

/**
 * Builds the page list with `null` gaps for ellipsis (web parity).
 * @param total - Total pages.
 * @param current - Current page.
 * @returns Page numbers and null ellipsis slots.
 */
function buildVisiblePages(total: number, current: number): Array<number | null> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1)
  }
  const pages: Array<number | null> = [1]
  if (current > 3) {
    pages.push(null)
  }
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i += 1) {
    pages.push(i)
  }
  if (current < total - 2) {
    pages.push(null)
  }
  pages.push(total)
  return pages
}

/**
 * Centered prev / page numbers / next control for Admin lists.
 * @param props - Page state and navigation handler.
 * @returns Pagination strip, or null when hidden.
 */
export function PaginationStrip({
  currentPage,
  totalPages,
  onGoToPage,
  showWhenSinglePage = false,
  className = '',
  disabled = false,
}: PaginationStripProps): ReactNode {
  const { t } = useTranslation()
  const visiblePages = useMemo(
    () => buildVisiblePages(totalPages, currentPage),
    [currentPage, totalPages],
  )

  if (!showWhenSinglePage && totalPages <= 1) {
    return null
  }

  /**
   * Navigates when the target is in range and not disabled.
   * @param page - Target page.
   * @returns Nothing.
   */
  function go(page: number): void {
    if (disabled || page < 1 || page > totalPages || page === currentPage) {
      return
    }
    onGoToPage(page)
  }

  return (
    <div className={`flex items-center justify-center gap-1 pt-2 ${className}`.trim()}>
      <button
        type="button"
        className="rounded-lg p-2 text-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/5"
        disabled={disabled || currentPage <= 1}
        aria-label={t('common.pagination.prev')}
        onClick={() => go(currentPage - 1)}
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
      </button>
      {visiblePages.map((page, index) =>
        page === null ? (
          <span key={`gap-${index}`} className="px-1 text-muted">
            …
          </span>
        ) : (
          <button
            key={page}
            type="button"
            className={`size-8 rounded-lg text-sm font-medium transition-colors ${
              page === currentPage
                ? 'bg-brand text-brand-fg'
                : 'text-muted hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5'
            }`}
            aria-current={page === currentPage ? 'page' : undefined}
            disabled={disabled}
            onClick={() => go(page)}
          >
            {page}
          </button>
        ),
      )}
      <button
        type="button"
        className="rounded-lg p-2 text-muted transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/5"
        disabled={disabled || currentPage >= totalPages}
        aria-label={t('common.pagination.next')}
        onClick={() => go(currentPage + 1)}
      >
        <ArrowRightIcon className="size-4" aria-hidden />
      </button>
    </div>
  )
}
