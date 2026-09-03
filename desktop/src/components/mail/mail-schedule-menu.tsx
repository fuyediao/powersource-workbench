import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  mailSchedulePresets,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from '@/utils/mail/schedule-presets'

interface MailScheduleMenuProps {
  onPick: (iso: string) => void
  onClose: () => void
}

/**
 * Snooze / send-later menu: presets plus a datetime picker.
 * @param props - Pick handler.
 * @returns Menu.
 */
export function MailScheduleMenu({ onPick, onClose }: MailScheduleMenuProps): ReactNode {
  const { t } = useTranslation()
  const [custom, setCustom] = useState(() => toDatetimeLocalValue(new Date(Date.now() + 3 * 60 * 60 * 1000)))
  const presets = mailSchedulePresets()

  return (
    <div className="min-w-52 overflow-hidden rounded-xl border border-mail-divider bg-mail-menu py-1 text-[13px] shadow-xl backdrop-blur-xl">
      {presets.map((row) => (
        <button
          key={row.id}
          type="button"
          className="block w-full px-3 py-1.5 text-left text-ink hover:bg-mail-row-hover"
          onClick={() => {
            onPick(row.at.toISOString())
            onClose()
          }}
        >
          {t(row.labelKey)}
        </button>
      ))}
      <div className="my-1 border-t border-mail-divider" />
      <div className="px-3 py-2">
        <p className="mb-1.5 text-[11px] font-medium text-muted">{t('mail.schedule.pickDate')}</p>
        <input
          type="datetime-local"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          className="w-full rounded-md border border-mail-divider bg-mail-input px-2 py-1 text-[12px] text-ink outline-none"
        />
        <button
          type="button"
          className="mt-2 w-full rounded-md bg-brand px-2 py-1 text-[12px] font-semibold text-brand-fg disabled:opacity-40"
          onClick={() => {
            const parsed = parseDatetimeLocalValue(custom)
            if (!parsed) {
              return
            }
            onPick(parsed.toISOString())
            onClose()
          }}
        >
          {t('mail.schedule.confirm')}
        </button>
      </div>
    </div>
  )
}
