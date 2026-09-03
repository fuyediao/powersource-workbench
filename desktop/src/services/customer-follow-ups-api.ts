/**
 * Follow-ups linked to a CRM customer (direct + via lead / opportunity).
 * Thin wrapper over the shared follow-ups API.
 */

import {
  fetchFollowUpsLinkedToCustomer,
  toCustomerFollowUp,
} from '@/services/follow-ups-api'
import type { CustomerFollowUp } from '@/types/customer'

/**
 * Loads follow-ups linked to a customer (direct, lead, or opportunity).
 * @param customerId - customers.id.
 * @returns Deduped follow-ups sorted by scheduled_at ascending.
 */
export async function listFollowUpsForCustomer(
  customerId: string,
): Promise<CustomerFollowUp[]> {
  const list = await fetchFollowUpsLinkedToCustomer(customerId)
  return list.map(toCustomerFollowUp)
}
