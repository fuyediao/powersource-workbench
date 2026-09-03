/**
 * Supabase reads for ERP-mirrored CRM orders (`public.orders`).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Order, OrdersListResult } from '@/types/orders'
import { buildOrderListSearchFilter } from '@/utils/order-list-search'

/** Default page size (web Admin list parity). */
export const ORDERS_PAGE_SIZE = 20

/** List query: customer + group joins (ERP index rows only). */
const ORDER_LIST_SELECT =
  '*, customers ( company_name, customer_code ), groups ( name )'

/**
 * Maps a raw Supabase row (with joined tables) to a typed Order object.
 * @param row - Raw database row from the orders table.
 * @returns Typed Order.
 */
function mapOrderRow(row: Record<string, unknown>): Order {
  const customers = row.customers as
    | { company_name?: string; customer_code?: string }
    | null
    | undefined
  const groups = row.groups as { name?: string } | null | undefined

  return {
    id: row.id as string,
    customerId: row.customer_id as string,
    groupId: row.group_id as string | null,
    productName: row.product_name as string,
    createdAt: row.created_at as string,
    source: (row.source as 'crm' | 'erp' | null) ?? 'erp',
    externalId: (row.external_id as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    billDate: (row.bill_date as string | null) ?? null,
    amount: (row.amount as number | null) ?? null,
    currency: (row.currency as string | null) ?? null,
    companyName: customers?.company_name ?? null,
    customerCode: customers?.customer_code ?? null,
    groupName: groups?.name ?? null,
  }
}

/** Options for paginated CRM order list. */
export interface ListCrmOrdersOptions {
  page: number
  pageSize?: number
  searchQuery?: string
  /** System-admin-only group filter; null means all groups. */
  filterGroupId?: string | null
  isSystemAdmin?: boolean
}

/**
 * Loads a page of ERP-mirrored orders visible to the current user.
 * @param options - Pagination, search, and optional group filter.
 * @returns Rows and total count.
 */
export async function listCrmOrders(
  options: ListCrmOrdersOptions,
): Promise<OrdersListResult<Order>> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const pageSize = options.pageSize ?? ORDERS_PAGE_SIZE
  const page = Math.max(1, options.page)
  let query = supabase
    .from('orders')
    .select(ORDER_LIST_SELECT, { count: 'exact' })
    .eq('source', 'erp')
    .order('created_at', { ascending: false })

  if (options.isSystemAdmin && options.filterGroupId) {
    query = query.eq('group_id', options.filterGroupId)
  }

  const q = options.searchQuery?.trim() ?? ''
  if (q) {
    const orFilter = await buildOrderListSearchFilter(supabase, q)
    if (orFilter) {
      query = query.or(orFilter)
    }
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query
  if (error) throw error

  return {
    rows: (data ?? []).map((row) => mapOrderRow(row as Record<string, unknown>)),
    totalCount: count ?? 0,
  }
}

/**
 * Fetches a single ERP order index row by id.
 * @param id - Order UUID.
 * @returns The order or null if not found.
 */
export async function getCrmOrderById(id: string): Promise<Order | null> {
  if (!isSupabaseConfigured || !supabase) return null
  const trimmed = id.trim()
  if (!trimmed) return null

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_LIST_SELECT)
    .eq('id', trimmed)
    .eq('source', 'erp')
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapOrderRow(data as Record<string, unknown>)
}

/**
 * Lists ERP orders for one customer (newest first).
 * @param customerId - CRM customer UUID.
 * @param limit - Max rows (default 50).
 * @returns Orders for that customer.
 */
export async function listCrmOrdersByCustomer(
  customerId: string,
  limit = 50,
): Promise<Order[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_LIST_SELECT)
    .eq('source', 'erp')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => mapOrderRow(row as Record<string, unknown>))
}
