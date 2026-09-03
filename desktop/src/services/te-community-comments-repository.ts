/**
 * Maps `public.te_community_comments` (+ stats + author) for Workbench admin detail.
 */

import type { TeCommunityPostAuthor } from '@/services/te-community-posts-repository'
import { coalesceCommunityPublicName } from '@/services/te-community-accounts-repository'

export type TeCommunityCommentStatus = 'published' | 'hidden' | 'deleted'

/** How the member chose to appear on the public TE comment. */
export type TeCommunityAuthorVisibility = 'real_name' | 'nickname' | 'anonymous'

/** Nested comment row for the admin post detail thread. */
export interface TeCommunityComment {
  id: string
  postId: string
  parentId: string | null
  communityAccountId: string
  body: string
  status: TeCommunityCommentStatus
  /** Public label mode on TE (CRM still shows the real account identity). */
  authorVisibility: TeCommunityAuthorVisibility
  createdAt: string
  author: TeCommunityPostAuthor | null
  likeCount: number
  dislikeCount: number
  replyCount: number
  reportCount: number
  /**
   * True when `parentId` points at a missing/deleted parent so this node was
   * promoted to the top of the admin forest (invisible on the public te feed).
   */
  isOrphan: boolean
  replies: TeCommunityComment[]
}

/** Columns selected for comments, including author and engagement stats. */
export const TE_COMMUNITY_COMMENT_SELECT =
  'id, post_id, parent_id, community_account_id, body, status, author_visibility, created_at, te_community_accounts ( display_name, nickname, email ), te_community_comment_stats ( like_count, dislike_count, comment_count, report_count )'

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
 * Map a nested account join to an author summary.
 *
 * @param account - Raw account object or null
 * @returns Author or null
 */
function mapAuthor(account: unknown): TeCommunityPostAuthor | null {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return null
  const acc = account as Record<string, unknown>
  return {
    displayName: coalesceCommunityPublicName(acc.nickname, acc.display_name),
    email: String(acc.email ?? ''),
    avatarUrl: typeof acc.avatar_url === 'string' ? acc.avatar_url : null,
  }
}

/**
 * Map a Supabase comment row (flat, no replies) to {@link TeCommunityComment}.
 *
 * @param row - Raw PostgREST record
 * @returns Normalized comment without nested replies
 */
export function mapTeCommunityCommentFromRow(row: Record<string, unknown>): TeCommunityComment {
  const statsRaw = row.te_community_comment_stats
  const stats =
    statsRaw && typeof statsRaw === 'object' && !Array.isArray(statsRaw)
      ? (statsRaw as Record<string, unknown>)
      : null

  return {
    id: String(row.id),
    postId: String(row.post_id ?? ''),
    parentId: typeof row.parent_id === 'string' ? row.parent_id : null,
    communityAccountId: String(row.community_account_id ?? ''),
    body: String(row.body ?? ''),
    status: (row.status as TeCommunityCommentStatus) ?? 'published',
    authorVisibility: (row.author_visibility as TeCommunityAuthorVisibility) ?? 'nickname',
    createdAt: String(row.created_at ?? ''),
    author: mapAuthor(row.te_community_accounts),
    likeCount: readStatsCount(stats?.like_count),
    dislikeCount: readStatsCount(stats?.dislike_count),
    replyCount: readStatsCount(stats?.comment_count),
    reportCount: readStatsCount(stats?.report_count),
    isOrphan: false,
    replies: [],
  }
}

/**
 * Nest flat comments into a Reddit-style reply tree (roots first).
 * Orphans whose parent is missing become top-level and are flagged `isOrphan`
 * (those replies are omitted from the public te feed until cleaned up).
 *
 * @param flat - Flat comment list
 * @returns Forest of top-level comments with nested replies
 */
export function buildTeCommunityCommentTree(flat: TeCommunityComment[]): TeCommunityComment[] {
  const byId = new Map<string, TeCommunityComment>()
  for (const item of flat) {
    byId.set(item.id, { ...item, isOrphan: false, replies: [] })
  }

  const roots: TeCommunityComment[] = []
  for (const item of byId.values()) {
    if (item.parentId && byId.has(item.parentId)) {
      byId.get(item.parentId)!.replies.push(item)
    } else {
      roots.push({
        ...item,
        isOrphan: !!item.parentId,
      })
    }
  }
  return roots
}
