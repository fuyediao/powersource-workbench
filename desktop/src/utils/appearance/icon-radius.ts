/** localStorage key for the app icon roundness (0–100 UI percent). */
export const ICON_RADIUS_KEY = 'geocrm-icon-radius-pct'
/** Legacy key stored the CSS radius 0–50; migrated on read. */
const LEGACY_ICON_RADIUS_KEY = 'geocrm-icon-radius'

/** Default roundness % — close to the previous `rounded-xl` look. */
export const DEFAULT_ICON_RADIUS = 50

/** Minimum roundness % (square). */
export const MIN_ICON_RADIUS = 0

/** Maximum roundness % (circle). */
export const MAX_ICON_RADIUS = 100

/**
 * Clamps an icon roundness percentage into the supported range.
 * @param value - Raw roundness percent (0 = square, 100 = circle).
 * @returns Clamped integer 0–100.
 */
export function clampIconRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_ICON_RADIUS
  }
  return Math.min(MAX_ICON_RADIUS, Math.max(MIN_ICON_RADIUS, Math.round(value)))
}

/**
 * Converts UI roundness (0–100) to CSS `border-radius` percent (0–50).
 * @param roundness - UI roundness percent.
 * @returns CSS border-radius percent.
 */
function toCssRadiusPercent(roundness: number): number {
  return clampIconRadius(roundness) / 2
}

/**
 * Applies the icon radius CSS variable on the document root.
 * @param roundness - UI roundness percent (0 = square, 100 = circle).
 * @returns Nothing.
 */
export function applyIconRadius(roundness: number): void {
  const next = clampIconRadius(roundness)
  document.documentElement.style.setProperty('--app-icon-radius', `${toCssRadiusPercent(next)}%`)
  localStorage.setItem(ICON_RADIUS_KEY, String(next))
  localStorage.removeItem(LEGACY_ICON_RADIUS_KEY)
}

/**
 * Reads the persisted icon roundness from localStorage.
 * @returns Roundness percent 0–100.
 */
export function getStoredIconRadius(): number {
  const raw = localStorage.getItem(ICON_RADIUS_KEY)
  if (raw !== null) {
    return clampIconRadius(Number(raw))
  }

  const legacy = localStorage.getItem(LEGACY_ICON_RADIUS_KEY)
  if (legacy !== null) {
    const migrated = clampIconRadius(Number(legacy) * 2)
    localStorage.setItem(ICON_RADIUS_KEY, String(migrated))
    localStorage.removeItem(LEGACY_ICON_RADIUS_KEY)
    return migrated
  }

  return DEFAULT_ICON_RADIUS
}
