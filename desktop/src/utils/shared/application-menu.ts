/** Go-menu targets; keep in sync with `electron/shared/ipc` `MENU_FEATURE_IDS`. */
const MENU_NAVIGATE_TARGETS = [
  'home',
  'settings',
  'chat',
  'harness',
  'messages',
  'mail',
  'calendar',
  'kanban',
  'map',
  'admin',
  'orders',
  'products',
  'nexdot',
  'teAdmin',
  'team',
  'aura',
  'folio',
  'docs',
  'sheets',
  'slides',
  'clash',
] as const

/**
 * Returns whether a string is a native Go-menu navigation target.
 * @param value - Candidate id.
 * @returns True for home, settings, or a known feature.
 */
export function isMenuNavigateTarget(value: string): value is MenuNavigateTarget {
  return (MENU_NAVIGATE_TARGETS as readonly string[]).includes(value)
}
