/**
 * Supabase loaders for Map CRM layers (customer + competitor pins).
 */

import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { CompetitorMapPoint, CustomerMapPoint } from '@/types/map-crm'

/**
 * True when lat/lng are finite and in range.
 * @param lat - Latitude.
 * @param lng - Longitude.
 * @returns Whether the point can be placed on a map.
 */
function hasValidCoords(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Loads geo-located customers (RLS + optional group filter).
 * @param groupId - When set, restrict to this `group_id` (admin picker).
 * @returns Customer map points with valid coordinates.
 */
export async function fetchCustomersForMap(
  groupId?: string | null,
): Promise<CustomerMapPoint[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  let query = supabase
    .from('customers')
    .select(
      'id, company_name, contact_name, phone, email, address, company_country, company_state, customer_level, latitude, longitude',
    )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('created_at', { ascending: false })

  if (groupId) {
    query = query.eq('group_id', groupId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[map-crm-api] fetchCustomersForMap:', error)
    throw error
  }

  const points: CustomerMapPoint[] = []
  for (const row of data ?? []) {
    const lat = row.latitude != null ? Number(row.latitude) : NaN
    const lng = row.longitude != null ? Number(row.longitude) : NaN
    if (!hasValidCoords(lat, lng)) {
      continue
    }
    points.push({
      id: row.id,
      companyName: row.company_name,
      contactName: row.contact_name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      address: row.address ?? null,
      companyCountry: row.company_country ?? null,
      companyState: row.company_state ?? null,
      customerLevel: row.customer_level ?? null,
      lat,
      lng,
    })
  }
  return points
}

/**
 * Loads geo-located competitor shops (RLS + optional group filter).
 * @param groupId - When set, restrict to this `group_id` (admin picker or membership).
 * @returns Competitor map points with valid coordinates.
 */
export async function fetchCompetitorShopsForMap(
  groupId?: string | null,
): Promise<CompetitorMapPoint[]> {
  if (!isSupabaseConfigured || !supabase) {
    return []
  }

  let query = supabase
    .from('competitor_shops')
    .select(
      'id, store_name, country, state_province, city, address_line1, latitude, longitude, importance_level',
    )
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('created_at', { ascending: false })

  if (groupId) {
    query = query.eq('group_id', groupId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[map-crm-api] fetchCompetitorShopsForMap:', error)
    throw error
  }

  const points: CompetitorMapPoint[] = []
  for (const row of data ?? []) {
    const lat = row.latitude != null ? Number(row.latitude) : NaN
    const lng = row.longitude != null ? Number(row.longitude) : NaN
    if (!hasValidCoords(lat, lng)) {
      continue
    }
    const importance = row.importance_level
    const importanceLevel =
      importance === 'low' || importance === 'medium' || importance === 'high'
        ? importance
        : null
    points.push({
      id: row.id,
      storeName: row.store_name,
      country: row.country ?? null,
      stateProvince: row.state_province ?? null,
      city: row.city ?? null,
      addressLine1: row.address_line1 ?? null,
      latitude: lat,
      longitude: lng,
      importanceLevel,
    })
  }
  return points
}
