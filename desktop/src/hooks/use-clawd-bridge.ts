import { useEffect, useRef } from 'react'
import {
  mapAskClawdActivity,
  reportAskClawdActivity,
} from '@/utils/clawd-bridge/map-activity'

/** Inputs that drive Ask / Ask AI Clawd reports. */
export type UseClawdBridgeReporterInput = {
  sessionId: string
  loading: boolean
  thinkMode: boolean
  error: boolean
}

/**
 * Posts Ask lifecycle events to standalone Clawd while this surface is mounted.
 * @param input - Session id and UI flags.
 * @returns Nothing.
 */
export function useClawdBridgeReporter(input: UseClawdBridgeReporterInput): void {
  const previousLoading = useRef(false)

  useEffect(() => {
    reportAskClawdActivity(input.sessionId, { event: 'SessionStart', state: 'idle' })
    return () => {
      reportAskClawdActivity(input.sessionId, { event: 'SessionEnd', state: 'sleeping' })
    }
  }, [input.sessionId])

  useEffect(() => {
    const activity = mapAskClawdActivity(
      {
        loading: input.loading,
        thinkMode: input.thinkMode,
        error: input.error,
      },
      previousLoading.current,
    )
    previousLoading.current = input.loading
    if (activity) {
      reportAskClawdActivity(input.sessionId, activity)
    }
  }, [input.error, input.loading, input.sessionId, input.thinkMode])
}
