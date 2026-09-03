import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchPlaceName,
  fetchWeather,
  type PlaceSearchHitDto,
  type WeatherDto,
} from '@/utils/shared/api'
import {
  fetchWeatherLocationSettings,
  saveWeatherLocationSettings,
  type WeatherLocationSource,
} from '@/utils/home/library-api'

const WEATHER_POLL_MS = 10 * 60_000

export type WeatherPermission = 'prompt' | 'granted' | 'denied' | 'unsupported'

export interface WeatherState {
  permission: WeatherPermission
  weather: WeatherDto | null
  /** Reverse-geocoded or manually chosen city / region label. */
  place: string | null
  /** Whether a saved or live coordinate is active. */
  hasLocation: boolean
  /** How the active location was chosen. */
  source: WeatherLocationSource | null
  loading: boolean
  requesting: boolean
  /** False until the initial location bootstrap finishes. */
  ready: boolean
  /** Requests device geolocation and persists it. */
  requestLocation: () => void
  /** Applies a city-search hit and persists it. */
  selectPlace: (hit: PlaceSearchHitDto) => void
  /** Clears the saved location and weather. */
  clearLocation: () => void
}

interface Coords {
  latitude: number
  longitude: number
}

/**
 * Maps a WMO weather code to a coarse condition key for i18n.
 * @param code - Open-Meteo / WMO weather code.
 * @returns Condition key under `weather.condition.*`.
 */
export function weatherConditionKey(code: number): string {
  if (code === 0) {
    return 'clear'
  }
  if (code <= 3) {
    return 'cloudy'
  }
  if (code === 45 || code === 48) {
    return 'fog'
  }
  if (code >= 51 && code <= 67) {
    return 'rain'
  }
  if (code >= 71 && code <= 77) {
    return 'snow'
  }
  if (code >= 80 && code <= 82) {
    return 'showers'
  }
  if (code >= 85 && code <= 86) {
    return 'snowShowers'
  }
  if (code >= 95) {
    return 'thunder'
  }
  return 'cloudy'
}

/**
 * Reads the browser geolocation permission when the Permissions API is available.
 * @returns Permission state, or null when it cannot be queried.
 */
async function queryGeolocationPermission(): Promise<WeatherPermission | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return 'unsupported'
  }
  if (!navigator.permissions?.query) {
    return null
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' })
    if (status.state === 'granted') {
      return 'granted'
    }
    if (status.state === 'denied') {
      return 'denied'
    }
    return 'prompt'
  } catch {
    return null
  }
}

/**
 * Formats a place label from a geocoding hit.
 * @param hit - Search hit.
 * @returns Display label.
 */
function labelFromHit(hit: PlaceSearchHitDto): string {
  if (hit.detail) {
    return `${hit.name}, ${hit.detail}`
  }
  return hit.name
}

/**
 * Loads weather for a chosen or device location; persists to Supabase when signed in.
 * @param userId - Signed-in user id.
 * @returns Weather data, place name, permission state, and location helpers.
 */
export function useWeather(userId: string): WeatherState {
  const { i18n } = useTranslation()
  const [permission, setPermission] = useState<WeatherPermission>('prompt')
  const [weather, setWeather] = useState<WeatherDto | null>(null)
  const [place, setPlace] = useState<string | null>(null)
  const [source, setSource] = useState<WeatherLocationSource | null>(null)
  const [hasLocation, setHasLocation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [ready, setReady] = useState(false)
  const coordsRef = useRef<Coords | null>(null)
  const activeRef = useRef(true)
  const languageRef = useRef(i18n.language)
  const userIdRef = useRef(userId)
  const requestLocationRef = useRef<() => void>(() => {})

  useEffect(() => {
    languageRef.current = i18n.language
  }, [i18n.language])

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  /**
   * Persists the active location to Supabase.
   * @param next - Coordinates, place label, and source.
   * @returns Nothing.
   */
  const persistLocation = useCallback(
    (next: {
      latitude: number
      longitude: number
      place: string | null
      source: WeatherLocationSource
    }): void => {
      void saveWeatherLocationSettings(userIdRef.current, next).catch(() => {
        // Keep in-memory location on save failure.
      })
    },
    [],
  )

  /**
   * Applies coordinates locally and loads weather.
   * @param latitude - Degrees north.
   * @param longitude - Degrees east.
   * @param nextPlace - Optional display label (manual picks).
   * @param nextSource - How the location was chosen.
   * @param reverseGeocode - Whether to refresh the place label from coords.
   * @returns Nothing.
   */
  const applyCoords = useCallback(
    (
      latitude: number,
      longitude: number,
      nextPlace: string | null,
      nextSource: WeatherLocationSource,
      reverseGeocode: boolean,
    ): void => {
      coordsRef.current = { latitude, longitude }
      setHasLocation(true)
      setSource(nextSource)
      if (nextPlace) {
        setPlace(nextPlace)
      }
      setLoading(true)
      void fetchWeather(latitude, longitude)
        .then((next) => {
          if (activeRef.current) {
            setWeather(next)
          }
        })
        .catch(() => {
          if (activeRef.current) {
            setWeather(null)
          }
        })
        .finally(() => {
          if (activeRef.current) {
            setLoading(false)
          }
        })
      if (reverseGeocode) {
        void fetchPlaceName(latitude, longitude, languageRef.current)
          .then((resolved) => {
            if (!activeRef.current) {
              return
            }
            const label = resolved || nextPlace
            setPlace(label)
            persistLocation({
              latitude,
              longitude,
              place: label,
              source: nextSource,
            })
          })
          .catch(() => {
            if (!activeRef.current) {
              return
            }
            persistLocation({
              latitude,
              longitude,
              place: nextPlace,
              source: nextSource,
            })
          })
      } else {
        persistLocation({
          latitude,
          longitude,
          place: nextPlace,
          source: nextSource,
        })
      }
    },
    [persistLocation],
  )

  /**
   * Fetches weather for the last known coordinates.
   * @returns Nothing.
   */
  const refreshWeather = useCallback((): void => {
    const coords = coordsRef.current
    if (!coords) {
      return
    }
    setLoading(true)
    void fetchWeather(coords.latitude, coords.longitude)
      .then((next) => {
        if (activeRef.current) {
          setWeather(next)
        }
      })
      .catch(() => {
        if (activeRef.current) {
          setWeather(null)
        }
      })
      .finally(() => {
        if (activeRef.current) {
          setLoading(false)
        }
      })
  }, [])

  /**
   * Resolves a place label for the last known coordinates (geo source only).
   * @returns Nothing.
   */
  const refreshPlace = useCallback((): void => {
    const coords = coordsRef.current
    if (!coords || source === 'manual') {
      return
    }
    void fetchPlaceName(coords.latitude, coords.longitude, languageRef.current)
      .then((next) => {
        if (activeRef.current) {
          setPlace(next)
          if (next) {
            persistLocation({
              latitude: coords.latitude,
              longitude: coords.longitude,
              place: next,
              source: 'geo',
            })
          }
        }
      })
      .catch(() => {
        // Keep existing place label.
      })
  }, [persistLocation, source])

  /**
   * Asks the browser for the current position, then loads and persists weather.
   * @returns Nothing.
   */
  const requestLocation = useCallback((): void => {
    if (!navigator.geolocation) {
      setPermission('unsupported')
      return
    }
    setRequesting(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!activeRef.current) {
          return
        }
        setPermission('granted')
        setRequesting(false)
        applyCoords(
          position.coords.latitude,
          position.coords.longitude,
          null,
          'geo',
          true,
        )
      },
      (error) => {
        if (!activeRef.current) {
          return
        }
        setRequesting(false)
        if (!coordsRef.current) {
          setWeather(null)
          setPlace(null)
          setHasLocation(false)
          setSource(null)
        }
        setPermission(error.code === error.PERMISSION_DENIED ? 'denied' : 'prompt')
      },
      {
        enableHighAccuracy: false,
        timeout: 12_000,
        maximumAge: WEATHER_POLL_MS,
      },
    )
  }, [applyCoords])

  useEffect(() => {
    requestLocationRef.current = requestLocation
  }, [requestLocation])

  /**
   * Selects a city from search and persists it.
   * @param hit - Geocoding search hit.
   * @returns Nothing.
   */
  const selectPlace = useCallback(
    (hit: PlaceSearchHitDto): void => {
      applyCoords(hit.latitude, hit.longitude, labelFromHit(hit), 'manual', false)
    },
    [applyCoords],
  )

  /**
   * Clears the saved location and in-memory weather.
   * @returns Nothing.
   */
  const clearLocation = useCallback((): void => {
    coordsRef.current = null
    setWeather(null)
    setPlace(null)
    setSource(null)
    setHasLocation(false)
    setLoading(false)
    void saveWeatherLocationSettings(userIdRef.current, {
      latitude: null,
      longitude: null,
      place: null,
      source: null,
    }).catch(() => {
      // Ignore clear failures.
    })
  }, [])

  useEffect(() => {
    activeRef.current = true
    let cancelled = false

    /**
     * Bootstraps from Supabase, then falls back to browser geo permission.
     * @returns Nothing.
     */
    async function bootstrap(): Promise<void> {
      try {
        const saved = await fetchWeatherLocationSettings(userId)
        if (cancelled || !activeRef.current) {
          return
        }
        if (
          typeof saved.latitude === 'number' &&
          typeof saved.longitude === 'number' &&
          saved.source
        ) {
          coordsRef.current = {
            latitude: saved.latitude,
            longitude: saved.longitude,
          }
          setHasLocation(true)
          setSource(saved.source)
          setPlace(saved.place)
          setPermission(saved.source === 'geo' ? 'granted' : 'prompt')
          setReady(true)
          setLoading(true)
          void fetchWeather(saved.latitude, saved.longitude)
            .then((next) => {
              if (activeRef.current) {
                setWeather(next)
              }
            })
            .catch(() => {
              if (activeRef.current) {
                setWeather(null)
              }
            })
            .finally(() => {
              if (activeRef.current) {
                setLoading(false)
              }
            })
          return
        }
      } catch {
        // Fall through to permission-based bootstrap.
      }

      if (cancelled || !activeRef.current) {
        return
      }

      const state = await queryGeolocationPermission()
      if (cancelled || !activeRef.current) {
        return
      }
      if (state === 'unsupported') {
        setPermission('unsupported')
        setReady(true)
        return
      }
      if (state === 'granted') {
        setPermission('granted')
        setReady(true)
        requestLocationRef.current()
        return
      }
      if (state === 'denied') {
        setPermission('denied')
        setReady(true)
        return
      }
      setPermission('prompt')
      setReady(true)
    }

    void bootstrap()

    return () => {
      cancelled = true
      activeRef.current = false
    }
  }, [userId])

  useEffect(() => {
    if (!hasLocation || !coordsRef.current) {
      return
    }
    const intervalId = window.setInterval(refreshWeather, WEATHER_POLL_MS)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [hasLocation, refreshWeather])

  useEffect(() => {
    if (!hasLocation || source !== 'geo' || !coordsRef.current) {
      return
    }
    refreshPlace()
  }, [hasLocation, i18n.language, refreshPlace, source])

  return {
    permission,
    weather,
    place,
    hasLocation,
    source,
    loading,
    requesting,
    ready,
    requestLocation,
    selectPlace,
    clearLocation,
  }
}
