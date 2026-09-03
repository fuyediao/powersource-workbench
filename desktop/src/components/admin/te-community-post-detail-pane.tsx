/**
 * Admin T&E community post detail: overview, content, comments, and reports
 * (Vue TeCommunityManagementView detail parity).
 */

import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { TeCommunityCommentItem } from '@/components/admin/te-community-comment-item'
import {
  TeCommunityPostDetailTabs,
  type TeCommunityPostTab,
} from '@/components/admin/te-community-post-detail-tabs'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useTeCommunityCommentReports } from '@/hooks/use-te-community-comment-reports'
import { useTeCommunityComments } from '@/hooks/use-te-community-comments'
import { useTeCommunityPostReports } from '@/hooks/use-te-community-post-reports'
import {
  MAX_ACTIVE_PINS,
  useTeCommunityPosts,
  type PinDurationDays,
} from '@/hooks/use-te-community-posts'
import {
  ArrowLeftIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  LucideMessagesSquareIcon,
  PinIcon,
  ShieldIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import type { TeCommunityComment } from '@/services/te-community-comments-repository'
import {
  isPostPinActive,
  type TeCommunityPost,
  type TeCommunityPostStatus,
  type TeCommunityReportStatus,
} from '@/services/te-community-posts-repository'
import { communityPostExcerpt, renderCommunityPostHtml } from '@/utils/community-markdown'
import { openExternalUrl } from '@/utils/shared/api'
import { teApplicationDetailPath } from '@/utils/te-application-routes'
import { teCommunityDetailPath, teCommunityListPath } from '@/utils/te-community-routes'
import { teUserDetailPath } from '@/utils/te-user-routes'

const PIN_DURATION_OPTIONS: { value: PinDurationDays; labelKey: string }[] = [
  { value: 1, labelKey: 'admin.teCommunity.pinDuration.1' },
  { value: 3, labelKey: 'admin.teCommunity.pinDuration.3' },
  { value: 7, labelKey: 'admin.teCommunity.pinDuration.7' },
  { value: 30, labelKey: 'admin.teCommunity.pinDuration.30' },
  { value: null, labelKey: 'admin.teCommunity.pinDuration.indefinite' },
]

/** Compact markdown host styles (Vue `.te-community-post-body` parity). */
const COMMUNITY_POST_BODY_CLASS = [
  'text-[15px] leading-relaxed text-ink',
  '[&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg',
  '[&_video]:my-3 [&_video]:max-w-full [&_video]:rounded-lg',
  '[&_a]:text-brand [&_a]:underline',
  '[&_h1]:mt-3 [&_h1]:mb-2 [&_h1]:font-bold',
  '[&_h2]:mt-3 [&_h2]:mb-2 [&_h2]:font-bold',
  '[&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:font-bold',
  '[&_ul]:[list-style:revert] [&_ul]:pl-5',
  '[&_ol]:[list-style:revert] [&_ol]:pl-5',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-zinc-950/10 [&_pre]:px-4 [&_pre]:py-3 [&_pre]:text-sm dark:[&_pre]:bg-black/35',
  '[&_code]:rounded [&_code]:bg-ink/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.875em]',
  '[&_p]:mb-3 [&_p:last-child]:mb-0',
].join(' ')

interface TeCommunityPostDetailPaneProps {
  postId: string
  tab: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

interface ConfirmDangerDialogProps {
  open: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Returns whether a string is a known detail tab key.
 *
 * @param value - Candidate tab.
 * @returns True when the value is a {@link TeCommunityPostTab}.
 */
function isDetailTab(value: string): value is TeCommunityPostTab {
  return value === 'overview' || value === 'content' || value === 'comments' || value === 'reports'
}

/**
 * Parses a `?tab=` query value into a known detail tab.
 *
 * @param raw - Query tab or null.
 * @returns Valid tab, defaulting to overview.
 */
function parseDetailTab(raw: string | null): TeCommunityPostTab {
  if (raw && isDetailTab(raw)) {
    return raw
  }
  return 'overview'
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
 * Badge classes for a report status.
 *
 * @param status - Report status.
 * @returns Tailwind class string.
 */
function reportStatusClass(status: TeCommunityReportStatus): string {
  switch (status) {
    case 'open':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'action_taken':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'dismissed':
      return 'border-ink/15 bg-ink/5 text-muted'
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
 * Count comments in a nested forest (includes soft-deleted rows).
 *
 * @param forest - Comment trees.
 * @returns Total node count.
 */
function countCommentsInForest(forest: TeCommunityComment[]): number {
  return forest.reduce((total, node) => total + 1 + countCommentsInForest(node.replies), 0)
}

/**
 * Danger confirm dialog used for post and comment hard-delete.
 *
 * @param props - Dialog copy and handlers.
 * @returns Portal dialog, or null.
 */
function ConfirmDangerDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDangerDialogProps): ReactNode {
  const presence = useDialogPresence(open)
  if (!presence.mounted) return null
  return createPortal(
    <div
      className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-extrabold text-brand">{title}</h2>
        <p className="mt-2 text-sm font-medium text-muted">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Community post detail with four tabs, pin/hide/restore, and hard-delete.
 *
 * @param props - Post id, tab query, writes, and navigation.
 * @returns Detail UI.
 */
export function TeCommunityPostDetailPane({
  postId,
  tab,
  writes,
  onNavigate,
}: TeCommunityPostDetailPaneProps): ReactNode {
  const { t } = useTranslation()
  const canModerate = Boolean(writes?.canEdit)
  const canHardDelete = Boolean(writes?.canDelete)
  const activeTab = parseDetailTab(tab)

  const { fetchPostById, setPostStatus, pinPost, unpinPost, hardDeletePost, error } =
    useTeCommunityPosts()
  const {
    reports,
    isLoading: reportsLoading,
    fetchReports,
    resolveReport,
    dismissAllOpenReports,
  } = useTeCommunityPostReports()
  const {
    comments,
    isLoading: commentsLoading,
    isDeleting: commentsDeleting,
    error: commentsError,
    fetchComments,
    hardDeleteCommentTree,
    clearComments,
  } = useTeCommunityComments()
  const {
    openReportCount: openCommentReportCount,
    isLoading: commentReportsLoading,
    fetchCommentReports,
    openReportsForComment,
    resolveCommentReport,
    dismissAllOpenCommentReports,
    clearCommentReports,
  } = useTeCommunityCommentReports()

  const [selectedPost, setSelectedPost] = useState<TeCommunityPost | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [showHideForm, setShowHideForm] = useState(false)
  const [hideReason, setHideReason] = useState('')
  const [showPinForm, setShowPinForm] = useState(false)
  const [pinDuration, setPinDuration] = useState<PinDurationDays>(7)
  const [pinFormError, setPinFormError] = useState<string | null>(null)
  const [commentPendingDelete, setCommentPendingDelete] = useState<TeCommunityComment | null>(
    null,
  )
  const [postPendingDelete, setPostPendingDelete] = useState(false)

  const openPostReportCount = useMemo(
    () => reports.filter((r) => r.status === 'open').length,
    [reports],
  )
  const loadedCommentCount = useMemo(() => countCommentsInForest(comments), [comments])
  const isSelectedPostPinned = selectedPost ? isPostPinActive(selectedPost) : false

  const detailPageTitle = useMemo(() => {
    const post = selectedPost
    if (!post) return '...'
    const title = post.title?.trim()
    if (title) return title
    return communityPostExcerpt(post.bodyMarkdown, 48) || t('admin.teCommunity.untitled')
  }, [selectedPost, t])

  const detailBodyHtml = useMemo(
    () => (selectedPost ? renderCommunityPostHtml(selectedPost.bodyMarkdown) : ''),
    [selectedPost],
  )

  /**
   * Human-readable pin expiry label for a pinned post.
   *
   * @param post - Community post.
   * @returns Localized until/indefinite label.
   */
  function pinUntilLabel(post: TeCommunityPost): string {
    if (!post.pinnedUntil) return t('admin.teCommunity.pinIndefinite')
    return t('admin.teCommunity.pinUntil', { date: formatDate(post.pinnedUntil) })
  }

  /**
   * Load the post plus comments and reports for the detail route.
   *
   * @param id - Post UUID.
   * @returns Nothing.
   */
  const loadDetail = useCallback(
    async (id: string): Promise<void> => {
      setDetailLoading(true)
      setShowHideForm(false)
      setHideReason('')
      setShowPinForm(false)
      setPinFormError(null)
      const post = await fetchPostById(id)
      if (!post) {
        setSelectedPost(null)
        setDetailLoading(false)
        clearComments()
        clearCommentReports()
        return
      }
      setSelectedPost(post)
      await Promise.all([fetchReports(id), fetchComments(id), fetchCommentReports(id)])
      setDetailLoading(false)
    },
    [clearCommentReports, clearComments, fetchCommentReports, fetchComments, fetchPostById, fetchReports],
  )

  useEffect(() => {
    void loadDetail(postId)
  }, [loadDetail, postId])

  /**
   * Persist the active detail tab on the shell path.
   *
   * @param next - Selected tab.
   * @returns Nothing.
   */
  function setActiveTab(next: TeCommunityPostTab): void {
    onNavigate(teCommunityDetailPath(postId, next))
  }

  /**
   * Open markdown / media links in the system browser.
   *
   * @param event - Click on the rendered body.
   * @returns Nothing.
   */
  function onBodyClick(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const anchor = target.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href) return
    event.preventDefault()
    void openExternalUrl(href)
  }

  /** Hide the current post with an optional reason. */
  async function confirmHide(): Promise<void> {
    if (!selectedPost || !canModerate) return
    setUpdating(true)
    const ok = await setPostStatus(selectedPost.id, 'hidden', hideReason, {
      skipListRefresh: true,
    })
    if (ok) {
      setSelectedPost(await fetchPostById(selectedPost.id))
      setShowHideForm(false)
      setHideReason('')
    }
    setUpdating(false)
  }

  /** Restore the current hidden post to published. */
  async function restorePost(): Promise<void> {
    if (!selectedPost || !canModerate) return
    setUpdating(true)
    const ok = await setPostStatus(selectedPost.id, 'published', null, {
      skipListRefresh: true,
    })
    if (ok) {
      setSelectedPost(await fetchPostById(selectedPost.id))
    }
    setUpdating(false)
  }

  /** Toggle the pin duration form and reset any previous error. */
  function togglePinForm(): void {
    setPinFormError(null)
    setShowPinForm((open) => !open)
  }

  /** Pin the current post for the selected duration, enforcing the active-pin cap. */
  async function confirmPin(): Promise<void> {
    if (!selectedPost || !canModerate) return
    setUpdating(true)
    setPinFormError(null)
    const result = await pinPost(selectedPost.id, pinDuration, { skipListRefresh: true })
    if (result === 'ok') {
      setSelectedPost(await fetchPostById(selectedPost.id))
      setShowPinForm(false)
    } else if (result === 'maxPinsReached') {
      setPinFormError(t('admin.teCommunity.pinMaxReached', { max: MAX_ACTIVE_PINS }))
    } else {
      setPinFormError(t('admin.teCommunity.errorUpdateStatus'))
    }
    setUpdating(false)
  }

  /** Unpin the current post. */
  async function unpinCurrentPost(): Promise<void> {
    if (!selectedPost || !canModerate) return
    setUpdating(true)
    const ok = await unpinPost(selectedPost.id, { skipListRefresh: true })
    if (ok) {
      setSelectedPost(await fetchPostById(selectedPost.id))
    }
    setUpdating(false)
  }

  /**
   * Resolve a report (dismiss or mark action taken).
   *
   * @param reportId - Report UUID.
   * @param status - Resolution status.
   * @returns Nothing.
   */
  async function handleResolveReport(
    reportId: string,
    status: Exclude<TeCommunityReportStatus, 'open'>,
  ): Promise<void> {
    if (!canModerate) return
    const ok = await resolveReport(reportId, status)
    if (!ok) return
    setSelectedPost((prev) =>
      prev
        ? {
            ...prev,
            openReportCount: reports.filter((r) => r.id !== reportId && r.status === 'open')
              .length,
          }
        : prev,
    )
  }

  /**
   * Resolve a comment report (status only; row kept for audit).
   *
   * @param reportId - Comment report UUID.
   * @param status - Resolution status.
   * @returns Nothing.
   */
  async function handleResolveCommentReport(
    reportId: string,
    status: Exclude<TeCommunityReportStatus, 'open'>,
  ): Promise<void> {
    if (!canModerate) return
    const ok = await resolveCommentReport(reportId, status)
    if (!ok) return
    setSelectedPost((prev) =>
      prev ? { ...prev, commentReportCount: Math.max(0, openCommentReportCount - 1) } : prev,
    )
  }

  /** Dismiss all open post reports so the Reports badge returns to zero. */
  async function dismissAllPostReports(): Promise<void> {
    if (!selectedPost || !canModerate || openPostReportCount === 0) return
    setUpdating(true)
    const ok = await dismissAllOpenReports(selectedPost.id)
    if (ok) {
      setSelectedPost((prev) => (prev ? { ...prev, openReportCount: 0 } : prev))
    }
    setUpdating(false)
  }

  /** Dismiss all open comment reports so the Comments badge returns to zero. */
  async function dismissAllCommentReports(): Promise<void> {
    if (!selectedPost || !canModerate || openCommentReportCount === 0) return
    setUpdating(true)
    const ok = await dismissAllOpenCommentReports()
    if (ok) {
      setSelectedPost((prev) => (prev ? { ...prev, commentReportCount: 0 } : prev))
    }
    setUpdating(false)
  }

  /**
   * Open the confirm dialog for permanently deleting a comment subtree.
   *
   * @param comment - Comment (and nested replies) to delete.
   * @returns Nothing.
   */
  function requestDeleteComment(comment: TeCommunityComment): void {
    if (!canHardDelete || commentsDeleting) return
    setCommentPendingDelete(comment)
  }

  /** Permanently delete the pending comment and nested replies, then refresh post stats. */
  async function confirmDeleteComment(): Promise<void> {
    const target = commentPendingDelete
    if (!target || !selectedPost || !canHardDelete) return
    const ok = await hardDeleteCommentTree(target)
    setCommentPendingDelete(null)
    if (!ok) return
    setSelectedPost(await fetchPostById(selectedPost.id))
  }

  /** Open the confirm dialog for permanently deleting the detail post. */
  function requestDeletePost(): void {
    if (!selectedPost || !canHardDelete || updating) return
    setPostPendingDelete(true)
  }

  /** Permanently delete the detail post and navigate back to the list. */
  async function confirmDeletePost(): Promise<void> {
    if (!selectedPost || !canHardDelete) return
    setUpdating(true)
    const ok = await hardDeletePost(selectedPost.id)
    setUpdating(false)
    setPostPendingDelete(false)
    if (!ok) return
    setSelectedPost(null)
    clearComments()
    clearCommentReports()
    onNavigate(teCommunityListPath())
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.customers.backToList')}
          aria-label={t('admin.customers.backToList')}
          onClick={() => onNavigate(teCommunityListPath())}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h1 className="min-w-0 truncate text-xl font-extrabold text-brand">{detailPageTitle}</h1>
        {selectedPost ? (
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(selectedPost.status)}`}
          >
            {t(`admin.teCommunity.status.${selectedPost.status}`)}
          </span>
        ) : null}
        {isSelectedPostPinned ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
            <PinIcon className="size-3" />
            {t('admin.teCommunity.pinned')}
          </span>
        ) : null}
        {selectedPost && canModerate ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selectedPost.status === 'published' && !isSelectedPostPinned ? (
              <button
                type="button"
                disabled={updating}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/10 disabled:opacity-50"
                onClick={togglePinForm}
              >
                <PinIcon className="size-3.5" />
                {t('admin.teCommunity.pin')}
              </button>
            ) : null}
            {selectedPost.status === 'published' && isSelectedPostPinned ? (
              <button
                type="button"
                disabled={updating}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
                onClick={() => void unpinCurrentPost()}
              >
                <PinIcon className="size-3.5" />
                {t('admin.teCommunity.unpin')}
              </button>
            ) : null}
            {selectedPost.status === 'published' ? (
              <button
                type="button"
                disabled={updating}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-300"
                onClick={() => setShowHideForm((open) => !open)}
              >
                <EyeOffIcon className="size-3.5" />
                {t('admin.teCommunity.hide')}
              </button>
            ) : null}
            {selectedPost.status === 'hidden' ? (
              <button
                type="button"
                disabled={updating}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-300"
                onClick={() => void restorePost()}
              >
                <EyeIcon className="size-3.5" />
                {t('admin.teCommunity.restore')}
              </button>
            ) : null}
            {canHardDelete ? (
              <button
                type="button"
                disabled={updating}
                className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-500/15 disabled:opacity-50 dark:text-rose-300"
                onClick={requestDeletePost}
              >
                <TrashIcon className="size-3.5" />
                {t('admin.teCommunity.deletePost')}
              </button>
            ) : null}
          </div>
        ) : canHardDelete && selectedPost ? (
          <div className="ml-auto">
            <button
              type="button"
              disabled={updating}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/50 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-500/15 disabled:opacity-50 dark:text-rose-300"
              onClick={requestDeletePost}
            >
              <TrashIcon className="size-3.5" />
              {t('admin.teCommunity.deletePost')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-rose-500">
            {error}
          </p>
        ) : null}

        {detailLoading ? (
          <p className="py-12 text-center text-sm font-medium text-muted">
            {t('status.loading')}
          </p>
        ) : null}

        {!detailLoading && !selectedPost ? (
          <p className="py-12 text-center text-muted">{t('admin.teCommunity.notFound')}</p>
        ) : null}

        {!detailLoading && selectedPost ? (
          <>
            {showPinForm ? (
              <section className="space-y-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
                <label className="block text-xs text-muted">
                  {t('admin.teCommunity.pinDurationLabel')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {PIN_DURATION_OPTIONS.map((option) => (
                    <button
                      key={String(option.value)}
                      type="button"
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                        pinDuration === option.value
                          ? 'border-brand bg-brand/20 text-brand'
                          : 'border-ink/15 text-ink hover:border-brand/40'
                      }`}
                      onClick={() => setPinDuration(option.value)}
                    >
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
                {pinFormError ? (
                  <p className="text-xs text-rose-500">{pinFormError}</p>
                ) : (
                  <p className="text-xs text-muted">
                    {t('admin.teCommunity.pinMaxHint', { max: MAX_ACTIVE_PINS })}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-xs text-muted hover:text-ink"
                    onClick={() => setShowPinForm(false)}
                  >
                    {t('admin.teCommunity.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={updating}
                    className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg hover:bg-brand/90 disabled:opacity-50"
                    onClick={() => void confirmPin()}
                  >
                    {t('admin.teCommunity.confirmPin')}
                  </button>
                </div>
              </section>
            ) : null}

            {showHideForm ? (
              <section className="space-y-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
                <label className="block text-xs text-muted">
                  {t('admin.teCommunity.hideReasonLabel')}
                </label>
                <textarea
                  value={hideReason}
                  rows={2}
                  className="w-full rounded-lg border border-ink/15 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/50 dark:bg-white/5"
                  placeholder={t('admin.teCommunity.hideReasonPlaceholder')}
                  onChange={(e) => setHideReason(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md px-3 py-1.5 text-xs text-muted hover:text-ink"
                    onClick={() => setShowHideForm(false)}
                  >
                    {t('admin.teCommunity.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={updating}
                    className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                    onClick={() => void confirmHide()}
                  >
                    {t('admin.teCommunity.confirmHide')}
                  </button>
                </div>
              </section>
            ) : null}

            <TeCommunityPostDetailTabs
              value={activeTab}
              commentReportCount={openCommentReportCount}
              reportCount={openPostReportCount}
              onChange={setActiveTab}
            />

            {activeTab === 'overview' ? (
              <section className={detailSectionCardClass()}>
                <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted">{t('admin.teCommunity.field.author')}</dt>
                    <dd className="mt-1">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-brand hover:underline"
                        onClick={() =>
                          onNavigate(teUserDetailPath(selectedPost.communityAccountId))
                        }
                      >
                        {authorLabel(selectedPost)}
                        <ExternalLinkIcon className="size-3 opacity-70" />
                      </button>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">
                      {t('admin.teCommunity.field.createdAt')}
                    </dt>
                    <dd className="mt-1 text-ink">{formatDate(selectedPost.createdAt)}</dd>
                  </div>
                  {selectedPost.teSubmissionId ? (
                    <div>
                      <dt className="text-xs text-muted">
                        {t('admin.teCommunity.field.submission')}
                      </dt>
                      <dd className="mt-1">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-brand hover:underline"
                          onClick={() => {
                            const submissionId = selectedPost.teSubmissionId
                            if (submissionId) {
                              onNavigate(teApplicationDetailPath(submissionId))
                            }
                          }}
                        >
                          {t('admin.teCommunity.viewSubmission')}
                          <ExternalLinkIcon className="size-3 opacity-70" />
                        </button>
                      </dd>
                    </div>
                  ) : null}
                  {isSelectedPostPinned ? (
                    <div>
                      <dt className="text-xs text-muted">{t('admin.teCommunity.field.pin')}</dt>
                      <dd className="mt-1 text-brand">{pinUntilLabel(selectedPost)}</dd>
                    </div>
                  ) : null}
                  {selectedPost.hiddenReason ? (
                    <div>
                      <dt className="text-xs text-muted">
                        {t('admin.teCommunity.field.hiddenReason')}
                      </dt>
                      <dd className="mt-1 text-ink whitespace-pre-wrap">
                        {selectedPost.hiddenReason}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-ink/10 pt-5 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <dt className="text-xs text-muted">{t('admin.teCommunity.field.likes')}</dt>
                    <dd className="mt-1 text-ink tabular-nums">{selectedPost.likeCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('admin.teCommunity.field.dislikes')}</dt>
                    <dd className="mt-1 text-ink tabular-nums">{selectedPost.dislikeCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('admin.teCommunity.field.comments')}</dt>
                    <dd className="mt-1 text-ink tabular-nums">{selectedPost.commentCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('admin.teCommunity.field.shares')}</dt>
                    <dd className="mt-1 text-ink tabular-nums">{selectedPost.shareCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('admin.teCommunity.field.reports')}</dt>
                    <dd
                      className={`mt-1 tabular-nums ${
                        openPostReportCount > 0 ? 'text-red-600 dark:text-red-300' : 'text-ink'
                      }`}
                    >
                      {openPostReportCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">
                      {t('admin.teCommunity.field.commentReports')}
                    </dt>
                    <dd
                      className={`mt-1 tabular-nums ${
                        openCommentReportCount > 0 ? 'text-red-600 dark:text-red-300' : 'text-ink'
                      }`}
                    >
                      {commentReportsLoading || commentsLoading ? '…' : openCommentReportCount}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            {activeTab === 'content' ? (
              <div className="space-y-6">
                <section className={`${detailSectionCardClass()} sm:p-8`}>
                  <h2 className="mb-4 text-sm font-semibold text-muted">
                    {t('admin.teCommunity.field.body')}
                  </h2>
                  <div
                    className={COMMUNITY_POST_BODY_CLASS}
                    dangerouslySetInnerHTML={{ __html: detailBodyHtml }}
                    onClick={onBodyClick}
                  />
                </section>
                {selectedPost.media.length > 0 ? (
                  <section className={detailSectionCardClass()}>
                    <h2 className="mb-4 text-sm font-semibold text-muted">
                      {t('admin.teCommunity.field.media')}{' '}
                      <span className="font-normal text-muted">
                        ({selectedPost.media.length})
                      </span>
                    </h2>
                    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                      {selectedPost.media.map((item) => (
                        <li
                          key={item.id}
                          className="overflow-hidden rounded-lg border border-ink/10 bg-zinc-950/10"
                        >
                          {item.mediaType === 'video' ? (
                            <video
                              src={item.url}
                              controls
                              preload="metadata"
                              className="block max-h-80 w-full bg-black object-contain"
                            />
                          ) : (
                            <button
                              type="button"
                              className="block w-full"
                              onClick={() => void openExternalUrl(item.url)}
                            >
                              <img
                                src={item.url}
                                alt=""
                                className="block max-h-80 w-full bg-zinc-950/20 object-contain"
                                loading="lazy"
                              />
                            </button>
                          )}
                          <p className="truncate px-2.5 py-1.5 text-[11px] text-muted">
                            {item.mediaType === 'video'
                              ? t('admin.teCommunity.mediaVideo')
                              : t('admin.teCommunity.mediaImage')}
                            {item.mimeType ? ` · ${item.mimeType}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'comments' ? (
              <section className={detailSectionCardClass()}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
                    <LucideMessagesSquareIcon className="size-4 shrink-0" />
                    {t('admin.teCommunity.field.comments')}
                    <span className="font-normal text-muted">
                      ({commentsLoading ? '…' : loadedCommentCount})
                    </span>
                    {openCommentReportCount > 0 ? (
                      <span className="font-normal text-red-600 dark:text-red-300">
                        · {openCommentReportCount}
                      </span>
                    ) : null}
                  </h2>
                  {canModerate && openCommentReportCount > 0 ? (
                    <button
                      type="button"
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
                      onClick={() => void dismissAllCommentReports()}
                    >
                      {t('admin.teCommunity.dismissAllReports')}
                    </button>
                  ) : null}
                </div>
                {commentsLoading || commentReportsLoading ? (
                  <div className="py-6 text-center text-sm text-muted">{t('status.loading')}</div>
                ) : commentsError ? (
                  <p className="text-sm text-rose-500">{commentsError}</p>
                ) : comments.length === 0 ? (
                  <p className="text-sm text-muted">{t('admin.teCommunity.noComments')}</p>
                ) : (
                  <ul className="m-0 list-none space-y-4 p-0">
                    {comments.map((comment) => (
                      <li key={comment.id}>
                        <TeCommunityCommentItem
                          comment={comment}
                          canDelete={canHardDelete}
                          deleteBusy={commentsDeleting}
                          openReports={openReportsForComment(comment.id)}
                          openReportsForComment={openReportsForComment}
                          canResolveReports={canModerate}
                          onDelete={requestDeleteComment}
                          onResolveReport={(reportId, status) =>
                            void handleResolveCommentReport(reportId, status)
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {activeTab === 'reports' ? (
              <section className={detailSectionCardClass()}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-muted">
                    <ShieldIcon className="size-4" />
                    {t('admin.teCommunity.field.reports')}
                    {openPostReportCount ? (
                      <span className="text-red-600 dark:text-red-300">
                        ({openPostReportCount})
                      </span>
                    ) : reports.length ? (
                      <span className="text-muted">({reports.length})</span>
                    ) : null}
                  </h2>
                  {canModerate && openPostReportCount > 0 ? (
                    <button
                      type="button"
                      disabled={updating}
                      className="inline-flex items-center gap-1.5 rounded-md border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
                      onClick={() => void dismissAllPostReports()}
                    >
                      {t('admin.teCommunity.dismissAllReports')}
                    </button>
                  ) : null}
                </div>
                {reportsLoading ? (
                  <div className="py-6 text-center text-sm text-muted">{t('status.loading')}</div>
                ) : reports.length === 0 ? (
                  <p className="text-sm text-muted">{t('admin.teCommunity.noReports')}</p>
                ) : (
                  <ul className="space-y-3">
                    {reports.map((report) => (
                      <li
                        key={report.id}
                        className="rounded-lg border border-ink/10 bg-white/40 p-3 dark:bg-white/5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-ink">
                                {t(`admin.teCommunity.reportReason.${report.reason}`)}
                              </span>
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${reportStatusClass(report.status)}`}
                              >
                                {t(`admin.teCommunity.reportStatus.${report.status}`)}
                              </span>
                            </div>
                            {report.detail ? (
                              <p className="mt-1 text-xs text-muted whitespace-pre-wrap">
                                {report.detail}
                              </p>
                            ) : null}
                            <p className="mt-1 text-xs text-muted">
                              {report.reporter?.displayName || report.reporter?.email || '—'} ·{' '}
                              {formatDate(report.createdAt)}
                            </p>
                            {report.adminNote ? (
                              <p className="mt-1 text-xs text-muted">
                                {t('admin.teCommunity.field.adminNote')}: {report.adminNote}
                              </p>
                            ) : null}
                          </div>
                          {canModerate && report.status === 'open' ? (
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                className="rounded-md border border-ink/15 px-2.5 py-1 text-xs text-ink hover:border-brand/40 hover:text-brand"
                                onClick={() => void handleResolveReport(report.id, 'dismissed')}
                              >
                                {t('admin.teCommunity.dismiss')}
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-emerald-500/40 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
                                onClick={() =>
                                  void handleResolveReport(report.id, 'action_taken')
                                }
                              >
                                {t('admin.teCommunity.markActioned')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      <ConfirmDangerDialog
        open={Boolean(commentPendingDelete)}
        title={t('admin.teCommunity.deleteCommentTitle')}
        message={t('admin.teCommunity.deleteCommentMessage')}
        confirmText={t('admin.teCommunity.deleteComment')}
        cancelText={t('admin.teCommunity.cancel')}
        busy={commentsDeleting}
        onConfirm={() => void confirmDeleteComment()}
        onCancel={() => setCommentPendingDelete(null)}
      />
      <ConfirmDangerDialog
        open={postPendingDelete}
        title={t('admin.teCommunity.deletePostTitle')}
        message={t('admin.teCommunity.deletePostMessage')}
        confirmText={t('admin.teCommunity.deletePost')}
        cancelText={t('admin.teCommunity.cancel')}
        busy={updating}
        onConfirm={() => void confirmDeletePost()}
        onCancel={() => setPostPendingDelete(false)}
      />
    </div>
  )
}
