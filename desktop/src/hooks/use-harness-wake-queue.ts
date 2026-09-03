/**
 * Polls the VPS for scheduled tasks that need this computer.
 *
 * Server-side jobs already ran on the VPS. Jobs marked "this computer" wait in
 * a queue until Harness is open; this hook starts them as ordinary local turns
 * so the usual approval bar still applies. Wake items are marked complete only
 * after the local Codex turn finishes (the host does that for live turns).
 */

import { useEffect, useRef } from 'react'
import {
  completeWakeItem,
  fetchWakeQueue,
  isHarnessScheduleApiConfigured,
} from '@/services/harness-schedule-api'
import type { HarnessTurnStatus } from '@/types/harness'

/** How often an open Harness tab checks for due local tasks. */
const POLL_INTERVAL_MS = 60_000

/**
 * Runs due local scheduled tasks while the Harness tab is open.
 * @param enabled - False while a turn is already running or the host is idle.
 * @param submit - Starts one workflow turn with the job prompt and optional wake id.
 * @param turnStatus - Current turn lifecycle used to coordinate queued wake jobs.
 * @param isLive - True when the local Codex host completes wake items itself.
 * @returns Nothing.
 */
export function useHarnessWakeQueue(
  enabled: boolean,
  submit: (text: string, extras?: { wakeJobId?: string }) => void,
  turnStatus: HarnessTurnStatus,
  isLive: boolean,
): void {
  const submitRef = useRef(submit)
  submitRef.current = submit
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const isLiveRef = useRef(isLive)
  isLiveRef.current = isLive
  const pendingJobIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingJobIdRef.current) {
      return
    }
    if (turnStatus === 'running' || turnStatus === 'idle') {
      return
    }
    const jobId = pendingJobIdRef.current
    pendingJobIdRef.current = null
    if (!isLiveRef.current) {
      void completeWakeItem(jobId, turnStatus !== 'completed').catch(() => undefined)
    }
  }, [turnStatus])

  useEffect(() => {
    if (!isHarnessScheduleApiConfigured()) {
      return
    }
    let cancelled = false

    /**
     * Pulls the queue once and starts at most one task.
     * @returns Nothing.
     */
    async function drain(): Promise<void> {
      if (cancelled || !enabledRef.current || pendingJobIdRef.current) {
        return
      }
      try {
        const pending = await fetchWakeQueue()
        const next = pending[0]
        if (cancelled || !next || !enabledRef.current || pendingJobIdRef.current) {
          return
        }
        pendingJobIdRef.current = next.jobId
        if (isLiveRef.current) {
          submitRef.current(next.prompt, { wakeJobId: next.jobId })
        } else {
          submitRef.current(next.prompt)
        }
      } catch {
        // Offline or unauthenticated; the queue stays on the server.
        pendingJobIdRef.current = null
      }
    }

    void drain()
    const timer = window.setInterval(() => {
      void drain()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])
}
