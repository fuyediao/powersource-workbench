import type { SupabaseClient } from '@supabase/supabase-js'

/** Max customer rows resolved for order list search (keeps PostgREST `in` filters bounded). */
const ORDER_SEARCH_CUSTOMER_ID_CAP = 200

/**
 * Sanitize free-text input before building PostgREST ilike / in filters.
 * @param raw - Raw search box value.
 * @returns Safe trimmed term, or empty string when nothing remains.
 */
export function sanitizeOrderSearchTerm(raw: string): string {
  return raw.trim().slice(0, 100).replace(/,/g, ' ').replace(/%/g, '').replace(/_/g, '')
}

/**
 * Resolve customer IDs whose code or company name matches the search term.
 * @param client - Supabase client.
 * @param term - Sanitized search term.
 * @returns Matching customer UUIDs (capped).
 */
export async function resolveOrderSearchCustomerIds(
  client: SupabaseClient,
  term: string,
): Promise<string[]> {
  const pattern = `%${term}%`
  const { data, error } = await client
    .from('customers')
    .select('id')
    .or(`customer_code.ilike.${pattern},company_name.ilike.${pattern}`)
    .limit(ORDER_SEARCH_CUSTOMER_ID_CAP)

  if (error) throw error
  return (data ?? []).map((row) => row.id as string)
}

/**
 * Build a PostgREST `.or()` filter for ERP order list search.
 * @param term - Sanitized search term.
 * @param customerIds - Customer UUIDs from {@link resolveOrderSearchCustomerIds}.
 * @returns Filter string for `.or()`, or null when term is empty.
 */
export function buildOrderListSearchOrFilter(term: string, customerIds: string[]): string | null {
  if (!term) return null
  const pattern = `%${term}%`
  const parts = [`external_id.ilike.${pattern}`]
  if (customerIds.length > 0) {
    parts.push(`customer_id.in.(${customerIds.join(',')})`)
  }
  return parts.join(',')
}

/**
 * Applies order list search: resolves matching customers, then OR-filters orders.
 * @param client - Supabase client.
 * @param rawSearch - Raw search box value.
 * @returns PostgREST `.or()` filter string.
 */
export async function buildOrderListSearchFilter(
  client: SupabaseClient,
  rawSearch: string,
): Promise<string | null> {
  const term = sanitizeOrderSearchTerm(rawSearch)
  if (!term) return null
  const customerIds = await resolveOrderSearchCustomerIds(client, term)
  return buildOrderListSearchOrFilter(term, customerIds)
}
