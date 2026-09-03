/** Supabase CRUD for T&E homepage partner departments. */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export interface TePartnerDepartment {
  id: string
  name: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Map one database row to the Electron model.
 * @param row - Typed Supabase row.
 * @returns Partner department model.
 */
function mapPartnerDepartment(row: {
  id: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}): TePartnerDepartment {
  return {
    id: row.id,
    name: row.name.trim(),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * List every partner department in case-insensitive English order.
 * @returns All partner departments.
 */
export async function listTePartnerDepartments(): Promise<TePartnerDepartment[]> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await supabase.from('te_partner_departments').select('*')
  if (error) throw error
  return (data ?? [])
    .map(mapPartnerDepartment)
    .sort((a, b) => a.name.localeCompare(b.name, 'en-US', { sensitivity: 'base' }))
}

/**
 * Create an active partner department.
 * @param name - Department display name.
 * @returns Created department.
 */
export async function createTePartnerDepartment(name: string): Promise<TePartnerDepartment> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { data, error } = await supabase
    .from('te_partner_departments')
    .insert({ name: name.trim(), is_active: true })
    .select('*')
    .single()
  if (error) throw error
  return mapPartnerDepartment(data)
}

/**
 * Update a partner department name or active state.
 * @param id - Department row id.
 * @param updates - Fields to update.
 * @returns Updated department.
 */
export async function updateTePartnerDepartment(
  id: string,
  updates: { name?: string; isActive?: boolean },
): Promise<TePartnerDepartment> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const payload: { name?: string; is_active?: boolean } = {}
  if (updates.name !== undefined) payload.name = updates.name.trim()
  if (updates.isActive !== undefined) payload.is_active = updates.isActive
  const { data, error } = await supabase
    .from('te_partner_departments')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return mapPartnerDepartment(data)
}

/**
 * Delete a partner department.
 * @param id - Department row id.
 * @returns Nothing.
 */
export async function deleteTePartnerDepartment(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }
  const { error } = await supabase.from('te_partner_departments').delete().eq('id', id)
  if (error) throw error
}
