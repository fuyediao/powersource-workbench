import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import {
  mapTeCommunityAccountFromRow,
  TE_COMMUNITY_ACCOUNT_SELECT,
  type TeCommunityAccount,
  type TeCommunityAccountStatus,
} from '@/services/te-community-accounts-repository'

export type { TeCommunityAccount, TeCommunityAccountStatus }

const PAGE_SIZE = 20

/**
 * List T&E community accounts; status updates require group/system admin (RLS).
 *
 * @returns Account list state and actions
 */
export function useTeCommunityAccounts() {
  const { t } = useTranslation()
  const [accounts, setAccounts] = useState<TeCommunityAccount[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilterState] = useState<TeCommunityAccountStatus | ''>('')

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  )

  /**
   * Fetch community accounts with explicit search, status, and pagination.
   *
   * @param page - One-based page index
   * @param search - Search string
   * @param status - Account status or empty for all
   */
  const fetchAccountsWith = useCallback(
    async (
      page: number,
      search: string,
      status: TeCommunityAccountStatus | '',
    ): Promise<void> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.teUsers.errorNotConfigured'))
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let query = fromLoose('te_community_accounts')
          .select(TE_COMMUNITY_ACCOUNT_SELECT, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(from, to)

        if (status) {
          query = query.eq('status', status)
        }

        if (search.trim()) {
          const q = `%${search.trim()}%`
          query = query.or(
            `email.ilike.${q},display_name.ilike.${q},nickname.ilike.${q},organization.ilike.${q}`,
          )
        }

        const { data, count, error: fetchError } = await query

        if (fetchError) throw fetchError

        setAccounts((data ?? []).map((row) => mapTeCommunityAccountFromRow(row)))
        setTotalCount(count ?? 0)
      } catch (err) {
        console.error('useTeCommunityAccounts fetchAccounts error:', err)
        setError(t('admin.teUsers.errorLoad'))
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  /**
   * Fetch community accounts with search, status filter, and pagination.
   */
  const fetchAccounts = useCallback(async (): Promise<void> => {
    await fetchAccountsWith(currentPage, searchQuery, statusFilter)
  }, [currentPage, fetchAccountsWith, searchQuery, statusFilter])

  /**
   * Change search query and reset to page 1.
   *
   * @param query - Search string
   */
  const setSearch = useCallback(
    async (query: string): Promise<void> => {
      setSearchQuery(query)
      setCurrentPage(1)
      await fetchAccountsWith(1, query, statusFilter)
    },
    [fetchAccountsWith, statusFilter],
  )

  /**
   * Change status filter and reset to page 1.
   *
   * @param status - Account status or empty for all
   */
  const setStatusFilter = useCallback(
    async (status: TeCommunityAccountStatus | ''): Promise<void> => {
      setStatusFilterState(status)
      setCurrentPage(1)
      await fetchAccountsWith(1, searchQuery, status)
    },
    [fetchAccountsWith, searchQuery],
  )

  /**
   * Go to a page and reload.
   *
   * @param page - 1-based page index
   */
  const goToPage = useCallback(
    async (page: number): Promise<void> => {
      if (page < 1 || page > totalPages) return
      setCurrentPage(page)
      await fetchAccountsWith(page, searchQuery, statusFilter)
    },
    [fetchAccountsWith, searchQuery, statusFilter, totalPages],
  )

  /**
   * Fetch a single community account by id.
   *
   * @param id - Account UUID
   * @returns Account or null when missing / on error
   */
  const fetchAccountById = useCallback(
    async (id: string): Promise<TeCommunityAccount | null> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.teUsers.errorNotConfigured'))
        return null
      }

      const { data, error: fetchError } = await fromLoose('te_community_accounts')
        .select(TE_COMMUNITY_ACCOUNT_SELECT)
        .eq('id', id)
        .maybeSingle()

      if (fetchError) {
        console.error('useTeCommunityAccounts fetchAccountById error:', fetchError)
        setError(t('admin.teUsers.errorLoad'))
        return null
      }

      if (!data) return null

      return mapTeCommunityAccountFromRow(data)
    },
    [t],
  )

  /**
   * Update account status (active / suspended / banned).
   *
   * @param id - Account UUID
   * @param status - New status
   * @param reason - Optional suspension reason
   * @param options - Skip list refresh when on the detail page
   * @returns true on success
   */
  const updateAccountStatus = useCallback(
    async (
      id: string,
      status: TeCommunityAccountStatus,
      reason?: string | null,
      options?: { skipListRefresh?: boolean },
    ): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false

      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      }

      if (status === 'active') {
        patch.suspended_at = null
        patch.suspended_reason = null
        patch.suspended_by = null
      } else {
        patch.suspended_at = new Date().toISOString()
        patch.suspended_reason = reason?.trim() || null
        const { data: userData } = await supabase.auth.getUser()
        patch.suspended_by = userData.user?.id ?? null
      }

      const { error: updateError } = await fromLoose('te_community_accounts')
        .update(patch)
        .eq('id', id)

      if (updateError) {
        console.error('useTeCommunityAccounts updateAccountStatus error:', updateError)
        setError(t('admin.teUsers.errorUpdateStatus'))
        return false
      }

      if (!options?.skipListRefresh) {
        await fetchAccountsWith(currentPage, searchQuery, statusFilter)
      }
      return true
    },
    [currentPage, fetchAccountsWith, searchQuery, statusFilter, t],
  )

  return {
    accounts,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    searchQuery,
    statusFilter,
    fetchAccounts,
    setSearch,
    setStatusFilter,
    goToPage,
    fetchAccountById,
    updateAccountStatus,
  }
}
