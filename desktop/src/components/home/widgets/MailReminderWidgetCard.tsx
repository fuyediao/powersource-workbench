/**
 * Home aside: mail unread reminder (Board dashboard parity).
 */

import { useTranslation } from 'react-i18next'
import { MailIcon } from '@/icons/AllIcons'
import { useCrmAsideWidgets } from '@/hooks/use-crm-aside-widgets'

interface MailReminderWidgetCardProps {
  /** Opens the Mail Function tab. */
  onOpenMail: () => void
}

/**
 * Compact mail unread widget for the home aside.
 * @param props - Mail navigation handoff.
 * @returns Mail reminder card.
 */
export function MailReminderWidgetCard({ onOpenMail }: MailReminderWidgetCardProps) {
  const { t } = useTranslation()
  const {
    mailUnreadTotal,
    mailUnreadLoaded,
    mailUnreadFetchFailed,
  } = useCrmAsideWidgets()

  return (
    <section className="glass-panel overflow-hidden rounded-3xl">
      <div className="p-5">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-brand">
            {t('home.aside.mailReminder')}
          </h2>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <MailIcon className="size-5" aria-hidden />
          </span>
        </header>

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl border border-ink/10 bg-white/60 p-3 text-left transition-colors hover:border-brand/35 dark:bg-zinc-900/50"
          onClick={onOpenMail}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
            <MailIcon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium text-ink">
            {t('home.aside.mailUnreadDescription')}
          </span>
          {mailUnreadLoaded && mailUnreadTotal > 0 ? (
            <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold tabular-nums text-brand">
              {mailUnreadTotal}
            </span>
          ) : null}
          {mailUnreadLoaded && mailUnreadTotal === 0 && !mailUnreadFetchFailed ? (
            <span className="shrink-0 text-xs font-medium tabular-nums text-muted">0</span>
          ) : null}
          {!mailUnreadLoaded ? (
            <span className="h-5 w-8 shrink-0 animate-pulse rounded bg-ink/10" aria-hidden />
          ) : null}
        </button>
        {mailUnreadFetchFailed ? (
          <p className="mt-2 px-1 text-[11px] font-medium text-muted">
            {t('home.aside.mailUnreadUnavailable')}
          </p>
        ) : null}
      </div>
    </section>
  )
}
