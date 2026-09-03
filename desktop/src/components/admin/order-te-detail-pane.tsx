/**
 * T&E local logistics order detail pane (read-only, in-Orders sub-page).
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon } from '@/icons/AllIcons'
import {
  fetchProductCatalogIdLabelMap,
  formatTeProductIds,
  getTeOrderById,
} from '@/services/orders-te-api'
import type { TeOrder } from '@/types/orders'
import { formatDisplayDateTime } from '@/utils/format-display-date'

interface OrderTeDetailPaneProps {
  orderId: string
  onNavigate: (path: string) => void
}

/**
 * Badge classes for a normalized tracking state.
 * @param status - Tracking status.
 * @returns Tailwind class string.
 */
function trackingStatusClass(status: TeOrder['trackingStatus']): string {
  switch (status) {
    case 'pending':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'in_transit':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
    case 'delivered':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    default:
      return 'border-ink/15 bg-ink/5 text-muted'
  }
}

/**
 * T&E order detail view within the Orders Function.
 * @param props - Order id and back navigation.
 * @returns Detail UI.
 */
export function OrderTeDetailPane({ orderId, onNavigate }: OrderTeDetailPaneProps) {
  const { t } = useTranslation()
  const [order, setOrder] = useState<TeOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [labelMap, setLabelMap] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    void fetchProductCatalogIdLabelMap()
      .then((map) => {
        if (!cancelled) setLabelMap(map)
      })
      .catch((err) => {
        console.error('Load product catalog labels error:', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    /**
     * Loads one te_orders row.
     */
    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const row = await getTeOrderById(orderId)
        if (cancelled) return
        setOrder(row)
      } catch (err) {
        console.error('Load T&E order detail error:', err)
        if (!cancelled) {
          setError(t('admin.orders.hub.teOrders.detailError'))
          setOrder(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orderId, t])

  /**
   * Tracking status label.
   * @param status - Tracking status.
   * @returns Localized label.
   */
  function statusLabel(status: TeOrder['trackingStatus']): string {
    if (!status) return t('admin.orders.hub.teOrders.statusNotRegistered')
    return t(`admin.orders.teTracking.${status}`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-brand/10 hover:text-brand"
          onClick={() => onNavigate('/orders/te')}
        >
          <ArrowLeftIcon className="size-4" />
          {t('admin.orders.detail.backToList')}
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-brand">
          {t('admin.orders.hub.teOrders.detailTitle')}
        </h1>
      </div>

      {loading ? (
        <div className="animate-pulse rounded-3xl border border-ink/10 bg-white/60 p-8 dark:bg-white/5">
          <div className="mb-4 h-6 w-1/3 rounded bg-ink/10" />
          <div className="mb-2 h-4 w-full rounded bg-ink/5" />
          <div className="h-4 w-2/3 rounded bg-ink/5" />
        </div>
      ) : null}

      {error ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}

      {!loading && !error && !order ? (
        <div className="rounded-3xl border border-ink/10 bg-white/60 p-8 text-center dark:bg-white/5">
          <p className="mb-4 text-muted">{t('admin.orders.hub.teOrders.detailNotFound')}</p>
          <button
            type="button"
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg"
            onClick={() => onNavigate('/orders/te')}
          >
            {t('admin.orders.detail.backToList')}
          </button>
        </div>
      ) : null}

      {!loading && order ? (
        <section className="grid gap-4 rounded-3xl border border-ink/10 bg-white/60 p-5 sm:grid-cols-2 dark:bg-white/5">
          <Field
            label={t('admin.orders.hub.teOrders.col.approvedProducts')}
            value={formatTeProductIds(order.approvedProductIds, labelMap)}
          />
          <Field
            label={t('admin.orders.hub.teOrders.col.tracking')}
            value={order.trackingNumber || '—'}
          />
          <Field
            label={t('admin.orders.hub.teOrders.col.carrier')}
            value={order.carrier || '—'}
          />
          <div>
            <p className="text-xs text-muted">{t('admin.orders.hub.teOrders.col.status')}</p>
            <span
              className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${trackingStatusClass(order.trackingStatus)}`}
            >
              {statusLabel(order.trackingStatus)}
            </span>
          </div>
          <Field
            label={t('admin.orders.hub.teOrders.col.lastChecked')}
            value={formatDisplayDateTime(order.trackingLastCheckedAt)}
          />
          <Field
            label={t('admin.orders.hub.teOrders.col.shippedAt')}
            value={formatDisplayDateTime(order.shippedAt)}
          />
          <Field
            label={t('admin.orders.hub.teOrders.col.deliveredAt')}
            value={formatDisplayDateTime(order.deliveredAt)}
          />
          <Field
            label={t('admin.orders.hub.teOrders.detail.orderCreatedAt')}
            value={formatDisplayDateTime(order.orderCreatedAt)}
          />
          {order.trackingLastError ? (
            <Field
              label={t('admin.orders.hub.teOrders.detail.lastError')}
              value={order.trackingLastError}
              className="sm:col-span-2"
            />
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

/**
 * Labeled detail field.
 * @param props - Label, value, optional class.
 * @returns Field block.
 */
function Field({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold break-all text-ink">{value}</p>
    </div>
  )
}

/**
 * Parses `/orders/te/:id` detail paths.
 * @param path - Shell path.
 * @returns Order id or null.
 */
export function parseOrderTeDetailPath(path: string): string | null {
  const match = /^\/orders\/te\/([^/]+)\/?$/.exec(path.trim())
  if (!match) return null
  const id = match[1]?.trim() ?? ''
  return id || null
}
