/**
 * KOL visits tab: visit-log list plus add / open navigation.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { PlusIcon } from '@/icons/AllIcons'
import { listKolVisitLogs } from '@/services/kols-api'
import type { CustomerVisitLog } from '@/types/customer'
import { formatDisplayDate } from '@/utils/format-display-date'
import { kolDetailPath } from '@/utils/kol-routes'

interface VisitsPanelProps {
  mode: 'create' | 'detail'
  kolId: string | null
  onNavigate: (path: string) => void
}

/**
 * Visit records linked to this KOL.
 * @param props - Mode, KOL id, and navigation.
 * @returns Panel UI.
 */
export function VisitsPanel({ mode, kolId, onNavigate }: VisitsPanelProps) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<CustomerVisitLog[]>([])
  const [loading, setLoading] = useState(mode === 'detail')

  useEffect(() => {
    if (mode === 'create' || !kolId) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void listKolVisitLogs(kolId)
      .then((result) => {
        if (!cancelled) {
          setRows(result.rows)
        }
      })
      .catch((err: unknown) => {
        console.error('[VisitsPanel] load:', err)
        if (!cancelled) {
          setRows([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [kolId, mode])

  const returnTo = kolId ? encodeURIComponent(kolDetailPath(kolId)) : ''

  return (
    <div className={`${detailSectionCardClass()} overflow-hidden p-0`}>
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 bg-brand/5 px-5 py-3">
        <h2 className="text-sm font-extrabold tracking-wide text-ink">
          {t('admin.kolDetail.visitLog.title')}
          <span className="ml-1.5 text-xs font-normal text-muted">
            ({rows.length})
          </span>
        </h2>
        {mode !== 'create' && kolId ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            onClick={() =>
              onNavigate(
                `/admin/visit-log/new?kolId=${kolId}&returnTo=${returnTo}`,
              )
            }
          >
            <PlusIcon className="size-3.5" />
            {t('admin.kolDetail.visitLog.add')}
          </button>
        ) : null}
      </div>
      {loading ? (
        <p className="px-5 py-8 text-center text-sm text-muted">
          {t('status.loading')}
        </p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted">
          {t('admin.kolDetail.visitLog.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-ink/10">
          {rows.map((log) => (
            <li key={log.id}>
              <button
                type="button"
                className="group block w-full px-5 py-3 text-left hover:bg-brand/5"
                onClick={() =>
                  onNavigate(
                    `/admin/visit-log/${log.id}?returnTo=${returnTo}`,
                  )
                }
              >
                <p className="mb-0.5 text-[11px] text-muted">
                  {formatDisplayDate(log.visitDate ?? log.createdAt)}
                </p>
                <p className="text-sm text-ink group-hover:text-brand">
                  {log.subject || t('admin.kolDetail.visitLog.untitled')}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
