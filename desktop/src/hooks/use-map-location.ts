/**
 * Geolocation helpers for the Electron map page (Vue useLocation parity).
 */

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Coordinates } from '@/types/chat'

export interface UseMapLocationReturn {
  location: Coordinates | undefined
  locationError: string | null
  /**
   * Requests the system geolocation permission / fix.
   *
   * @param options - Optional forceRefresh (bypass cached position)
   * @returns Resolved coordinates, or null on failure / unsupported
   */
  handleLocate: (options?: { forceRefresh?: boolean }) => Promise<Coordinates | null>
  handleMapLocationUpdate: (coords: Coordinates) => void
}

/**
 * Tracks user / search-center coordinates and geolocation errors.
 *
 * @returns Location state and locate handlers
 */
export function useMapLocation(): UseMapLocationReturn {
  const { t } = useTranslation()
  const [location, setLocation] = useState<Coordinates | undefined>(undefined)
  const [locationError, setLocationError] = useState<string | null>(null)

  const handleMapLocationUpdate = useCallback((coords: Coordinates) => {
    setLocation(coords)
    setLocationError(null)
  }, [])

  const handleLocate = useCallback(
    (options?: { forceRefresh?: boolean }): Promise<Coordinates | null> => {
      if (!navigator.geolocation) {
        setLocationError(t('chat.location.notSupported'))
        return Promise.resolve(null)
      }

      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords: Coordinates = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }
            setLocation(coords)
            setLocationError(null)
            resolve(coords)
          },
          (err) => {
            if (err.code === err.TIMEOUT) {
              setLocationError(t('chat.location.timeout'))
            } else {
              setLocationError(t('chat.location.unableToRetrieve'))
            }
            resolve(null)
          },
          {
            enableHighAccuracy: true,
            timeout: 15_000,
            maximumAge: options?.forceRefresh ? 0 : 60_000,
          },
        )
      })
    },
    [t],
  )

  return { location, locationError, handleLocate, handleMapLocationUpdate }
}
