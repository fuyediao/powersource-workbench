/**
 * Customer code uniqueness checks against Supabase.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Postgres / PostgREST error shape for unique violations. */
export interface PgErrorLike {
  code?: string
  message?: string
  details?: string
}

/**
 * True when `err` is a unique constraint violation on `customers.customer_code`.
 * @param err - Supabase or Postgres error object.
 * @returns Whether the error is a customer_code unique violation.
 */
export function isCustomerCodeUniqueViolation(err: PgErrorLike | null | undefined): boolean {
  if (!err || err.code !== '23505') {
    return false
  }
  const haystack = `${err.message ?? ''} ${err.details ?? ''}`.toLowerCase()
  return haystack.includes('customer_code') || haystack.includes('customers_customer_code_key')
}

/**
 * Checks whether `customer_code` is available (trimmed exact match per DB UNIQUE).
 * @param code - Candidate customer code.
 * @param excludeCustomerId - Current row id when editing.
 * @returns True when no other customer uses this code.
 */
export async function isCustomerCodeAvailable(
  code: string,
  excludeCustomerId?: string | null,
): Promise<boolean> {
  const trimmed = code.trim()
  if (!trimmed || !isSupabaseConfigured || !supabase) {
    return true
  }

  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('customer_code', trimmed)
    .maybeSingle()

  if (error) {
    console.error('[customers-api] isCustomerCodeAvailable:', error)
    return true
  }

  if (!data) {
    return true
  }

  if (excludeCustomerId && data.id === excludeCustomerId) {
    return true
  }

  return false
}

const VISIT_LOG_CUSTOMER_CODE_ATTEMPTS = 8

/**
 * Allocates a unique `customer_code` for visit-log "new customer" creates.
 * Format: `VL-YYYYMMDD-<8 hex>` (letters, digits, and hyphen only).
 *
 * @returns An unused code, or null when allocation failed.
 */
export async function allocateVisitLogCustomerCode(): Promise<string | null> {
  const dateStamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  for (let attempt = 0; attempt < VISIT_LOG_CUSTOMER_CODE_ATTEMPTS; attempt += 1) {
    const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
    const code = `VL-${dateStamp}-${suffix}`
    if (await isCustomerCodeAvailable(code)) {
      return code
    }
  }
  return null
}
