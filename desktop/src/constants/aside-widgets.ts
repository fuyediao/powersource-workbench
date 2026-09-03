/**
 * Aside home widget ids that can be reordered.
 */

export type AsideWidgetId =
  | 'weather'
  | 'todo'
  | 'currency'
  | 'markets'
  | 'news'
  | 'mail'

/** Which home content-stage rail a widget sits on. */
export type AsideWidgetRail = 'left' | 'right'

/**
 * Default left-rail order (mail reminder + briefing).
 */
export const DEFAULT_ASIDE_WIDGET_ORDER_LEFT: AsideWidgetId[] = [
  'mail',
  'news',
]

/**
 * Default right-rail order (weather / todo / markets / FX).
 */
export const DEFAULT_ASIDE_WIDGET_ORDER_RIGHT: AsideWidgetId[] = [
  'weather',
  'todo',
  'markets',
  'currency',
]

/** Canonical union in default left-then-right order (restore / missing-id fill). */
export const DEFAULT_ASIDE_WIDGET_ORDER: AsideWidgetId[] = [
  ...DEFAULT_ASIDE_WIDGET_ORDER_LEFT,
  ...DEFAULT_ASIDE_WIDGET_ORDER_RIGHT,
]

const ASIDE_WIDGET_IDS = new Set<string>(DEFAULT_ASIDE_WIDGET_ORDER)

/**
 * Parses a jsonb/array of widget ids, dropping unknowns and duplicates.
 * @param raw - Value from Supabase or an in-memory draft.
 * @returns Ordered unique known widget ids (may be incomplete).
 */
export function parseAsideWidgetOrder(raw: unknown): AsideWidgetId[] {
  const seen = new Set<AsideWidgetId>()
  const next: AsideWidgetId[] = []
  if (!Array.isArray(raw)) {
    return next
  }
  for (const item of raw) {
    if (
      typeof item === 'string' &&
      ASIDE_WIDGET_IDS.has(item) &&
      !seen.has(item as AsideWidgetId)
    ) {
      const id = item as AsideWidgetId
      next.push(id)
      seen.add(id)
    }
  }
  return next
}

/**
 * Normalizes a single-list order, appending any missing widgets at the end.
 * @param raw - Value from Supabase or an in-memory draft.
 * @returns Complete ordered widget ids.
 * @deprecated Prefer {@link normalizeAsideWidgetRails}.
 */
export function normalizeAsideWidgetOrder(raw: unknown): AsideWidgetId[] {
  const next = parseAsideWidgetOrder(raw)
  const seen = new Set(next)
  for (const id of DEFAULT_ASIDE_WIDGET_ORDER) {
    if (!seen.has(id)) {
      next.push(id)
    }
  }
  return next
}

export interface AsideWidgetRails {
  left: AsideWidgetId[]
  right: AsideWidgetId[]
}

/**
 * Normalizes left/right rails so every widget appears on exactly one side.
 * Preference: left order first, then right; missing ids append to their
 * product-default rail.
 * @param leftRaw - Left-rail jsonb/array.
 * @param rightRaw - Right-rail jsonb/array.
 * @param legacyRaw - Optional legacy single-list order (used when both rails empty).
 * @returns Normalized rails.
 */
export function normalizeAsideWidgetRails(
  leftRaw: unknown,
  rightRaw: unknown,
  legacyRaw?: unknown,
): AsideWidgetRails {
  let left = parseAsideWidgetOrder(leftRaw)
  let right = parseAsideWidgetOrder(rightRaw)

  if (left.length === 0 && right.length === 0 && legacyRaw !== undefined) {
    right = parseAsideWidgetOrder(legacyRaw)
  }

  const seen = new Set<AsideWidgetId>()
  const cleanLeft: AsideWidgetId[] = []
  for (const id of left) {
    if (!seen.has(id)) {
      cleanLeft.push(id)
      seen.add(id)
    }
  }
  const cleanRight: AsideWidgetId[] = []
  for (const id of right) {
    if (!seen.has(id)) {
      cleanRight.push(id)
      seen.add(id)
    }
  }
  for (const id of DEFAULT_ASIDE_WIDGET_ORDER_LEFT) {
    if (!seen.has(id)) {
      cleanLeft.push(id)
      seen.add(id)
    }
  }
  for (const id of DEFAULT_ASIDE_WIDGET_ORDER_RIGHT) {
    if (!seen.has(id)) {
      cleanRight.push(id)
      seen.add(id)
    }
  }
  return { left: cleanLeft, right: cleanRight }
}

/**
 * Whether two rail orders match the product defaults.
 * @param rails - Current rails.
 * @returns True when left and right match the default sequences.
 */
export function isDefaultAsideWidgetRails(rails: AsideWidgetRails): boolean {
  if (rails.left.length !== DEFAULT_ASIDE_WIDGET_ORDER_LEFT.length) {
    return false
  }
  if (rails.right.length !== DEFAULT_ASIDE_WIDGET_ORDER_RIGHT.length) {
    return false
  }
  const leftOk = rails.left.every(
    (id, index) => id === DEFAULT_ASIDE_WIDGET_ORDER_LEFT[index],
  )
  const rightOk = rails.right.every(
    (id, index) => id === DEFAULT_ASIDE_WIDGET_ORDER_RIGHT[index],
  )
  return leftOk && rightOk
}
