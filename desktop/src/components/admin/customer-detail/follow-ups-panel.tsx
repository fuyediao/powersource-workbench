/**
 * Follow-ups linked to a customer.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dash,
  detailSectionCardClass,
} from '@/components/admin/customer-detail/detail-shared'
import { listFollowUpsForCustomer } from '@/services/customer-follow-ups-api'
import type { CustomerFollowUp } from '@/types/customer'
import { formatDisplayDateTime } from '@/utils/format-display-date'
import { followUpEntityPath } from '@/utils/follow-up-routes'

interface FollowUpsPanelProps {
  customerId: string
  /** Customer display name for the timeline query. */
  customerName?: string
  /**
   * Opens Admin on a CRM path (Todo List timeline).
   * @param path - Absolute Admin path.
   */
  onNavigate: (path: string) => void
}

/**
 * Builds the body text shown under the follow-up type.
 * Prefers checklist items (create form) over legacy `content`.
 * @param row - Customer follow-up.
 * @returns Display body, or empty when nothing useful.
 */
function followUpBodyText(row: CustomerFollowUp): string {
  const todos = row.todoItems
    .map((item) => item.text.trim())
    .filter((text) => text.length > 0)
  if (todos.length > 0) {
    return todos.map((text) => `• ${text}`).join('\n')
  }
  return (row.content ?? '').trim()
}

/**
 * Whether a planned follow-up is past its scheduled time.
 * @param row - Customer follow-up.
 * @returns True when planned and overdue.
 */
function isFollowUpOverdue(row: CustomerFollowUp): boolean {
  if (row.status !== 'planned') {
    return false
  }
  const scheduledMs = new Date(row.scheduledAt).getTime()
  return Number.isFinite(scheduledMs) && scheduledMs < Date.now()
}

/**
 * Follow-up plan tab for a customer.
 * @param props - Customer id, name, and Admin navigation.
 * @returns Panel UI.
 */
export function FollowUpsPanel({
  customerId,
  customerName,
  onNavigate,
}: FollowUpsPanelProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<CustomerFollowUp[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setRows(await listFollowUpsForCustomer(customerId))
    } catch (err) {
      console.error('[FollowUpsPanel] load:', err)
      setError(t('admin.customers.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [customerId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Localized follow-up type label.
   * @param type - Stored type slug.
   * @returns Display label.
   */
  function typeLabel(type: string): string {
    const key = `admin.followUps.type.${type}`
    const translated = t(key)
    return translated === key ? type : translated
  }

  /**
   * Localized follow-up status label.
   * @param status - Stored status slug.
   * @returns Display label.
   */
  function statusLabel(status: string): string {
    const key = `admin.followUps.status.${status}`
    const translated = t(key)
    return translated === key ? status : translated
  }

  /**
   * Opens the customer Todo List timeline for this row.
   * @returns Nothing.
   */
  function openTimeline(): void {
    onNavigate(followUpEntityPath('customer', customerId, customerName))
  }

  return (
    <section className={detailSectionCardClass()}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-ink">
          {t('admin.customers.detail.tabFollowUpPlan')}
        </h3>
        <button
          type="button"
          className="text-xs font-semibold text-brand hover:underline"
          onClick={openTimeline}
        >
          {t('admin.dashboard.viewMore')}
        </button>
      </div>

      {error ? <p className="mb-2 text-sm font-medium text-rose-500">{error}</p> : null}
      {loading ? (
        <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="py-8 text-center text-sm font-medium text-muted">
          {t('admin.followUpTimeline.noFollowUps')}
        </p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => {
            const body = followUpBodyText(row)
            const overdue = isFollowUpOverdue(row)
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2.5 text-left shadow-sm transition-colors dark:bg-zinc-900/90 ${
                    overdue
                      ? 'border-amber-500/50 bg-white/90 hover:border-amber-500/70'
                      : 'border-ink/10 bg-white/90 hover:border-brand/40'
                  }`}
                  onClick={openTimeline}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p
                      className={`text-sm font-bold ${
                        overdue
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-ink'
                      }`}
                    >
                      {formatDisplayDateTime(row.scheduledAt)}
                    </p>
                    {overdue ? (
                      <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-amber-700 uppercase dark:bg-amber-400/20 dark:text-amber-300">
                        {t('admin.followUpTimeline.overdue')}
                      </span>
                    ) : (
                      <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-brand">
                        {statusLabel(row.status)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-brand">
                    {typeLabel(row.type)}
                  </p>
                  <p className="mt-1 text-xs font-medium whitespace-pre-wrap text-ink/80">
                    {body || dash(null)}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
