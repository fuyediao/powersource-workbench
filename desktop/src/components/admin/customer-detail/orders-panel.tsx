/**
 * CRM + NEXDOT orders linked to a customer (separate pagination per source).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { useCustomerTabCache } from '@/hooks/use-customer-tab-cache'
import { ExternalLinkIcon } from '@/icons/AllIcons'
import { listCrmOrdersByCustomer } from '@/services/orders-crm-api'
import { listObmOrdersByCustomer } from '@/services/orders-obm-api'
import type { ObmOrder, Order } from '@/types/orders'
import type { CustomerOrdersCachePayload } from '@/utils/customer-detail-cache'
import { formatDisplayDateTime } from '@/utils/format-display-date'
import { openOrdersPath } from '@/utils/orders/orders-open-request'

interface OrdersPanelProps {
  customerId: string
}

/** Max rows per page for each order source (ERP / NEXDOT). */
const ORDERS_PAGE_SIZE = 15

/** How many rows to fetch per source for client-side paging. */
const ORDERS_FETCH_LIMIT = 500

/**
 * Clamps a 1-based page into `[1, totalPages]`.
 * @param page - Requested page.
 * @param totalPages - Available pages (at least 1).
 * @returns Safe page.
 */
function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages))
}

/**
 * Orders tab listing ERP and NEXDOT orders for a customer.
 * @param props - Customer id.
 * @returns Panel UI.
 */
export function OrdersPanel({ customerId }: OrdersPanelProps) {
  const { t } = useTranslation()
  const [crmPage, setCrmPage] = useState(1)
  const [obmPage, setObmPage] = useState(1)

  const fetchOrders = useCallback(async (): Promise<CustomerOrdersCachePayload> => {
    const [crm, obm] = await Promise.all([
      listCrmOrdersByCustomer(customerId, ORDERS_FETCH_LIMIT),
      listObmOrdersByCustomer(customerId, ORDERS_FETCH_LIMIT).catch(
        () => [] as ObmOrder[],
      ),
    ])
    return { crm, obm }
  }, [customerId])

  const { data, loading, error } = useCustomerTabCache(
    customerId,
    'orders',
    fetchOrders,
    t('admin.orders.error.load'),
  )

  const crmOrders: Order[] = data?.crm ?? []
  const obmOrders: ObmOrder[] = data?.obm ?? []

  useEffect(() => {
    setCrmPage(1)
    setObmPage(1)
  }, [customerId, data])

  const crmTotal = crmOrders.length
  const obmTotal = obmOrders.length
  const crmTotalPages = Math.max(1, Math.ceil(crmTotal / ORDERS_PAGE_SIZE))
  const obmTotalPages = Math.max(1, Math.ceil(obmTotal / ORDERS_PAGE_SIZE))
  const safeCrmPage = clampPage(crmPage, crmTotalPages)
  const safeObmPage = clampPage(obmPage, obmTotalPages)

  const pageCrm = useMemo(() => {
    const start = (safeCrmPage - 1) * ORDERS_PAGE_SIZE
    return crmOrders.slice(start, start + ORDERS_PAGE_SIZE)
  }, [crmOrders, safeCrmPage])

  const pageObm = useMemo(() => {
    const start = (safeObmPage - 1) * ORDERS_PAGE_SIZE
    return obmOrders.slice(start, start + ORDERS_PAGE_SIZE)
  }, [obmOrders, safeObmPage])

  useEffect(() => {
    if (crmPage !== safeCrmPage) {
      setCrmPage(safeCrmPage)
    }
  }, [crmPage, safeCrmPage])

  useEffect(() => {
    if (obmPage !== safeObmPage) {
      setObmPage(safeObmPage)
    }
  }, [obmPage, safeObmPage])

  const empty = !loading && crmTotal === 0 && obmTotal === 0
  const crmRangeStart = crmTotal === 0 ? 0 : (safeCrmPage - 1) * ORDERS_PAGE_SIZE + 1
  const crmRangeEnd = Math.min(safeCrmPage * ORDERS_PAGE_SIZE, crmTotal)
  const obmRangeStart = obmTotal === 0 ? 0 : (safeObmPage - 1) * ORDERS_PAGE_SIZE + 1
  const obmRangeEnd = Math.min(safeObmPage * ORDERS_PAGE_SIZE, obmTotal)

  return (
    <div className="space-y-4">
      <section className={detailSectionCardClass()}>
        <h3 className="mb-3 text-sm font-extrabold text-ink">
          {t('admin.customers.detail.ordersSectionTitle')}
        </h3>

        {error ? (
          <p className="mb-2 text-sm font-medium text-rose-500">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
        ) : null}
        {empty ? (
          <p className="py-6 text-center text-sm font-medium text-muted">
            {t('admin.customers.detail.ordersEmpty')}
          </p>
        ) : null}
      </section>

      {!loading && crmTotal > 0 ? (
        <section className={detailSectionCardClass()}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">
              {t('admin.orders.crmTitle')}
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium text-muted">
                {t('admin.customers.countText', {
                  from: crmRangeStart,
                  to: crmRangeEnd,
                  total: crmTotal,
                })}
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-brand hover:underline"
                onClick={() => openOrdersPath('/orders/crm')}
              >
                {t('admin.customers.detail.ordersGoToManagement')}
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            {pageCrm.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-ink/10 bg-canvas/60 px-3 py-2 text-left text-xs hover:border-brand/40"
                  onClick={() => openOrdersPath(`/orders/crm/${order.id}`)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">
                      {order.externalId || order.productName || order.id}
                    </p>
                    <p className="text-muted">
                      {formatDisplayDateTime(order.createdAt)}
                      {order.status ? ` · ${order.status}` : ''}
                    </p>
                  </div>
                  <ExternalLinkIcon className="size-3.5 shrink-0 text-brand" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <PaginationStrip
              currentPage={safeCrmPage}
              totalPages={crmTotalPages}
              disabled={loading}
              onGoToPage={setCrmPage}
            />
          </div>
        </section>
      ) : null}

      {!loading && obmTotal > 0 ? (
        <section className={detailSectionCardClass()}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-muted">
              {t('admin.orders.hub.obm.customerSectionTitle')}
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-medium text-muted">
                {t('admin.customers.countText', {
                  from: obmRangeStart,
                  to: obmRangeEnd,
                  total: obmTotal,
                })}
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-brand hover:underline"
                onClick={() => openOrdersPath('/orders/nexdot')}
              >
                {t('admin.customers.detail.ordersGoToManagement')}
              </button>
            </div>
          </div>
          <ul className="space-y-2">
            {pageObm.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-ink/10 bg-canvas/60 px-3 py-2 text-left text-xs hover:border-brand/40"
                  onClick={() => openOrdersPath(`/orders/nexdot/${order.id}`)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{order.orderNumber}</p>
                    <p className="text-muted">
                      {formatDisplayDateTime(order.createdAt)} ·{' '}
                      {t(`admin.orders.hub.obm.status.${order.paymentStatus}`, {
                        defaultValue: order.paymentStatus,
                      })}
                    </p>
                  </div>
                  <ExternalLinkIcon className="size-3.5 shrink-0 text-brand" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <PaginationStrip
              currentPage={safeObmPage}
              totalPages={obmTotalPages}
              disabled={loading}
              onGoToPage={setObmPage}
            />
          </div>
        </section>
      ) : null}
    </div>
  )
}
