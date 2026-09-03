/**
 * Customer / competitor map pin projections for Electron Map CRM sources.
 */

import { getCustomerLevelPinColor } from '@/constants/customer-levels'

/** Customer row fields needed for the customer map. */
export interface CustomerMapPoint {
  id: string
  companyName: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  companyCountry: string | null
  companyState: string | null
  customerLevel: string | null
  lat: number
  lng: number
}

/** Competitor shop fields needed for the competitor map. */
export interface CompetitorMapPoint {
  id: string
  storeName: string
  country: string | null
  stateProvince: string | null
  city: string | null
  addressLine1: string | null
  latitude: number
  longitude: number
  importanceLevel: 'low' | 'medium' | 'high' | null
}

const COMPETITOR_IMPORTANCE_PIN_COLOR: Record<'low' | 'medium' | 'high', string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#ef4444',
}

/**
 * Pin color for a customer level slug.
 * @param level - Customer level or null.
 * @returns Hex color.
 */
export function customerMapPinColor(level: string | null | undefined): string {
  return getCustomerLevelPinColor(level)
}

/**
 * Pin color for a competitor importance level.
 * @param level - Importance or null.
 * @returns Hex color.
 */
export function competitorMapPinColor(
  level: CompetitorMapPoint['importanceLevel'],
): string {
  if (!level) {
    return '#6b7280'
  }
  return COMPETITOR_IMPORTANCE_PIN_COLOR[level]
}

/**
 * Formats a competitor address for list / popup display.
 * @param point - Competitor map point.
 * @returns Single-line address or empty string.
 */
export function formatCompetitorMapAddress(point: CompetitorMapPoint): string {
  return [point.addressLine1, point.city, point.stateProvince, point.country]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(', ')
}
