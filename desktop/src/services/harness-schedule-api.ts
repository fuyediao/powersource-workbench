/**
 * Harness Scheduled tasks against geocrm-api `/ai/harness/cron/*`.
 *
 * The Go proxy forwards to that user's Hermes profile on the VPS, so office
 * jobs keep firing with this laptop closed. Requests carry the signed-in
 * session; Harness never speaks MCP to reach GeoCRM.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  HarnessJobLastStatus,
  HarnessJobRuntimeTarget,
  HarnessSchedule,
  HarnessScheduledJob,
} from '@/types/harness'

/** Fields needed to create one scheduled job. */
export interface HarnessScheduledJobInput {
  name: string
  prompt: string
  schedule: HarnessSchedule
  target: HarnessJobRuntimeTarget
}

/** Wire shape returned by the Go cron proxy. */
interface ScheduledJobPayload {
  id: string
  name: string
  prompt: string
  schedule: HarnessSchedule
  target: HarnessJobRuntimeTarget
  paused: boolean
  nextRunAtMs: number | null
  lastRunAtMs: number | null
  lastStatus: HarnessJobLastStatus | null
  lastDigest?: string
}

/** Error raised by scheduled-task helpers. */
export class HarnessScheduleApiError extends Error {
  readonly status: number

  /**
   * @param message - Human-readable message.
   * @param status - HTTP status (0 = network or configuration failure).
   */
  constructor(message: string, status: number) {
    super(message)
    this.name = 'HarnessScheduleApiError'
    this.status = status
  }
}

/**
 * Reports whether the GeoCRM API origin is configured.
 * @returns True when scheduled-task calls can run.
 */
export function isHarnessScheduleApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/**
 * Authenticated JSON request to geocrm-api `/ai/harness/cron/*`.
 * @param path - Path below `/ai/harness/cron`.
 * @param method - HTTP method.
 * @param options - Optional JSON body and abort signal.
 * @returns Parsed JSON response.
 */
async function cronRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  options?: { body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new HarnessScheduleApiError('The PowerSource Workbench API is not configured.', 0)
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new HarnessScheduleApiError('Supabase is not configured.', 0)
  }
  const { data, error } = await supabase.auth.getSession()
  const accessToken = data.session?.access_token
  if (error || !accessToken) {
    throw new HarnessScheduleApiError('Sign in required.', 401)
  }

  const init: RequestInit = {
    method,
    mode: 'cors',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    signal: options?.signal,
  }
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(`${base}/ai/harness/cron${path}`, init)
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }
    throw new HarnessScheduleApiError('The PowerSource Workbench API could not be reached.', 0)
  }

  if (!response.ok) {
    let message = `Scheduled task request failed (${response.status})`
    try {
      const payload = (await response.json()) as { error?: unknown }
      if (typeof payload.error === 'string' && payload.error) {
        message = payload.error
      }
    } catch {
      // Non-JSON error body; keep the status-based message.
    }
    throw new HarnessScheduleApiError(message, response.status)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

/**
 * Lists the signed-in user's scheduled jobs.
 * @param signal - Optional abort signal.
 * @returns Scheduled jobs on that Hermes profile.
 */
export async function listScheduledJobs(signal?: AbortSignal): Promise<HarnessScheduledJob[]> {
  const payload = await cronRequest<{ jobs?: ScheduledJobPayload[] }>('/jobs', 'GET', { signal })
  return payload.jobs ?? []
}

/**
 * Creates one scheduled job on that user's Hermes profile.
 * @param input - Name, prompt, recurrence, and run target.
 * @returns The stored job.
 */
export function createScheduledJob(
  input: HarnessScheduledJobInput,
): Promise<HarnessScheduledJob> {
  return cronRequest<HarnessScheduledJob>('/jobs', 'POST', {
    body: {
      ...input,
      schedule: {
        ...input.schedule,
        timeZone: input.schedule.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  })
}

/**
 * Pauses or resumes one scheduled job.
 * @param jobId - Job identifier.
 * @param paused - Target state.
 * @returns Nothing.
 */
export async function setScheduledJobPaused(jobId: string, paused: boolean): Promise<void> {
  await cronRequest<unknown>(
    `/jobs/${encodeURIComponent(jobId)}/${paused ? 'pause' : 'resume'}`,
    'POST',
  )
}

/**
 * Requests an immediate run on the next scheduler tick.
 * @param jobId - Job identifier.
 * @returns Nothing.
 */
export async function triggerScheduledJob(jobId: string): Promise<void> {
  await cronRequest<unknown>(`/jobs/${encodeURIComponent(jobId)}/trigger`, 'POST')
}

/**
 * Deletes one scheduled job.
 * @param jobId - Job identifier.
 * @returns Nothing.
 */
export async function deleteScheduledJob(jobId: string): Promise<void> {
  await cronRequest<unknown>(`/jobs/${encodeURIComponent(jobId)}`, 'DELETE')
}

/** One due task that needs this computer. */
export interface HarnessWakeItem {
  jobId: string
  name: string
  prompt: string
  dueAtMs: number
}

/**
 * Lists scheduled tasks that are due but need this machine.
 * @returns Pending wake items for the signed-in user.
 */
export async function fetchWakeQueue(): Promise<HarnessWakeItem[]> {
  const payload = await cronRequest<{ jobs?: HarnessWakeItem[] }>('/wake', 'GET')
  return payload.jobs ?? []
}

/**
 * Clears one queued task after this machine ran it.
 * @param jobId - Job identifier.
 * @param failed - True when the local run failed.
 * @returns Nothing.
 */
export async function completeWakeItem(jobId: string, failed: boolean): Promise<void> {
  await cronRequest<unknown>(`/wake/${encodeURIComponent(jobId)}/complete`, 'POST', {
    body: { failed },
  })
}
