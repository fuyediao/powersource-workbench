/**
 * Supabase reads for T&E local logistics orders (`te_orders`).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { OrdersListResult, TeOrder, TeOrderTrackingStatus } from '@/types/orders'

/** Default page size (web Admin list parity). */
export const TE_ORDERS_PAGE_SIZE = 20

/** Current local logistics columns selected from `te_orders`. */
const TE_ORDER_SELECT = '*'

/**
 * Normalize a carrier status from a local order row.
 * @param value - Raw `tracking_status` value.
 * @returns A supported tracking status or null.
 */
function normalizeTrackingStatus(value: unknown): TeOrderTrackingStatus | null {
  if (value === 'pending' || value === 'in_transit' || value === 'delivered') return value
  return null
}

/**
 * Map a raw Supabase `te_orders` row to {@link TeOrder}.
 * @param row - Supabase row.
 * @returns Typed T&E order.
 */
export function mapTeOrderFromRow(row: Record<string, unknown>): TeOrder {
  return {
    id: row.id as string,
    teSubmissionId: row.te_submission_id as string,
    communityAccountId: (row.community_account_id as string) ?? null,
    approvedProductIds: Array.isArray(row.approved_product_ids)
      ? (row.approved_product_ids as string[])
      : [],
    orderCreatedAt: row.order_created_at as string,
    trackingNumber: (row.tracking_number as string) ?? null,
    carrier: (row.carrier as string) ?? null,
    trackerId: (row.tracker_id as string) ?? null,
    trackerRegisteredAt: (row.tracker_registered_at as string) ?? null,
    trackingStatus: normalizeTrackingStatus(row.tracking_status),
    trackingStatusUpdatedAt: (row.tracking_status_updated_at as string) ?? null,
    trackingLastCheckedAt: (row.tracking_last_checked_at as string) ?? null,
    trackingNextCheckAt: (row.tracking_next_check_at as string) ?? null,
    trackingFailureCount:
      typeof row.tracking_failure_count === 'number' ? row.tracking_failure_count : 0,
    trackingLastError: (row.tracking_last_error as string) ?? null,
    shippedAt: (row.shipped_at as string) ?? null,
    deliveredAt: (row.delivered_at as string) ?? null,
    source: (row.source as string) ?? 'local',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Options for paginated T&E order list. */
export interface ListTeOrdersOptions {
  page: number
  pageSize?: number
  searchQuery?: string
  /** When set, only orders for this community account. */
  communityAccountId?: string | null
}

/**
 * Loads a page of T&E local logistics orders.
 * @param options - Pagination, optional search, and optional account filter.
 * @returns Rows and total count.
 */
export async function listTeOrders(
  options: ListTeOrdersOptions,
): Promise<OrdersListResult<TeOrder>> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const pageSize = options.pageSize ?? TE_ORDERS_PAGE_SIZE
  const page = Math.max(1, options.page)
  let query = supabase
    .from('te_orders')
    .select(TE_ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })

  const accountId = options.communityAccountId?.trim() ?? ''
  if (accountId) {
    query = query.eq('community_account_id', accountId)
  }

  const q = options.searchQuery?.trim() ?? ''
  if (q) {
    query = query.or(`tracking_number.ilike.%${q}%,carrier.ilike.%${q}%`)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query
  if (error) throw error

  return {
    rows: (data ?? []).map((row) => mapTeOrderFromRow(row as Record<string, unknown>)),
    totalCount: count ?? 0,
  }
}

/**
 * Loads one T&E local logistics order by id.
 * @param orderId - `te_orders.id`.
 * @returns Order, or null when missing.
 */
export async function getTeOrderById(orderId: string): Promise<TeOrder | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const id = orderId.trim()
  if (!id) return null

  const { data, error } = await supabase
    .from('te_orders')
    .select(TE_ORDER_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapTeOrderFromRow(data as Record<string, unknown>)
}

/**
 * Load id → label for product_catalog rows (ERP item_name, with display_name override).
 * @returns Lookup map keyed by product_catalog.id.
 */
export async function fetchProductCatalogIdLabelMap(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured || !supabase) {
    return {}
  }

  const { data, error } = await supabase
    .from('product_catalog')
    .select('id, item_name, display_name')
    .order('item_code', { ascending: true })
    .limit(5000)

  if (error) {
    throw new Error(error.message)
  }

  const map: Record<string, string> = {}
  for (const row of (data ?? []) as Array<{
    id: string
    item_name: string
    display_name: string | null
  }>) {
    const label = (row.display_name ?? '').trim() || row.item_name
    map[row.id] = label
  }
  return map
}

/**
 * Maps catalog ids (or leftover free-text names) to display labels.
 * Unknown values are returned unchanged.
 * @param ids - Catalog ids or legacy product names.
 * @returns Labels in the same order.
 */
export async function labelsForProductCatalogIds(
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) {
    return []
  }
  try {
    const map = await fetchProductCatalogIdLabelMap()
    return ids.map((id) => map[id] ?? id)
  } catch {
    return ids
  }
}

/**
 * Resolve one or more product ids to display names.
 * @param productIds - Stored product UUID list.
 * @param labelMap - id → label map from {@link fetchProductCatalogIdLabelMap}.
 * @returns Comma-separated labels (falls back to short id).
 */
export function formatTeProductIds(
  productIds: string[],
  labelMap: Record<string, string>,
): string {
  if (productIds.length === 0) return '—'
  return productIds
    .map((id) => labelMap[id] ?? id.slice(0, 8))
    .join(', ')
}
