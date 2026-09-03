import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import {
  mapTeCommunityReportFromRow,
  TE_COMMUNITY_REPORT_SELECT,
  type TeCommunityPostReport,
  type TeCommunityReportStatus,
} from '@/services/te-community-posts-repository'

/**
 * Load and resolve reports for a single community post (detail page).
 * Reads use the authenticated Supabase client; resolving requires system/group
 * admin per RLS.
 *
 * @returns Report list state and actions
 */
export function useTeCommunityPostReports() {
  const { t } = useTranslation()
  const [reports, setReports] = useState<TeCommunityPostReport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch all reports for a post (newest first).
   *
   * @param postId - Post UUID
   */
  const fetchReports = useCallback(
    async (postId: string): Promise<void> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.teCommunity.errorNotConfigured'))
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await fromLoose('te_community_post_reports')
          .select(TE_COMMUNITY_REPORT_SELECT)
          .eq('post_id', postId)
          .order('created_at', { ascending: false })

        if (fetchError) throw fetchError
        setReports((data ?? []).map((row) => mapTeCommunityReportFromRow(row)))
      } catch (err) {
        console.error('useTeCommunityPostReports fetchReports error:', err)
        setError(t('admin.teCommunity.errorLoadReports'))
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  /**
   * Resolve a report by setting its status and optional note.
   *
   * @param id - Report UUID
   * @param status - New status (`dismissed` or `action_taken`)
   * @param adminNote - Optional moderator note
   * @returns true on success
   */
  const resolveReport = useCallback(
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

      const { error: updateError } = await fromLoose('te_community_post_reports')
        .update(patch)
        .eq('id', id)

      if (updateError) {
        console.error('useTeCommunityPostReports resolveReport error:', updateError)
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
   * Dismiss every open report on this post in one update (rows kept for audit).
   *
   * @param postId - Post UUID
   * @returns true on success
   */
  const dismissAllOpenReports = useCallback(
    async (postId: string): Promise<boolean> => {
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

      const { error: updateError } = await fromLoose('te_community_post_reports')
        .update(patch)
        .eq('post_id', postId)
        .eq('status', 'open')

      if (updateError) {
        console.error('useTeCommunityPostReports dismissAllOpenReports error:', updateError)
        setError(t('admin.teCommunity.errorResolveReport'))
        return false
      }

      setReports((prev) =>
        prev.map((report) =>
          report.status === 'open' ? { ...report, status: 'dismissed', reviewedAt } : report,
        ),
      )
      return true
    },
    [reports, t],
  )

  return {
    reports,
    isLoading,
    error,
    fetchReports,
    resolveReport,
    dismissAllOpenReports,
  }
}
