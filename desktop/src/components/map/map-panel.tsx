/**
 * Leaflet map panel for Electron MapView (Vue MapVisualizer / MapPanel parity).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import type { Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { getPriorityColor } from '@/constants/priority'
import { SearchIcon } from '@/icons/AllIcons'
import type { Coordinates, ShopLocation } from '@/types/chat'
import { shopMarkerKey } from '@/types/chat'
import type { PendingCoordinates } from '@/types/favorite'
import {
  applyLeafletOsmWorldCoverMinZoom,
  createLeafletOsmTileLayer,
  LEAFLET_DEFAULT_MAP_CENTER,
  LEAFLET_DEFAULT_MAP_ZOOM,
  LEAFLET_OSM_WORLD_BOUNDS,
} from '@/utils/map/leaflet-osm-world'

const LOCATE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>'

const SIDEBAR_COLLAPSE_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'

const SIDEBAR_EXPAND_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'

interface ShopMarkerMeta {
  color: string
  lat: number
  lng: number
  name: string
}

/**
 * Creates one Leaflet bar with locate + sidebar toggle stacked under zoom.
 *
 * @param onLocate - Locate click handler
 * @param locateLabel - Locate accessible label
 * @param onToggleSidebar - Sidebar toggle click handler
 * @param sidebarLabel - Sidebar toggle accessible label
 * @param sidebarCollapsed - Whether the sidebar is currently collapsed
 * @returns Leaflet control instance
 */
function createMapToolControls(
  onLocate: () => void,
  locateLabel: string,
  onToggleSidebar: () => void,
  sidebarLabel: string,
  sidebarCollapsed: boolean,
): L.Control {
  const MapToolControls = L.Control.extend({
    options: { position: 'topleft' as const },
    onAdd() {
      const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control')

      const locateBtn = L.DomUtil.create('button', 'leaflet-locate-btn', div) as HTMLButtonElement
      locateBtn.type = 'button'
      locateBtn.title = locateLabel
      locateBtn.setAttribute('aria-label', locateLabel)
      locateBtn.innerHTML = LOCATE_ICON_SVG
      L.DomEvent.disableClickPropagation(locateBtn)
      L.DomEvent.on(locateBtn, 'click', L.DomEvent.stop).on(locateBtn, 'click', onLocate)

      const sidebarBtn = L.DomUtil.create(
        'button',
        'leaflet-sidebar-toggle-btn',
        div,
      ) as HTMLButtonElement
      sidebarBtn.type = 'button'
      sidebarBtn.title = sidebarLabel
      sidebarBtn.setAttribute('aria-label', sidebarLabel)
      sidebarBtn.innerHTML = sidebarCollapsed ? SIDEBAR_EXPAND_ICON_SVG : SIDEBAR_COLLAPSE_ICON_SVG
      L.DomEvent.disableClickPropagation(sidebarBtn)
      L.DomEvent.on(sidebarBtn, 'click', L.DomEvent.stop).on(sidebarBtn, 'click', onToggleSidebar)

      return div
    },
  })
  return new MapToolControls()
}

export interface MapPanelHandle {
  getCurrentView: () => { center: Coordinates; zoom: number } | null
  setMapView: (center: Coordinates, zoom: number) => void
}

interface MapPanelProps {
  shops: ShopLocation[]
  userLocation?: Coordinates
  selectedShops?: string[]
  isAuthenticated?: boolean
  onMarkerClick: (shopName: string) => void
  onLocationUpdate: (location: Coordinates) => void
  onAddLocation: (coords: PendingCoordinates) => void
  onClearSelection: () => void
  /** Request a fresh system geolocation fix (Electron / Chromium permission prompt). */
  onLocateRequest: (options?: { forceRefresh?: boolean }) => Promise<Coordinates | null>
  /** Optional geolocation error message to show near the locate control. */
  locationError?: string | null
  /** Whether the left map sidebar is visible. */
  isSidebarVisible: boolean
  /** Toggle the left map sidebar open / closed. */
  onToggleSidebar: () => void
}

/**
 * Parses "lat, lng" or "lat lng" coordinate strings.
 *
 * @param input - Raw search text
 * @returns Parsed lat/lng or null
 */
function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const cleaned = input.trim().replace(/^[([{]|[)\]}]$/g, '').trim()
  const commaMatch = cleaned.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/)
  if (commaMatch) {
    const lat = Number.parseFloat(commaMatch[1] ?? '')
    const lng = Number.parseFloat(commaMatch[2] ?? '')
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  const spaceMatch = cleaned.match(/^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/)
  if (spaceMatch) {
    const lat = Number.parseFloat(spaceMatch[1] ?? '')
    const lng = Number.parseFloat(spaceMatch[2] ?? '')
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

/**
 * Builds a colored divIcon for a map pin.
 *
 * @param color - Fill color
 * @param selected - Whether the pin is selected
 * @returns Leaflet DivIcon
 */
function makePinIcon(color: string, selected: boolean): L.DivIcon {
  const size = selected ? 28 : 22
  const border = selected ? 3 : 2
  return L.divIcon({
    className: 'workbench-map-pin',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:${border}px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * Cheap fingerprint of the visible shop set for fit-bounds (avoids joining all keys).
 * @param shops - Shop pins currently on the map.
 * @returns Stable-ish signature string, or empty when none.
 */
function shopsFingerprint(shops: ShopLocation[]): string {
  let count = 0
  let hash = 2166136261
  let first = ''
  let last = ''
  for (const shop of shops) {
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue
    }
    const key = shopMarkerKey(shop)
    if (count === 0) {
      first = key
    }
    last = key
    count += 1
    for (let i = 0; i < key.length; i += 1) {
      hash ^= key.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    hash ^= (lat * 1000) | 0
    hash = Math.imul(hash, 16777619)
    hash ^= (lng * 1000) | 0
    hash = Math.imul(hash, 16777619)
  }
  return count === 0 ? '' : `${count}:${hash >>> 0}:${first}:${last}`
}

/**
 * Cluster badge DivIcon sized by child count.
 * @param count - Markers in the cluster.
 * @returns Leaflet DivIcon.
 */
function makeClusterIcon(count: number): L.DivIcon {
  const size = count < 10 ? 36 : count < 100 ? 44 : 52
  return L.divIcon({
    html: `<span class="workbench-map-cluster" style="width:${size}px;height:${size}px">${count}</span>`,
    className: 'workbench-map-cluster-wrap',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

/**
 * Full-bleed Leaflet map with shop markers, search, locate, and add-location context menu.
 */
export const MapPanel = forwardRef<MapPanelHandle, MapPanelProps>(function MapPanel(
  {
    shops,
    userLocation,
    selectedShops = [],
    isAuthenticated = false,
    onMarkerClick,
    onLocationUpdate,
    onAddLocation,
    onClearSelection,
    onLocateRequest,
    locationError = null,
    isSidebarVisible,
    onToggleSidebar,
  },
  ref,
) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null)
  const markersRef = useRef<Record<string, Marker>>({})
  const shopMetaRef = useRef<Record<string, ShopMarkerMeta>>({})
  const selectedKeysRef = useRef<Set<string>>(new Set())
  /** Signature of shops last used for flyToBounds (avoid re-fit on selection-only updates). */
  const lastFittedShopsKeyRef = useRef('')
  const isProgrammaticMove = useRef(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  const locateBtnRef = useRef<HTMLButtonElement | null>(null)
  const sidebarToggleBtnRef = useRef<HTMLButtonElement | null>(null)
  const onLocateClickRef = useRef<() => void>(() => undefined)
  const onToggleSidebarRef = useRef(onToggleSidebar)
  onToggleSidebarRef.current = onToggleSidebar
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    latitude: number
    longitude: number
  } | null>(null)

  const onMarkerClickRef = useRef(onMarkerClick)
  const onLocationUpdateRef = useRef(onLocationUpdate)
  const onAddLocationRef = useRef(onAddLocation)
  const onClearSelectionRef = useRef(onClearSelection)
  const isAuthenticatedRef = useRef(isAuthenticated)
  onMarkerClickRef.current = onMarkerClick
  onLocationUpdateRef.current = onLocationUpdate
  onAddLocationRef.current = onAddLocation
  onClearSelectionRef.current = onClearSelection
  isAuthenticatedRef.current = isAuthenticated

  useImperativeHandle(ref, () => ({
    getCurrentView: () => {
      const map = mapRef.current
      if (!map) return null
      const c = map.getCenter()
      return {
        center: { latitude: c.lat, longitude: c.lng },
        zoom: map.getZoom(),
      }
    },
    setMapView: (center, zoom) => {
      const map = mapRef.current
      if (!map) return
      const lat = Number(center.latitude)
      const lng = Number(center.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      isProgrammaticMove.current = true
      map.flyTo([lat, lng], zoom, { duration: 1.2 })
      window.setTimeout(() => {
        isProgrammaticMove.current = false
      }, 1400)
    },
  }))

  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return

    // React StrictMode remount: clear leftover Leaflet id
    const leafletEl = el as HTMLElement & { _leaflet_id?: number }
    if (leafletEl._leaflet_id) {
      delete leafletEl._leaflet_id
    }

    const initLat = userLocation?.latitude
    const initLng = userLocation?.longitude
    const hasUser =
      initLat != null &&
      initLng != null &&
      Number.isFinite(Number(initLat)) &&
      Number.isFinite(Number(initLng))

    const map = L.map(el, {
      maxBounds: LEAFLET_OSM_WORLD_BOUNDS,
      maxBoundsViscosity: 1,
      worldCopyJump: false,
    }).setView(
      hasUser
        ? [Number(initLat), Number(initLng)]
        : LEAFLET_DEFAULT_MAP_CENTER,
      hasUser ? 14 : LEAFLET_DEFAULT_MAP_ZOOM,
    )

    createLeafletOsmTileLayer().addTo(map)

    applyLeafletOsmWorldCoverMinZoom(map)

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 56,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      /**
       * @param cluster - Cluster layer.
       * @returns Count badge icon.
       */
      iconCreateFunction(cluster) {
        return makeClusterIcon(cluster.getChildCount())
      },
    })
    clusterGroup.addTo(map)
    clusterGroupRef.current = clusterGroup

    const locateLabel = t('map.locate.returnToMyLocation')
    const sidebarToggleLabel = t('chat.favorites.collapse')
    const toolControls = createMapToolControls(
      () => {
        onLocateClickRef.current()
      },
      locateLabel,
      () => {
        onToggleSidebarRef.current()
      },
      sidebarToggleLabel,
      false,
    )
    toolControls.addTo(map)
    const locateBtn = toolControls.getContainer()?.querySelector('button.leaflet-locate-btn')
    if (locateBtn instanceof HTMLButtonElement) {
      locateBtnRef.current = locateBtn
    }
    const sidebarToggleBtn = toolControls
      .getContainer()
      ?.querySelector('button.leaflet-sidebar-toggle-btn')
    if (sidebarToggleBtn instanceof HTMLButtonElement) {
      sidebarToggleBtnRef.current = sidebarToggleBtn
    }

    map.on('click', () => {
      setContextMenu(null)
      if (!isProgrammaticMove.current) {
        onClearSelectionRef.current()
      }
    })

    map.on('contextmenu', (e) => {
      if (!isAuthenticatedRef.current) return
      L.DomEvent.preventDefault(e.originalEvent)
      setContextMenu({
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
      })
    })

    const onWindowResize = () => {
      invalidateMapSize()
    }

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    let followUpTimeout: ReturnType<typeof setTimeout> | null = null

    /**
     * Debounced Leaflet resize after sidebar collapse / container flex growth (Vue MapVisualizer parity).
     */
    const invalidateMapSize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        followUpTimeout = setTimeout(() => {
          const current = mapRef.current
          if (!current) return
          try {
            current.invalidateSize()
            applyLeafletOsmWorldCoverMinZoom(current)
            const center = current.getCenter()
            if (center) {
              current.setView(center, current.getZoom(), { animate: false })
            }
          } catch (error) {
            console.warn('Error invalidating map size:', error)
          }
        }, 100)
      }, 150)
    }

    const resizeObserver = new ResizeObserver(() => {
      applyLeafletOsmWorldCoverMinZoom(map)
      invalidateMapSize()
    })
    resizeObserver.observe(el)
    window.addEventListener('resize', onWindowResize)

    // After mount, sidebar may still be settling
    const readyTimeout = window.setTimeout(() => {
      invalidateMapSize()
    }, 500)

    mapRef.current = map

    return () => {
      window.clearTimeout(readyTimeout)
      if (resizeTimeout) clearTimeout(resizeTimeout)
      if (followUpTimeout) clearTimeout(followUpTimeout)
      window.removeEventListener('resize', onWindowResize)
      resizeObserver.disconnect()
      locateBtnRef.current = null
      sidebarToggleBtnRef.current = null
      clusterGroupRef.current = null
      map.remove()
      mapRef.current = null
      markersRef.current = {}
      shopMetaRef.current = {}
      selectedKeysRef.current = new Set()
    }
    // Initialize once; userLocation updates are handled by marker effect
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only map init
  }, [])

  useEffect(() => {
    const btn = locateBtnRef.current
    if (!btn) return
    btn.disabled = isLocating
  }, [isLocating])

  useEffect(() => {
    const btn = sidebarToggleBtnRef.current
    if (!btn) return
    const collapsed = !isSidebarVisible
    const label = collapsed ? t('chat.favorites.expand') : t('chat.favorites.collapse')
    btn.title = label
    btn.setAttribute('aria-label', label)
    btn.innerHTML = collapsed ? SIDEBAR_EXPAND_ICON_SVG : SIDEBAR_COLLAPSE_ICON_SVG
  }, [isSidebarVisible, t])

  const flyToUserLocation = useCallback((coords: Coordinates) => {
    const map = mapRef.current
    if (!map) return
    const lat = Number(coords.latitude)
    const lng = Number(coords.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    isProgrammaticMove.current = true
    map.flyTo([lat, lng], 14, { duration: 1.2 })
    window.setTimeout(() => {
      markersRef.current.__user__?.openPopup()
      isProgrammaticMove.current = false
    }, 1400)
  }, [])

  useEffect(() => {
    onLocateClickRef.current = () => {
      setIsLocating(true)
      void onLocateRequest({ forceRefresh: true })
        .then((coords) => {
          if (coords) flyToUserLocation(coords)
        })
        .finally(() => {
          setIsLocating(false)
        })
    }
  }, [flyToUserLocation, onLocateRequest])

  // Sync shop + user markers (not selection styling).
  useEffect(() => {
    const map = mapRef.current
    const cluster = clusterGroupRef.current
    if (!map || !cluster) return

    const nextShopKeys = new Set<string>()
    const nextMeta: Record<string, ShopMarkerMeta> = {}
    const selected = selectedKeysRef.current

    for (const shop of shops) {
      const lat = Number(shop.latitude)
      const lng = Number(shop.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const key = shopMarkerKey(shop)
      nextShopKeys.add(key)
      const color = shop.pinColor ?? getPriorityColor(shop.priority)
      nextMeta[key] = { color, lat, lng, name: shop.name }
      const isSelected = selected.has(key)
      const icon = makePinIcon(color, isSelected)
      const existing = markersRef.current[key]
      if (existing) {
        existing.setLatLng([lat, lng])
        existing.setIcon(icon)
        existing.setPopupContent(shop.name)
      } else {
        const marker = L.marker([lat, lng], { icon })
        marker.bindPopup(shop.name)
        marker.on('click', () => onMarkerClickRef.current(key))
        cluster.addLayer(marker)
        markersRef.current[key] = marker
      }
    }

    for (const key of Object.keys(markersRef.current)) {
      if (key === '__user__') continue
      if (!nextShopKeys.has(key)) {
        const marker = markersRef.current[key]
        if (marker) {
          cluster.removeLayer(marker)
        }
        delete markersRef.current[key]
      }
    }
    shopMetaRef.current = nextMeta

    if (userLocation) {
      const lat = Number(userLocation.latitude)
      const lng = Number(userLocation.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const brand =
          getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() ||
          '#0ea5e9'
        const icon = makePinIcon(brand, false)
        const existing = markersRef.current.__user__
        if (existing) {
          existing.setLatLng([lat, lng])
          existing.setIcon(icon)
        } else {
          const marker = L.marker([lat, lng], { icon }).addTo(map)
          marker.bindPopup(t('map.legend.userSearchCenter'))
          markersRef.current.__user__ = marker
        }
      }
    } else if (markersRef.current.__user__) {
      markersRef.current.__user__.remove()
      delete markersRef.current.__user__
    }

    const fingerprint = shopsFingerprint(shops)
    if (fingerprint && fingerprint !== lastFittedShopsKeyRef.current) {
      lastFittedShopsKeyRef.current = fingerprint
      const points = shops
        .map((s) => [Number(s.latitude), Number(s.longitude)] as [number, number])
        .filter(([la, ln]) => Number.isFinite(la) && Number.isFinite(ln))
      if (points.length > 0) {
        const bounds = L.latLngBounds(points)
        if (bounds.isValid()) {
          isProgrammaticMove.current = true
          map.flyToBounds(bounds.pad(0.2), { duration: 1, maxZoom: 15 })
          window.setTimeout(() => {
            isProgrammaticMove.current = false
          }, 1200)
        }
      }
    }
    if (!fingerprint) {
      lastFittedShopsKeyRef.current = ''
    }
  }, [shops, userLocation, t])

  // Selection-only icon refresh (avoid re-fitting bounds / full rebuild).
  useEffect(() => {
    const nextSelected = new Set(selectedShops)
    const prevSelected = selectedKeysRef.current
    const touched = new Set<string>()
    for (const key of nextSelected) {
      if (!prevSelected.has(key)) {
        touched.add(key)
      }
    }
    for (const key of prevSelected) {
      if (!nextSelected.has(key)) {
        touched.add(key)
      }
    }
    selectedKeysRef.current = nextSelected

    for (const key of touched) {
      if (key === '__user__') continue
      const marker = markersRef.current[key]
      const meta = shopMetaRef.current[key]
      if (!marker || !meta) continue
      marker.setIcon(makePinIcon(meta.color, nextSelected.has(key)))
    }
  }, [selectedShops])

  const handleSearch = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!searchQuery.trim() || !mapRef.current) return
      setIsSearching(true)
      try {
        const coordinates = parseCoordinates(searchQuery)
        if (
          coordinates &&
          coordinates.lat >= -90 &&
          coordinates.lat <= 90 &&
          coordinates.lng >= -180 &&
          coordinates.lng <= 180
        ) {
          isProgrammaticMove.current = true
          mapRef.current.flyTo([coordinates.lat, coordinates.lng], 11, { duration: 1.2 })
          onLocationUpdate({ latitude: coordinates.lat, longitude: coordinates.lng })
          window.setTimeout(() => {
            isProgrammaticMove.current = false
          }, 1400)
        } else {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`,
          )
          const data = (await response.json()) as Array<{ lat: string; lon: string }>
          if (data[0]) {
            const newLat = Number.parseFloat(data[0].lat)
            const newLng = Number.parseFloat(data[0].lon)
            if (Number.isFinite(newLat) && Number.isFinite(newLng) && mapRef.current) {
              isProgrammaticMove.current = true
              mapRef.current.flyTo([newLat, newLng], 11, { duration: 1.2 })
              onLocationUpdate({ latitude: newLat, longitude: newLng })
              window.setTimeout(() => {
                isProgrammaticMove.current = false
              }, 1400)
            }
          }
        }
      } catch (err) {
        console.error('Map search failed', err)
      } finally {
        setIsSearching(false)
      }
    },
    [onLocationUpdate, searchQuery],
  )

  return (
    <div className="relative min-h-0 min-w-0 flex-1">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      <form
        onSubmit={(e) => void handleSearch(e)}
        className="group absolute top-3 right-3 z-20 w-[min(20rem,calc(100%-1.5rem))]"
      >
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('map.search.placeholder')}
          aria-label={t('map.search.ariaLabel')}
          className="w-full rounded-lg border border-zinc-950/10 bg-white/70 py-2 pr-10 pl-3 text-sm font-medium text-ink shadow-lg outline-none backdrop-blur-xl transition-all placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand dark:border-white/10 dark:bg-zinc-950/60"
        />
        <button
          type="submit"
          disabled={isSearching}
          aria-label={t('actions.search')}
          className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-brand transition-colors hover:text-brand/80 disabled:opacity-50"
        >
          {isSearching ? (
            <span
              className="block size-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
              aria-hidden
            />
          ) : (
            <SearchIcon className="size-4" aria-hidden />
          )}
        </button>
      </form>

      {locationError ? (
        <div className="absolute top-28 left-3 z-20 max-w-xs rounded-xl border border-amber-500/40 bg-white px-3 py-2 text-xs font-medium text-amber-800 shadow-lg dark:bg-zinc-950 dark:text-amber-200">
          {locationError}
        </div>
      ) : null}

      {contextMenu ? (
        <div
          className="fixed z-50 min-w-44 overflow-hidden rounded-xl border border-zinc-950/10 bg-white/90 shadow-xl backdrop-blur-xl animate-dropdown-in dark:border-white/10 dark:bg-zinc-950/90"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-brand/10"
            onClick={() => {
              onAddLocation({
                latitude: contextMenu.latitude,
                longitude: contextMenu.longitude,
              })
              setContextMenu(null)
            }}
          >
            {t('chat.favorites.modal.addCustomLocation')}
          </button>
        </div>
      ) : null}
    </div>
  )
})
