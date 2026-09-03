import type { FavoritePriority } from '@/types/favorite'

/**
 * Priority option for display (id, i18n key, hex color).
 * important=red, normal=yellow, unimportant=green.
 */
export const PRIORITY_OPTIONS: {
  id: FavoritePriority
  labelKey: string
  color: string
}[] = [
  { id: 'important', labelKey: 'chat.favorites.priority.important', color: '#ef4444' },
  { id: 'normal', labelKey: 'chat.favorites.priority.normal', color: '#eab308' },
  { id: 'unimportant', labelKey: 'chat.favorites.priority.unimportant', color: '#22c55e' },
]

/**
 * Returns the hex color for a priority value.
 *
 * @param priority - Priority id or null/undefined
 * @returns Hex color string (slate gray when missing/invalid)
 */
export function getPriorityColor(priority: FavoritePriority | undefined | null): string {
  if (!priority) return '#64748b'
  const option = PRIORITY_OPTIONS.find((o) => o.id === priority)
  return option?.color ?? '#64748b'
}
