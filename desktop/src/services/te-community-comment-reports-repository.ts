/**
 * Maps `public.te_community_comment_reports` for GeoCRM admin moderation.
 */

import type {
  TeCommunityPostAuthor,
  TeCommunityReportReason,
  TeCommunityReportStatus,
} from '@/services/te-community-posts-repository'
import { coalesceCommunityPublicName } from '@/services/te-community-accounts-repository'

/** A report filed against a community comment. */
export interface TeCommunityCommentReport {
  id: string
  commentId: string
  reporterAccountId: string
  reason: TeCommunityReportReason
  detail: string | null
  status: TeCommunityReportStatus
  reviewedAt: string | null
  adminNote: string | null
  createdAt: string
  reporter: TeCommunityPostAuthor | null
}

/** Columns selected for comment reports, including the reporter summary. */
export const TE_COMMUNITY_COMMENT_REPORT_SELECT =
  'id, comment_id, reporter_account_id, reason, detail, status, reviewed_at, admin_note, created_at, te_community_accounts ( display_name, nickname, email )'

/**
 * Map a Supabase row to {@link TeCommunityCommentReport}.
 *
 * @param row - Raw PostgREST record
 * @returns Normalized comment report
 */
export function mapTeCommunityCommentReportFromRow(
  row: Record<string, unknown>,
): TeCommunityCommentReport {
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
    commentId: String(row.comment_id ?? ''),
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
