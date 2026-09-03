/**
 * Customer activity log timeline.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { listCustomerActivityLogs } from '@/services/customer-activity-logs-api'
import type { CustomerActivityLog } from '@/types/customer'
import { formatDisplayDateTime } from '@/utils/format-display-date'

interface ActivityPanelProps {
  customerId: string
}

const ENTITY_I18N: Record<CustomerActivityLog['entityType'], string> = {
  customers: 'customers',
  customer_contacts: 'customerContacts',
  customer_addresses: 'customerAddresses',
  customer_work_items: 'customerWorkItems',
  customer_visit_log: 'customerVisitLog',
  orders: 'orders',
}

/**
 * Activity tab listing audit logs for a customer.
 * @param props - Customer id.
 * @returns Panel UI.
 */
export function ActivityPanel({ customerId }: ActivityPanelProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<CustomerActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listCustomerActivityLogs(customerId))
    } catch (err) {
      console.error('[ActivityPanel] load:', err)
      setError(t('admin.customers.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [customerId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Builds a human-readable summary for a log row.
   * @param log - Activity row.
   * @returns Summary text.
   */
  function summaryText(log: CustomerActivityLog): string {
    if (log.summary.trim()) {
      return log.summary
    }
    const entityKey = ENTITY_I18N[log.entityType] ?? log.entityType
    const entity = t(`admin.customers.detail.activity.entity.${entityKey}`, {
      defaultValue: log.entityType,
    })
    const changeCount = Object.keys(log.changedFields ?? {}).length
    return t(`admin.customers.detail.activity.action.${log.action}`, {
      entity,
      count: changeCount,
      defaultValue: log.action,
    })
  }

  return (
    <section className={detailSectionCardClass()}>
      <h3 className="mb-3 text-sm font-extrabold text-ink">
        {t('admin.customers.detail.tabActivity')}
      </h3>

      {error ? <p className="mb-2 text-sm font-medium text-rose-500">{error}</p> : null}
      {loading ? (
        <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="py-8 text-center text-sm font-medium text-muted">
          {t('admin.customers.detail.activity.empty')}
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="relative space-y-5 pl-6 before:absolute before:bottom-2 before:left-2 before:top-2 before:w-px before:bg-ink/10">
          {rows.map((log) => (
            <div key={log.id} className="relative">
              <div className="absolute -left-6 top-0.5 size-3 rounded-full border border-brand/70 bg-brand/50" />
              <p className="mb-0.5 text-[11px] font-medium text-muted">
                {formatDisplayDateTime(log.createdAt)} ·{' '}
                {log.actorEmail || 'system'}
              </p>
              <p className="text-sm font-medium text-ink">{summaryText(log)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
