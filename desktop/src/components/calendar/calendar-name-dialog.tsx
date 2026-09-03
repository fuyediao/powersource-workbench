/**
 * Dialog to name a new calendar (with color) or rename an existing one.
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarColorSwatches } from '@/components/calendar/calendar-color-swatches'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { CALENDAR_COLOR_PALETTE } from '@/services/calendar-calendars-api'

export interface CalendarNameDialogProps {
  open: boolean
  saving: boolean
  /** Create picks name + color; rename edits the display name only. */
  mode?: 'create' | 'rename'
  /** Prefill when renaming (or reopening create with defaults). */
  initialName?: string
  initialColor?: string
  onClose: () => void
  onExited?: () => void
  onSubmit: (payload: { name: string; color: string }) => void
}

/**
 * Modal prompting for a calendar display name (and color when creating).
 * @param props - Dialog state and handlers.
 * @returns Dialog content, or null when unmounted.
 */
export function CalendarNameDialog({
  open,
  saving,
  mode = 'create',
  initialName,
  initialColor,
  onClose,
  onExited,
  onSubmit,
}: CalendarNameDialogProps) {
  const { t } = useTranslation()
  const { mounted, leaving } = useDialogPresence(open)
  const hadMountedRef = useRef(false)
  const [name, setName] = useState(initialName ?? t('calendar.calendars.newName'))
  const [color, setColor] = useState<string>(initialColor ?? CALENDAR_COLOR_PALETTE[0])
  const isRename = mode === 'rename'

  useEffect(() => {
    if (mounted) {
      hadMountedRef.current = true
      return
    }
    if (hadMountedRef.current) {
      hadMountedRef.current = false
      onExited?.()
    }
  }, [mounted, onExited])

  useEffect(() => {
    if (!open) {
      return
    }
    setName(initialName ?? t('calendar.calendars.newName'))
    setColor(initialColor ?? CALENDAR_COLOR_PALETTE[0])
  }, [open, initialName, initialColor, t])

  if (!mounted) {
    return null
  }

  /**
   * Submits a trimmed calendar name (and color when creating).
   * @returns Nothing.
   */
  function handleSubmit(): void {
    const trimmed = name.trim()
    if (!trimmed) {
      return
    }
    onSubmit({ name: trimmed, color })
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('actions.close')}
        className={`absolute inset-0 bg-zinc-950/40 ${
          leaving ? 'dialog-backdrop-out' : 'dialog-backdrop-in'
        }`}
        disabled={leaving || saving}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="calendar-name-dialog-title"
        className={`relative w-full max-w-sm rounded-3xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 ${
          leaving ? 'dialog-panel-out' : 'dialog-panel-in'
        }`}
      >
        <h2 id="calendar-name-dialog-title" className="text-lg font-extrabold text-ink">
          {isRename ? t('calendar.calendars.rename') : t('calendar.calendars.add')}
        </h2>
        <label className="mt-4 flex flex-col gap-1 text-xs font-semibold text-muted">
          {t('calendar.calendars.promptName')}
          <input
            className="rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand"
            value={name}
            disabled={saving}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleSubmit()
              }
            }}
          />
        </label>
        {isRename ? null : (
          <fieldset className="mt-4 flex flex-col gap-2">
            <legend className="text-xs font-semibold text-muted">
              {t('calendar.calendars.color')}
            </legend>
            <CalendarColorSwatches
              value={color}
              size="md"
              disabled={saving}
              onChange={setColor}
            />
          </fieldset>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs font-bold text-muted transition hover:bg-ink/5"
            disabled={saving}
            onClick={onClose}
          >
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            className="rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg transition hover:opacity-90 disabled:opacity-60"
            disabled={saving || !name.trim()}
            onClick={handleSubmit}
          >
            {t('actions.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
