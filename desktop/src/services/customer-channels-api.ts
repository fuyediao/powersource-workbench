/**
 * Supabase CRUD for customer_channels.
 */

import { fromLoose } from '@/lib/supabase-loose'
import type { CustomerChannel, CustomerChannelInput } from '@/types/customer'

/**
 * Maps a raw row to CustomerChannel.
 * @param row - Supabase row.
 * @returns Channel.
 */
function mapRow(row: Record<string, unknown>): CustomerChannel {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    groupId: (row.group_id as string | null) ?? null,
    platformKey: String(row.platform_key ?? ''),
    platformCustomName: (row.platform_custom_name as string | null) ?? null,
    channelUrl: String(row.channel_url ?? ''),
    notes: (row.notes as string | null) ?? null,
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
 * Lists channels for a customer.
 * @param customerId - Parent customer id.
 * @returns Channels ordered by created_at.
 */
export async function listCustomerChannels(
  customerId: string,
): Promise<CustomerChannel[]> {
  const { data, error } = await fromLoose('customer_channels')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    console.error('[customer-channels-api] list:', error)
    throw error
  }
  return (data ?? []).map((row: Record<string, unknown>) => mapRow(row))
}

/**
 * Creates a channel under a customer.
 * @param customerId - Parent customer id.
 * @param groupId - Workspace group id.
 * @param input - Channel fields.
 * @returns Created channel.
 */
export async function createCustomerChannel(
  customerId: string,
  groupId: string | null,
  input: CustomerChannelInput,
): Promise<CustomerChannel> {
  const url = input.channelUrl.trim()
  if (!url) {
    throw new Error('channel_url_required')
  }
  const { data, error } = await fromLoose('customer_channels')
    .insert({
      customer_id: customerId,
      group_id: groupId,
      platform_key: input.platformKey.trim(),
      platform_custom_name: emptyToNull(input.platformCustomName),
      channel_url: url,
      notes: emptyToNull(input.notes),
    })
    .select('*')
    .single()
  if (error || !data) {
    console.error('[customer-channels-api] create:', error)
    throw error ?? new Error('create_failed')
  }
  return mapRow(data)
}

/**
 * Updates a channel by id.
 * @param id - Channel id.
 * @param input - Channel fields.
 * @returns Updated channel.
 */
export async function updateCustomerChannel(
  id: string,
  input: CustomerChannelInput,
): Promise<CustomerChannel> {
  const url = input.channelUrl.trim()
  if (!url) {
    throw new Error('channel_url_required')
  }
  const { data, error } = await fromLoose('customer_channels')
    .update({
      platform_key: input.platformKey.trim(),
      platform_custom_name: emptyToNull(input.platformCustomName),
      channel_url: url,
      notes: emptyToNull(input.notes),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) {
    console.error('[customer-channels-api] update:', error)
    throw error ?? new Error('update_failed')
  }
  return mapRow(data)
}

/**
 * Deletes a channel by id.
 * @param id - Channel id.
 * @returns Nothing.
 */
export async function deleteCustomerChannel(id: string): Promise<void> {
  const { error } = await fromLoose('customer_channels').delete().eq('id', id)
  if (error) {
    console.error('[customer-channels-api] delete:', error)
    throw error
  }
}
