import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import { TE_ADMIN_STATUSES, type TeStatus } from '@/constants/te-tracking-stages'
import { profileDisplayLabel } from '@/utils/profile-display-label'

export type { TeStatus }
export { TE_ADMIN_STATUSES, TE_SUBMISSION_STATUSES } from '@/constants/te-tracking-stages'

/** Work-email classification persisted on a T&E submission (set by te). */
export type TeEmailCategory =
  | 'us_law_enforcement'
  | 'us_government'
  | 'popular_provider'
  | 'other'

/** Origin of the classification: automatic (submit/backfill) or a reviewer correction. */
export type TeEmailCategorySource = 'auto' | 'manual'

/** Persisted ERP pre-order push state. */
export type TeErpPushStatus = 'pending' | 'pushed' | 'failed'

/** Trusted reason for a completed T&E workflow. */
export type TeCompletionReason = 'payment' | 'returned'

/** Retired database status accepted only during the staged cutover window. */
export type TeLegacyStatus = 'testing_complete' | 'closed'

/** Canonical status plus optional staged-cutover source status. */
export interface TeNormalizedStatus {
  status: TeStatus
  legacyStatus: TeLegacyStatus | null
  legacyManualReviewRequired: boolean
}

/** Evidence columns used to safely interpret a retired `closed` row. */
export interface TeLegacyCompletionEvidence {
  completionReason?: unknown
  paymentSucceededAt?: unknown
  returnConfirmedAt?: unknown
}

/** A single T&E submission record from Supabase */
export interface TeSubmission {
  id: string
  createdAt: string
  updatedAt: string
  status: TeStatus
  legacyStatus: TeLegacyStatus | null
  legacyManualReviewRequired: boolean
  email: string | null
  emailDomain: string | null
  emailCategory: TeEmailCategory
  emailCategorySource: TeEmailCategorySource
  identityType: string | null
  firstName: string | null
  lastName: string | null
  agency: string | null
  deptRole: string | null
  mobile: string | null
  mobileCountry: string | null
  shippingCountry: string | null
  shippingCity: string | null
  shippingState: string | null
  shippingZip: string | null
  shippingStreet: string | null
  shippingApt: string | null
  product: string[] | null
  approvedProductIds: string[] | null
  approvedProductsConfirmedBy: string | null
  approvedProductsConfirmedAt: string | null
  erpPushStatus: TeErpPushStatus | null
  erpPushAt: string | null
  erpPushError: string | null
  intendedUse: string | null
  duration: string | null
  consentAfterTest: string | null
  consentShareMedia: boolean | null
  consentCommunity: boolean | null
  consentWall: boolean | null
  consentMarketingEmails: boolean | null
  source: string
  ip: string | null
  country: string | null
  countryCode: string | null
  userAgent: string | null
  browserLanguage: string | null
  handledBy: string | null
  handledByUserId: string | null
  handledAt: string | null
  testingStartAt: string | null
  testingCompletedAt: string | null
  evaluationDueAt: string | null
  evaluationFirstSentAt: string | null
  evaluationLastRemindedAt: string | null
  evaluationSubmittedAt: string | null
  settlementStartedAt: string | null
  settlementLastRemindedAt: string | null
  returnRequestedAt: string | null
  returnConfirmedAt: string | null
  returnConfirmedBy: string | null
  paymentSucceededAt: string | null
  completedAt: string | null
  completionReason: TeCompletionReason | null
  notes: string | null
  /** Linked T&E community account when the submission is tied to a portal user. */
  communityAccountId: string | null
  /** Trilingual AI review suggestion, generated on demand from the AI review tab. */
  aiReviewEnUs: string | null
  aiReviewZhCn: string | null
  aiReviewZhTw: string | null
  /**
   * Model that generated the saved review: either a legacy bare vendor slug
   * (`gemini`, `chatgpt`, `claude`, `grok`) or a specific catalog model id
   * (e.g. `gpt-5.6-luna`) once per-model selection is used.
   */
  aiReviewModel: string | null
  aiReviewGeneratedAt: string | null
}

/** All work-email categories in sidebar display order. */
export const TE_EMAIL_CATEGORIES: TeEmailCategory[] = [
  'us_law_enforcement',
  'us_government',
  'popular_provider',
  'other',
]

/**
 * Normalize unknown status values from database rows.
 *
 * @param value - Raw status value from Supabase row
 * @param evidence - Trusted terminal evidence from the same row
 * @returns Canonical status plus staged-cutover metadata
 * @throws When the database contains a status outside the current contract
 */
export function normalizeTeSubmissionStatus(
  value: unknown,
  evidence: TeLegacyCompletionEvidence = {},
): TeNormalizedStatus {
  if (typeof value === 'string' && TE_ADMIN_STATUSES.includes(value as TeStatus)) {
    return {
      status: value as TeStatus,
      legacyStatus: null,
      legacyManualReviewRequired: false,
    }
  }
  if (value === 'testing_complete') {
    return {
      status: 'settlement_pending',
      legacyStatus: null,
      legacyManualReviewRequired: false,
    }
  }
  if (value === 'closed') {
    const completed = hasTrustedLegacyCompletionEvidence(evidence)
    return {
      status: completed ? 'completed' : 'settlement_pending',
      legacyStatus: null,
      legacyManualReviewRequired: false,
    }
  }
  throw new Error(`Unsupported T&E submission status: ${String(value)}`)
}

/**
 * Check whether a retired `closed` row has consistent terminal evidence.
 *
 * @param evidence - Completion reason and matching trusted timestamp
 * @returns True only for a payment or returned evidence pair
 */
export function hasTrustedLegacyCompletionEvidence(
  evidence: TeLegacyCompletionEvidence,
): boolean {
  const hasPaymentTimestamp =
    typeof evidence.paymentSucceededAt === 'string'
    && evidence.paymentSucceededAt.trim() !== ''
  const hasReturnTimestamp =
    typeof evidence.returnConfirmedAt === 'string'
    && evidence.returnConfirmedAt.trim() !== ''
  return (
    (evidence.completionReason === 'payment' && hasPaymentTimestamp)
    || (evidence.completionReason === 'returned' && hasReturnTimestamp)
  )
}

/**
 * Return database status candidates for a canonical status filter.
 *
 * @param status - Canonical thirteen-state status
 * @returns Candidate values requiring row-level canonicalization
 */
export function teDatabaseStatusCandidates(status: TeStatus): string[] {
  return [status]
}

/**
 * Report whether a status filter needs row-level legacy evidence checks.
 *
 * @param status - Canonical thirteen-state status
 * @returns True for settlement pending and completed
 */
export function teStatusRequiresLegacyEvidenceFilter(status: TeStatus): boolean {
  return status === 'settlement_pending' || status === 'completed'
}

/**
 * Normalize a nullable ERP push status.
 *
 * @param value - Raw `erp_push_status` value
 * @returns Validated ERP push status or null
 * @throws When a non-null value falls outside the database contract
 */
function normalizeTeErpPushStatus(value: unknown): TeErpPushStatus | null {
  if (value == null) return null
  if (value === 'pending' || value === 'pushed' || value === 'failed') return value
  throw new Error(`Unsupported T&E ERP push status: ${String(value)}`)
}

/**
 * Normalize a nullable completion reason.
 *
 * @param value - Raw `completion_reason` value
 * @returns Trusted completion reason or null
 */
function normalizeTeCompletionReason(value: unknown): TeCompletionReason | null {
  return value === 'payment' || value === 'returned' ? value : null
}

/**
 * Normalize unknown email-category values from database rows.
 *
 * @param value - Raw `email_category` value from Supabase row
 * @returns A safe TeEmailCategory value (defaults to `other`)
 */
function normalizeTeEmailCategory(value: unknown): TeEmailCategory {
  return typeof value === 'string' && TE_EMAIL_CATEGORIES.includes(value as TeEmailCategory)
    ? (value as TeEmailCategory)
    : 'other'
}

/**
 * Normalize a nullable AI review provider model: either a legacy bare
 * vendor slug or a specific catalog model id (both plain, non-empty text).
 *
 * @param value - Raw `ai_review_model` value
 * @returns Trimmed model reference or null
 */
function normalizeTeAiReviewModel(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Map a raw Supabase row to {@link TeSubmission}.
 *
 * @param row - Supabase row
 * @returns Typed submission
 */
export function mapTeSubmissionFromRow(row: Record<string, unknown>): TeSubmission {
  const normalizedStatus = normalizeTeSubmissionStatus(row.status, {
    completionReason: row.completion_reason,
    paymentSucceededAt: row.payment_succeeded_at,
    returnConfirmedAt: row.return_confirmed_at,
  })
  return {
    id: row.id as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    status: normalizedStatus.status,
    legacyStatus: normalizedStatus.legacyStatus,
    legacyManualReviewRequired: normalizedStatus.legacyManualReviewRequired,
    email: (row.email as string) ?? null,
    emailDomain: (row.email_domain as string) ?? null,
    emailCategory: normalizeTeEmailCategory(row.email_category),
    emailCategorySource: row.email_category_source === 'manual' ? 'manual' : 'auto',
    identityType: (row.identity_type as string) ?? null,
    firstName: (row.first_name as string) ?? null,
    lastName: (row.last_name as string) ?? null,
    agency: (row.agency as string) ?? null,
    deptRole: (row.dept_role as string) ?? null,
    mobile: (row.mobile as string) ?? null,
    mobileCountry: (row.mobile_country as string) ?? null,
    shippingCountry: (row.shipping_country as string) ?? null,
    shippingCity: (row.shipping_city as string) ?? null,
    shippingState: (row.shipping_state as string) ?? null,
    shippingZip: (row.shipping_zip as string) ?? null,
    shippingStreet: (row.shipping_street as string) ?? null,
    shippingApt: (row.shipping_apt as string) ?? null,
    product: Array.isArray(row.product) ? (row.product as string[]) : null,
    approvedProductIds: Array.isArray(row.approved_product_ids)
      ? (row.approved_product_ids as string[])
      : null,
    approvedProductsConfirmedBy:
      typeof row.approved_products_confirmed_by === 'string'
        ? row.approved_products_confirmed_by
        : null,
    approvedProductsConfirmedAt: (row.approved_products_confirmed_at as string) ?? null,
    erpPushStatus: normalizeTeErpPushStatus(row.erp_push_status),
    erpPushAt: (row.erp_push_at as string) ?? null,
    erpPushError: (row.erp_push_error as string) ?? null,
    intendedUse: (row.intended_use as string) ?? null,
    duration: (row.duration as string) ?? null,
    consentAfterTest: (row.consent_after_test as string) ?? null,
    consentShareMedia: typeof row.consent_share_media === 'boolean' ? row.consent_share_media : null,
    consentCommunity: typeof row.consent_community === 'boolean' ? row.consent_community : null,
    consentWall: typeof row.consent_wall === 'boolean' ? row.consent_wall : null,
    consentMarketingEmails:
      typeof row.consent_marketing_emails === 'boolean' ? row.consent_marketing_emails : null,
    source: (row.source as string) ?? 'smart_forms',
    ip: (row.ip as string) ?? null,
    country: (row.country as string) ?? null,
    countryCode: (row.country_code as string) ?? null,
    userAgent: (row.user_agent as string) ?? null,
    browserLanguage: (row.browser_language as string) ?? null,
    handledBy: (row.handled_by as string) ?? null,
    handledByUserId:
      typeof row.handled_by_user_id === 'string' ? row.handled_by_user_id : null,
    handledAt: (row.handled_at as string) ?? null,
    testingStartAt: (row.testing_start_at as string) ?? null,
    testingCompletedAt: (row.testing_completed_at as string) ?? null,
    evaluationDueAt: (row.evaluation_due_at as string) ?? null,
    evaluationFirstSentAt: (row.evaluation_first_sent_at as string) ?? null,
    evaluationLastRemindedAt: (row.evaluation_last_reminded_at as string) ?? null,
    evaluationSubmittedAt: (row.evaluation_submitted_at as string) ?? null,
    settlementStartedAt: (row.settlement_started_at as string) ?? null,
    settlementLastRemindedAt: (row.settlement_last_reminded_at as string) ?? null,
    returnRequestedAt: (row.return_requested_at as string) ?? null,
    returnConfirmedAt: (row.return_confirmed_at as string) ?? null,
    returnConfirmedBy:
      typeof row.return_confirmed_by === 'string' ? row.return_confirmed_by : null,
    paymentSucceededAt: (row.payment_succeeded_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
    completionReason: normalizeTeCompletionReason(row.completion_reason),
    notes: (row.notes as string) ?? null,
    communityAccountId:
      typeof row.community_account_id === 'string' ? row.community_account_id : null,
    aiReviewEnUs: (row.ai_review_en_us as string) ?? null,
    aiReviewZhCn: (row.ai_review_zh_cn as string) ?? null,
    aiReviewZhTw: (row.ai_review_zh_tw as string) ?? null,
    aiReviewModel: normalizeTeAiReviewModel(row.ai_review_model),
    aiReviewGeneratedAt: (row.ai_review_generated_at as string) ?? null,
  }
}

/**
 * Count T&E submissions visible under RLS, optionally limited to `created_at >= sinceIso`.
 *
 * @param sinceIso - When set, only rows created on or after this ISO timestamp; when `null`, all rows
 * @returns Count, or 0 if Supabase is off or the query fails
 */
export async function fetchTeSubmissionsCount(sinceIso: string | null): Promise<number> {
  if (!isSupabaseConfigured || !supabase) {
    return 0
  }
  let query = fromLoose('te_submissions').select('id', { count: 'exact', head: true })
  if (sinceIso) {
    query = query.gte('created_at', sinceIso)
  }
  const { count, error } = await query
  if (error) {
    return 0
  }
  return count ?? 0
}

/**
 * Load one T&E submission by id under the caller's read policy.
 *
 * @param submissionId - Submission UUID
 * @returns Submission or null when it does not exist or is not visible
 */
export async function fetchTeSubmissionById(
  submissionId: string,
): Promise<TeSubmission | null> {
  if (!isSupabaseConfigured || !supabase || !submissionId.trim()) return null
  const { data, error } = await fromLoose('te_submissions')
    .select('*')
    .eq('id', submissionId.trim())
    .maybeSingle()
  if (error) throw error
  return data ? mapTeSubmissionFromRow(data) : null
}

/**
 * Resolve CRM profile display labels for operator UUID columns.
 *
 * @param userIds - Profile / auth user ids (e.g. approved_products_confirmed_by)
 * @returns Map of id → display_name / full_name / email (missing ids omitted)
 */
export async function fetchProfileDisplayLabelsByIds(
  userIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const ids = [
    ...new Set(
      userIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0),
    ),
  ]
  if (ids.length === 0 || !isSupabaseConfigured || !supabase) return labels

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, full_name, email')
    .in('id', ids)
  if (error || !data) return labels

  for (const row of data) {
    const label = profileDisplayLabel(row)
    if (label) labels.set(row.id, label)
  }
  return labels
}
