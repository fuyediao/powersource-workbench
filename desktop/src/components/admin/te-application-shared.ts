/**
 * Shared types and helpers for the T&E Applications admin UI (Vue TeManagementView parity).
 */

import type { TFunction } from 'i18next'
import {
  TE_STATUS_BADGE_CLASSES,
  type TeStatus,
} from '@/constants/te-tracking-stages'
import { PHONE_COUNTRY_CODES } from '@/constants/phone-country-codes'
import type { AppLanguage } from '@/i18n'
import type { TeEmailCategory, TeErpPushStatus, TeSubmission } from '@/services/te-submissions-repository'
import type { TeApplicationUpdatePatch } from '@/services/te-workflow-api'
import { TeWorkflowApiError } from '@/services/te-workflow-api'
import { getCountryDisplayName } from '@/utils/map/country-alpha2'

/** Detail tab keys for a T&E application. */
export type TeApplicationDetailTab = 'application' | 'aiReview' | 'operations' | 'audit'

/** Editable tri-state consent value: '' means not recorded. */
export type ConsentDraft = '' | 'yes' | 'no'

/** Review dialog decision. */
export type ReviewDecision = 'approved' | 'invalid'

/** ERP reconciliation outcome. */
export type ReconcileResolution = 'accepted' | 'not_accepted'

/** In-flight workflow mutation. */
export type WorkflowAction = 'review' | 'push' | 'reconcile' | 'tracking' | 'return' | null

/** ERP badge state including derived unknown / not-started. */
export type ErpDisplayStatus = TeErpPushStatus | 'unknown' | 'not_started'

/** Independently copyable shipping lines. */
export type ShippingAddressCopyLineKey = 'locationCode' | 'fullAddress' | 'postalLine'

/** Draft form state for the Application tab edit mode. */
export interface ApplicationDraft {
  email: string
  emailCategory: TeEmailCategory
  identityType: string
  firstName: string
  lastName: string
  agency: string
  deptRole: string
  mobile: string
  mobileCountry: string
  shippingCountry: string
  shippingState: string
  shippingCity: string
  shippingZip: string
  shippingStreet: string
  shippingApt: string
  product: string[]
  intendedUse: string
  duration: string
  consentAfterTest: ConsentDraft
  consentShareMedia: ConsentDraft
  consentCommunity: ConsentDraft
  consentWall: ConsentDraft
  consentMarketingEmails: ConsentDraft
}

/** Catalog product lookup used by the approve dialog. */
export interface CatalogProductMeta {
  name: string
  itemName: string
  tePriceUsd: number | null
}

/** Requested-product row in the approve dialog side panel. */
export interface RequestedApprovalProduct {
  id: string
  name: string
  itemName: string
  showErpName: boolean
  available: boolean
  selected: boolean
}

/** Duration values accepted on the application form. */
export const DURATION_OPTIONS = ['30days', '60days'] as const

/** Email-category sidebar / filter options. */
export const TE_CATEGORY_OPTIONS: Array<{ value: TeEmailCategory; labelKey: string }> = [
  { value: 'us_law_enforcement', labelKey: 'admin.te.sidebar.category.usLawEnforcement' },
  { value: 'us_government', labelKey: 'admin.te.sidebar.category.usGovernment' },
  { value: 'popular_provider', labelKey: 'admin.te.sidebar.category.popularProvider' },
  { value: 'other', labelKey: 'admin.te.sidebar.category.other' },
]

/** Shared field input chrome for application edit. */
export const TE_FIELD_INPUT_CLASS =
  'mt-1 w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:border-white/10 dark:bg-white/5'

/** Shared section card chrome. */
export const TE_SECTION_CLASS =
  'overflow-hidden rounded-2xl border border-ink/10 bg-white/60 dark:border-white/10 dark:bg-white/5'

/** Shared section header chrome. */
export const TE_SECTION_HEADER_CLASS =
  'border-b border-brand/20 bg-brand/10 px-4 py-2.5'

/**
 * Map i18next language to the Electron AppLanguage union.
 *
 * @param language - i18n.language
 * @returns Supported app language
 */
export function toAppLanguage(language: string): AppLanguage {
  if (language === 'zh-CN') return 'zh-CN'
  if (language === 'zh-TW') return 'zh-TW'
  return 'en'
}

/**
 * Whether an ISO / free-text shipping country is outside the PhoneInput country list.
 *
 * @param value - Stored shipping country
 * @returns True when the value is non-empty and not a known ISO code
 */
export function isCustomShippingCountry(value: string): boolean {
  const code = value.trim().toUpperCase()
  if (!code) return false
  return !PHONE_COUNTRY_CODES.some((country) => country.code === code)
}

/**
 * Match a shipping-country row against the combobox search (ISO, English name, localized).
 *
 * @param iso - ISO 3166-1 alpha-2
 * @param englishName - English label from PHONE_COUNTRY_CODES
 * @param queryRaw - Combobox search string
 * @param locale - Active UI locale
 * @returns True when the row should be shown
 */
export function shippingIsoMatchesSearch(
  iso: string,
  englishName: string,
  queryRaw: string,
  locale: string,
): boolean {
  const q = queryRaw.trim()
  if (!q) return true
  const qLower = q.toLowerCase()
  if (iso.toLowerCase() === qLower || iso.toLowerCase().includes(qLower)) return true
  if (englishName.toLowerCase().includes(qLower)) return true
  for (const loc of [locale, 'zh-TW', 'zh-CN', 'en-US']) {
    const label = getCountryDisplayName(iso, loc)
    if (!label) continue
    if (loc.startsWith('zh') && label.includes(q)) return true
    if (!loc.startsWith('zh') && label.toLowerCase().includes(qLower)) return true
  }
  return false
}

/**
 * Convert a nullable boolean consent column to its tri-state draft value.
 *
 * @param value - Stored boolean or null
 * @returns Draft tri-state
 */
export function toConsentDraft(value: boolean | null): ConsentDraft {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  return ''
}

/**
 * Convert a tri-state draft value back to a nullable boolean, or undefined when unset.
 *
 * @param value - Draft tri-state
 * @returns Boolean or undefined
 */
export function fromConsentDraft(value: ConsentDraft): boolean | undefined {
  if (value === 'yes') return true
  if (value === 'no') return false
  return undefined
}

/**
 * Build an edit draft snapshot from a submission.
 *
 * @param submission - Open submission
 * @returns Application draft
 */
export function buildApplicationDraft(submission: TeSubmission): ApplicationDraft {
  return {
    email: submission.email ?? '',
    emailCategory: submission.emailCategory,
    identityType: submission.identityType ?? '',
    firstName: submission.firstName ?? '',
    lastName: submission.lastName ?? '',
    agency: submission.agency ?? '',
    deptRole: submission.deptRole ?? '',
    mobile: submission.mobile ?? '',
    mobileCountry: submission.mobileCountry ?? '',
    shippingCountry: submission.shippingCountry ?? '',
    shippingState: submission.shippingState ?? '',
    shippingCity: submission.shippingCity ?? '',
    shippingZip: submission.shippingZip ?? '',
    shippingStreet: submission.shippingStreet ?? '',
    shippingApt: submission.shippingApt ?? '',
    product: [...(submission.product ?? [])],
    intendedUse: submission.intendedUse ?? '',
    duration: submission.duration ?? '',
    consentAfterTest:
      submission.consentAfterTest === 'yes' || submission.consentAfterTest === 'no'
        ? submission.consentAfterTest
        : '',
    consentShareMedia: toConsentDraft(submission.consentShareMedia),
    consentCommunity: toConsentDraft(submission.consentCommunity),
    consentWall: toConsentDraft(submission.consentWall),
    consentMarketingEmails: toConsentDraft(submission.consentMarketingEmails),
  }
}

/**
 * Compare two nullable arrays of ids for equality (order-insensitive).
 *
 * @param a - First id list
 * @param b - Second id list
 * @returns True when both contain the same ids
 */
export function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

/**
 * Build the minimal patch of fields that changed between the draft and the original submission.
 *
 * @param draft - Application edit draft
 * @param original - Open submission
 * @returns Sparse update patch
 */
export function buildApplicationPatch(
  draft: ApplicationDraft,
  original: TeSubmission,
): TeApplicationUpdatePatch {
  const patch: TeApplicationUpdatePatch = {}
  if (draft.email.trim() !== (original.email ?? '')) patch.email = draft.email.trim()
  if (draft.emailCategory !== original.emailCategory) patch.emailCategory = draft.emailCategory
  if (draft.identityType.trim() !== (original.identityType ?? '')) {
    patch.identityType = draft.identityType.trim()
  }
  if (draft.firstName.trim() !== (original.firstName ?? '')) patch.firstName = draft.firstName.trim()
  if (draft.lastName.trim() !== (original.lastName ?? '')) patch.lastName = draft.lastName.trim()
  if (draft.agency.trim() !== (original.agency ?? '')) patch.agency = draft.agency.trim()
  if (draft.deptRole.trim() !== (original.deptRole ?? '')) patch.deptRole = draft.deptRole.trim()
  if (draft.mobile.trim() !== (original.mobile ?? '')) patch.mobile = draft.mobile.trim()
  if (draft.mobileCountry.trim() !== (original.mobileCountry ?? '')) {
    patch.mobileCountry = draft.mobileCountry.trim()
  }
  if (draft.shippingCountry.trim() !== (original.shippingCountry ?? '')) {
    patch.shippingCountry = draft.shippingCountry.trim()
  }
  if (draft.shippingState.trim() !== (original.shippingState ?? '')) {
    patch.shippingState = draft.shippingState.trim()
  }
  if (draft.shippingCity.trim() !== (original.shippingCity ?? '')) {
    patch.shippingCity = draft.shippingCity.trim()
  }
  if (draft.shippingZip.trim() !== (original.shippingZip ?? '')) patch.shippingZip = draft.shippingZip.trim()
  if (draft.shippingStreet.trim() !== (original.shippingStreet ?? '')) {
    patch.shippingStreet = draft.shippingStreet.trim()
  }
  if (draft.shippingApt.trim() !== (original.shippingApt ?? '')) patch.shippingApt = draft.shippingApt.trim()
  if (!sameIdSet(draft.product, original.product ?? [])) patch.product = draft.product
  if (draft.intendedUse.trim() !== (original.intendedUse ?? '')) {
    patch.intendedUse = draft.intendedUse.trim()
  }
  if (draft.duration.trim() !== (original.duration ?? '')) patch.duration = draft.duration.trim()
  if (draft.consentAfterTest !== (original.consentAfterTest ?? '')) {
    patch.consentAfterTest = draft.consentAfterTest
  }
  if (toConsentDraft(original.consentShareMedia) !== draft.consentShareMedia) {
    patch.consentShareMedia = fromConsentDraft(draft.consentShareMedia)
  }
  if (toConsentDraft(original.consentCommunity) !== draft.consentCommunity) {
    patch.consentCommunity = fromConsentDraft(draft.consentCommunity)
  }
  if (toConsentDraft(original.consentWall) !== draft.consentWall) {
    patch.consentWall = fromConsentDraft(draft.consentWall)
  }
  if (toConsentDraft(original.consentMarketingEmails) !== draft.consentMarketingEmails) {
    patch.consentMarketingEmails = fromConsentDraft(draft.consentMarketingEmails)
  }
  return patch
}

/**
 * Return localized category text.
 *
 * @param t - i18n translator
 * @param category - Email category
 * @returns Localized category label
 */
export function categoryLabel(t: TFunction, category: TeEmailCategory): string {
  const match = TE_CATEGORY_OPTIONS.find((option) => option.value === category)
  return match ? t(match.labelKey) : category
}

/**
 * Return category badge classes.
 *
 * @param category - Email category
 * @returns Tailwind classes
 */
export function categoryBadgeClass(category: TeEmailCategory): string {
  switch (category) {
    case 'us_law_enforcement':
      return 'border-badge-indigo-line bg-badge-indigo-fill text-badge-indigo'
    case 'us_government':
      return 'border-badge-sky-line bg-badge-sky-fill text-badge-sky'
    case 'popular_provider':
      return 'border-badge-violet-line bg-badge-violet-fill text-badge-violet'
    default:
      return 'border-badge-zinc-line bg-badge-zinc-fill text-badge-zinc'
  }
}

/**
 * Return workflow status badge classes.
 *
 * @param status - Submission status
 * @returns Tailwind classes
 */
export function statusClass(status: TeStatus): string {
  return TE_STATUS_BADGE_CLASSES[status]
}

/**
 * Return ERP state badge classes.
 *
 * @param status - ERP display state
 * @returns Tailwind classes
 */
export function erpStatusClass(status: ErpDisplayStatus): string {
  switch (status) {
    case 'pushed':
      return 'border-badge-emerald-line bg-badge-emerald-fill text-badge-emerald'
    case 'failed':
      return 'border-badge-rose-line bg-badge-rose-fill text-badge-rose'
    case 'pending':
      return 'border-badge-amber-line bg-badge-amber-fill text-badge-amber'
    case 'unknown':
      return 'border-badge-orange-line bg-badge-orange-fill text-badge-orange'
    default:
      return 'border-badge-zinc-line bg-badge-zinc-fill text-badge-zinc'
  }
}

/**
 * Format an ISO timestamp.
 *
 * @param iso - ISO timestamp or null
 * @returns Localized date and time or an em dash
 */
export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

/**
 * Format an ISO timestamp as a date for list rows.
 *
 * @param iso - ISO timestamp or null
 * @returns Localized date or an em dash
 */
export function formatListDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : '—'
}

/**
 * Build an applicant display name.
 *
 * @param submission - Submission record
 * @returns Full name or an em dash
 */
export function displayName(submission: TeSubmission): string {
  const parts = [submission.firstName, submission.lastName].filter(Boolean)
  return parts.length ? parts.join(' ') : '—'
}

/**
 * Translate a stored yes/no consent string.
 *
 * @param t - i18n translator
 * @param value - Consent value
 * @returns Localized value
 */
export function consentLabel(t: TFunction, value: string | null): string {
  if (!value) return '—'
  if (value.toLowerCase() === 'yes') return t('common.yes')
  if (value.toLowerCase() === 'no') return t('common.no')
  return value
}

/**
 * Format a nullable boolean consent column.
 *
 * @param t - i18n translator
 * @param value - Stored boolean or null
 * @returns Localized yes/no or em dash
 */
export function booleanConsentLabel(t: TFunction, value: boolean | null): string {
  if (value === null) return '—'
  return value ? t('common.yes') : t('common.no')
}

/**
 * Format a Stripe amount.
 *
 * @param cents - Amount in minor units
 * @param currency - ISO currency code
 * @returns Localized monetary value
 */
export function formatPaymentAmount(cents: number, currency: string): string {
  const code = (currency || 'usd').toUpperCase()
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`
  }
}

/**
 * Format T&E retail MSRP (USD) for the approve-dialog catalog list.
 *
 * @param value - Price in U.S. dollars
 * @returns Formatted currency or an em dash
 */
export function formatTeRetailUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Sum known T&E retail MSRP values for the given catalog product ids.
 *
 * @param ids - product_catalog ids
 * @param catalogById - Catalog lookup
 * @returns Total USD (missing prices count as zero)
 */
export function sumTeRetailUsd(
  ids: string[],
  catalogById: Map<string, CatalogProductMeta>,
): number {
  let total = 0
  for (const id of ids) {
    const price = catalogById.get(id)?.tePriceUsd
    if (price != null && Number.isFinite(price)) total += price
  }
  return total
}

/**
 * Halve a USD amount to cents: odd cents +1 then /2; even cents /2 only.
 *
 * @param retailPriceUsd - Full retail total
 * @returns 50% USD amount
 */
export function halfRetailTotalUsd(retailPriceUsd: number): number {
  const retailCents = Math.round(retailPriceUsd * 100)
  const halfCents = retailCents % 2 === 0 ? retailCents / 2 : (retailCents + 1) / 2
  return halfCents / 100
}

/**
 * Resolve a localized safe workflow error.
 *
 * @param t - i18n translator
 * @param exists - i18n key existence check
 * @param value - Unknown thrown value
 * @returns Localized operator-safe message
 */
export function workflowErrorMessage(
  t: TFunction,
  exists: (key: string) => boolean,
  value: unknown,
): string {
  if (value instanceof TeWorkflowApiError) {
    const key = `admin.te.workflowError.${value.code}`
    if (exists(key)) return t(key)
    return t('admin.te.workflowError.genericWithCode', { code: value.code })
  }
  return t('admin.te.workflowError.generic')
}

/**
 * Stored label for CountryFlag (ISO code or free-text country).
 *
 * @param label - Country name or alpha-2 from DB
 * @returns Value to pass as countryName, or null
 */
export function countryInputForFlag(label: string | null | undefined): string | null {
  const normalized = label?.trim()
  return normalized || null
}
