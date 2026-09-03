/**
 * Customer visit logs list with navigation to visit-log detail / create
 * (Vue CustomerDetailView + KOL visits-panel parity).
 */

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dash,
  detailSectionCardClass,
} from '@/components/admin/customer-detail/detail-shared'
import { useCustomerTabCache } from '@/hooks/use-customer-tab-cache'
import { PlusIcon } from '@/icons/AllIcons'
import { listCustomerVisitLogs } from '@/services/customer-visit-logs-api'
import { customerDetailPath } from '@/utils/customer-routes'
import { formatDisplayDate } from '@/utils/format-display-date'

interface VisitLogsPanelProps {
  customerId: string
  canCreate: boolean
  onNavigate: (path: string) => void
}

/**
 * Truncates content for list snippets.
 * @param content - Full content.
 * @param max - Max characters.
 * @returns Snippet text.
 */
function snippet(content: string | null | undefined, max = 160): string {
  const text = content?.trim() ?? ''
  if (!text) {
    return '—'
  }
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max).trimEnd()}…`
}

/**
 * Visit logs tab for a customer.
 * @param props - Customer id, create permission, and navigation.
 * @returns Panel UI.
 */
export function VisitLogsPanel({
  customerId,
  canCreate,
  onNavigate,
}: VisitLogsPanelProps) {
  const { t } = useTranslation()

  const fetchLogs = useCallback(
    () => listCustomerVisitLogs(customerId),
    [customerId],
  )

  const { data, loading, error } = useCustomerTabCache(
    customerId,
    'visitLogs',
    fetchLogs,
    t('admin.customers.errorLoad'),
  )
  const rows = data ?? []
  const returnTo = encodeURIComponent(customerDetailPath(customerId))

  /**
   * Opens visit-log detail for one row.
   * @param visitLogId - Visit log uuid.
   * @returns Nothing.
   */
  function openDetail(visitLogId: string): void {
    onNavigate(`/admin/visit-log/${visitLogId}?returnTo=${returnTo}`)
  }

  /**
   * Opens the create form pre-linked to this customer.
   * @returns Nothing.
   */
  function openCreate(): void {
    onNavigate(
      `/admin/visit-log/new?customerId=${customerId}&returnTo=${returnTo}`,
    )
  }

  return (
    <section className={detailSectionCardClass()}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-ink">
          {t('admin.customers.detail.visitLogPanel.title')}
          <span className="ml-1.5 text-xs font-normal text-muted">
            ({rows.length})
          </span>
        </h3>
        {canCreate ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            onClick={openCreate}
          >
            <PlusIcon className="size-3.5" aria-hidden />
            {t('admin.customers.detail.activity.addVisitLog')}
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-sm font-medium text-rose-500">{error}</p> : null}
      {loading ? (
        <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="py-8 text-center text-sm font-medium text-muted">
          {t('admin.customers.detail.visitLogPanel.empty')}
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="group w-full rounded-xl border border-ink/10 bg-canvas/60 px-3 py-2.5 text-left transition-colors hover:border-brand/40 hover:bg-brand/5"
                onClick={() => openDetail(row.id)}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-ink group-hover:text-brand">
                    {dash(
                      row.subject ||
                        t('admin.customers.detail.activity.visitLogNoTitle'),
                    )}
                  </p>
                  <p className="text-[11px] font-medium text-muted">
                    {formatDisplayDate(row.visitDate)}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs font-medium text-muted">
                  {snippet(row.content)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
