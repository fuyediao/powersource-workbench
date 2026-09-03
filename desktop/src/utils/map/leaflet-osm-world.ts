import type { LatLngBounds, LatLngTuple, Map as LeafletMap, TileLayer, TileLayerOptions } from 'leaflet'
import L from 'leaflet'

/**
 * Web Mercator-friendly world extent for OSM when using a single world copy (`noWrap: true`).
 */
export const LEAFLET_OSM_WORLD_BOUNDS: LatLngBounds = L.latLngBounds([-85, -180], [85, 180])

/** Continental US — default viewport when the map has no markers or user location yet. */
export const LEAFLET_DEFAULT_MAP_CENTER: LatLngTuple = [39.8283, -98.5795]

/** Default zoom for {@link LEAFLET_DEFAULT_MAP_CENTER} (US overview). */
export const LEAFLET_DEFAULT_MAP_ZOOM = 4

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

/**
 * Returns whether XYZ tile indices are in range for the given zoom.
 * @param z - Zoom level.
 * @param x - Tile column.
 * @param y - Tile row.
 * @returns True when the tile exists in the standard OSM scheme.
 */
function isOsmTileInRange(z: number, x: number, y: number): boolean {
  const max = 2 ** z
  return x >= 0 && x < max && y >= 0 && y < max
}

/**
 * Creates an OSM raster layer that never hits tile.openstreetmap.org with
 * out-of-range XYZ (e.g. negative `x` → HTTP 400). Leaflet `noWrap` alone is
 * not enough when CRS.wrapLng is set; world `bounds` can still admit edge tiles.
 * @param options - Extra TileLayer options (attribution, maxZoom, …).
 * @returns Configured OSM tile layer (not yet added to a map).
 */
export function createLeafletOsmTileLayer(options: TileLayerOptions = {}): TileLayer {
  const layer = L.tileLayer(OSM_TILE_URL, {
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
    ...options,
    noWrap: true,
    bounds: LEAFLET_OSM_WORLD_BOUNDS,
  })
  const baseGetTileUrl = layer.getTileUrl.bind(layer)
  layer.getTileUrl = (coords) => {
    if (!isOsmTileInRange(coords.z, coords.x, coords.y)) {
      return L.Util.emptyImageUrl
    }
    return baseGetTileUrl(coords)
  }
  return layer
}

/**
 * Sets the lowest zoom level so the OSM world always covers the map container
 * (no side letterboxing). Uses Leaflet `Map#getBoundsZoom` with `inside: true`.
 *
 * @param map - Leaflet map instance from `L.map(...)`
 */
export function applyLeafletOsmWorldCoverMinZoom(map: unknown): void {
  const m = map as LeafletMap
  m.invalidateSize()
  const { x, y } = m.getSize()
  if (x === 0 || y === 0) return
  const z = m.getBoundsZoom(LEAFLET_OSM_WORLD_BOUNDS, true, L.point(0, 0))
  m.setMinZoom(z)
  if (m.getZoom() < z) m.setZoom(z)
}
