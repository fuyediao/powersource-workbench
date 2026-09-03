/**
 * Maps `public.te_community_posts` rows (with joined author + media) for the
 * Workbench T&E community admin UI.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import { coalesceCommunityPublicName } from '@/services/te-community-accounts-repository'

export type TeCommunityPostStatus = 'draft' | 'published' | 'hidden' | 'deleted'

/** Media attachment on a community post. */
export interface TeCommunityPostMedia {
  id: string
  mediaType: 'image' | 'video'
  mimeType: string
  url: string
  width: number | null
  height: number | null
  durationSeconds: number | null
}

/** Author summary joined from te_community_accounts. */
export interface TeCommunityPostAuthor {
  displayName: string | null
  email: string
  /** Public avatar URL (WebP). Null when no avatar uploaded. */
  avatarUrl: string | null
}

/** Community post row for the admin list and detail views. */
export interface TeCommunityPost {
  id: string
  communityAccountId: string
  teSubmissionId: string | null
  title: string | null
  bodyMarkdown: string
  status: TeCommunityPostStatus
  hiddenAt: string | null
  hiddenReason: string | null
  reportCount: number
  /** Open (unresolved) post reports — used by admin list/badges. */
  openReportCount: number
  /** Open comment reports under this post (any nesting depth). */
  commentReportCount: number
  likeCount: number
  dislikeCount: number
  commentCount: number
  shareCount: number
  /** When a moderator pinned this post. Null when not pinned. */
  pinnedAt: string | null
  /** Pin expiry. Null with a non-null `pinnedAt` means the pin is indefinite. */
  pinnedUntil: string | null
  /** Admin auth.users id who pinned this post. */
  pinnedBy: string | null
  createdAt: string
  updatedAt: string
  author: TeCommunityPostAuthor | null
  media: TeCommunityPostMedia[]
}

/**
 * True when a post is currently pinned (pinned and, if timed, not yet expired).
 *
 * @param post - Community post (or the pin fields of one)
 * @returns Whether the pin is active
 */
export function isPostPinActive(
  post: Pick<TeCommunityPost, 'pinnedAt' | 'pinnedUntil'>,
): boolean {
  if (!post.pinnedAt) return false
  if (!post.pinnedUntil) return true
  return new Date(post.pinnedUntil).getTime() > Date.now()
}

/** Columns selected for posts, including joined author, media, and engagement stats. */
export const TE_COMMUNITY_POST_SELECT =
  'id, community_account_id, te_submission_id, title, body_markdown, status, hidden_at, hidden_reason, report_count, pinned_at, pinned_until, pinned_by, created_at, updated_at, te_community_accounts ( display_name, nickname, email ), te_community_post_media ( id, media_type, mime_type, public_url, width, height, duration_seconds ), te_community_post_stats ( like_count, dislike_count, comment_count, share_count )'

/**
 * Map a nested media row to {@link TeCommunityPostMedia}.
 *
 * @param row - Raw media record
 * @returns Normalized media
 */
function mapMedia(row: Record<string, unknown>): TeCommunityPostMedia {
  return {
    id: String(row.id),
    mediaType: (row.media_type as 'image' | 'video') ?? 'image',
    mimeType: String(row.mime_type ?? ''),
    url: String(row.public_url ?? ''),
    width: typeof row.width === 'number' ? row.width : null,
    height: typeof row.height === 'number' ? row.height : null,
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
  }
}

/**
 * Read a non-negative counter from a PostgREST stats field.
 *
 * @param value - Raw counter value
 * @returns Integer count (defaults to 0)
 */
function readStatsCount(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

/**
 * Map a Supabase row (with nested account + media) to {@link TeCommunityPost}.
 *
 * @param row - Raw PostgREST record
 * @returns Normalized post
 */
export function mapTeCommunityPostFromRow(row: Record<string, unknown>): TeCommunityPost {
  const account = row.te_community_accounts
  let author: TeCommunityPostAuthor | null = null
  if (account && typeof account === 'object' && !Array.isArray(account)) {
    const acc = account as Record<string, unknown>
    author = {
      displayName: coalesceCommunityPublicName(acc.nickname, acc.display_name),
      email: String(acc.email ?? ''),
      avatarUrl: typeof acc.avatar_url === 'string' ? acc.avatar_url : null,
    }
  }

  const mediaRaw = Array.isArray(row.te_community_post_media) ? row.te_community_post_media : []
  const media = (mediaRaw as Record<string, unknown>[]).map(mapMedia)

  const statsRaw = row.te_community_post_stats
  const stats =
    statsRaw && typeof statsRaw === 'object' && !Array.isArray(statsRaw)
      ? (statsRaw as Record<string, unknown>)
      : null

  return {
    id: String(row.id),
    communityAccountId: String(row.community_account_id ?? ''),
    teSubmissionId: typeof row.te_submission_id === 'string' ? row.te_submission_id : null,
    title: typeof row.title === 'string' ? row.title : null,
    bodyMarkdown: String(row.body_markdown ?? ''),
    status: (row.status as TeCommunityPostStatus) ?? 'published',
    hiddenAt: typeof row.hidden_at === 'string' ? row.hidden_at : null,
    hiddenReason: typeof row.hidden_reason === 'string' ? row.hidden_reason : null,
    reportCount: typeof row.report_count === 'number' ? row.report_count : 0,
    openReportCount: 0,
    commentReportCount: 0,
    likeCount: readStatsCount(stats?.like_count),
    dislikeCount: readStatsCount(stats?.dislike_count),
    commentCount: readStatsCount(stats?.comment_count),
    shareCount: readStatsCount(stats?.share_count),
    pinnedAt: typeof row.pinned_at === 'string' ? row.pinned_at : null,
    pinnedUntil: typeof row.pinned_until === 'string' ? row.pinned_until : null,
    pinnedBy: typeof row.pinned_by === 'string' ? row.pinned_by : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    author,
    media,
  }
}

/**
 * Count open (unresolved) post reports per post for the given post IDs.
 *
 * @param postIds - Post UUIDs on the current page
 * @returns Map of postId → open report count
 */
export async function fetchOpenPostReportCountsByPostIds(
  postIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>()
  if (postIds.length === 0 || !isSupabaseConfigured || !supabase) return totals

  const { data, error } = await fromLoose('te_community_post_reports')
    .select('post_id')
    .in('post_id', postIds)
    .eq('status', 'open')

  if (error) throw error

  for (const raw of data ?? []) {
    const postId = typeof raw.post_id === 'string' ? raw.post_id : ''
    if (!postId) continue
    totals.set(postId, (totals.get(postId) ?? 0) + 1)
  }
  return totals
}

/**
 * Attach open post-report totals onto normalized posts (mutates in place).
 *
 * @param posts - Normalized posts
 * @param totals - Map from {@link fetchOpenPostReportCountsByPostIds}
 */
export function applyOpenPostReportCounts(
  posts: TeCommunityPost[],
  totals: Map<string, number>,
): void {
  for (const post of posts) {
    post.openReportCount = totals.get(post.id) ?? 0
  }
}

/**
 * Count open comment reports per post for the given post IDs.
 * Dismissed / actioned reports are excluded so admin badges drop after resolve.
 *
 * @param postIds - Post UUIDs on the current page
 * @returns Map of postId → open comment-report count
 */
export async function fetchCommentReportCountsByPostIds(
  postIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>()
  if (postIds.length === 0 || !isSupabaseConfigured || !supabase) return totals

  const { data, error } = await fromLoose('te_community_comment_reports')
    .select('id, te_community_comments!inner(post_id)')
    .eq('status', 'open')
    .in('te_community_comments.post_id', postIds)

  if (error) throw error

  for (const raw of data ?? []) {
    const comment = raw.te_community_comments
    const postId =
      comment && typeof comment === 'object' && !Array.isArray(comment)
        ? String((comment as Record<string, unknown>).post_id ?? '')
        : ''
    if (!postId) continue
    totals.set(postId, (totals.get(postId) ?? 0) + 1)
  }
  return totals
}

/**
 * Attach open comment-report totals onto normalized posts (mutates in place).
 *
 * @param posts - Normalized posts
 * @param totals - Map from {@link fetchCommentReportCountsByPostIds}
 */
export function applyCommentReportCounts(
  posts: TeCommunityPost[],
  totals: Map<string, number>,
): void {
  for (const post of posts) {
    post.commentReportCount = totals.get(post.id) ?? 0
  }
}

export type TeCommunityReportReason =
  | 'spam'
  | 'harassment'
  | 'misinformation'
  | 'privacy'
  | 'illegal'
  | 'sexual'
  | 'other'

export type TeCommunityReportStatus = 'open' | 'dismissed' | 'action_taken'

/** A report filed against a community post. */
export interface TeCommunityPostReport {
  id: string
  postId: string
  reporterAccountId: string
  reason: TeCommunityReportReason
  detail: string | null
  status: TeCommunityReportStatus
  reviewedAt: string | null
  adminNote: string | null
  createdAt: string
  reporter: TeCommunityPostAuthor | null
}

/** Columns selected for reports, including the reporter summary. */
export const TE_COMMUNITY_REPORT_SELECT =
  'id, post_id, reporter_account_id, reason, detail, status, reviewed_at, admin_note, created_at, te_community_accounts ( display_name, nickname, email )'

/**
 * Map a Supabase row to {@link TeCommunityPostReport}.
 *
 * @param row - Raw PostgREST record
 * @returns Normalized report
 */
export function mapTeCommunityReportFromRow(row: Record<string, unknown>): TeCommunityPostReport {
  const account = row.te_community_accounts
  let reporter: TeCommunityPostAuthor | null = null
  if (account && typeof account === 'object' && !Array.isArray(account)) {
    const acc = account as Record<string, unknown>
    reporter = {
      displayName: coalesceCommunityPublicName(acc.nickname, acc.display_name),
      email: String(acc.email ?? ''),
      avatarUrl: typeof acc.avatar_url === 'string' ? acc.avatar_url : null,
    }
  }

  return {
    id: String(row.id),
    postId: String(row.post_id ?? ''),
    reporterAccountId: String(row.reporter_account_id ?? ''),
    reason: (row.reason as TeCommunityReportReason) ?? 'other',
    detail: typeof row.detail === 'string' ? row.detail : null,
    status: (row.status as TeCommunityReportStatus) ?? 'open',
    reviewedAt: typeof row.reviewed_at === 'string' ? row.reviewed_at : null,
    adminNote: typeof row.admin_note === 'string' ? row.admin_note : null,
    createdAt: String(row.created_at ?? ''),
    reporter,
  }
}
