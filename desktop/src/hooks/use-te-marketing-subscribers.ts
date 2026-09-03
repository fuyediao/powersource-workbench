import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import {
  mapTeSubmissionFromRow,
  type TeSubmission,
} from '@/services/te-submissions-repository'

const PAGE_SIZE = 20

/**
 * Paginated T&E submissions that opted in to marketing emails.
 *
 * @returns Subscriber list state and actions
 */
export function useTeMarketingSubscribers() {
  const { t } = useTranslation()
  const [submissions, setSubmissions] = useState<TeSubmission[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  )

  /**
   * Load a page of marketing opt-in submissions with explicit search.
   *
   * @param page - One-based page index
   * @param search - Search string
   */
  const fetchSubscribersWith = useCallback(
    async (page: number, search: string): Promise<void> => {
      if (!isSupabaseConfigured) {
        setError(t('teAdmin.marketing.errors.notConfigured'))
        setSubmissions([])
        setTotalCount(0)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1
        let query = fromLoose('te_submissions')
          .select('*', { count: 'exact' })
          .eq('consent_marketing_emails', true)
          .order('created_at', { ascending: false })
          .range(from, to)
        const keyword = search.trim()
        if (keyword) {
          const pattern = `%${keyword}%`
          query = query.or(
            `email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},agency.ilike.${pattern}`,
          )
        }
        const { data, count, error: fetchError } = await query
        if (fetchError) {
          throw fetchError
        }
        setSubmissions(
          ((data ?? []) as Record<string, unknown>[]).map((row) =>
            mapTeSubmissionFromRow(row),
          ),
        )
        setTotalCount(count ?? 0)
      } catch (fetchError) {
        console.error('useTeMarketingSubscribers fetchSubscribers error:', fetchError)
        setError(t('teAdmin.marketing.errors.load'))
        setSubmissions([])
        setTotalCount(0)
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  /**
   * Reload the current page with the current search query.
   */
  const fetchSubscribers = useCallback(async (): Promise<void> => {
    await fetchSubscribersWith(currentPage, searchQuery)
  }, [currentPage, fetchSubscribersWith, searchQuery])

  /**
   * Update the search query and reload page one.
   *
   * @param query - Search text
   */
  const setSearch = useCallback(
    async (query: string): Promise<void> => {
      setSearchQuery(query)
      setCurrentPage(1)
      await fetchSubscribersWith(1, query)
    },
    [fetchSubscribersWith],
  )

  /**
   * Navigate to a subscriber list page.
   *
   * @param page - One-based page number
   */
  const goToPage = useCallback(
    async (page: number): Promise<void> => {
      if (page < 1 || page > totalPages) {
        return
      }
      setCurrentPage(page)
      await fetchSubscribersWith(page, searchQuery)
    },
    [fetchSubscribersWith, searchQuery, totalPages],
  )

  return {
    submissions,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    searchQuery,
    fetchSubscribers,
    setSearch,
    goToPage,
  }
}
