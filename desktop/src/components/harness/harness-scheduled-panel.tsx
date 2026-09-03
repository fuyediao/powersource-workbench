/**
 * Harness Scheduled view: list, search, and create recurring tasks.
 *
 * Office jobs run on the VPS with this machine closed. Jobs that need this
 * PC's disk wait for Harness to come online, and say so in the list.
 */

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ClockIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import { HarnessScheduleForm } from '@/components/harness/harness-schedule-form'
import type { HarnessScheduleState } from '@/hooks/use-harness-schedule'
import type { HarnessSchedule, HarnessScheduledJob } from '@/types/harness'

interface HarnessScheduledPanelProps {
  state: HarnessScheduleState
  onContinue: (job: HarnessScheduledJob) => void
}

/**
 * Human label for one recurrence.
 * @param schedule - Job recurrence.
 * @param t - Translator.
 * @returns Text such as `Weekdays at 08:00`.
 */
function scheduleLabel(schedule: HarnessSchedule, t: (key: string) => string): string {
  if (schedule.kind === 'daily') {
    return `${t('harness.scheduled.kind.daily')} · ${schedule.time}`
  }
  if (schedule.kind === 'weekdays') {
    return `${t('harness.scheduled.kind.weekdays')} · ${schedule.time}`
  }
  const days = schedule.days.map((day) => t(`harness.scheduled.weekday.${day}`)).join(', ')
  return `${days || t('harness.scheduled.kind.weekly')} · ${schedule.time}`
}

/**
 * Formats an epoch timestamp for the list, or a dash when absent.
 * @param value - Epoch milliseconds or null.
 * @returns Localized short date-time.
 */
function formatTimestamp(value: number | null): string {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * One scheduled job row with its lifecycle controls.
 * @param props - Job plus action handlers.
 * @returns List row element.
 */
function ScheduledRow({
  job,
  onTogglePause,
  onRunNow,
  onRemove,
  onContinue,
}: {
  job: HarnessScheduledJob
  onTogglePause: () => void
  onRunNow: () => void
  onRemove: () => void
  onContinue: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/40">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
        <ClockIcon className="size-4" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-bold text-ink">{job.name}</p>
          <span className="rounded-full bg-zinc-950/5 px-2 py-0.5 text-[11px] font-semibold text-muted dark:bg-white/5">
            {t(`harness.scheduled.target.${job.target}`)}
          </span>
          {job.paused ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              {t('harness.scheduled.paused')}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs font-medium text-muted">{job.prompt}</p>
        <p className="mt-1 text-xs text-muted">
          {scheduleLabel(job.schedule, t)}
          {' · '}
          {t('harness.scheduled.nextRun')}: {formatTimestamp(job.nextRunAtMs)}
          {job.schedule.timeZone ? ` · ${job.schedule.timeZone}` : ''}
        </p>
        {job.lastStatus ? (
          <p className="mt-0.5 text-xs font-semibold text-muted">
            {t(`harness.scheduled.lastStatus.${job.lastStatus}`)} ·{' '}
            {formatTimestamp(job.lastRunAtMs)}
          </p>
        ) : null}
        {job.lastDigest ? (
          <details className="mt-2 rounded-xl bg-zinc-950/5 px-3 py-2 text-xs text-ink dark:bg-white/5">
            <summary className="cursor-pointer font-bold text-brand">
              {t('harness.scheduled.result')}
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-muted">{job.lastDigest}</p>
            <button
              type="button"
              className="mt-2 rounded-lg bg-brand/10 px-2.5 py-1.5 font-bold text-brand hover:bg-brand/15"
              onClick={onContinue}
            >
              {t('harness.scheduled.continue')}
            </button>
          </details>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-brand transition hover:bg-brand/10"
          title={t('harness.scheduled.runNow')}
          aria-label={t('harness.scheduled.runNow')}
          onClick={onRunNow}
        >
          <PlayIcon className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-brand transition hover:bg-brand/10"
          title={job.paused ? t('harness.scheduled.resume') : t('harness.scheduled.pause')}
          aria-label={job.paused ? t('harness.scheduled.resume') : t('harness.scheduled.pause')}
          onClick={onTogglePause}
        >
          {job.paused ? (
            <PlayIcon className="size-4" aria-hidden />
          ) : (
            <PauseIcon className="size-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-red-500/10 hover:text-red-500"
          title={t('harness.scheduled.delete')}
          aria-label={t('harness.scheduled.delete')}
          onClick={onRemove}
        >
          <TrashIcon className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

/**
 * Scheduled tasks workspace for Harness.
 * @param props - Schedule state from `useHarnessSchedule`.
 * @returns Scheduled view element.
 */
export function HarnessScheduledPanel({ state, onContinue }: HarnessScheduledPanelProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const visibleJobs = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return state.jobs
    }
    return state.jobs.filter(
      (job) =>
        job.name.toLowerCase().includes(term) || job.prompt.toLowerCase().includes(term),
    )
  }, [query, state.jobs])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-brand">
              {t('harness.scheduled.title')}
            </h1>
            <p className="mt-1 text-sm font-medium text-muted">
              {t('harness.scheduled.subtitle')}
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg shadow-lg shadow-brand/25 transition hover:opacity-90"
            onClick={() => setIsCreating((prev) => !prev)}
          >
            <PlusIcon className="size-4" aria-hidden />
            {t('harness.scheduled.create')}
          </button>
        </div>

        {!state.isLive ? (
          <p className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-xs font-medium text-muted dark:border-white/10 dark:bg-white/5">
            {t('harness.scheduled.sampleNotice')}
          </p>
        ) : null}

        {isCreating ? (
          <HarnessScheduleForm
            onCancel={() => setIsCreating(false)}
            onCreate={async (input) => {
              await state.create(input)
              setIsCreating(false)
            }}
          />
        ) : null}

        <label className="relative block">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            name="harnessScheduleSearch"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('harness.scheduled.searchPlaceholder')}
            aria-label={t('harness.scheduled.searchPlaceholder')}
            className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-brand/50 dark:border-white/10 dark:bg-zinc-950/40"
          />
        </label>

        {state.isLoading ? (
          <p className="py-8 text-center text-sm text-muted">{t('status.loading')}</p>
        ) : visibleJobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t('harness.scheduled.empty')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleJobs.map((job) => (
              <ScheduledRow
                key={job.id}
                job={job}
                onTogglePause={() => void state.togglePause(job.id)}
                onRunNow={() => void state.runNow(job.id)}
                onRemove={() => void state.remove(job.id)}
                onContinue={() => onContinue(job)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
