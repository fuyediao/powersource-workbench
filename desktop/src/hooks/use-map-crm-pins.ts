/**
 * Loads Map CRM layer pins (customer / competitor) for the active source + group.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  fetchCompetitorShopsForMap,
  fetchCustomersForMap,
} from '@/services/map-crm-api'
import type { MapSidebarSource } from '@/hooks/use-map-scope'
import type { ShopLocation } from '@/types/chat'
import {
  competitorMapPinColor,
  customerMapPinColor,
  formatCompetitorMapAddress,
  type CompetitorMapPoint,
  type CustomerMapPoint,
} from '@/types/map-crm'

export interface UseMapCrmPinsReturn {
  pins: ShopLocation[]
  isLoading: boolean
  errorKey: string | null
  refresh: () => Promise<void>
}

/**
 * Maps a customer point to a ShopLocation pin.
 * @param point - Customer map point.
 * @returns Shop location for Leaflet / sidebar.
 */
function customerToShop(point: CustomerMapPoint): ShopLocation {
  return {
    id: point.id,
    name: point.companyName,
    latitude: point.lat,
    longitude: point.lng,
    address: point.address ?? undefined,
    country: point.companyCountry,
    stateProvince: point.companyState,
    description: [point.contactName, point.phone, point.email].filter(Boolean).join(' · ') || undefined,
    tags: point.customerLevel ? [point.customerLevel] : undefined,
    pinColor: customerMapPinColor(point.customerLevel),
  }
}

/**
 * Maps a competitor point to a ShopLocation pin.
 * @param point - Competitor map point.
 * @returns Shop location for Leaflet / sidebar.
 */
function competitorToShop(point: CompetitorMapPoint): ShopLocation {
  return {
    id: point.id,
    name: point.storeName,
    latitude: point.latitude,
    longitude: point.longitude,
    address: formatCompetitorMapAddress(point) || undefined,
    country: point.country,
    stateProvince: point.stateProvince,
    city: point.city,
    addressLine1: point.addressLine1,
    tags: point.importanceLevel ? [point.importanceLevel] : undefined,
    pinColor: competitorMapPinColor(point.importanceLevel),
  }
}

/**
 * Loads pins when Map source is customer or competitor map.
 * @param source - Active map menubar source.
 * @param groupId - Admin group filter (null = all); members pass membership id.
 * @returns Pin list and load state.
 */
export function useMapCrmPins(
  source: MapSidebarSource,
  groupId: string | null,
): UseMapCrmPinsReturn {
  const [pins, setPins] = useState<ShopLocation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (source !== 'customer_map' && source !== 'competitor_map') {
      setPins([])
      setErrorKey(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setErrorKey(null)
    try {
      if (source === 'customer_map') {
        const rows = await fetchCustomersForMap(groupId)
        setPins(rows.map(customerToShop))
      } else {
        const rows = await fetchCompetitorShopsForMap(groupId)
        setPins(rows.map(competitorToShop))
      }
    } catch {
      setPins([])
      setErrorKey(
        source === 'customer_map'
          ? 'map.menubar.customerLoadError'
          : 'map.menubar.competitorLoadError',
      )
    } finally {
      setIsLoading(false)
    }
  }, [groupId, source])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { pins, isLoading, errorKey, refresh }
}
