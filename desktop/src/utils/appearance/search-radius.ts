/** localStorage key for the search bar roundness (0–100 UI percent). */
export const SEARCH_RADIUS_KEY = 'workbench-search-radius-pct'

/** Default roundness % — about `1rem` / previous `rounded-2xl` with the rem mapping below. */
export const DEFAULT_SEARCH_RADIUS = 50

/** Minimum roundness % (square). */
export const MIN_SEARCH_RADIUS = 0

/** Maximum roundness % (true stadium pill / circle on the square settings chip). */
export const MAX_SEARCH_RADIUS = 100

/**
 * CSS rem radius at 100% UI.
 * Equal length on both axes so wide bars become a stadium (not elliptical “eye” corners).
 * ~2.125rem ≈ half of a 68px-tall bar → full pill at max.
 */
const SEARCH_RADIUS_MAX_REM = 2.125

/**
 * Clamps a search-bar roundness percentage into the supported range.
 * @param value - Raw roundness percent (0 = square, 100 = pill/circle).
 * @returns Clamped integer 0–100.
 */
export function clampSearchRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_SEARCH_RADIUS
  }
  return Math.min(MAX_SEARCH_RADIUS, Math.max(MIN_SEARCH_RADIUS, Math.round(value)))
}

/**
 * Converts UI roundness (0–100) to a CSS rem radius (same on both axes).
 * @param roundness - UI roundness percent.
 * @returns CSS rem length string.
 */
function toCssRadiusRem(roundness: number): string {
  return `${(clampSearchRadius(roundness) / 100) * SEARCH_RADIUS_MAX_REM}rem`
}

/**
 * Applies the search-bar radius CSS variable on the document root.
 * Uses a length (not %) so wide bars get stadium corners instead of elliptical ones.
 * @param roundness - UI roundness percent (0 = square, 100 = pill/circle).
 * @returns Nothing.
 */
export function applySearchRadius(roundness: number): void {
  const next = clampSearchRadius(roundness)
  document.documentElement.style.setProperty('--search-bar-radius', toCssRadiusRem(next))
  localStorage.setItem(SEARCH_RADIUS_KEY, String(next))
}

/**
 * Reads the persisted search-bar roundness from localStorage.
 * @returns Roundness percent 0–100.
 */
export function getStoredSearchRadius(): number {
  const raw = localStorage.getItem(SEARCH_RADIUS_KEY)
  if (raw !== null) {
    return clampSearchRadius(Number(raw))
  }
  return DEFAULT_SEARCH_RADIUS
}
