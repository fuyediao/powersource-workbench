import { useTranslation } from 'react-i18next'
import { RefreshIcon, UploadIcon } from '@/icons/AllIcons'
import type { MailSyncTask } from '@/types/mail'
import { formatMailListDate } from '@/utils/mail/format-mail-date'

interface MailOutboxListProps {
  tasks: MailSyncTask[]
  isLoading: boolean
  error: string | null
  locale: string
  onRefresh: () => void
}

/**
 * Human-readable label for a sync-task kind.
 * @param kind - Task kind from the API.
 * @param translate - i18n function.
 * @returns Localized kind label.
 */
function syncTaskKindLabel(kind: string, translate: (key: string, opts?: Record<string, string>) => string): string {
  const key = `mail.outbox.kind.${kind}`
  const label = translate(key)
  return label === key ? translate('mail.outbox.kind.other', { kind }) : label
}

/**
 * Outbox list for pending_remote / failed mail_sync_tasks.
 * @param props - Tasks and refresh.
 * @returns List pane.
 */
export function MailOutboxList({ tasks, isLoading, error, locale, onRefresh }: MailOutboxListProps) {
  const { t } = useTranslation()

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col border-r border-mail-divider bg-mail-list">
      <header className="flex items-center gap-2 border-b border-mail-divider px-3 py-2">
        <UploadIcon className="size-3.5 text-muted" aria-hidden />
        <h2 className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{t('mail.folder.outbox')}</h2>
        <button
          type="button"
          className="rounded p-1 text-muted hover:bg-mail-row-hover hover:text-ink"
          title={t('mail.outbox.refresh')}
          aria-label={t('mail.outbox.refresh')}
          onClick={onRefresh}
        >
          <RefreshIcon className="size-3.5" aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {error ? <p className="px-4 py-3 text-sm font-medium text-red-500">{error}</p> : null}
        {isLoading && tasks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{t('status.loading')}</p>
        ) : null}
        {!isLoading && tasks.length === 0 ? (
          <div className="mail-empty-in px-4 py-10 text-center text-sm text-muted">
            <p>{t('mail.outbox.empty')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-mail-divider">
            {tasks.map((task) => (
              <li key={task.id} className="px-3 py-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-brand">
                      {task.subject?.trim() || syncTaskKindLabel(task.kind, t)}
                    </p>
                    <p className="mt-0.5 truncate text-[12px] text-muted">
                      {syncTaskKindLabel(task.kind, t)}
                      {task.messageCount > 0
                        ? ` · ${t('mail.outbox.messageCount', { count: task.messageCount })}`
                        : null}
                    </p>
                    {task.errorMessage ? (
                      <p className="mt-1 line-clamp-2 text-[12px] text-red-500">{task.errorMessage}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        task.status === 'failed'
                          ? 'bg-red-500/15 text-red-500'
                          : 'bg-brand/15 text-brand'
                      }`}
                    >
                      {t(`mail.outbox.status.${task.status}`)}
                    </span>
                    <p className="mt-1 text-[11px] text-muted tabular-nums">
                      {formatMailListDate(task.updatedAt || task.createdAt, locale)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
