/**
 * Scheduled-task state for the Harness Scheduled view.
 *
 * Jobs live on the VPS Hermes profile for the signed-in user. When the Workbench
 * API is not configured this falls back to in-memory sample rows so the view
 * can still be exercised locally.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createScheduledJob,
  deleteScheduledJob,
  isHarnessScheduleApiConfigured,
  listScheduledJobs,
  setScheduledJobPaused,
  triggerScheduledJob,
  type HarnessScheduledJobInput,
} from '@/services/harness-schedule-api'
import { HARNESS_SCHEDULE_TEMPLATES, nextRunAtMs } from '@/utils/harness/schedule'
import type { HarnessScheduledJob } from '@/types/harness'

export interface HarnessScheduleState {
  jobs: HarnessScheduledJob[]
  isLoading: boolean
  /** True when jobs come from the VPS instead of local samples. */
  isLive: boolean
  error: string | null
  create: (input: HarnessScheduledJobInput) => Promise<void>
  togglePause: (jobId: string) => Promise<void>
  runNow: (jobId: string) => Promise<void>
  remove: (jobId: string) => Promise<void>
}

/**
 * Builds the sample rows shown before the cron proxy is reachable.
 * @param t - Translator for template names and prompts.
 * @returns Sample scheduled jobs.
 */
function buildSampleJobs(t: (key: string) => string): HarnessScheduledJob[] {
  return HARNESS_SCHEDULE_TEMPLATES.map((template) => ({
    id: `sample-${template.id}`,
    name: t(`harness.scheduled.templates.${template.id}.name`),
    prompt: t(`harness.scheduled.templates.${template.id}.prompt`),
    schedule: template.schedule,
    target: template.target,
    paused: false,
    nextRunAtMs: nextRunAtMs(template.schedule),
    lastRunAtMs: null,
    lastStatus: null,
  }))
}

/**
 * Loads and mutates the signed-in user's scheduled jobs.
 * @returns Scheduled state and actions.
 */
export function useHarnessSchedule(): HarnessScheduleState {
  const { t } = useTranslation()
  const [jobs, setJobs] = useState<HarnessScheduledJob[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLive, setIsLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!isHarnessScheduleApiConfigured()) {
      setJobs(buildSampleJobs(t))
      setIsLive(false)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const rows = await listScheduledJobs()
      setJobs(rows)
      setIsLive(true)
      setError(null)
    } catch (err) {
      setJobs(buildSampleJobs(t))
      setIsLive(false)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (input: HarnessScheduledJobInput): Promise<void> => {
      if (!isLive) {
        setJobs((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            name: input.name,
            prompt: input.prompt,
            schedule: input.schedule,
            target: input.target,
            paused: false,
            nextRunAtMs: nextRunAtMs(input.schedule),
            lastRunAtMs: null,
            lastStatus: null,
          },
        ])
        return
      }
      const created = await createScheduledJob(input)
      setJobs((prev) => [...prev, created])
    },
    [isLive],
  )

  const togglePause = useCallback(
    async (jobId: string): Promise<void> => {
      const target = jobs.find((job) => job.id === jobId)
      if (!target) {
        return
      }
      const paused = !target.paused
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? { ...job, paused, nextRunAtMs: paused ? null : nextRunAtMs(job.schedule) }
            : job,
        ),
      )
      if (isLive) {
        await setScheduledJobPaused(jobId, paused)
      }
    },
    [isLive, jobs],
  )

  const runNow = useCallback(
    async (jobId: string): Promise<void> => {
      if (isLive) {
        await triggerScheduledJob(jobId)
        await refresh()
        return
      }
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? {
                ...job,
                lastRunAtMs: Date.now(),
                lastStatus: job.target === 'thisPc' ? 'waitingForThisPc' : 'ok',
              }
            : job,
        ),
      )
    },
    [isLive, refresh],
  )

  const remove = useCallback(
    async (jobId: string): Promise<void> => {
      setJobs((prev) => prev.filter((job) => job.id !== jobId))
      if (isLive) {
        await deleteScheduledJob(jobId)
      }
    },
    [isLive],
  )

  return useMemo(
    () => ({ jobs, isLoading, isLive, error, create, togglePause, runNow, remove }),
    [jobs, isLoading, isLive, error, create, togglePause, runNow, remove],
  )
}
