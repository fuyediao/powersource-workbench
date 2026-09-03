/**
 * KOL enum values and badge styling shared by the Admin KOL panes.
 */

import type {
  KolCooperationStatus,
  KolCurrentStatus,
  KolTier,
} from '@/types/kol'

/** Tier values in descending priority order. */
export const KOL_TIER_VALUES: KolTier[] = ['A', 'B', 'C', 'D']

/** Current-status slugs. */
export const KOL_CURRENT_STATUS_VALUES: KolCurrentStatus[] = [
  'received_review',
  'product_sent',
  'abnormal',
  'active_cooperation',
  'other',
]

/** Cooperation-status slugs. */
export const KOL_COOPERATION_STATUS_VALUES: KolCooperationStatus[] = [
  'core_partner',
  'normal_maintenance',
  'contacted',
  'low_frequency',
  'long_no_reply',
  'pending_contact',
  'handled_by_others',
  'used_by_ecommerce',
]

/** Supported social platform keys for `kol_channels.platform_key`. */
export const KOL_PLATFORM_KEYS = [
  'youtube',
  'instagram',
  'tiktok',
  'facebook',
  'x',
  'threads',
  'other',
] as const

export type KolPlatformKey = (typeof KOL_PLATFORM_KEYS)[number]

/** Platforms whose profile stats are fetched via geocrm-api + Apify (not YouTube Data API). */
export const KOL_APIFY_ENRICHABLE_PLATFORM_KEYS = [
  'instagram',
  'tiktok',
  'facebook',
  'x',
  'threads',
] as const

export type KolApifyEnrichablePlatformKey =
  (typeof KOL_APIFY_ENRICHABLE_PLATFORM_KEYS)[number]

/**
 * True when add/update should call Apify enrichment on geocrm-api.
 * @param key - `kol_channels.platform_key`.
 * @returns Whether the platform is Apify-enrichable.
 */
export function isKolApifyEnrichablePlatform(
  key: string,
): key is KolApifyEnrichablePlatformKey {
  return (KOL_APIFY_ENRICHABLE_PLATFORM_KEYS as readonly string[]).includes(key)
}

/**
 * Tailwind classes for a star at the given rating (light Electron UI).
 * 1 = red (poor), 2 = orange (fair), 3 = yellow (average),
 * 4 = lime (good), 5 = emerald (excellent).
 * @param rating - 1-5 rating value.
 * @returns Tailwind class string for the star icon (text + fill).
 */
export function getRatingStarClass(rating: number | null | undefined): string {
  switch (rating) {
    case 1:
      return 'fill-current text-red-500 fill-red-500'
    case 2:
      return 'fill-current text-orange-500 fill-orange-500'
    case 3:
      return 'fill-current text-yellow-500 fill-yellow-500'
    case 4:
      return 'fill-current text-lime-500 fill-lime-500'
    case 5:
      return 'fill-current text-emerald-500 fill-emerald-500'
    default:
      return 'fill-current text-gray-400'
  }
}

/**
 * Tailwind text-color class for rating-related labels (no fill).
 * @param rating - 1-5 rating value.
 * @returns Tailwind class string for text/label use.
 */
export function getRatingTextClass(rating: number | null | undefined): string {
  switch (rating) {
    case 1:
      return 'text-red-500'
    case 2:
      return 'text-orange-500'
    case 3:
      return 'text-yellow-500'
    case 4:
      return 'text-lime-500'
    case 5:
      return 'text-emerald-500'
    default:
      return 'text-gray-500'
  }
}

/** i18n key suffix for rating tier labels (1..5). */
export const KOL_RATING_LABEL_KEYS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'admin.kol.rating.1',
  2: 'admin.kol.rating.2',
  3: 'admin.kol.rating.3',
  4: 'admin.kol.rating.4',
  5: 'admin.kol.rating.5',
}

/**
 * Badge classes for a KOL tier (desktop palette, readable over glass).
 * @param tier - Tier value or null.
 * @returns Tailwind class string.
 */
export function kolTierBadgeClass(tier: KolTier | null): string {
  switch (tier) {
    case 'A':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'B':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
    case 'C':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'D':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
    default:
      return 'bg-ink/10 text-muted'
  }
}

/**
 * Badge classes for a cooperation status.
 * @param status - Cooperation status or null.
 * @returns Tailwind class string.
 */
export function kolCooperationBadgeClass(
  status: KolCooperationStatus | null,
): string {
  switch (status) {
    case 'core_partner':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'normal_maintenance':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
    case 'contacted':
      return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
    case 'low_frequency':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
    case 'long_no_reply':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
    case 'pending_contact':
      return 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
    case 'handled_by_others':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-300'
    case 'used_by_ecommerce':
      return 'bg-pink-500/15 text-pink-700 dark:text-pink-300'
    default:
      return 'bg-ink/10 text-muted'
  }
}

/**
 * Badge classes for a current status.
 * @param status - Current status or null.
 * @returns Tailwind class string.
 */
export function kolCurrentStatusBadgeClass(
  status: KolCurrentStatus | null,
): string {
  switch (status) {
    case 'received_review':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'product_sent':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
    case 'abnormal':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
    case 'active_cooperation':
      return 'bg-brand/15 text-brand'
    default:
      return 'bg-ink/10 text-muted'
  }
}
