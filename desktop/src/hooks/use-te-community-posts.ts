import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose, rpcLoose } from '@/lib/supabase-loose'
import {
  applyCommentReportCounts,
  applyOpenPostReportCounts,
  fetchCommentReportCountsByPostIds,
  fetchOpenPostReportCountsByPostIds,
  mapTeCommunityPostFromRow,
  TE_COMMUNITY_POST_SELECT,
  type TeCommunityPost,
  type TeCommunityPostStatus,
} from '@/services/te-community-posts-repository'

const PAGE_SIZE = 20

/** Maximum number of posts that can be pinned at the same time. */
export const MAX_ACTIVE_PINS = 3

/** Fixed pin duration choices (days); `null` means indefinite (no expiry). */
export type PinDurationDays = 1 | 3 | 7 | 30 | null

/** Result of a pin attempt. */
export type PinPostResult = 'ok' | 'maxPinsReached' | 'error'

/** List filter for moderation focus. */
export type PostReportFilter = '' | 'reported'

/**
 * Attach open post-report and comment-report totals onto mapped posts.
 *
 * @param mapped - Normalized posts
 * @returns Posts with report counts applied
 */
async function attachReportCounts(mapped: TeCommunityPost[]): Promise<TeCommunityPost[]> {
  const postIds = mapped.map((post) => post.id)
  const [openPostReportTotals, commentReportTotals] = await Promise.all([
    fetchOpenPostReportCountsByPostIds(postIds),
    fetchCommentReportCountsByPostIds(postIds),
  ])
  applyOpenPostReportCounts(mapped, openPostReportTotals)
  applyCommentReportCounts(mapped, commentReportTotals)
  return mapped
}

/**
 * Paginated list and moderation actions for `te_community_posts` in Workbench admin.
 * Reads use the authenticated Supabase client (cross-group SELECT); hide/restore
 * require system/group admin per RLS.
 *
 * @returns Post list state and actions
 */
export function useTeCommunityPosts() {
  const { t } = useTranslation()
  const [posts, setPosts] = useState<TeCommunityPost[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilterState] = useState<TeCommunityPostStatus | ''>('')
  const [reportFilter, setReportFilterState] = useState<PostReportFilter>('')

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    [totalCount],
  )

  /**
   * Clear expired timed pins so they stop counting against the active-pin cap
   * and stop sorting ahead of fresh posts. Lazy cleanup (no cron job).
   */
  const expireOverduePins = useCallback(async (): Promise<void> => {
    if (!isSupabaseConfigured) return
    const { error: expireError } = await fromLoose('te_community_posts')
      .update({ pinned_at: null, pinned_until: null, pinned_by: null })
      .lt('pinned_until', new Date().toISOString())

    if (expireError) {
      console.error('useTeCommunityPosts expireOverduePins error:', expireError)
    }
  }, [])

  /**
   * Fetch posts with explicit search, status / report filters, and pagination.
   *
   * @param page - 1-based page index
   * @param search - Search string
   * @param status - Status or empty for all
   * @param reports - Report filter value
   */
  const fetchPostsWith = useCallback(
    async (
      page: number,
      search: string,
      status: TeCommunityPostStatus | '',
      reports: PostReportFilter,
    ): Promise<void> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.teCommunity.errorNotConfigured'))
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        await expireOverduePins()

        const from = (page - 1) * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let query = fromLoose('te_community_posts')
          .select(TE_COMMUNITY_POST_SELECT, { count: 'exact' })
          .order('pinned_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .range(from, to)

        if (status) {
          query = query.eq('status', status)
        }
        if (reports === 'reported') {
          query = query.gt('report_count', 0)
        }

        const q = search.trim()
        if (q) {
          const pattern = `%${q}%`
          query = query.or(`title.ilike.${pattern},body_markdown.ilike.${pattern}`)
        }

        const { data, count, error: fetchError } = await query
        if (fetchError) throw fetchError

        const mapped = (data ?? []).map((row) => mapTeCommunityPostFromRow(row))
        setPosts(await attachReportCounts(mapped))
        setTotalCount(count ?? 0)
      } catch (err) {
        console.error('useTeCommunityPosts fetchPosts error:', err)
        setError(t('admin.teCommunity.errorLoad'))
      } finally {
        setIsLoading(false)
      }
    },
    [expireOverduePins, t],
  )

  /**
   * Fetch posts with search, status / report filters, and pagination.
   */
  const fetchPosts = useCallback(async (): Promise<void> => {
    await fetchPostsWith(currentPage, searchQuery, statusFilter, reportFilter)
  }, [currentPage, fetchPostsWith, reportFilter, searchQuery, statusFilter])

  /**
   * Load a single post by id for the detail page.
   *
   * @param id - Post UUID
   * @returns Post or null when not found
   */
  const fetchPostById = useCallback(
    async (id: string): Promise<TeCommunityPost | null> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.teCommunity.errorNotConfigured'))
        return null
      }
      try {
        const { data, error: fetchError } = await fromLoose('te_community_posts')
          .select(TE_COMMUNITY_POST_SELECT)
          .eq('id', id)
          .maybeSingle()

        if (fetchError) throw fetchError
        if (!data) return null
        const post = mapTeCommunityPostFromRow(data)
        const [withCounts] = await attachReportCounts([post])
        return withCounts ?? null
      } catch (err) {
        console.error('useTeCommunityPosts fetchPostById error:', err)
        setError(t('admin.teCommunity.errorLoad'))
        return null
      }
    },
    [t],
  )

  /**
   * Change search query and reset to page 1.
   *
   * @param query - Search string
   */
  const setSearch = useCallback(
    async (query: string): Promise<void> => {
      setSearchQuery(query)
      setCurrentPage(1)
      await fetchPostsWith(1, query, statusFilter, reportFilter)
    },
    [fetchPostsWith, reportFilter, statusFilter],
  )

  /**
   * Change status filter and reset to page 1.
   *
   * @param status - Status or empty for all
   */
  const setStatusFilter = useCallback(
    async (status: TeCommunityPostStatus | ''): Promise<void> => {
      setStatusFilterState(status)
      setCurrentPage(1)
      await fetchPostsWith(1, searchQuery, status, reportFilter)
    },
    [fetchPostsWith, reportFilter, searchQuery],
  )

  /**
   * Toggle the "reported only" filter and reset to page 1.
   *
   * @param filter - Report filter value
   */
  const setReportFilter = useCallback(
    async (filter: PostReportFilter): Promise<void> => {
      setReportFilterState(filter)
      setCurrentPage(1)
      await fetchPostsWith(1, searchQuery, statusFilter, filter)
    },
    [fetchPostsWith, searchQuery, statusFilter],
  )

  /**
   * Go to a page index (1-based).
   *
   * @param page - Target page
   */
  const goToPage = useCallback(
    async (page: number): Promise<void> => {
      const next = Math.max(1, Math.min(page, totalPages))
      setCurrentPage(next)
      await fetchPostsWith(next, searchQuery, statusFilter, reportFilter)
    },
    [fetchPostsWith, reportFilter, searchQuery, statusFilter, totalPages],
  )

  /**
   * Update a post's moderation status (hide or restore to published).
   *
   * @param id - Post UUID
   * @param status - New status (`hidden` or `published`)
   * @param reason - Optional reason when hiding
   * @param options - Skip list refresh when on the detail page
   * @returns true on success
   */
  const setPostStatus = useCallback(
    async (
      id: string,
      status: 'hidden' | 'published',
      reason?: string | null,
      options?: { skipListRefresh?: boolean },
    ): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false

      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      }
      if (status === 'hidden') {
        patch.hidden_at = new Date().toISOString()
        patch.hidden_reason = reason?.trim() || null
        const { data: userData } = await supabase.auth.getUser()
        patch.hidden_by = userData.user?.id ?? null
        patch.pinned_at = null
        patch.pinned_until = null
        patch.pinned_by = null
      } else {
        patch.hidden_at = null
        patch.hidden_reason = null
        patch.hidden_by = null
      }

      const { error: updateError } = await fromLoose('te_community_posts')
        .update(patch)
        .eq('id', id)

      if (updateError) {
        console.error('useTeCommunityPosts setPostStatus error:', updateError)
        setError(t('admin.teCommunity.errorUpdateStatus'))
        return false
      }

      if (!options?.skipListRefresh) {
        await fetchPostsWith(currentPage, searchQuery, statusFilter, reportFilter)
      }
      return true
    },
    [currentPage, fetchPostsWith, reportFilter, searchQuery, statusFilter, t],
  )

  /**
   * Count posts that are currently pinned, optionally excluding one post id
   * (used when re-pinning an already-pinned post so it does not count twice).
   *
   * @param excludePostId - Post id to exclude from the count
   * @returns Active pin count, or -1 when the count could not be read
   */
  const countActivePins = useCallback(async (excludePostId?: string): Promise<number> => {
    if (!isSupabaseConfigured) return -1
    let query = fromLoose('te_community_posts')
      .select('id', { count: 'exact', head: true })
      .not('pinned_at', 'is', null)
    if (excludePostId) {
      query = query.neq('id', excludePostId)
    }
    const { count, error: countError } = await query
    if (countError) {
      console.error('useTeCommunityPosts countActivePins error:', countError)
      return -1
    }
    return count ?? 0
  }, [])

  /**
   * Pin a post for a fixed duration (or indefinitely), enforcing the
   * {@link MAX_ACTIVE_PINS} cap. Re-pinning an already-pinned post refreshes
   * its duration without consuming an extra slot.
   *
   * @param id - Post UUID
   * @param durationDays - 1, 3, 7, 30, or null for indefinite
   * @param options - Skip list refresh when on the detail page
   * @returns `'ok'`, `'maxPinsReached'`, or `'error'`
   */
  const pinPost = useCallback(
    async (
      id: string,
      durationDays: PinDurationDays,
      options?: { skipListRefresh?: boolean },
    ): Promise<PinPostResult> => {
      if (!isSupabaseConfigured || !supabase) return 'error'

      await expireOverduePins()

      const activeCount = await countActivePins(id)
      if (activeCount < 0) return 'error'
      if (activeCount >= MAX_ACTIVE_PINS) return 'maxPinsReached'

      const now = new Date()
      const pinnedUntil =
        durationDays === null ? null : new Date(now.getTime() + durationDays * 86_400_000)
      const { data: userData } = await supabase.auth.getUser()

      const { error: pinError } = await fromLoose('te_community_posts')
        .update({
          pinned_at: now.toISOString(),
          pinned_until: pinnedUntil ? pinnedUntil.toISOString() : null,
          pinned_by: userData.user?.id ?? null,
          updated_at: now.toISOString(),
        })
        .eq('id', id)

      if (pinError) {
        console.error('useTeCommunityPosts pinPost error:', pinError)
        return 'error'
      }

      if (!options?.skipListRefresh) {
        await fetchPostsWith(currentPage, searchQuery, statusFilter, reportFilter)
      }
      return 'ok'
    },
    [
      countActivePins,
      currentPage,
      expireOverduePins,
      fetchPostsWith,
      reportFilter,
      searchQuery,
      statusFilter,
    ],
  )

  /**
   * Unpin a post.
   *
   * @param id - Post UUID
   * @param options - Skip list refresh when on the detail page
   * @returns true on success
   */
  const unpinPost = useCallback(
    async (id: string, options?: { skipListRefresh?: boolean }): Promise<boolean> => {
      if (!isSupabaseConfigured) return false

      const { error: unpinError } = await fromLoose('te_community_posts')
        .update({
          pinned_at: null,
          pinned_until: null,
          pinned_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      if (unpinError) {
        console.error('useTeCommunityPosts unpinPost error:', unpinError)
        setError(t('admin.teCommunity.errorUpdateStatus'))
        return false
      }

      if (!options?.skipListRefresh) {
        await fetchPostsWith(currentPage, searchQuery, statusFilter, reportFilter)
      }
      return true
    },
    [currentPage, fetchPostsWith, reportFilter, searchQuery, statusFilter, t],
  )

  /**
   * Permanently delete a post (system admin only). Cascades media, reports,
   * comments, reactions, and related rows via FK.
   *
   * @param id - Post UUID
   * @returns true on success
   */
  const hardDeletePost = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isSupabaseConfigured) return false

      try {
        const { error: rpcError } = await rpcLoose('te_community_hard_delete_post', {
          p_post_id: id,
        })
        if (rpcError) throw rpcError
        setPosts((prev) => prev.filter((post) => post.id !== id))
        setTotalCount((prev) => Math.max(0, prev - 1))
        return true
      } catch (err) {
        console.error('useTeCommunityPosts hardDeletePost error:', err)
        setError(t('admin.teCommunity.errorHardDeletePost'))
        return false
      }
    },
    [t],
  )

  return {
    posts,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    searchQuery,
    statusFilter,
    reportFilter,
    fetchPosts,
    fetchPostById,
    setSearch,
    setStatusFilter,
    setReportFilter,
    goToPage,
    setPostStatus,
    pinPost,
    unpinPost,
    hardDeletePost,
  }
}
