/**
 * Supabase CRUD for customer_work_items under a customer.
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { CustomerWorkItem, CustomerWorkItemInput } from '@/types/customer'

/**
 * Maps a raw row to CustomerWorkItem.
 * @param row - Supabase row.
 * @returns Work item.
 */
function mapRow(row: Record<string, unknown>): CustomerWorkItem {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    groupId: (row.group_id as string | null) ?? null,
    itemCode: (row.item_code as string | null) ?? null,
    subject: String(row.subject ?? ''),
    dueDate: (row.due_date as string | null) ?? null,
    startAt: (row.start_at as string | null) ?? null,
    expectedEndAt: (row.expected_end_at as string | null) ?? null,
    assigneeName: (row.assignee_name as string | null) ?? null,
    importance: (row.importance as string | null) ?? null,
    completed: Boolean(row.completed),
    remarks: (row.remarks as string | null) ?? null,
    suggestion: (row.suggestion as string | null) ?? null,
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
 * Lists work items for a customer.
 * @param customerId - Parent customer id.
 * @returns Work items.
 */
export async function listCustomerWorkItems(customerId: string): Promise<CustomerWorkItem[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { data, error } = await supabase
    .from('customer_work_items')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    console.error('[customer-work-items-api] list:', error)
    throw error
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>))
}

/**
 * Creates a work item under a customer.
 * @param customerId - Parent customer id.
 * @param groupId - Workspace group id.
 * @param input - Work item fields.
 * @returns Created work item.
 */
export async function createCustomerWorkItem(
  customerId: string,
  groupId: string | null,
  input: CustomerWorkItemInput,
): Promise<CustomerWorkItem> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const subject = input.subject.trim()
  if (!subject) {
    throw new Error('subject_required')
  }

  const { count } = await supabase
    .from('customer_work_items')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
  const seq = ((count ?? 0) + 1).toString().padStart(5, '0')
  const itemCode = `T-${seq}`

  const { data, error } = await supabase
    .from('customer_work_items')
    .insert({
      customer_id: customerId,
      group_id: groupId,
      item_code: itemCode,
      subject,
      due_date: emptyToNull(input.dueDate),
      start_at: emptyToNull(input.startAt),
      expected_end_at: emptyToNull(input.expectedEndAt),
      assignee_name: emptyToNull(input.assigneeName),
      importance: emptyToNull(input.importance) ?? 'medium',
      completed: input.completed ?? false,
      remarks: emptyToNull(input.remarks),
      suggestion: emptyToNull(input.suggestion),
    })
    .select('*')
    .single()
  if (error) {
    console.error('[customer-work-items-api] create:', error)
    throw error
  }
  return mapRow(data as Record<string, unknown>)
}

/**
 * Updates a work item.
 * @param id - Work item id.
 * @param input - Work item fields.
 * @returns Updated work item.
 */
export async function updateCustomerWorkItem(
  id: string,
  input: CustomerWorkItemInput,
): Promise<CustomerWorkItem> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const subject = input.subject.trim()
  if (!subject) {
    throw new Error('subject_required')
  }
  const { data, error } = await supabase
    .from('customer_work_items')
    .update({
      subject,
      due_date: emptyToNull(input.dueDate),
      start_at: emptyToNull(input.startAt),
      expected_end_at: emptyToNull(input.expectedEndAt),
      assignee_name: emptyToNull(input.assigneeName),
      importance: emptyToNull(input.importance) ?? 'medium',
      completed: input.completed ?? false,
      remarks: emptyToNull(input.remarks),
      suggestion: emptyToNull(input.suggestion),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    console.error('[customer-work-items-api] update:', error)
    throw error
  }
  return mapRow(data as Record<string, unknown>)
}

/**
 * Deletes a work item.
 * @param id - Work item id.
 * @returns Nothing.
 */
export async function deleteCustomerWorkItem(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('supabase_not_configured')
  }
  const { error } = await supabase.from('customer_work_items').delete().eq('id', id)
  if (error) {
    console.error('[customer-work-items-api] delete:', error)
    throw error
  }
}
