/**
 * Supabase CRUD for customer_addresses.
 */

import { fromLoose } from '@/lib/supabase-loose'
import type {
  CustomerAddress,
  CustomerAddressInput,
  CustomerAddressType,
} from '@/types/customer'

/**
 * Maps a raw row to CustomerAddress.
 * @param row - Supabase row.
 * @returns Address.
 */
function mapRow(row: Record<string, unknown>): CustomerAddress {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    groupId: (row.group_id as string | null) ?? null,
    addressType: (row.address_type as CustomerAddressType) ?? 'billing',
    country: (row.country as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    state: (row.state as string | null) ?? null,
    postalCode: (row.postal_code as string | null) ?? null,
    district: (row.district as string | null) ?? null,
    line1: (row.line1 as string | null) ?? null,
    line2: (row.line2 as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  }
}

/**
 * Trims empty strings to null.
 * @param value - Optional string.
 * @returns Trimmed or null.
 */
function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Lists addresses for a customer.
 * @param customerId - Parent customer id.
 * @returns Addresses ordered by created_at.
 */
export async function listCustomerAddresses(
  customerId: string,
): Promise<CustomerAddress[]> {
  const { data, error } = await fromLoose('customer_addresses')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    console.error('[customer-addresses-api] list:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row))
}

/**
 * Creates an address under a customer.
 * @param customerId - Parent customer id.
 * @param groupId - Workspace group id.
 * @param input - Address fields.
 * @returns Created address.
 */
export async function createCustomerAddress(
  customerId: string,
  groupId: string | null,
  input: CustomerAddressInput,
): Promise<CustomerAddress> {
  const { data, error } = await fromLoose('customer_addresses')
    .insert({
      customer_id: customerId,
      group_id: groupId,
      address_type: input.addressType,
      country: emptyToNull(input.country),
      city: emptyToNull(input.city),
      state: emptyToNull(input.state),
      postal_code: emptyToNull(input.postalCode),
      district: emptyToNull(input.district),
      line1: emptyToNull(input.line1),
      line2: emptyToNull(input.line2),
    })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[customer-addresses-api] create:', error)
    throw error ?? new Error('create_failed')
  }
  return mapRow(data)
}

/**
 * Updates an address by id.
 * @param id - Address id.
 * @param input - Address fields.
 * @returns Updated address.
 */
export async function updateCustomerAddress(
  id: string,
  input: CustomerAddressInput,
): Promise<CustomerAddress> {
  const { data, error } = await fromLoose('customer_addresses')
    .update({
      address_type: input.addressType,
      country: emptyToNull(input.country),
      city: emptyToNull(input.city),
      state: emptyToNull(input.state),
      postal_code: emptyToNull(input.postalCode),
      district: emptyToNull(input.district),
      line1: emptyToNull(input.line1),
      line2: emptyToNull(input.line2),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    console.error('[customer-addresses-api] update:', error)
    throw error ?? new Error('update_failed')
  }
  return mapRow(data)
}

/**
 * Deletes an address by id.
 * @param id - Address id.
 * @returns Nothing.
 */
export async function deleteCustomerAddress(id: string): Promise<void> {
  const { error } = await fromLoose('customer_addresses').delete().eq('id', id)
  if (error) {
    console.error('[customer-addresses-api] delete:', error)
    throw error
  }
}
