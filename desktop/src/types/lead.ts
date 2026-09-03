/**
 * Lead (sales lead / pool) types aligned with workbench-web Admin Leads models.
 */

import type { LeadExtendedFieldKey } from '@/constants/lead-extended-form'

/** Pipeline status stored in `leads.status` (matches `lead_status_enum`). */
export type LeadStatus = 'unhandled' | 'following_up' | 'qualified' | 'disqualified'

export const LEAD_STATUS_VALUES: LeadStatus[] = [
  'unhandled',
  'following_up',
  'qualified',
  'disqualified',
]

/**
 * Left-rail scope for the Admin leads list.
 * `all` = public pool + own leads (web parity); `public` / `mine` narrow the pool.
 */
export type LeadPoolScope = 'all' | 'public' | 'mine'

/** Sidebar filter: a pool scope, or a specific pipeline status. */
export type LeadListScopeFilter = LeadPoolScope | LeadStatus

/**
 * One social / IM row: preset `platform` slug (or legacy free text) plus `account`.
 * When `platform` is `other`, `custom` stores the user-visible platform name.
 */
export interface LeadSocialAccountEntry {
  platform: string
  account: string
  /** Set when `platform` is `other` — custom platform label. */
  custom?: string
}

/**
 * One phone row on a lead contact card (ISO country + T&amp;E dial string).
 * `dialCode` / `number` remain optional for legacy JSON parse paths.
 */
export interface LeadContactPhoneRow {
  /** ISO 3166-1 alpha-2 (PhoneInput selection). */
  phoneCountry: string
  /** Full dial string, e.g. `+886 9123456789`. */
  phone: string
  /** @deprecated Prefer `phone` + `phoneCountry`. */
  dialCode?: string
  /** @deprecated Prefer `phone` + `phoneCountry`. */
  number?: string
}

/**
 * One contact block on a lead (card UI); persisted in `lead_contacts` (+ phones/socials).
 */
export interface LeadContactProfile {
  /** Stable client id (UUID) for list keys and reorder. */
  id: string
  /** Primary flag; exactly one profile should be primary per lead. */
  isPrimary: boolean
  /**
   * Pinned `customer_contacts.id` for this card when the lead is linked to a customer;
   * empty = auto (primary name / first row).
   */
  customerContactId: string
  /** Not stored on the lead — identity comes from `customers` / `customer_contacts`. */
  nickname: string
  /** Not stored on the lead — use customer contact email. */
  email: string
  socialAccounts: LeadSocialAccountEntry[]
  /** Lead-local phones (`lead_contact_phones`); cleared in UI when CRM contact identity is used. */
  phones: LeadContactPhoneRow[]
  /** `''` = unset; `'male'` / `'female'` for the lead contact gender radio. */
  gender: string
  jobTitle: string
  contactRemarks: string
  contactImageUrl: string
}

/**
 * Optional lead attributes formerly in `extended_fields` JSONB.
 * Lead-level scalars now live on `leads` columns; this type remains for form helpers.
 */
export type LeadExtendedFields = Partial<Record<LeadExtendedFieldKey, string>> & {
  socialAccounts?: LeadSocialAccountEntry[]
  /** Legacy: multiple names from the old customer multi-select. */
  selectedContactNames?: string[]
  /** @deprecated Loaded from `lead_contacts`; kept for transitional form helpers. */
  contactProfiles?: LeadContactProfile[]
  /**
   * Legacy / mirror: primary card’s pick is also stored here on save for older readers.
   */
  customerContactId?: string
}

/**
 * Compact linked-customer row used by lead form import helpers
 * (website / country / primary contact).
 */
export interface LeadLinkedCustomer {
  id: string
  companyName: string
  website?: string | null
  companyCountry?: string | null
  primaryContactName?: string | null
  contactName?: string | null
  phone?: string | null
  email?: string | null
}

/**
 * Lead record.
 *
 * Pool semantics:
 * - `ownerId === null`  → public pool, claimable by any authenticated user.
 * - `ownerId === <uid>` → private pool, owned by that user.
 */
export interface Lead {
  id: string
  companyName: string
  contactName: string | null
  phone: string | null
  phoneCountry: string | null
  email: string | null
  status: LeadStatus
  lat: number | null
  lng: number | null
  ownerId: string | null
  claimedAt: string | null
  customerId: string | null
  lastContactDate: string | null
  createdAt: string
  updatedAt: string
  /**
   * Lead-level optional fields (former `extended_fields` scalars).
   * Prefer reading scalar keys here; contact cards use {@link Lead.contactProfiles}.
   */
  extendedFields: LeadExtendedFields
  /** Contact cards from `lead_contacts` (+ phones / socials). */
  contactProfiles: LeadContactProfile[]
}

/** Editable lead fields shared by create and update. */
export interface LeadFormInput {
  companyName: string
  contactName: string | null
  phone: string | null
  phoneCountry: string | null
  email: string | null
  status: LeadStatus
  customerId: string | null
  lastContactDate: string | null
  extendedFields: LeadExtendedFields
  contactProfiles: LeadContactProfile[]
}

/** Paginated list result. */
export interface LeadListResult {
  rows: Lead[]
  totalCount: number
}
