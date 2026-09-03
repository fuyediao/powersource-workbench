/**
 * Related mail messages for a customer (inbox / sent).
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dash,
  detailSectionCardClass,
} from '@/components/admin/customer-detail/detail-shared'
import { MailMessageDialog } from '@/components/admin/customer-detail/mail-message-dialog'
import {
  isMailApiConfigured,
  listMailMessagesByCustomer,
} from '@/services/mail-api'
import type { MailMessage } from '@/types/mail'
import { formatDisplayDateTime } from '@/utils/format-display-date'

interface MailPanelProps {
  customerId: string
}

type MailBox = 'inbox' | 'sent'

/**
 * Mail tab with inbox/sent toggle for a customer.
 * @param props - Customer id.
 * @returns Panel UI.
 */
export function MailPanel({ customerId }: MailPanelProps) {
  const { t } = useTranslation()
  const configured = isMailApiConfigured()
  const [box, setBox] = useState<MailBox>('inbox')
  const [rows, setRows] = useState<MailMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openMessageId, setOpenMessageId] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    if (!configured) {
      setRows([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      setRows(await listMailMessagesByCustomer(customerId, box))
    } catch (err) {
      console.error('[MailPanel] load:', err)
      setError(err instanceof Error ? err.message : t('admin.customers.errorLoad'))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [box, configured, customerId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <section className={detailSectionCardClass()}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-ink">
          {t('admin.customers.detail.mailSectionTitle')}
        </h3>
        {configured ? (
          <div className="inline-flex rounded-xl border border-ink/10 p-0.5">
            {(['inbox', 'sent'] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                  box === key
                    ? 'bg-brand text-brand-fg'
                    : 'text-muted hover:text-ink'
                }`}
                onClick={() => setBox(key)}
              >
                {key === 'inbox'
                  ? t('admin.customers.detail.mailBoxInbox')
                  : t('admin.customers.detail.mailBoxSent')}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mb-3 text-xs font-medium text-muted">
        {t('admin.customers.detail.mailHint')}
      </p>

      {!configured ? (
        <p className="text-sm font-medium text-amber-600">
          {t('admin.customers.detail.mailUnavailableNoWorker')}
        </p>
      ) : null}

      {error ? <p className="mb-2 text-sm font-medium text-rose-500">{error}</p> : null}

      {configured && loading ? (
        <p className="text-sm font-medium text-muted">
          {t('admin.customers.detail.mailLoading')}
        </p>
      ) : null}

      {configured && !loading && rows.length === 0 ? (
        <p className="py-6 text-center text-sm font-medium text-muted">
          {t('admin.customers.detail.mailEmpty')}
        </p>
      ) : null}

      {configured && !loading && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="w-full rounded-xl border border-ink/10 bg-canvas/60 px-3 py-2.5 text-left transition-colors hover:border-brand/30 hover:bg-canvas"
                onClick={() => setOpenMessageId(row.id)}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p
                    className={`text-sm font-bold ${row.isRead ? 'text-ink' : 'text-brand'}`}
                  >
                    {dash(row.subject)}
                  </p>
                  <p className="text-[11px] font-medium text-muted">
                    {formatDisplayDateTime(row.receivedAt)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs font-medium text-muted">
                  {row.fromName || row.fromAddress}
                </p>
                {row.snippet ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{row.snippet}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <MailMessageDialog messageId={openMessageId} onClose={() => setOpenMessageId(null)} />
    </section>
  )
}
