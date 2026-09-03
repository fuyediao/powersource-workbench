/**
 * NEXDOT wholesale order detail pane (summary, shipping, payment, line items).
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon } from '@/icons/AllIcons'
import { fetchObmOrderById } from '@/services/orders-obm-api'
import type {
  ObmOrderAddressSnapshot,
  ObmOrderDetail,
  ShopOrderPaymentStatus,
} from '@/types/orders'
import { formatDisplayDateTime } from '@/utils/format-display-date'

interface OrderNexdotDetailPaneProps {
  orderId: string
  onNavigate: (path: string) => void
}

/**
 * Badge classes for one payment status.
 * @param status - Payment status.
 * @returns Tailwind class string.
 */
function statusClass(status: ShopOrderPaymentStatus): string {
  switch (status) {
    case 'pending_payment':
      return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'payment_processing':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
    case 'payment_succeeded':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'payment_failed':
      return 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-300'
    case 'closed':
    case 'cancelled':
    default:
      return 'border-ink/15 bg-ink/5 text-muted'
  }
}

/**
 * Formats an amount with currency, or an em dash when missing.
 * @param amount - Whole currency units.
 * @param currency - Currency code.
 * @returns Formatted amount.
 */
function formatAmount(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return '—'
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Contact display name from an address snapshot.
 * @param address - Shipping or billing snapshot.
 * @returns Display name.
 */
function contactName(address: ObmOrderAddressSnapshot | null): string {
  if (!address) return '—'
  const name = `${address.firstName} ${address.lastName}`.trim()
  return name || '—'
}

/**
 * Multi-line street address from a snapshot.
 * @param address - Shipping or billing snapshot.
 * @returns Street lines.
 */
function formatStreet(address: ObmOrderAddressSnapshot | null): string {
  if (!address) return '—'
  const lines = [address.line1, address.line2].filter(Boolean)
  return lines.length > 0 ? lines.join(', ') : '—'
}

/**
 * City / state / postal line from a snapshot.
 * @param address - Shipping or billing snapshot.
 * @returns Locality line.
 */
function formatLocality(address: ObmOrderAddressSnapshot | null): string {
  if (!address) return '—'
  const parts = [address.city, address.state, address.postalCode, address.district].filter(
    Boolean,
  )
  return parts.length > 0 ? parts.join(', ') : '—'
}

/**
 * NEXDOT order detail view.
 * @param props - Order id and back navigation.
 * @returns Detail UI.
 */
export function OrderNexdotDetailPane({
  orderId,
  onNavigate,
}: OrderNexdotDetailPaneProps) {
  const { t } = useTranslation()
  const [order, setOrder] = useState<ObmOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    /**
     * Loads shop order detail from Supabase.
     */
    async function load(): Promise<void> {
      setLoading(true)
      setError(null)
      try {
        const detail = await fetchObmOrderById(orderId)
        if (cancelled) return
        setOrder(detail)
      } catch (err) {
        console.error('Load NEXDOT order detail error:', err)
        if (!cancelled) {
          setError(t('admin.orders.hub.obm.detailError'))
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
   * Localized client platform label.
   * @param platform - Platform slug.
   * @returns Label.
   */
  function platformLabel(platform: string | null): string {
    if (!platform) return '—'
    const key = `admin.orders.hub.obm.platform.${platform}`
    const translated = t(key)
    return translated === key ? platform : translated
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-brand/10 hover:text-brand"
          onClick={() => onNavigate('/orders/nexdot')}
        >
          <ArrowLeftIcon className="size-4" />
          {t('admin.orders.detail.backToList')}
        </button>
        {order ? (
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-brand">
              {order.orderNumber}
            </h1>
            <p className="text-xs text-muted">{t('admin.orders.hub.obm.detailSubtitle')}</p>
          </div>
        ) : null}
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
          <p className="mb-4 text-muted">{t('admin.orders.hub.obm.detailNotFound')}</p>
          <button
            type="button"
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg"
            onClick={() => onNavigate('/orders/nexdot')}
          >
            {t('admin.orders.detail.backToList')}
          </button>
        </div>
      ) : null}

      {!loading && order ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="space-y-3 rounded-3xl border border-ink/10 bg-white/60 p-5 dark:bg-white/5">
            <h2 className="text-sm font-bold tracking-wide text-ink">
              {t('admin.orders.hub.obm.detail.sections.summary')}
            </h2>
            <Field
              label={t('admin.orders.hub.obm.col.orderNumber')}
              value={order.orderNumber}
            />
            <Field
              label={t('admin.orders.hub.obm.col.customer')}
              value={order.companyName || order.customerId || '—'}
            />
            <div>
              <p className="text-xs text-muted">{t('admin.orders.hub.obm.col.status')}</p>
              <span
                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass(order.paymentStatus)}`}
              >
                {t(`admin.orders.hub.obm.status.${order.paymentStatus}`)}
              </span>
            </div>
            <Field
              label={t('admin.orders.hub.obm.col.amount')}
              value={formatAmount(order.totalAmount, order.currency)}
            />
            <Field
              label={t('admin.orders.hub.obm.detail.fields.subtotal')}
              value={formatAmount(order.subtotalAmount, order.currency)}
            />
            <Field
              label={t('admin.orders.hub.obm.detail.fields.platform')}
              value={platformLabel(order.clientPlatform)}
            />
            <Field
              label={t('admin.orders.hub.obm.col.createdAt')}
              value={formatDisplayDateTime(order.createdAt)}
            />
            {order.closedAt ? (
              <Field
                label={t('admin.orders.hub.obm.detail.fields.closedAt')}
                value={formatDisplayDateTime(order.closedAt)}
              />
            ) : null}
            {order.cancelledAt ? (
              <Field
                label={t('admin.orders.hub.obm.detail.fields.cancelledAt')}
                value={formatDisplayDateTime(order.cancelledAt)}
              />
            ) : null}
          </section>

          <section className="space-y-3 rounded-3xl border border-ink/10 bg-white/60 p-5 dark:bg-white/5">
            <h2 className="text-sm font-bold tracking-wide text-ink">
              {t('admin.orders.hub.obm.detail.sections.shipping')}
            </h2>
            <Field
              label={t('admin.orders.hub.obm.detail.fields.contactName')}
              value={contactName(order.shippingAddress)}
            />
            <Field
              label={t('admin.orders.hub.obm.detail.fields.contactEmail')}
              value={order.shippingAddress?.email || '—'}
            />
            <Field
              label={t('admin.orders.hub.obm.detail.fields.contactPhone')}
              value={order.shippingAddress?.phone || '—'}
            />
            <Field
              label={t('admin.orders.hub.obm.detail.fields.address')}
              value={`${formatStreet(order.shippingAddress)}; ${formatLocality(order.shippingAddress)}; ${order.shippingAddress?.country || '—'}`}
            />
          </section>

          <section className="space-y-3 rounded-3xl border border-ink/10 bg-white/60 p-5 dark:bg-white/5">
            <h2 className="text-sm font-bold tracking-wide text-ink">
              {t('admin.orders.hub.obm.detail.sections.payment')}
            </h2>
            {order.payments.length === 0 ? (
              <p className="text-sm text-muted">
                {t('admin.orders.hub.obm.detail.paymentMissing')}
              </p>
            ) : (
              order.payments.map((payment) => (
                <div key={payment.id} className="space-y-2 border-t border-ink/5 pt-2 first:border-0 first:pt-0">
                  <Field
                    label={t('admin.orders.hub.obm.detail.fields.stripeCheckoutSession')}
                    value={payment.stripeCheckoutSessionId || '—'}
                  />
                  <Field
                    label={t('admin.orders.hub.obm.detail.fields.stripePaymentIntent')}
                    value={payment.stripePaymentIntentId || '—'}
                  />
                  <Field
                    label={t('admin.orders.hub.obm.col.amount')}
                    value={formatAmount(payment.amount, payment.currency)}
                  />
                  <Field
                    label={t('admin.orders.hub.obm.detail.fields.paidAt')}
                    value={formatDisplayDateTime(payment.paidAt)}
                  />
                </div>
              ))
            )}
          </section>

          <section className="rounded-3xl border border-ink/10 bg-white/60 p-5 lg:col-span-3 dark:bg-white/5">
            <h2 className="mb-3 text-sm font-bold tracking-wide text-ink">
              {t('admin.orders.hub.obm.detail.sections.items')}
            </h2>
            {order.items.length === 0 ? (
              <p className="text-sm text-muted">
                {t('admin.orders.hub.obm.detail.emptyItems')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                  <thead className="text-xs font-bold tracking-wide text-muted uppercase">
                    <tr>
                      <th className="px-3 py-2">
                        {t('admin.orders.hub.obm.detail.itemsColumns.item')}
                      </th>
                      <th className="px-3 py-2">
                        {t('admin.orders.hub.obm.detail.itemsColumns.sku')}
                      </th>
                      <th className="px-3 py-2">
                        {t('admin.orders.hub.obm.detail.itemsColumns.quantity')}
                      </th>
                      <th className="px-3 py-2">
                        {t('admin.orders.hub.obm.detail.itemsColumns.unitPrice')}
                      </th>
                      <th className="px-3 py-2">
                        {t('admin.orders.hub.obm.detail.itemsColumns.lineTotal')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.id} className="border-t border-ink/5">
                        <td className="px-3 py-2 font-medium text-ink">{item.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">
                          {item.itemCode || '—'}
                        </td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2">
                          {formatAmount(item.unitPrice, order.currency)}
                        </td>
                        <td className="px-3 py-2">
                          {formatAmount(item.lineTotal, order.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Labeled detail field.
 * @param props - Label and value.
 * @returns Field block.
 */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold break-all text-ink">{value}</p>
    </div>
  )
}
