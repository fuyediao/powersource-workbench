/**
 * Supabase reads for customer_activity_logs.
 */

import { fromLoose } from '@/lib/supabase-loose'
import type { CustomerActivityLog } from '@/types/customer'

/**
 * Maps a raw row to CustomerActivityLog.
 * @param row - Supabase row.
 * @returns Activity log.
 */
function mapRow(row: Record<string, unknown>): CustomerActivityLog {
  const changedFieldsRaw = row.changed_fields
  const changedFields =
    typeof changedFieldsRaw === 'object' && changedFieldsRaw !== null
      ? (changedFieldsRaw as Record<string, { old: unknown; new: unknown }>)
      : {}
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    groupId: (row.group_id as string | null) ?? null,
    actorUserId: (row.actor_user_id as string | null) ?? null,
    actorEmail: (row.actor_email as string | null) ?? null,
    entityType: row.entity_type as CustomerActivityLog['entityType'],
    entityId: (row.entity_id as string | null) ?? null,
    action: row.action as CustomerActivityLog['action'],
    summary: String(row.summary ?? ''),
    changedFields,
    createdAt: String(row.created_at ?? ''),
  }
}

/**
 * Lists activity logs for a customer (newest first).
 * @param customerId - Parent customer id.
 * @returns Activity rows.
 */
export async function listCustomerActivityLogs(
  customerId: string,
): Promise<CustomerActivityLog[]> {
  const { data, error } = await fromLoose('customer_activity_logs')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[customer-activity-logs-api] list:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row))
}
