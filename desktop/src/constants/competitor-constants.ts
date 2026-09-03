/**
 * Competitor importance / threat enum values and badge styling.
 */

import type {
  CompetitorImportanceLevel,
  CompetitorThreatLevel,
} from '@/types/competitor'

/** Importance levels (map marker colour order). */
export const COMPETITOR_IMPORTANCE_VALUES: CompetitorImportanceLevel[] = [
  'low',
  'medium',
  'high',
]

/** Threat levels ordered lowest to highest. */
export const COMPETITOR_THREAT_VALUES: CompetitorThreatLevel[] = [
  'very_low',
  'low',
  'medium',
  'high',
  'critical',
]

/**
 * Badge classes for a shop importance level.
 * @param level - Importance level or null.
 * @returns Tailwind class string.
 */
export function competitorImportanceBadgeClass(
  level: CompetitorImportanceLevel | null,
): string {
  switch (level) {
    case 'low':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'medium':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'high':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
    default:
      return 'bg-ink/10 text-muted'
  }
}

/**
 * Badge classes for a line threat level.
 * @param level - Threat level or null.
 * @returns Tailwind class string.
 */
export function competitorThreatBadgeClass(
  level: CompetitorThreatLevel | null,
): string {
  switch (level) {
    case 'very_low':
      return 'bg-green-500/15 text-green-700 dark:text-green-300'
    case 'low':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'medium':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'high':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
    case 'critical':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
    default:
      return 'bg-ink/10 text-muted'
  }
}
