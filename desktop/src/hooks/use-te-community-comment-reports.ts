import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import {
  mapTeCommunityCommentReportFromRow,
  TE_COMMUNITY_COMMENT_REPORT_SELECT,
  type TeCommunityCommentReport,
} from '@/services/te-community-comment-reports-repository'
import type { TeCommunityReportStatus } from '@/services/te-community-posts-repository'

/**
 * Load and resolve reports against comments under one post (detail page).
 * Resolving only updates status — report rows are kept for audit; open badges drop.
 *
 * @returns Comment-report list state and actions
 */
export function useTeCommunityCommentReports() {
  const { t } = useTranslation()
  const [reports, setReports] = useState<TeCommunityCommentReport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Open (unresolved) comment reports for the current post. */
  const openReports = useMemo(
    () => reports.filter((r) => r.status === 'open'),
    [reports],
  )

  /** Open report count (for the Comments tab badge). */
  const openReportCount = openReports.length

  /**
   * Fetch all comment reports for comments under a post (newest first).
   *
   * @param postId - Post UUID
   */
  const fetchCommentReports = useCallback(
    async (postId: string): Promise<void> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.teCommunity.errorNotConfigured'))
        setReports([])
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await fromLoose('te_community_comment_reports')
          .select(`${TE_COMMUNITY_COMMENT_REPORT_SELECT}, te_community_comments!inner(post_id)`)
          .eq('te_community_comments.post_id', postId)
          .order('created_at', { ascending: false })

        if (fetchError) throw fetchError
        setReports((data ?? []).map((row) => mapTeCommunityCommentReportFromRow(row)))
      } catch (err) {
        console.error('useTeCommunityCommentReports fetchCommentReports error:', err)
        setError(t('admin.teCommunity.errorLoadReports'))
        setReports([])
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  /**
   * Open reports for a single comment id.
   *
   * @param commentId - Comment UUID
   * @returns Open reports for that comment
   */
  const openReportsForComment = useCallback(
    (commentId: string): TeCommunityCommentReport[] =>
      openReports.filter((r) => r.commentId === commentId),
    [openReports],
  )

  /**
   * Resolve a comment report by setting its status (does not delete the row).
   *
   * @param id - Report UUID
   * @param status - New status (`dismissed` or `action_taken`)
   * @param adminNote - Optional moderator note
   * @returns true on success
   */
  const resolveCommentReport = useCallback(
    async (
      id: string,
      status: Exclude<TeCommunityReportStatus, 'open'>,
      adminNote?: string | null,
    ): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false

      const { data: userData } = await supabase.auth.getUser()
      const reviewedAt = new Date().toISOString()
      const trimmedNote = adminNote?.trim() || null
      const patch: Record<string, unknown> = {
        status,
        admin_note: trimmedNote,
        reviewed_at: reviewedAt,
        reviewed_by: userData.user?.id ?? null,
      }

      const { error: updateError } = await fromLoose('te_community_comment_reports')
        .update(patch)
        .eq('id', id)

      if (updateError) {
        console.error('useTeCommunityCommentReports resolveCommentReport error:', updateError)
        setError(t('admin.teCommunity.errorResolveReport'))
        return false
      }

      setReports((prev) =>
        prev.map((report) =>
          report.id === id
            ? { ...report, status, adminNote: trimmedNote, reviewedAt }
            : report,
        ),
      )
      return true
    },
    [t],
  )

  /**
   * Dismiss every open comment report under this post (rows kept for audit).
   *
   * @returns true on success
   */
  const dismissAllOpenCommentReports = useCallback(async (): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false

    const openIds = reports.filter((r) => r.status === 'open').map((r) => r.id)
    if (openIds.length === 0) return true

    const { data: userData } = await supabase.auth.getUser()
    const reviewedAt = new Date().toISOString()
    const patch: Record<string, unknown> = {
      status: 'dismissed',
      reviewed_at: reviewedAt,
      reviewed_by: userData.user?.id ?? null,
    }

    const { error: updateError } = await fromLoose('te_community_comment_reports')
      .update(patch)
      .in('id', openIds)

    if (updateError) {
      console.error(
        'useTeCommunityCommentReports dismissAllOpenCommentReports error:',
        updateError,
      )
      setError(t('admin.teCommunity.errorResolveReport'))
      return false
    }

    setReports((prev) =>
      prev.map((report) =>
        report.status === 'open' ? { ...report, status: 'dismissed', reviewedAt } : report,
      ),
    )
    return true
  }, [reports, t])

  /** Clear local report state when leaving detail. */
  const clearCommentReports = useCallback((): void => {
    setReports([])
    setError(null)
  }, [])

  return {
    reports,
    openReports,
    openReportCount,
    isLoading,
    error,
    fetchCommentReports,
    openReportsForComment,
    resolveCommentReport,
    dismissAllOpenCommentReports,
    clearCommentReports,
  }
}
