/**
 * Supabase reads for NEXDOT wholesale orders (`shop_orders`).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type {
  ObmOrder,
  ObmOrderAddressSnapshot,
  ObmOrderDetail,
  ObmOrderLineItem,
  ObmOrderPayment,
  OrdersListResult,
  ShopOrderPaymentStatus,
} from '@/types/orders'

/** Default page size (web Admin list parity). */
export const OBM_ORDERS_PAGE_SIZE = 20

const PAYMENT_STATUSES: readonly ShopOrderPaymentStatus[] = [
  'pending_payment',
  'payment_processing',
  'payment_succeeded',
  'payment_failed',
  'closed',
  'cancelled',
]

/**
 * Converts cents to whole currency units, or null when missing.
 * @param cents - Integer cents from the database.
 * @returns Dollars (or equivalent) / 100.
 */
function centsToAmount(cents: unknown): number | null {
  if (cents === null || cents === undefined) return null
  const n = Number(cents)
  if (!Number.isFinite(n)) return null
  return n / 100
}

/**
 * Normalizes a payment_status string to a known enum value.
 * @param raw - Database value.
 * @returns Typed status (defaults to pending_payment).
 */
function parsePaymentStatus(raw: unknown): ShopOrderPaymentStatus {
  return PAYMENT_STATUSES.includes(raw as ShopOrderPaymentStatus)
    ? (raw as ShopOrderPaymentStatus)
    : 'pending_payment'
}

/**
 * Reads a string field from a JSON address snapshot.
 * @param row - Snapshot object.
 * @param key - Field name (camelCase as stored by workbench-api).
 * @returns Trimmed string or empty.
 */
function snapshotString(row: Record<string, unknown> | null, key: string): string {
  if (!row) return ''
  const value = row[key]
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/**
 * Maps a frozen shipping/billing JSONB snapshot to a typed address.
 * @param raw - JSONB value from `shop_orders`.
 * @returns Snapshot or null when empty/invalid.
 */
export function mapObmAddressSnapshot(raw: unknown): ObmOrderAddressSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  return {
    firstName: snapshotString(row, 'firstName'),
    lastName: snapshotString(row, 'lastName'),
    phone: snapshotString(row, 'phone'),
    email: snapshotString(row, 'email'),
    country: snapshotString(row, 'country'),
    state: snapshotString(row, 'state'),
    city: snapshotString(row, 'city'),
    postalCode: snapshotString(row, 'postalCode'),
    district: snapshotString(row, 'district'),
    line1: snapshotString(row, 'line1'),
    line2: snapshotString(row, 'line2'),
  }
}

/**
 * Maps one `shop_order_items` row to a typed line item.
 * @param row - Supabase row.
 * @returns Line item in whole currency units.
 */
export function mapObmOrderLineItem(row: Record<string, unknown>): ObmOrderLineItem {
  return {
    id: String(row.id ?? ''),
    productId: String(row.product_id ?? ''),
    itemCode: String(row.item_code ?? ''),
    name: String(row.name ?? ''),
    unitPrice: centsToAmount(row.unit_price_cents) ?? 0,
    quantity: Number(row.quantity ?? 0),
    lineTotal: centsToAmount(row.line_total_cents) ?? 0,
  }
}

/**
 * Map a raw Supabase `shop_orders` row (optionally with a joined customer) to {@link ObmOrder}.
 * @param row - Supabase row.
 * @returns Typed OBM/NEXDOT order.
 */
export function mapObmOrderFromRow(row: Record<string, unknown>): ObmOrder {
  const customers = row.customers as { company_name?: string } | null | undefined
  return {
    id: row.id as string,
    orderNumber: (row.order_number as string) ?? '',
    customerId: (row.customer_id as string) ?? null,
    groupId: (row.group_id as string) ?? null,
    paymentStatus: parsePaymentStatus(row.payment_status),
    itemCount: Number(row.item_count ?? 0),
    totalAmount: centsToAmount(row.total_cents),
    currency: ((row.currency as string) ?? 'usd').toUpperCase(),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    companyName: customers?.company_name ?? null,
  }
}

/**
 * Maps one `shop_payments` row to a typed payment record.
 * @param row - Supabase row.
 * @returns Payment evidence for admin display.
 */
export function mapObmOrderPayment(row: Record<string, unknown>): ObmOrderPayment {
  return {
    id: String(row.id ?? ''),
    stripeCheckoutSessionId: String(row.stripe_checkout_session_id ?? ''),
    stripePaymentIntentId: row.stripe_payment_intent_id
      ? String(row.stripe_payment_intent_id)
      : null,
    status: String(row.status ?? ''),
    amount: centsToAmount(row.amount_cents),
    currency: ((row.currency as string) ?? 'usd').toUpperCase(),
    paidAt: (row.paid_at as string) ?? null,
    customerEmail: row.customer_email ? String(row.customer_email) : null,
  }
}

/**
 * Maps a `shop_orders` row plus nested line items to a detail model.
 * @param row - Supabase row with optional `shop_order_items` and `customers`.
 * @returns Full detail model.
 */
export function mapObmOrderDetailFromRow(row: Record<string, unknown>): ObmOrderDetail {
  const base = mapObmOrderFromRow(row)
  const rawItems = row.shop_order_items
  const items = Array.isArray(rawItems)
    ? (rawItems as Record<string, unknown>[]).map(mapObmOrderLineItem)
    : []
  const rawPayments = row.shop_payments
  const payments = Array.isArray(rawPayments)
    ? (rawPayments as Record<string, unknown>[]).map(mapObmOrderPayment)
    : []
  return {
    ...base,
    dealerAccountId: (row.dealer_account_id as string) ?? null,
    clientPlatform: (row.client_platform as string) ?? null,
    subtotalAmount: centsToAmount(row.subtotal_cents),
    paymentStatusChangedAt: (row.payment_status_changed_at as string) ?? null,
    closedAt: (row.closed_at as string) ?? null,
    cancelledAt: (row.cancelled_at as string) ?? null,
    shippingAddress: mapObmAddressSnapshot(row.shipping_address),
    billingAddress: mapObmAddressSnapshot(row.billing_address),
    items,
    payments,
  }
}

/** Options for paginated NEXDOT order list. */
export interface ListObmOrdersOptions {
  page: number
  pageSize?: number
  searchQuery?: string
}

/**
 * Loads a page of wholesale shop orders.
 * @param options - Pagination and optional order-number search.
 * @returns Rows and total count.
 */
export async function listObmOrders(
  options: ListObmOrdersOptions,
): Promise<OrdersListResult<ObmOrder>> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const pageSize = options.pageSize ?? OBM_ORDERS_PAGE_SIZE
  const page = Math.max(1, options.page)
  let query = supabase
    .from('shop_orders')
    .select('*, customers ( company_name )', { count: 'exact' })
    .order('created_at', { ascending: false })

  const q = options.searchQuery?.trim() ?? ''
  if (q) {
    query = query.ilike('order_number', `%${q}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query
  if (error) throw error

  return {
    rows: (data ?? []).map((row) => mapObmOrderFromRow(row as Record<string, unknown>)),
    totalCount: count ?? 0,
  }
}

/**
 * Lists NEXDOT shop orders for one CRM customer (newest first).
 * @param customerId - CRM customer UUID.
 * @param limit - Max rows (default 50).
 * @returns Orders for that customer.
 */
export async function listObmOrdersByCustomer(
  customerId: string,
  limit = 50,
): Promise<ObmOrder[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await supabase
    .from('shop_orders')
    .select('*, customers ( company_name )')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => mapObmOrderFromRow(row as Record<string, unknown>))
}

/**
 * Loads one wholesale order with line items and payments.
 * @param orderId - `shop_orders.id`.
 * @returns Detail model, or null when missing.
 */
export async function fetchObmOrderById(orderId: string): Promise<ObmOrderDetail | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const id = orderId.trim()
  if (!id) return null

  const { data, error } = await supabase
    .from('shop_orders')
    .select('*, customers ( company_name ), shop_order_items ( * ), shop_payments ( * )')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapObmOrderDetailFromRow(data as Record<string, unknown>)
}
