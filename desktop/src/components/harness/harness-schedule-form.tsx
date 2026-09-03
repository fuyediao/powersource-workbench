/**
 * Create form for a Harness scheduled task.
 * Office templates default to the VPS so they keep firing with the laptop off.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsSegmented } from '@/components/settings/settings-segmented'
import type { HarnessScheduledJobInput } from '@/services/harness-schedule-api'
import {
  HARNESS_SCHEDULE_TEMPLATES,
  HARNESS_WEEKDAYS,
  isValidScheduleTime,
} from '@/utils/harness/schedule'
import type {
  HarnessJobRuntimeTarget,
  HarnessScheduleKind,
  HarnessWeekday,
} from '@/types/harness'

interface HarnessScheduleFormProps {
  onCreate: (input: HarnessScheduledJobInput) => Promise<void>
  onCancel: () => void
}

/**
 * Form for one new scheduled job.
 * @param props - Create and cancel handlers.
 * @returns Create form element.
 */
export function HarnessScheduleForm({ onCreate, onCancel }: HarnessScheduleFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState<HarnessScheduleKind>('weekdays')
  const [time, setTime] = useState('08:00')
  const [days, setDays] = useState<HarnessWeekday[]>(['mon'])
  const [target, setTarget] = useState<HarnessJobRuntimeTarget>('vps')
  const [isSaving, setIsSaving] = useState(false)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const canSave = Boolean(name.trim() && prompt.trim() && isValidScheduleTime(time)) && !isSaving

  /**
   * Fills the form from a built-in office template.
   * @param templateId - Template identifier.
   * @returns Nothing.
   */
  function applyTemplate(templateId: string): void {
    const template = HARNESS_SCHEDULE_TEMPLATES.find((entry) => entry.id === templateId)
    if (!template) {
      return
    }
    setName(t(`harness.scheduled.templates.${template.id}.name`))
    setPrompt(t(`harness.scheduled.templates.${template.id}.prompt`))
    setKind(template.schedule.kind)
    setTime(template.schedule.time)
    setDays(template.schedule.days.length > 0 ? template.schedule.days : ['mon'])
    setTarget(template.target)
  }

  /**
   * Toggles one weekday in a weekly schedule.
   * @param day - Weekday key.
   * @returns Nothing.
   */
  function toggleDay(day: HarnessWeekday): void {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((entry) => entry !== day) : [...prev, day],
    )
  }

  /**
   * Submits the new job.
   * @returns Nothing.
   */
  async function handleSave(): Promise<void> {
    if (!canSave) {
      return
    }
    setIsSaving(true)
    try {
      await onCreate({
        name: name.trim(),
        prompt: prompt.trim(),
        schedule: { kind, time: time.trim(), days: kind === 'weekly' ? days : [], timeZone },
        target,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const fieldClass =
    'w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand/50 dark:border-white/10 dark:bg-zinc-950/40'

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-zinc-950/10 bg-white/60 p-4 dark:border-white/10 dark:bg-zinc-950/40">
      <div className="flex flex-wrap gap-2">
        {HARNESS_SCHEDULE_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="rounded-full bg-brand/10 px-3 py-1.5 text-xs font-bold text-brand transition hover:bg-brand/15"
            onClick={() => applyTemplate(template.id)}
          >
            {t(`harness.scheduled.templates.${template.id}.name`)}
          </button>
        ))}
      </div>

      <input
        type="text"
        name="harnessScheduleName"
        className={fieldClass}
        value={name}
        placeholder={t('harness.scheduled.form.name')}
        aria-label={t('harness.scheduled.form.name')}
        onChange={(event) => setName(event.target.value)}
      />

      <textarea
        rows={3}
        name="harnessSchedulePrompt"
        className={`${fieldClass} resize-none`}
        value={prompt}
        placeholder={t('harness.scheduled.form.prompt')}
        aria-label={t('harness.scheduled.form.prompt')}
        onChange={(event) => setPrompt(event.target.value)}
      />

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">{t('harness.scheduled.form.repeat')}</p>
        <SettingsSegmented
          value={kind}
          options={[
            { value: 'daily' as const, label: t('harness.scheduled.kind.daily') },
            { value: 'weekdays' as const, label: t('harness.scheduled.kind.weekdays') },
            { value: 'weekly' as const, label: t('harness.scheduled.kind.weekly') },
          ]}
          onChange={setKind}
        />
      </div>

      {kind === 'weekly' ? (
        <div className="flex flex-wrap gap-2">
          {HARNESS_WEEKDAYS.map((day) => {
            const selected = days.includes(day)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={selected}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                  selected
                    ? 'bg-brand text-brand-fg'
                    : 'bg-zinc-950/5 text-brand hover:bg-brand/10 dark:bg-white/5'
                }`}
                onClick={() => toggleDay(day)}
              >
                {t(`harness.scheduled.weekday.${day}`)}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">{t('harness.scheduled.form.time')}</p>
        <input
          type="time"
          name="harnessScheduleTime"
          className={fieldClass}
          value={time}
          aria-label={t('harness.scheduled.form.time')}
          onChange={(event) => setTime(event.target.value)}
        />
        <p className="text-xs text-muted">
          {t('harness.scheduled.form.timeZone')}: {timeZone}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">{t('harness.scheduled.form.runsOn')}</p>
        <SettingsSegmented
          value={target}
          options={[
            { value: 'vps' as const, label: t('harness.scheduled.target.vps') },
            { value: 'thisPc' as const, label: t('harness.scheduled.target.thisPc') },
          ]}
          onChange={setTarget}
        />
        <p className="text-xs text-muted">
          {target === 'vps'
            ? t('harness.scheduled.form.vpsHint')
            : t('harness.scheduled.form.thisPcHint')}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
          disabled={!canSave}
          onClick={() => {
            void handleSave()
          }}
        >
          {t('harness.scheduled.form.save')}
        </button>
        <button
          type="button"
          className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-zinc-950/10 dark:bg-white/5 dark:hover:bg-white/10"
          onClick={onCancel}
        >
          {t('harness.scheduled.form.cancel')}
        </button>
      </div>
    </div>
  )
}
