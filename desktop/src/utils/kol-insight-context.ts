import type {
  KolChannel,
  KolCommunicationEntry,
  KolDetail,
} from '@/types/kol'

/** Maximum number of KOL channels included in the context. */
const MAX_CHANNELS = 20

/** Maximum number of communication history entries included. */
const MAX_COMM_HISTORY = 10

/** Maximum characters per communication history content field. */
const MAX_COMM_CONTENT_CHARS = 400

/** Default max characters for a single KOL profile string field. */
const DEFAULT_PROFILE_STRING_MAX = 900

/** Longer cap for free-text paragraphs (info, background, remarks). */
const LONG_PROFILE_STRING_MAX = 2800

/** KOL columns holding prior AI output — excluded so the model reasons from source data only. */
const EXCLUDED_FROM_PROFILE: ReadonlySet<keyof KolDetail> = new Set([
  'aiSummary',
  'aiSummaryEnUs',
  'aiSummaryZhCn',
  'aiSummaryZhTw',
  'aiSummaryModel',
  'aiSummaryGeneratedAt',
])

/** Fields intentionally excluded per plan scope (sales attribution, logistics, contract). */
const SCOPE_EXCLUDED_FROM_PROFILE: ReadonlySet<keyof KolDetail> = new Set([
  'promoCode',
  'orderCount',
  'totalAmount',
  'totalAmountCurrency',
  'shipments',
  'trackingNumber',
  'shippingStatus',
  'shippingInfo',
  'contractFiles',
  'contractImages',
  'contractLinks',
])

interface KolProfileFieldSpec {
  key: keyof KolDetail
  label: string
  maxChars?: number
}

const KOL_PROFILE_FIELDS: readonly KolProfileFieldSpec[] = [
  { key: 'id', label: 'KOL ID' },
  { key: 'groupId', label: 'Group ID' },
  { key: 'kolCode', label: 'KOL Code' },
  { key: 'name', label: 'Name' },
  { key: 'accountName', label: 'Account / Channel Name' },
  { key: 'tier', label: 'Tier' },
  { key: 'rating', label: 'Rating' },
  { key: 'followers', label: 'Followers (aggregate)' },
  { key: 'vertical', label: 'Content Vertical / Niche' },
  { key: 'info', label: 'Info', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'background', label: 'Background', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'remarks', label: 'Remarks', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'country', label: 'Country' },
  { key: 'region', label: 'Region' },
  { key: 'state', label: 'State/Province' },
  { key: 'county', label: 'County/District' },
  { key: 'city', label: 'City' },
  { key: 'town', label: 'Town' },
  { key: 'circle', label: 'Circle/Area' },
  { key: 'postalCode', label: 'Postal Code' },
  { key: 'addressLine1', label: 'Address Line 1' },
  { key: 'addressLine2', label: 'Address Line 2' },
  { key: 'viewCount', label: 'View Count' },
  { key: 'engagementRate', label: 'Engagement Rate' },
  { key: 'cooperationYears', label: 'Cooperation Years' },
  { key: 'historyLinks', label: 'History Links' },
  { key: 'currentStatus', label: 'Current Status' },
  { key: 'cooperationStatus', label: 'Cooperation Status' },
  { key: 'ownerId', label: 'Owner ID' },
  { key: 'lastContactAt', label: 'Last Contact At' },
  { key: 'reconnectAt', label: 'Reconnect At' },
  { key: 'commission', label: 'Commission' },
  { key: 'meetAt', label: 'Met At' },
  { key: 'checkCycleDays', label: 'Check Cycle (days)' },
  { key: 'testedProducts', label: 'Tested Products' },
  { key: 'createdAt', label: 'Record Created At' },
  { key: 'updatedAt', label: 'Record Updated At' },
]

const CHANNEL_PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  bilibili: 'BiliBili',
  tiktok: 'TikTok',
  douyin: 'Douyin',
  weibo: 'Weibo',
  wechat: 'WeChat',
  xiaohongshu: 'Xiaohongshu (RED)',
  twitter: 'X (Twitter)',
  x: 'X (Twitter)',
  threads: 'Threads',
  linkedin: 'LinkedIn',
  other: 'Other',
}

/**
 * Normalizes a Kol field value for the prompt, returning null if empty or not meaningful.
 * @param value - Raw field value.
 * @returns Prompt-safe string, or null to skip the field.
 */
function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no'
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null
    }
    return String(value)
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null
    }
    return value.join(', ')
  }
  return null
}

/**
 * Truncates a string to `max` characters with an ellipsis.
 * @param value - Source string.
 * @param max - Maximum length.
 * @returns Truncated string.
 */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`
}

/**
 * Appends CRM profile fields to the prompt parts.
 * @param kol - Loaded KOL detail.
 * @param parts - Mutable line buffer.
 * @returns Nothing.
 */
function appendKolProfile(kol: KolDetail, parts: string[]): void {
  parts.push('=== KOL Profile (CRM fields) ===')
  for (const { key, label, maxChars } of KOL_PROFILE_FIELDS) {
    if (EXCLUDED_FROM_PROFILE.has(key)) {
      continue
    }
    if (SCOPE_EXCLUDED_FROM_PROFILE.has(key)) {
      continue
    }
    const formatted = formatValue(kol[key])
    if (formatted === null) {
      continue
    }
    const cap = maxChars ?? DEFAULT_PROFILE_STRING_MAX
    parts.push(`${label}: ${truncate(formatted, cap)}`)
  }
}

/**
 * Appends social channel rows to the prompt parts.
 * @param channels - Loaded channel rows.
 * @param parts - Mutable line buffer.
 * @returns Nothing.
 */
function appendChannels(channels: KolChannel[], parts: string[]): void {
  if (channels.length === 0) {
    parts.push('')
    parts.push('=== Social Channels ===')
    parts.push('No channels recorded.')
    return
  }
  parts.push('')
  parts.push('=== Social Channels ===')
  const limited = channels.slice(0, MAX_CHANNELS)
  limited.forEach((ch, i) => {
    const isOther = ch.platformKey === 'other'
    const customName =
      isOther && ch.platformCustomName?.trim()
        ? ` (${ch.platformCustomName.trim()})`
        : ''
    const platformLabel =
      (CHANNEL_PLATFORM_LABELS[ch.platformKey] ?? ch.platformKey) + customName
    const handle = ch.handle ? ` @${ch.handle}` : ''
    const followers = ch.followers !== null ? ` | Followers: ${ch.followers}` : ''
    const contentCount =
      ch.contentCount !== null ? ` | Content count: ${ch.contentCount}` : ''
    parts.push(
      `${i + 1}. [${platformLabel}]${handle}${followers}${contentCount} — ${ch.channelUrl}`,
    )
    if (ch.enrichmentError) {
      parts.push(`   Enrichment error: ${truncate(ch.enrichmentError, 300)}`)
    }
  })
  if (channels.length > MAX_CHANNELS) {
    parts.push(`(${channels.length - MAX_CHANNELS} more channels not shown)`)
  }
}

/**
 * Appends communication-history entries to the prompt parts.
 * @param history - Communication log.
 * @param parts - Mutable line buffer.
 * @returns Nothing.
 */
function appendCommunicationHistory(
  history: KolCommunicationEntry[],
  parts: string[],
): void {
  if (history.length === 0) {
    return
  }
  parts.push('')
  parts.push('=== Communication History ===')
  const sorted = [...history].sort((a, b) => (a.at > b.at ? -1 : 1))
  const limited = sorted.slice(0, MAX_COMM_HISTORY)
  limited.forEach((entry, i) => {
    const by = entry.by ? ` (${entry.by})` : ''
    const content = truncate(entry.content, MAX_COMM_CONTENT_CHARS)
    parts.push(`${i + 1}. [${entry.at}]${by} ${content}`)
  })
  if (history.length > MAX_COMM_HISTORY) {
    parts.push(`(${history.length - MAX_COMM_HISTORY} older entries not shown)`)
  }
}

/** Arguments for {@link buildKolInsightContext}. */
export interface KolInsightContextArgs {
  kol: KolDetail
  channels?: KolChannel[]
}

/**
 * Builds the plain-text user-message context sent to the AI for KOL insight generation.
 * Includes KOL profile fields, social channels, and communication history.
 * Deliberately excludes sales attribution (promo codes, order totals), logistics, and contracts.
 *
 * @param args - Loaded KOL record plus separately loaded channels.
 * @returns Context string ready to be used as a user prompt.
 */
export function buildKolInsightContext(args: KolInsightContextArgs): string {
  const { kol } = args
  const channels = args.channels ?? []

  const parts: string[] = []
  appendKolProfile(kol, parts)
  appendChannels(channels, parts)
  appendCommunicationHistory(kol.communicationHistory ?? [], parts)

  return parts.join('\n')
}
