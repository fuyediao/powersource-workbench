/**
 * After a live Harness turn, reviews memory with the user's Settings API key
 * and posts proposed MEMORY.md / USER.md. The desktop never writes those files.
 */

import { useEffect, useRef } from 'react'
import { formatTranscriptForReview, isHarnessMemoryApiConfigured } from '@/services/harness-memory-api'
import { runHarnessMemoryReview } from '@/services/harness-memory-review'
import type { HarnessItem, HarnessTurnStatus } from '@/types/harness'

/**
 * Runs one review per completed turn.
 * @param turnStatus - Current turn lifecycle.
 * @param items - Transcript rows.
 * @param isLive - Whether a real Harness host is available for memory review.
 * @param provider - Provider used by the completed turn.
 * @param modelId - Vendor model used by the completed turn.
 * @returns Nothing.
 */
export function useHarnessMemoryReview(
  turnStatus: HarnessTurnStatus,
  items: HarnessItem[],
  isLive: boolean,
  provider: string,
  modelId: string,
): void {
  const itemsRef = useRef(items)
  itemsRef.current = items
  const lastReviewedRef = useRef<string>('')

  useEffect(() => {
    if (turnStatus !== 'completed' || !isLive || !isHarnessMemoryApiConfigured()) {
      return
    }
    const transcript = formatTranscriptForReview(itemsRef.current)
    if (!transcript.trim() || transcript === lastReviewedRef.current) {
      return
    }
    lastReviewedRef.current = transcript
    void runHarnessMemoryReview(transcript, { provider, modelId }).catch((error: unknown) => {
      console.error('[harness] memory review failed:', error)
    })
  }, [turnStatus, isLive, provider, modelId])
}
