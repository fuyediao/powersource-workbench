/**
 * CRM ERP order detail pane (index row + on-demand SaleOrder from geocrm-api).
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon } from '@/icons/AllIcons'
import { fetchErpOrderDetail } from '@/services/erp-orders-api'
import { getCrmOrderById } from '@/services/orders-crm-api'
import type { ErpOrderDetailPayload, ErpOrderLineItem, Order } from '@/types/orders'
import { formatErpContactInfo } from '@/utils/erp-order-display'
import { formatDisplayDate } from '@/utils/format-display-date'

interface OrderCrmDetailPaneProps {
  orderId: string
  onNavigate: (path: string) => void
}

/**
 * CRM order detail: ERP SaleOrder header + line items.
 * @param props - Order id and back navigation.
 * @returns Detail UI.
 */
export function OrderCrmDetailPane({ orderId, onNavigate }: OrderCrmDetailPaneProps) {
  const { t } = useTranslation()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [erpDetail, setErpDetail] = useState<ErpOrderDetailPayload | null>(null)
  const [erpLoading, setErpLoading] = useState(false)
  const [erpError, setErpError] = useState<string | null>(null)

  const erpSaleOrder = useMemo<Record<string, unknown>>(() => {
    const so = erpDetail?.SaleOrder
    if (Array.isArray(so)) return so[0] ?? {}
    return so ?? {}
  }, [erpDetail])

  const erpLineItems = useMemo<ErpOrderLineItem[]>(
    () => erpDetail?.SaleOrderSub ?? [],
    [erpDetail],
  )

  useEffect(() => {
    let cancelled = false
    /**
     * Loads index row then ERP detail when external_id is present.
     */
    async function load(): Promise<void> {
      setLoading(true)
      setErpDetail(null)
      setErpError(null)
      try {
        const row = await getCrmOrderById(orderId)
        if (cancelled) return
        setOrder(row)
        setLoading(false)
        if (row?.source === 'erp' && row.externalId) {
          setErpLoading(true)
          try {
            const detail = await fetchErpOrderDetail(row.externalId)
            if (cancelled) return
            setErpDetail(detail)
          } catch (e) {
            if (cancelled) return
            setErpError(
              e instanceof Error ? e.message : t('admin.orders.erp.detailError'),
            )
          } finally {
            if (!cancelled) setErpLoading(false)
          }
        }
      } catch (err) {
        console.error('Load CRM order detail error:', err)
        if (!cancelled) {
          setOrder(null)
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orderId, t])

  /**
   * Reads an ERP SaleOrder field as a display string.
   * @param key - ERP field name.
   * @returns Display value or em dash.
   */
  function erpField(key: string): string {
    const value = erpSaleOrder[key]
    if (value === null || value === undefined || value === '') return '—'
    return String(value)
  }

  /**
   * Reads an ERP date field for display (with time when present).
   * @param key - ERP field name.
   * @returns Localized date/time or em dash.
   */
  function erpDateField(key: string): string {
    const value = erpSaleOrder[key]
    if (value === null || value === undefined || value === '') return '—'
    const trimmed = String(value).trim()
    if (!/\d{1,2}:\d{2}/.test(trimmed)) return formatDisplayDate(trimmed)
    const parsed = new Date(trimmed)
    if (Number.isNaN(parsed.getTime())) return formatDisplayDate(trimmed)
    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  /**
   * Customer label from ERP header, falling back to the indexed join.
   * @returns Display label.
   */
  function erpCustomerDisplay(): string {
    const name = erpField('CustomerName')
    const code = erpField('CustomerCode')
    if (name !== '—' || code !== '—') {
      if (name !== '—' && code !== '—') return `${name} (${code})`
      return name !== '—' ? name : code
    }
    const company = order?.companyName
    const customerCode = order?.customerCode
    if (company && customerCode) return `${company} (${customerCode})`
    return company ?? customerCode ?? '—'
  }

  /**
   * Reads a line-item field.
   * @param item - Line item.
   * @param key - Field name.
   * @returns Display string.
   */
  function erpItemField(item: ErpOrderLineItem, key: string): string {
    const value = item[key]
    if (value === null || value === undefined || value === '') return '—'
    return String(value)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold text-muted hover:bg-brand/10 hover:text-brand"
          onClick={() => onNavigate('/orders/crm')}
        >
          <ArrowLeftIcon className="size-4" />
          {t('admin.orders.detail.backToList')}
        </button>
        <h1 className="text-xl font-extrabold tracking-tight text-brand">
          {t('admin.orders.erp.detailTitle')}
        </h1>
      </div>

      {loading ? (
        <div className="animate-pulse rounded-3xl border border-ink/10 bg-white/60 p-8 dark:bg-white/5">
          <div className="mb-4 h-6 w-1/3 rounded bg-ink/10" />
          <div className="mb-2 h-4 w-full rounded bg-ink/5" />
          <div className="h-4 w-2/3 rounded bg-ink/5" />
        </div>
      ) : null}

      {!loading && !order ? (
        <div className="rounded-3xl border border-ink/10 bg-white/60 p-8 text-center dark:bg-white/5">
          <p className="mb-4 text-muted">{t('admin.orders.detail.notFound')}</p>
          <button
            type="button"
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg"
            onClick={() => onNavigate('/orders/crm')}
          >
            {t('admin.orders.detail.backToList')}
          </button>
        </div>
      ) : null}

      {!loading && order ? (
        <>
          {erpLoading ? (
            <div className="animate-pulse rounded-3xl border border-ink/10 bg-white/60 p-6 dark:bg-white/5">
              <div className="mb-3 h-5 w-1/3 rounded bg-ink/10" />
              <div className="mb-2 h-4 w-full rounded bg-ink/5" />
              <div className="h-4 w-2/3 rounded bg-ink/5" />
            </div>
          ) : null}

          {erpError ? (
            <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
              {erpError}
            </p>
          ) : null}

          {!erpLoading && !erpError ? (
            <div className="space-y-4">
              <section className="rounded-3xl border border-ink/10 bg-white/60 p-5 dark:bg-white/5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailField
                    label={t('admin.orders.erp.field.billNo')}
                    value={erpField('BillNo') !== '—' ? erpField('BillNo') : order.externalId || '—'}
                  />
                  <DetailField
                    label={t('admin.orders.erp.field.billDate')}
                    value={erpDateField('BillDate')}
                  />
                  <DetailField
                    label={t('admin.orders.erp.field.customer')}
                    value={erpCustomerDisplay()}
                  />
                  <DetailField
                    label={t('admin.orders.erp.field.contactInfo')}
                    value={formatErpContactInfo(erpSaleOrder)}
                  />
                  <DetailField
                    label={t('admin.orders.erp.field.amount')}
                    value={erpField('TotalMoney')}
                  />
                  <DetailField
                    label={t('admin.orders.erp.field.shipment')}
                    value={erpField('ShipType')}
                  />
                  <DetailField
                    label={t('admin.orders.erp.field.address')}
                    value={erpField('Address')}
                    className="sm:col-span-2 lg:col-span-3"
                  />
                </div>
              </section>

              <section className="rounded-3xl border border-ink/10 bg-white/60 p-5 dark:bg-white/5">
                <h2 className="mb-3 text-sm font-bold tracking-wide text-ink">
                  {t('admin.orders.erp.lineItems')}
                </h2>
                {erpLineItems.length === 0 ? (
                  <p className="text-sm text-muted">{t('admin.orders.erp.noLineItems')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                      <thead className="text-xs font-bold tracking-wide text-muted uppercase">
                        <tr>
                          <th className="px-3 py-2">{t('admin.orders.erp.item.code')}</th>
                          <th className="px-3 py-2">{t('admin.orders.erp.item.name')}</th>
                          <th className="px-3 py-2">{t('admin.orders.erp.item.qty')}</th>
                          <th className="px-3 py-2">{t('admin.orders.erp.item.price')}</th>
                          <th className="px-3 py-2">{t('admin.orders.erp.item.amount')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {erpLineItems.map((item, index) => (
                          <tr key={index} className="border-t border-ink/5">
                            <td className="px-3 py-2 font-mono text-xs">
                              {erpItemField(item, 'ItemCode')}
                            </td>
                            <td className="px-3 py-2">{erpItemField(item, 'ItemName')}</td>
                            <td className="px-3 py-2">{erpItemField(item, 'Qty')}</td>
                            <td className="px-3 py-2">{erpItemField(item, 'Price')}</td>
                            <td className="px-3 py-2">{erpItemField(item, 'Money')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/**
 * Labeled detail field.
 * @param props - Label, value, optional colspan class.
 * @returns Field block.
 */
function DetailField({
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
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}
