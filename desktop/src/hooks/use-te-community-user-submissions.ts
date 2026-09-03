import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import {
  mapTeSubmissionFromRow,
  type TeSubmission,
} from '@/services/te-submissions-repository'
import type { TeCommunityAccount } from '@/services/te-community-accounts-repository'

const PAGE_SIZE = 10

/**
 * List T&E submissions that belong to a single community account.
 *
 * Matches on `community_account_id`, with a fallback to the account email so
 * legacy submissions created before the account link still appear.
 *
 * @returns Submission list state and actions scoped to one community account
 */
export function useTeCommunityUserSubmissions() {
  const { t } = useTranslation()
  const [submissions, setSubmissions] = useState<TeSubmission[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [activeAccount, setActiveAccount] = useState<TeCommunityAccount | null>(null)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  )

  /**
   * Fetch a page of submissions for a community account.
   *
   * @param account - Community account to scope submissions to
   * @param page - 1-based page index
   */
  const fetchPageFor = useCallback(
    async (account: TeCommunityAccount, page: number): Promise<void> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.teUsers.errorNotConfigured'))
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const filters = [`community_account_id.eq.${account.id}`]
        const email = account.email.trim()
        if (email) {
          filters.push(`email.eq.${email}`)
        }

        const { data, count, error: fetchError } = await fromLoose('te_submissions')
          .select('*', { count: 'exact' })
          .or(filters.join(','))
          .order('created_at', { ascending: false })
          .range(from, to)

        if (fetchError) throw fetchError

        setSubmissions((data ?? []).map((row) => mapTeSubmissionFromRow(row)))
        setTotalCount(count ?? 0)
      } catch (err) {
        console.error('useTeCommunityUserSubmissions fetchPage error:', err)
        setError(t('admin.teUsers.tabs.submissionsError'))
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  /**
   * Load submissions for an account, resetting to the first page.
   *
   * @param account - Community account to scope submissions to
   */
  const loadForAccount = useCallback(
    async (account: TeCommunityAccount): Promise<void> => {
      setActiveAccount(account)
      setCurrentPage(1)
      await fetchPageFor(account, 1)
    },
    [fetchPageFor],
  )

  /**
   * Go to a page and reload.
   *
   * @param page - 1-based page index
   */
  const goToPage = useCallback(
    async (page: number): Promise<void> => {
      if (!activeAccount) return
      if (page < 1 || page > totalPages) return
      setCurrentPage(page)
      await fetchPageFor(activeAccount, page)
    },
    [activeAccount, fetchPageFor, totalPages],
  )

  return {
    submissions,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    loadForAccount,
    goToPage,
  }
}
