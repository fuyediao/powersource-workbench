/**
 * Recursive admin comment tree node (Vue TeCommunityCommentItem parity).
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashIcon } from '@/icons/AllIcons'
import type { TeCommunityCommentReport } from '@/services/te-community-comment-reports-repository'
import type { TeCommunityComment } from '@/services/te-community-comments-repository'
import type { TeCommunityReportStatus } from '@/services/te-community-posts-repository'

export interface TeCommunityCommentItemProps {
  comment: TeCommunityComment
  depth?: number
  parentAuthorName?: string
  /** When true, show the admin delete control. */
  canDelete?: boolean
  /** Disable delete while a request is in flight. */
  deleteBusy?: boolean
  /** Open reports against this comment (resolved rows are omitted). */
  openReports?: TeCommunityCommentReport[]
  /**
   * Lookup open reports for a nested reply by comment id.
   * Required when rendering replies so each node gets its own reports.
   */
  openReportsForComment?: (commentId: string) => TeCommunityCommentReport[]
  /** When true, show dismiss / mark-actioned on open reports. */
  canResolveReports?: boolean
  /**
   * Request permanent delete of this comment subtree.
   *
   * @param comment - Subtree root.
   */
  onDelete: (comment: TeCommunityComment) => void
  /**
   * Resolve a comment report without deleting the row.
   *
   * @param reportId - Report UUID.
   * @param status - Resolution status.
   */
  onResolveReport: (
    reportId: string,
    status: Exclude<TeCommunityReportStatus, 'open'>,
  ) => void
}

/**
 * Format an ISO timestamp for the admin comment thread.
 *
 * @param iso - ISO date string.
 * @returns Locale-formatted date.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

/**
 * Display name for a comment author.
 *
 * @param comment - Comment row.
 * @returns Author label.
 */
function authorLabel(comment: TeCommunityComment): string {
  const name = comment.author?.displayName?.trim()
  return name || comment.author?.email || '—'
}

/**
 * Recursive comment node with report badges, hard-delete, and nested replies.
 *
 * @param props - Comment tree node props.
 * @returns Comment item.
 */
export function TeCommunityCommentItem({
  comment,
  depth = 0,
  parentAuthorName,
  canDelete = false,
  deleteBusy = false,
  openReports = [],
  openReportsForComment,
  canResolveReports = false,
  onDelete,
  onResolveReport,
}: TeCommunityCommentItemProps): ReactNode {
  const { t } = useTranslation()
  const hasReplies = comment.replies.length > 0
  const openReportCount = openReports.length
  const initial = authorLabel(comment).charAt(0).toUpperCase()

  /**
   * Open reports for a child reply.
   *
   * @param commentId - Reply comment id.
   * @returns Open reports for that reply.
   */
  function reportsForReply(commentId: string): TeCommunityCommentReport[] {
    return openReportsForComment?.(commentId) ?? []
  }

  return (
    <div className="relative">
      <div className="flex items-start gap-2.5">
        <div className="relative w-7 shrink-0">
          <span className="relative z-10 flex size-7 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand">
            {initial || '—'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <header className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-ink">{authorLabel(comment)}</span>
            <span className="text-xs text-muted">· {formatDate(comment.createdAt)}</span>
            {comment.status === 'hidden' ? (
              <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                {t('admin.teCommunity.status.hidden')}
              </span>
            ) : null}
            {comment.status === 'deleted' ? (
              <span className="inline-flex rounded border border-rose-500/30 bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-300">
                {t('admin.teCommunity.status.deleted')}
              </span>
            ) : null}
            <span className="inline-flex rounded border border-sky-500/30 bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
              {t(`admin.teCommunity.authorVisibility.${comment.authorVisibility}`)}
            </span>
            {comment.isOrphan ? (
              <span className="inline-flex rounded border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                {t('admin.teCommunity.orphanComment')}
              </span>
            ) : null}
            {depth > 0 && parentAuthorName ? (
              <span className="w-full text-xs text-muted">
                {t('admin.teCommunity.replyTo', { name: parentAuthorName })}
              </span>
            ) : null}
          </header>

          <p
            className={`mb-2 text-sm leading-relaxed whitespace-pre-wrap ${
              comment.status === 'deleted' ? 'text-muted line-through' : 'text-ink/80'
            }`}
          >
            {comment.body}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted tabular-nums">
            <span>
              {t('admin.teCommunity.field.likes')} {comment.likeCount}
            </span>
            <span>
              {t('admin.teCommunity.field.dislikes')} {comment.dislikeCount}
            </span>
            <span className={openReportCount > 0 ? 'text-red-600 dark:text-red-300' : ''}>
              {t('admin.teCommunity.field.reports')} {openReportCount}
            </span>
            {canDelete ? (
              <button
                type="button"
                disabled={deleteBusy}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300"
                onClick={() => onDelete(comment)}
              >
                <TrashIcon className="size-3" />
                {t('admin.teCommunity.deleteComment')}
              </button>
            ) : null}
          </div>

          {openReportCount > 0 ? (
            <ul className="mt-3 m-0 list-none space-y-2 p-0">
              {openReports.map((report) => (
                <li
                  key={report.id}
                  className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-red-700 dark:text-red-200">
                        {t(`admin.teCommunity.reportReason.${report.reason}`)}
                      </p>
                      {report.detail ? (
                        <p className="mt-1 text-xs text-muted whitespace-pre-wrap">
                          {report.detail}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted">
                        {report.reporter?.displayName || report.reporter?.email || '—'} ·{' '}
                        {formatDate(report.createdAt)}
                      </p>
                    </div>
                    {canResolveReports ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-ink/15 px-2.5 py-1 text-xs text-ink hover:border-brand/40 hover:text-brand"
                          onClick={() => onResolveReport(report.id, 'dismissed')}
                        >
                          {t('admin.teCommunity.dismiss')}
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
                          onClick={() => onResolveReport(report.id, 'action_taken')}
                        >
                          {t('admin.teCommunity.markActioned')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {hasReplies ? (
        <div className="mt-3 ml-3.5 space-y-3 border-l border-ink/10 pl-4">
          {comment.replies.map((reply) => (
            <TeCommunityCommentItem
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              parentAuthorName={authorLabel(comment)}
              canDelete={canDelete}
              deleteBusy={deleteBusy}
              openReports={reportsForReply(reply.id)}
              openReportsForComment={openReportsForComment}
              canResolveReports={canResolveReports}
              onDelete={onDelete}
              onResolveReport={onResolveReport}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
