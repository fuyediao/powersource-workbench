import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fromLoose, rpcLoose } from '@/lib/supabase-loose'
import {
  buildTeCommunityCommentTree,
  mapTeCommunityCommentFromRow,
  TE_COMMUNITY_COMMENT_SELECT,
  type TeCommunityComment,
} from '@/services/te-community-comments-repository'

/**
 * Collect comment ids for a subtree (root + nested replies).
 *
 * @param comment - Subtree root
 * @returns Flat id list
 */
function collectCommentSubtreeIds(comment: TeCommunityComment): string[] {
  const ids = [comment.id]
  for (const reply of comment.replies) {
    ids.push(...collectCommentSubtreeIds(reply))
  }
  return ids
}

/**
 * Remove a comment subtree from an in-memory forest by root id.
 *
 * @param forest - Comment trees
 * @param rootId - Subtree root to drop
 * @returns Updated forest
 */
function removeCommentSubtree(
  forest: TeCommunityComment[],
  rootId: string,
): TeCommunityComment[] {
  const next: TeCommunityComment[] = []
  for (const node of forest) {
    if (node.id === rootId) continue
    next.push({
      ...node,
      replies: removeCommentSubtree(node.replies, rootId),
    })
  }
  return next
}

/**
 * Drop any remaining nodes whose ids were deleted.
 *
 * @param nodes - Comment forest
 * @param removedIds - Ids removed by the RPC
 * @returns Pruned forest
 */
function pruneRemovedComments(
  nodes: TeCommunityComment[],
  removedIds: Set<string>,
): TeCommunityComment[] {
  return nodes
    .filter((node) => !removedIds.has(node.id))
    .map((node) => ({
      ...node,
      replies: pruneRemovedComments(node.replies, removedIds),
    }))
}

/**
 * Load nested comments for a community post detail page.
 * Reads use the authenticated Supabase client (RLS SELECT for authenticated).
 * Permanent delete requires system admin (`te_community_hard_delete_comment` RPC).
 *
 * @returns Comment tree state and actions
 */
export function useTeCommunityComments() {
  const { t } = useTranslation()
  const [comments, setComments] = useState<TeCommunityComment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Fetch comments for a post (including member soft-deletes) and nest replies.
   * Soft-deleted rows (`status=deleted`) stay visible in CRM as "User deleted";
   * hard-deleted rows are gone from the table and never appear.
   *
   * @param postId - Post UUID
   */
  const fetchComments = useCallback(
    async (postId: string): Promise<void> => {
      if (!isSupabaseConfigured) {
        setError(t('admin.teCommunity.errorNotConfigured'))
        setComments([])
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await fromLoose('te_community_comments')
          .select(TE_COMMUNITY_COMMENT_SELECT)
          .eq('post_id', postId)
          .order('created_at', { ascending: true })

        if (fetchError) throw fetchError
        const flat = (data ?? []).map((row) => mapTeCommunityCommentFromRow(row))
        setComments(buildTeCommunityCommentTree(flat))
      } catch (err) {
        console.error('useTeCommunityComments fetchComments error:', err)
        setError(t('admin.teCommunity.errorLoadComments'))
        setComments([])
      } finally {
        setIsLoading(false)
      }
    },
    [t],
  )

  /**
   * Permanently delete a comment and its nested replies (system admin only).
   *
   * @param comment - Subtree root to remove
   * @returns true on success
   */
  const hardDeleteCommentTree = useCallback(
    async (comment: TeCommunityComment): Promise<boolean> => {
      if (!isSupabaseConfigured) return false

      setIsDeleting(true)
      setError(null)
      try {
        const { error: rpcError } = await rpcLoose('te_community_hard_delete_comment', {
          p_comment_id: comment.id,
        })
        if (rpcError) throw rpcError

        const removedIds = new Set(collectCommentSubtreeIds(comment))
        setComments((prev) =>
          pruneRemovedComments(removeCommentSubtree(prev, comment.id), removedIds),
        )
        return true
      } catch (err) {
        console.error('useTeCommunityComments hardDeleteCommentTree error:', err)
        setError(t('admin.teCommunity.errorDeleteComment'))
        return false
      } finally {
        setIsDeleting(false)
      }
    },
    [t],
  )

  /** Clear the in-memory comment tree (e.g. leaving detail). */
  const clearComments = useCallback((): void => {
    setComments([])
    setError(null)
  }, [])

  return {
    comments,
    isLoading,
    isDeleting,
    error,
    fetchComments,
    hardDeleteCommentTree,
    clearComments,
  }
}
