import { useCallback, useState } from 'react'
import { generateTeAiReview, type TeAiReviewResponse } from '@/services/te-workflow-api'
import { useInsightAiModel } from '@/hooks/use-insight-ai-model'

const SESSION_KEY_MODEL = 'te_ai_review_model'

/**
 * Hook for generating a T&E application AI review suggestion via the
 * protected workbench-api backend. The backend calls the provider with the
 * admin's own API key and persists the trilingual result; this hook
 * tracks model selection (vendor + specific catalog model), BYOK gating,
 * and loading/error state.
 *
 * @returns Catalog, selection, key gating, and a generate action
 */
export function useTeAiReview() {
  const { models, selection, selectedReady, isConfigured, selectModel } = useInsightAiModel({
    sessionKey: SESSION_KEY_MODEL,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  /** Whether at least one catalog model has a key configured and is allowlisted. */
  const hasAnyApiKey = models.some((model) => isConfigured(model.provider))

  /**
   * Generates (and persists, server-side) a trilingual AI review suggestion
   * for one T&E submission using the selected vendor + catalog model.
   *
   * @param submissionId - T&E submission UUID
   * @returns The generated review, or null when no API key is configured or the request failed
   */
  const generate = useCallback(
    async (submissionId: string): Promise<TeAiReviewResponse | null> => {
      if (!selection || !selectedReady) {
        setError('no_key')
        return null
      }

      setIsLoading(true)
      setError('')
      try {
        return await generateTeAiReview(submissionId, selection.provider, selection.modelId)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [selection, selectedReady],
  )

  return {
    models,
    selection,
    selectedReady,
    isConfigured,
    isLoading,
    error,
    hasAnyApiKey,
    selectModel,
    generate,
  }
}
