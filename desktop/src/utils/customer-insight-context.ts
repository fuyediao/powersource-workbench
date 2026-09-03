import type { AppLanguage } from '@/i18n'
import type {
  CustomerChannel,
  CustomerDetail,
  CustomerVisitLog,
  CustomerWorkItem,
} from '@/types/customer'

/** Maximum number of work items included in the context. */
const MAX_WORK_ITEMS = 10

/** Maximum number of visit logs included in the context. */
const MAX_VISIT_LOGS = 8

/** Maximum characters per visit log content field. */
const MAX_VISIT_CONTENT_CHARS = 300

/** Maximum number of customer channels included in the context. */
const MAX_CHANNELS = 20

/** Maximum characters per channel notes field. */
const MAX_CHANNEL_NOTES_CHARS = 200

/** Default max characters for a single customer profile string field. */
const DEFAULT_PROFILE_STRING_MAX = 900

/** Longer cap for description, notes, and Specific-Info paragraphs. */
const LONG_PROFILE_STRING_MAX = 2800

/** Maximum total context length (chars) sent to the AI model. */
const MAX_TOTAL_CHARS = 14000

/** Max chars per proxy-assignment label (company name, sales rep name from proxy worker). */
const MAX_PROXY_ASSIGNMENT_CHARS = 400

/** Customer columns that hold prior AI output — excluded so the model reasons from source data only. */
const EXCLUDED_FROM_PROFILE: ReadonlySet<keyof CustomerDetail> = new Set([
  'aiSummary',
  'aiSummaryEnUs',
  'aiSummaryZhCn',
  'aiSummaryZhTw',
  'aiSummaryModel',
  'aiSummaryGeneratedAt',
])

/**
 * One scalar field from {@link CustomerDetail} to include in the AI prompt, with an English label.
 */
interface CustomerProfileFieldSpec {
  key: keyof CustomerDetail
  label: string
  /** When set, string values are truncated to this length; otherwise {@link DEFAULT_PROFILE_STRING_MAX}. */
  maxChars?: number
}

/**
 * Ordered list of all CRM customer profile fields sent to the insight model.
 * Mirrors the shape of {@link CustomerDetail}; excludes {@link EXCLUDED_FROM_PROFILE}.
 */
const CUSTOMER_PROFILE_FIELDS: readonly CustomerProfileFieldSpec[] = [
  { key: 'id', label: 'Customer ID' },
  { key: 'groupId', label: 'Group ID' },
  { key: 'customerCode', label: 'Customer Code' },
  { key: 'companyName', label: 'Company Name' },
  { key: 'shortName', label: 'Short Name' },
  { key: 'ownerUserId', label: 'Owner User ID' },
  { key: 'contactName', label: 'Contact Name (legacy)' },
  { key: 'primaryContactName', label: 'Primary Contact Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'fax', label: 'Fax' },
  { key: 'website', label: 'Website' },
  { key: 'taxId', label: 'Tax ID' },
  { key: 'address', label: 'Map Address' },
  { key: 'latitude', label: 'Latitude' },
  { key: 'longitude', label: 'Longitude' },
  { key: 'note', label: 'Note', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'category', label: 'Category' },
  { key: 'customerType', label: 'Customer Type' },
  { key: 'customerLevel', label: 'Customer Level' },
  { key: 'industry', label: 'Industry' },
  { key: 'employeeCount', label: 'Employee Count' },
  { key: 'customerChannel', label: 'Customer Channel' },
  { key: 'customerAttribute', label: 'Customer Attribute' },
  { key: 'marketSegment', label: 'Market Segment' },
  { key: 'marketSubSegment', label: 'Market Sub-segment' },
  { key: 'customerSource', label: 'Customer Source' },
  { key: 'paymentCycle', label: 'Payment Cycle' },
  { key: 'relationshipStartDate', label: 'Relationship Start Date' },
  { key: 'creditLimit', label: 'Credit Limit' },
  { key: 'paymentMethod', label: 'Payment Method' },
  { key: 'currency', label: 'Currency' },
  { key: 'priceType', label: 'Price Type' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'handlerDepartment', label: 'Handler Department' },
  { key: 'handlerDeveloper', label: 'Handler Developer' },
  { key: 'handlerFollower', label: 'Handler Follower' },
  { key: 'companyCountry', label: 'Company HQ Country' },
  { key: 'companyState', label: 'Company HQ State/Province' },
  { key: 'companyCity', label: 'Company HQ City' },
  { key: 'companyPostalCode', label: 'Company HQ Postal Code' },
  { key: 'companyAddressLine1', label: 'Company HQ Address Line 1' },
  { key: 'companyAddressLine2', label: 'Company HQ Address Line 2' },
  { key: 'description', label: 'Description', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'logoUrl', label: 'Logo URL' },
  { key: 'marketRegionPopulation', label: 'Market Region / Target Population', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'businessTypeChannel', label: 'Business Type / Channel', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'salesProductBrand', label: 'Sales Product Brand', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'managementPhilosophy', label: 'Management Philosophy', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'managementDirection', label: 'Management Direction', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'managementPolicy', label: 'Management Policy', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'managementCharacteristics', label: 'Management Characteristics', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'salesCapability', label: 'Sales Capability', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'developmentPotential', label: 'Development Potential', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'ownerFutureOutlook', label: "Owner's Future Outlook", maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'companyStrategy', label: 'Company Strategy', maxChars: LONG_PROFILE_STRING_MAX },
  { key: 'orderDiscount', label: 'Order Discount', maxChars: LONG_PROFILE_STRING_MAX },
  {
    key: 'procurementAmountProductStatus',
    label: 'Procurement Amount and Product Status',
    maxChars: LONG_PROFILE_STRING_MAX,
  },
  { key: 'companyBusinessStatus', label: 'Company Business Status', maxChars: LONG_PROFILE_STRING_MAX },
  {
    key: 'transactionStatus',
    label: 'Transaction Status (Market Image / Reputation / Financial / Credit)',
    maxChars: LONG_PROFILE_STRING_MAX,
  },
  {
    key: 'yearlySalesActivityStatusIssues',
    label: 'Yearly Sales Activity Status and Issues',
    maxChars: LONG_PROFILE_STRING_MAX,
  },
  {
    key: 'cooperationStatusStrategy',
    label: 'Cooperation Status and Strategy',
    maxChars: LONG_PROFILE_STRING_MAX,
  },
  { key: 'createdAt', label: 'Record Created At' },
  { key: 'updatedAt', label: 'Record Updated At' },
]

/** Display name for each customer-channel `platformKey`; falls back to the raw key. */
const CHANNEL_PLATFORM_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  facebook: 'Facebook',
  instagram: 'Instagram',
  discord: 'Discord',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  'twitter-x': 'X (Twitter)',
  line: 'LINE',
  reddit: 'Reddit',
  other: 'Other',
}

export interface CustomerInsightContextArgs {
  customer: CustomerDetail
  workItems: CustomerWorkItem[]
  visitLogs: CustomerVisitLog[]
  /** Customer social-media / platform channels (channels sub-table). Optional. */
  channels?: CustomerChannel[]
  /**
   * Display label for the proxy agency company holding this customer’s grant (from proxy worker).
   * Matches the left-rail "Agency" line; omitted when unset or placeholder.
   */
  proxyAgentDisplayLabel?: string | null
  /**
   * Display label for the sales rep assigned to this customer under that agency (from proxy worker).
   * Matches the left-rail "Sales Rep" line; omitted when unset or placeholder.
   */
  proxySalesRepDisplayLabel?: string | null
  /** Pre-rendered activity narrative string (already translated). */
  activityNarrative: string
  /** Active app locale (cache key; same prompt produces all three languages). */
  uiLocale: AppLanguage
}

/**
 * Normalizes a customer field value for the prompt, or `null` if empty / not meaningful.
 *
 * @param value - Raw property from {@link CustomerDetail}
 * @returns Trimmed string representation or null
 */
function formatCustomerProfileValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return String(value)
  }
  if (typeof value === 'string') {
    const t = value.trim()
    return t.length > 0 ? t : null
  }
  return null
}

/**
 * Truncates a string for inclusion in the AI context.
 *
 * @param s - Non-empty string
 * @param max - Maximum UTF-16 code units before ellipsis
 * @returns Possibly truncated string
 */
function truncateProfileString(s: string, max: number): string {
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

/**
 * Appends every non-empty CRM profile field (except prior AI summary columns) to `parts`.
 *
 * @param customer - Full customer row
 * @param parts - Mutable lines array for the prompt
 */
function appendFullCustomerProfile(customer: CustomerDetail, parts: string[]): void {
  parts.push('=== Customer Profile (all CRM fields) ===')
  for (const { key, label, maxChars } of CUSTOMER_PROFILE_FIELDS) {
    if (EXCLUDED_FROM_PROFILE.has(key)) continue
    const raw = customer[key]
    const formatted = formatCustomerProfileValue(raw)
    if (formatted === null) continue
    const cap = maxChars ?? DEFAULT_PROFILE_STRING_MAX
    parts.push(`${label}: ${truncateProfileString(formatted, cap)}`)
  }
}

/**
 * Returns a trimmed insight label or `null` if empty / UI placeholder (em dash, hyphen).
 *
 * @param value - Raw label from admin UI
 */
function normalizeOptionalInsightLabel(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const t = value.trim()
  if (t.length === 0 || t === '—' || t === '-' || t === '–') return null
  return truncateProfileString(t, MAX_PROXY_ASSIGNMENT_CHARS)
}

/**
 * Appends proxy agency and sales-rep lines resolved by the admin app (proxy worker), when present.
 *
 * @param parts - Prompt lines
 * @param proxyAgentDisplayLabel - Company name or login fallback
 * @param proxySalesRepDisplayLabel - Rep full name or username fallback
 */
function appendProxyAssignment(
  parts: string[],
  proxyAgentDisplayLabel?: string | null,
  proxySalesRepDisplayLabel?: string | null,
): void {
  const agent = normalizeOptionalInsightLabel(proxyAgentDisplayLabel)
  const rep = normalizeOptionalInsightLabel(proxySalesRepDisplayLabel)
  if (agent === null && rep === null) return
  parts.push('')
  parts.push('=== Proxy assignment (admin-resolved) ===')
  if (agent !== null) parts.push(`Assigned proxy agency (company): ${agent}`)
  if (rep !== null) parts.push(`Assigned sales rep: ${rep}`)
}

/**
 * Builds the plain-text user-message context sent to the AI for customer insight generation.
 * All data is truncated to keep token cost low.
 */
export function buildCustomerInsightContext(args: CustomerInsightContextArgs): string {
  const {
    customer,
    workItems,
    visitLogs,
    channels = [],
    proxyAgentDisplayLabel,
    proxySalesRepDisplayLabel,
    activityNarrative,
  } = args

  const parts: string[] = []

  appendFullCustomerProfile(customer, parts)
  appendProxyAssignment(parts, proxyAgentDisplayLabel, proxySalesRepDisplayLabel)

  // --- Channels (social-media / platform links from "Channels" tab) ---
  if (channels.length > 0) {
    parts.push('')
    parts.push('=== Channels ===')
    const limited = channels.slice(0, MAX_CHANNELS)
    limited.forEach((c, i) => {
      const isOther = c.platformKey === 'other'
      const otherName = isOther && c.platformCustomName?.trim()
        ? `: ${c.platformCustomName.trim()}`
        : ''
      const platformLabel = isOther
        ? `Other${otherName}`
        : CHANNEL_PLATFORM_LABELS[c.platformKey] ?? c.platformKey
      parts.push(`${i + 1}. [${platformLabel}] ${c.channelUrl}`)
      if (c.notes?.trim()) {
        const notes = c.notes.trim()
        const truncated =
          notes.length > MAX_CHANNEL_NOTES_CHARS
            ? notes.slice(0, MAX_CHANNEL_NOTES_CHARS) + '…'
            : notes
        parts.push(`   Notes: ${truncated}`)
      }
    })
    if (channels.length > MAX_CHANNELS) {
      parts.push(`(${channels.length - MAX_CHANNELS} more channels not shown)`)
    }
  }

  // --- Activity narrative ---
  if (activityNarrative.trim()) {
    parts.push('')
    parts.push('=== Recent Activity ===')
    parts.push(activityNarrative.trim())
  }

  // --- Work items (incomplete first, then complete) ---
  parts.push('')
  parts.push('=== Work Items ===')
  if (workItems.length === 0) {
    parts.push('No work items.')
  } else {
    const sorted = [...workItems].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const da = a.dueDate ?? a.createdAt
      const db = b.dueDate ?? b.createdAt
      return da < db ? -1 : 1
    })
    const limited = sorted.slice(0, MAX_WORK_ITEMS)
    limited.forEach((item, i) => {
      const status = item.completed ? '[Done]' : '[Open]'
      const due = item.dueDate ? ` (due: ${item.dueDate})` : ''
      const importance = item.importance ? ` [${item.importance}]` : ''
      const assignee = item.assigneeName ? ` – ${item.assigneeName}` : ''
      parts.push(`${i + 1}. ${status}${importance} ${item.subject}${due}${assignee}`)
      if (item.remarks) parts.push(`   Remarks: ${item.remarks}`)
    })
    if (workItems.length > MAX_WORK_ITEMS) {
      parts.push(`(${workItems.length - MAX_WORK_ITEMS} more work items not shown)`)
    }
  }

  // --- Visit logs ---
  parts.push('')
  parts.push('=== Visit Logs ===')
  if (visitLogs.length === 0) {
    parts.push('No visit records available.')
  } else {
    const sorted = [...visitLogs].sort((a, b) => {
      const da = a.visitDate ?? a.createdAt
      const db = b.visitDate ?? b.createdAt
      return da > db ? -1 : 1
    })
    const limited = sorted.slice(0, MAX_VISIT_LOGS)
    limited.forEach((log, i) => {
      const date = log.visitDate ?? log.createdAt.slice(0, 10)
      const subject = log.subject ?? '(no subject)'
      parts.push(`${i + 1}. [${date}] ${subject}`)
      if (log.contactPerson) parts.push(`   Contact: ${log.contactPerson}`)
      if (log.interestedProducts?.length) {
        parts.push(`   Interested Products: ${log.interestedProducts.join(', ')}`)
      }
      if (log.content) {
        const truncated =
          log.content.length > MAX_VISIT_CONTENT_CHARS
            ? log.content.slice(0, MAX_VISIT_CONTENT_CHARS) + '…'
            : log.content
        parts.push(`   Notes: ${truncated}`)
      }
    })
    if (visitLogs.length > MAX_VISIT_LOGS) {
      parts.push(`(${visitLogs.length - MAX_VISIT_LOGS} older visit logs not shown)`)
    }
  }

  let full = parts.join('\n')
  if (full.length > MAX_TOTAL_CHARS) {
    full = full.slice(0, MAX_TOTAL_CHARS) + '\n\n(Context truncated due to length limit.)'
  }
  return full
}
