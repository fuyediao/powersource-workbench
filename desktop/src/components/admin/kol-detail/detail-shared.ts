/**
 * Shared tab ids, chrome, and form helpers for the Admin KOL detail pane.
 */

import type { GroupMemberRecord, ProfileSnippet } from '@/services/groups-api'

export type KolDetailTabId =
  | 'overview'
  | 'channels'
  | 'location'
  | 'performance'
  | 'aiSummary'
  | 'orders'
  | 'visits'
  | 'status'
  | 'logistics'

/** Row 1 tab ids (5). */
export const KOL_DETAIL_TAB_ROW1: KolDetailTabId[] = [
  'overview',
  'channels',
  'location',
  'performance',
  'aiSummary',
]

/** Row 2 tab ids (4). */
export const KOL_DETAIL_TAB_ROW2: KolDetailTabId[] = [
  'orders',
  'visits',
  'status',
  'logistics',
]

/** All KOL detail tab ids in display order (row1 then row2). */
export const KOL_DETAIL_TAB_ALL: KolDetailTabId[] = [
  ...KOL_DETAIL_TAB_ROW1,
  ...KOL_DETAIL_TAB_ROW2,
]

/** i18n key for each KOL detail tab label. */
export const KOL_DETAIL_TAB_LABEL_KEY: Record<KolDetailTabId, string> = {
  overview: 'admin.kolDetail.tabs.overview',
  channels: 'admin.kolDetail.socialChannels',
  location: 'admin.kolDetail.tabs.location',
  performance: 'admin.kolDetail.tabs.performance',
  aiSummary: 'admin.kolDetail.tabs.aiSummary',
  orders: 'admin.kolDetail.tabs.orders',
  visits: 'admin.kolDetail.tabs.visits',
  status: 'admin.kolDetail.tabs.status',
  logistics: 'admin.kolDetail.tabs.logistics',
}

/** Shared text input class for KOL detail fields. */
export const KOL_DETAIL_INPUT_CLASS =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

/** Shared field label class for KOL detail fields. */
export const KOL_DETAIL_LABEL_CLASS = 'mb-1 block text-xs font-medium text-muted'

/** RFC 5322-lite email check (optional field; empty is valid). */
export const KOL_EMAIL_REGEX =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/

/**
 * Formats a follower / view count compactly (1.2K / 3.4M).
 * @param value - Numeric count.
 * @returns Compact string, or em dash when empty.
 */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/**
 * Builds up to two uppercase initials for the avatar fallback.
 * @param name - Display name.
 * @returns Initials string.
 */
export function kolInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Formats an ISO datetime string for a `datetime-local` input.
 * @param iso - ISO date-time or date string.
 * @returns `YYYY-MM-DDThh:mm` or empty string.
 */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) {
    return ''
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)) {
    return iso.slice(0, 16)
  }
  try {
    return new Date(iso).toISOString().slice(0, 16)
  } catch {
    return ''
  }
}

/**
 * Parses a `datetime-local` value to an ISO string.
 * @param val - Input value.
 * @returns ISO string, or null when empty.
 */
export function datetimeLocalToIso(val: string): string | null {
  return val ? new Date(val).toISOString() : null
}

/**
 * Formats an ISO / date string for a `date` input.
 * @param iso - Stored date or timestamp.
 * @returns `YYYY-MM-DD` or empty string.
 */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) {
    return ''
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  if (match?.[1]) {
    return match[1]
  }
  try {
    return new Date(iso).toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

/**
 * Formats stored cooperation years for the single-line input.
 * @param years - Years from DB or null.
 * @returns Comma-separated ascending years, or empty string.
 */
export function formatCooperationYearsForInput(
  years: number[] | null | undefined,
): string {
  if (!years?.length) {
    return ''
  }
  return [...years].sort((a, b) => a - b).join(', ')
}

/**
 * Parses cooperation years from free-form text into unique sorted years (1900–2100).
 * @param raw - Raw user input.
 * @returns Sorted unique years, or null if none parsed.
 */
export function parseCooperationYearsFromInput(raw: string): number[] | null {
  const text = raw.trim()
  if (!text) {
    return null
  }
  const years = new Set<number>()
  const embedded = /\b(19|20)\d{2}\b/g
  let match: RegExpExecArray | null = embedded.exec(text)
  while (match !== null) {
    const year = Number(match[0])
    if (year >= 1900 && year <= 2100) {
      years.add(year)
    }
    match = embedded.exec(text)
  }
  for (const part of text.split(/[,;\uFF0C\u3001\s]+/)) {
    const trimmed = part.trim()
    if (!trimmed) {
      continue
    }
    const parsed = Number.parseInt(trimmed, 10)
    if (!Number.isNaN(parsed) && parsed >= 1900 && parsed <= 2100) {
      years.add(parsed)
    }
  }
  const arr = [...years].sort((a, b) => a - b)
  return arr.length > 0 ? arr : null
}

/**
 * Display label for a group member (owner picker).
 * @param member - Group member with optional profile.
 * @returns Display name, email, or short id fallback.
 */
export function memberLabelForOwner(member: GroupMemberRecord): string {
  return (
    member.user?.display_name?.trim() ||
    member.user?.full_name?.trim() ||
    member.user?.email?.trim() ||
    `${member.userId.slice(0, 8)}…`
  )
}

/**
 * Resolves an owner id to a display label.
 * @param userId - Owner user UUID.
 * @param members - Group members for the KOL's group.
 * @param extra - Profile fetched when the owner is not a group member.
 * @returns Display name when found, else truncated id or em dash.
 */
export function ownerLabel(
  userId: string | null | undefined,
  members: GroupMemberRecord[],
  extra?: ProfileSnippet | null,
): string {
  if (!userId) {
    return '—'
  }
  const member = members.find((row) => row.userId === userId)
  if (member?.user) {
    return memberLabelForOwner(member)
  }
  if (extra) {
    return memberLabelForOwner({
      id: '',
      groupId: '',
      userId,
      status: 'active',
      user: extra,
    })
  }
  if (member) {
    return memberLabelForOwner(member)
  }
  return `${userId.slice(0, 8)}…`
}

/**
 * New id for a shipment / order row.
 * @returns UUID-like string.
 */
export function newShipmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Trims a text input into a nullable stored value.
 * @param value - Raw input.
 * @returns Trimmed string, or null.
 */
export function textValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Parses a numeric input into a nullable stored value.
 * @param value - Raw input.
 * @returns Finite number, or null.
 */
export function numberValue(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parses optional non-negative integers from channel modal number inputs.
 * @param value - Draft followers or content count.
 * @returns Integer ≥ 0, or null when empty / invalid.
 */
export function optionalNonNegativeInt(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed =
    typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }
  return Math.floor(parsed)
}

/**
 * Sums channel follower counts (finite numbers only).
 * @param channels - Channel rows.
 * @returns Aggregate followers.
 */
export function sumChannelFollowers(
  channels: Array<{ followers: number | null }>,
): number {
  return channels.reduce((sum, channel) => {
    const n = channel.followers
    return sum + (typeof n === 'number' && Number.isFinite(n) ? n : 0)
  }, 0)
}
