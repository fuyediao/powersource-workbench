import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import type { TeOrder, TeOrderTrackingStatus } from '@/types/orders'

/** Current local logistics columns selected from `te_orders`. */
export const TE_ORDER_SELECT = '*'

/**
 * Normalize a carrier status from a local order row.
 *
 * @param value - Raw `tracking_status` value
 * @returns A supported tracking status or null
 */
function normalizeTrackingStatus(value: unknown): TeOrderTrackingStatus | null {
  if (value === 'pending' || value === 'in_transit' || value === 'delivered') return value
  return null
}

/**
 * Map a raw Supabase `te_orders` row to {@link TeOrder}.
 *
 * @param row - Supabase row
 * @returns Typed T&E order
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

/**
 * Load the single local order linked to one T&E submission (`te_submission_id`).
 *
 * @param submissionId - `te_submissions.id`
 * @returns The order, or null when none exists or Supabase is off
 */
export async function fetchTeOrderBySubmissionId(
  submissionId: string,
): Promise<TeOrder | null> {
  if (!isSupabaseConfigured || !supabase || !submissionId.trim()) return null
  const { data, error } = await fromLoose('te_orders')
    .select(TE_ORDER_SELECT)
    .eq('te_submission_id', submissionId)
    .maybeSingle()
  if (error) {
    console.error('fetchTeOrderBySubmissionId error:', error)
    return null
  }
  return data ? mapTeOrderFromRow(data) : null
}
