import { LEAD_SOCIAL_PLATFORM_OTHER_ID } from '@/constants/lead-social-platforms'
import type { LeadExtendedFieldKey } from '@/constants/lead-extended-form'
import type { CustomerContact } from '@/types/customer'
import type {
  LeadContactPhoneRow,
  LeadContactProfile,
  LeadExtendedFields,
  LeadLinkedCustomer,
  LeadSocialAccountEntry,
} from '@/types/lead'
import {
  buildLeadImportedContactSummary,
  resolveCustomerContactForLead,
  type LeadImportedContactSummary,
} from '@/utils/lead-customer-contact-for-lead'

/** Stored **`LeadContactProfile.gender`**: empty = unset in UI, otherwise English slugs. */
export type LeadContactGenderSlug = '' | 'male' | 'female'

/**
 * Maps free-text / legacy values to **`''`**, **`'male'`**, or **`'female'`** for the gender radio UI and saves.
 *
 * @param g - Raw gender string
 * @returns Canonical slug; unknown values (including legacy custom text) map to **`''`**.
 */
export function normalizedLeadContactGenderSlug(g: string): LeadContactGenderSlug {
  const v = g.trim().toLowerCase()
  if (v === 'male' || v === 'm' || v === '男') return 'male'
  if (v === 'female' || v === 'f' || v === '女') return 'female'
  return ''
}

/**
 * One empty social row (duplicated here to avoid a circular import with **`lead-extended-fields`**).
 */
function emptyLeadSocialAccountRowLocal(): LeadSocialAccountEntry {
  return { platform: '', account: '' }
}

/**
 * Legacy social rows from **`LeadExtendedFields`** (no import from **`lead-extended-fields`**).
 *
 * @param ef - Extended fields
 */
function legacySocialRowsFromExtended(ef: LeadExtendedFields | undefined): LeadSocialAccountEntry[] {
  const base = ef ?? {}
  if (base.socialAccounts?.length) {
    return base.socialAccounts.map((r) => ({
      platform: r.platform ?? '',
      account: r.account ?? '',
      custom: r.custom ?? '',
    }))
  }
  const p = typeof base.socialPlatform === 'string' ? base.socialPlatform.trim() : ''
  if (p) {
    const c = typeof base.socialPlatformCustom === 'string' ? base.socialPlatformCustom.trim() : ''
    return [
      {
        platform: p,
        account: '',
        ...(p === LEAD_SOCIAL_PLATFORM_OTHER_ID && c ? { custom: c } : {}),
      },
    ]
  }
  return [emptyLeadSocialAccountRowLocal()]
}

/** Top-level extended string keys stored per {@link LeadContactProfile} instead of on the root map. */
export const LEAD_CONTACT_PROFILE_TOP_LEVEL_KEYS = [
  'contactNickname',
  'gender',
  'jobTitle',
  'contactRemarks',
  'contactImageUrl',
] as const satisfies readonly LeadExtendedFieldKey[]

/**
 * @returns A new UUID string for **`LeadContactProfile.id`**
 */
export function newLeadContactProfileId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `lc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * @returns One empty phone row for the contact card editor
 */
export function emptyLeadContactPhoneRow(): LeadContactPhoneRow {
  return { phoneCountry: '', phone: '', dialCode: '', number: '' }
}

/**
 * @param isPrimary - Whether this is the default primary card
 * @returns A fresh profile with one social row and one phone row
 */
export function emptyLeadContactProfile(isPrimary: boolean): LeadContactProfile {
  return {
    id: newLeadContactProfileId(),
    isPrimary,
    customerContactId: '',
    nickname: '',
    email: '',
    socialAccounts: [emptyLeadSocialAccountRowLocal()],
    phones: [emptyLeadContactPhoneRow()],
    gender: '',
    jobTitle: '',
    contactRemarks: '',
    contactImageUrl: '',
  }
}

/**
 * @param profiles - Non-empty list
 * @returns The profile marked primary, or index **0**
 */
export function primaryLeadContactProfile(profiles: readonly LeadContactProfile[]): LeadContactProfile | undefined {
  if (!profiles.length) return undefined
  const idx = profiles.findIndex((p) => p.isPrimary)
  return profiles[idx >= 0 ? idx : 0]
}

/**
 * Keeps each non-empty **`customerContactId`** on at most one profile (**first index wins**).
 *
 * @param profiles - Profile rows (shallow-copied per changed row)
 * @returns New list safe for the editor / JSONB
 */
export function dedupeCustomerContactIdsAcrossProfiles(profiles: readonly LeadContactProfile[]): LeadContactProfile[] {
  const seen = new Set<string>()
  return profiles.map((p) => {
    const id = (p.customerContactId ?? '').trim()
    if (!id) return p
    if (seen.has(id)) return { ...p, customerContactId: '' }
    seen.add(id)
    return p
  })
}

/**
 * Which CRM contact id to use for **read-only import** on one card when several **`contactProfiles`** exist.
 *
 * - **Trimmed `profile.customerContactId`** → that id.
 * - **Empty** and an **earlier** card has an explicit id → **`null`** (no auto import; UI shows the unselected state).
 * - **Empty** and this is the **first** empty card in list order → **`undefined`** (use **auto**: primary name / first row).
 * - **Empty** but not the first empty card → **`null`** (later empty cards do not reuse auto).
 *
 * @param profile - Card row
 * @param profileIndex - Index in **`allProfiles`**
 * @param allProfiles - Full list in display order
 */
export function effectivePinOrAutoCustomerContactId(
  profile: LeadContactProfile,
  profileIndex: number,
  allProfiles: readonly LeadContactProfile[],
): string | undefined | null {
  const trimmed = (profile.customerContactId ?? '').trim()
  if (trimmed) return trimmed
  const earlierHasExplicit = allProfiles.some((p, j) => j < profileIndex && (p.customerContactId ?? '').trim())
  if (earlierHasExplicit) return null
  const firstEmptyIdx = allProfiles.findIndex((p) => !(p.customerContactId ?? '').trim())
  if (profileIndex !== firstEmptyIdx) return null
  return undefined
}

/**
 * CRM import summary for one contact card respecting multi-card **auto / unselected** rules.
 *
 * @param customer - Linked customer
 * @param contacts - **`customer_contacts`** for that customer
 * @param profile - Card row
 * @param profileIndex - Index in **`allProfiles`**
 * @param allProfiles - Full list in display order
 */
export function buildLeadImportedContactSummaryForContactCard(
  customer: LeadLinkedCustomer | null | undefined,
  contacts: readonly CustomerContact[],
  profile: LeadContactProfile,
  profileIndex: number,
  allProfiles: readonly LeadContactProfile[],
): LeadImportedContactSummary | null {
  if (!customer?.id) return null
  const eff = effectivePinOrAutoCustomerContactId(profile, profileIndex, allProfiles)
  if (eff === null) return null
  return buildLeadImportedContactSummary(customer, contacts, eff)
}

/**
 * **`customer_contacts.id`** actually used by this card after **auto** (when **`effectivePinOrAutoCustomerContactId`** is **`undefined`**).
 *
 * @param customer - Linked customer
 * @param contacts - CRM contact rows
 * @param profile - Card row
 * @param profileIndex - Index in **`allProfiles`**
 * @param allProfiles - Full list in display order
 * @returns Id or **`undefined`** when this card does not consume a CRM row (unselected state or no customer).
 */
export function resolvedCustomerContactIdForProfile(
  customer: LeadLinkedCustomer | null | undefined,
  contacts: readonly CustomerContact[],
  profile: LeadContactProfile,
  profileIndex: number,
  allProfiles: readonly LeadContactProfile[],
): string | undefined {
  if (!customer?.id) return undefined
  const eff = effectivePinOrAutoCustomerContactId(profile, profileIndex, allProfiles)
  if (eff === null) return undefined
  if (typeof eff === 'string' && eff.trim()) return eff.trim()
  return resolveCustomerContactForLead(customer, contacts, undefined)?.id
}

/**
 * Parses **`contactProfiles`** from raw **`extended_fields`** JSON.
 *
 * @param raw - Parsed JSON object
 * @returns Valid profiles or **`undefined`**
 */
export function parseContactProfilesFromJson(raw: Record<string, unknown>): LeadContactProfile[] | undefined {
  const v = raw.contactProfiles
  if (!Array.isArray(v) || v.length === 0) return undefined
  const out: LeadContactProfile[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : newLeadContactProfileId()
    const nickname = typeof rec.nickname === 'string' ? rec.nickname : ''
    const email = typeof rec.email === 'string' ? rec.email : ''
    const isPrimary = rec.isPrimary === true
    const saRaw = rec.socialAccounts
    const socialAccounts: LeadSocialAccountEntry[] = []
    if (Array.isArray(saRaw)) {
      for (const row of saRaw) {
        if (!row || typeof row !== 'object') continue
        const r = row as Record<string, unknown>
        const platform = typeof r.platform === 'string' ? r.platform.trim() : ''
        const account = typeof r.account === 'string' ? r.account.trim() : ''
        const custom = typeof r.custom === 'string' ? r.custom.trim() : ''
        if (!platform && !account) continue
        socialAccounts.push({
          platform,
          account,
          ...(platform && custom ? { custom } : {}),
        })
      }
    }
    if (socialAccounts.length === 0) socialAccounts.push(emptyLeadSocialAccountRowLocal())
    const phonesRaw = rec.phones
    const phones: LeadContactPhoneRow[] = []
    if (Array.isArray(phonesRaw)) {
      for (const pr of phonesRaw) {
        if (!pr || typeof pr !== 'object') continue
        const p = pr as Record<string, unknown>
        const phoneCountry =
          typeof p.phoneCountry === 'string' ? p.phoneCountry.trim().toUpperCase() : ''
        const phone = typeof p.phone === 'string' ? p.phone.trim() : ''
        const dialCode = typeof p.dialCode === 'string' ? p.dialCode.trim() : ''
        const number = typeof p.number === 'string' ? p.number.trim() : ''
        if (!phoneCountry && !phone && !dialCode && !number) continue
        phones.push({ phoneCountry, phone, dialCode, number })
      }
    }
    if (phones.length === 0) phones.push(emptyLeadContactPhoneRow())
    out.push({
      id,
      isPrimary,
      customerContactId: typeof rec.customerContactId === 'string' ? rec.customerContactId.trim() : '',
      nickname,
      email,
      socialAccounts,
      phones,
      gender: normalizedLeadContactGenderSlug(typeof rec.gender === 'string' ? rec.gender : ''),
      jobTitle: typeof rec.jobTitle === 'string' ? rec.jobTitle : '',
      contactRemarks: typeof rec.contactRemarks === 'string' ? rec.contactRemarks : '',
      contactImageUrl: typeof rec.contactImageUrl === 'string' ? rec.contactImageUrl : '',
    })
  }
  if (out.length === 0) return undefined
  ensureSinglePrimary(out)
  return dedupeCustomerContactIdsAcrossProfiles(out)
}

function cloneProfile(p: LeadContactProfile): LeadContactProfile {
  return {
    ...p,
    socialAccounts: p.socialAccounts.map((r) => ({ ...r })),
    phones: p.phones.map((x) => ({ ...x })),
  }
}

/**
 * Name and email on a lead are sourced from **`customers`** / **`customer_contacts`**.
 * Phones from `lead_contact_phones` are kept for manual (non-CRM) identity.
 *
 * @param p - Profile row
 * @returns Copy with CRM name/email cleared
 */
function stripLeadProfileCRMIdentity(p: LeadContactProfile): LeadContactProfile {
  return {
    ...p,
    nickname: '',
    email: '',
  }
}

/**
 * @param list - Raw profile list for the editor
 * @returns Profiles with CRM identity stripped, **gender** normalized, and exactly one **`isPrimary`**
 */
function finalizeLeadProfilesForEditor(list: LeadContactProfile[]): LeadContactProfile[] {
  const source = list.length ? list.map((p) => cloneProfile(p)) : [emptyLeadContactProfile(true)]
  ensureSinglePrimary(source)
  return source.map((p) => {
    const s = stripLeadProfileCRMIdentity(p)
    return { ...s, gender: normalizedLeadContactGenderSlug(s.gender) }
  })
}

/**
 * Ensures exactly one **`isPrimary`** flag across profiles (first marked, else index 0).
 *
 * @param profiles - Mutable list
 */
export function ensureSinglePrimary(profiles: LeadContactProfile[]): void {
  if (!profiles.length) return
  let idx = profiles.findIndex((p) => p.isPrimary)
  if (idx < 0) idx = 0
  profiles.forEach((p, i) => {
    p.isPrimary = i === idx
  })
}

/**
 * Collapses a profile list to **one** card: prefers **`isPrimary`**, else index **0**.
 * Use when a caller must keep a **single** profile (e.g. legacy clamp in watchers).
 *
 * @param profiles - Source list (may be empty)
 * @returns Exactly one profile, **`isPrimary` = true**
 */
export function clampContactProfilesToSingle(
  profiles: readonly LeadContactProfile[],
): LeadContactProfile[] {
  if (!profiles.length) return [emptyLeadContactProfile(true)]
  const copy: LeadContactProfile[] = profiles.map((p) => ({
    ...p,
    socialAccounts: p.socialAccounts.map((r) => ({ ...r })),
    phones: p.phones.map((x) => ({ ...x })),
  }))
  ensureSinglePrimary(copy)
  const idx = copy.findIndex((p) => p.isPrimary)
  const chosen = copy[idx >= 0 ? idx : 0]!
  return [{ ...chosen, isPrimary: true }]
}

/**
 * Builds editor state: prefers `lead_contacts` rows, else legacy **`extendedFields.contactProfiles`**.
 *
 * @param ef - Parsed **`Lead.extendedFields`**
 * @param contactProfiles - Rows from `lead_contacts` when available
 * @returns Non-empty profile list for the drawer
 */
export function extractContactProfilesForForm(
  ef: LeadExtendedFields | undefined,
  contactProfiles?: readonly LeadContactProfile[] | null,
): LeadContactProfile[] {
  if (contactProfiles?.length) {
    return finalizeLeadProfilesForEditor(contactProfiles.map((p) => cloneProfile(p)))
  }
  if (ef?.contactProfiles?.length) {
    const list = finalizeLeadProfilesForEditor(ef.contactProfiles.map((p) => cloneProfile(p)))
    const rootCc = (ef.customerContactId ?? '').trim()
    if (rootCc) {
      const pi = list.findIndex((p) => p.isPrimary)
      const i = pi >= 0 ? pi : 0
      const cur = list[i]!
      if (!(cur.customerContactId ?? '').trim()) list[i] = { ...cur, customerContactId: rootCc }
    }
    return dedupeCustomerContactIdsAcrossProfiles(list)
  }

  const base = ef ?? {}
  const names =
    base.selectedContactNames?.filter((n) => typeof n === 'string' && n.trim()) ??
    (typeof base.contactNickname === 'string' && base.contactNickname.trim()
      ? [base.contactNickname.trim()]
      : [])
  const social = legacySocialRowsFromExtended(base)
  if (names.length === 0) {
    const p = emptyLeadContactProfile(true)
    p.nickname = ''
    p.email = ''
    p.socialAccounts = social.length ? social.map((r) => ({ ...r })) : [emptyLeadSocialAccountRowLocal()]
    p.gender = normalizedLeadContactGenderSlug(typeof base.gender === 'string' ? base.gender : '')
    p.jobTitle = typeof base.jobTitle === 'string' ? base.jobTitle.trim() : ''
    p.contactRemarks = typeof base.contactRemarks === 'string' ? base.contactRemarks.trim() : ''
    p.contactImageUrl = typeof base.contactImageUrl === 'string' ? base.contactImageUrl.trim() : ''
    return finalizeLeadProfilesForEditor([p])
  }
  const p = emptyLeadContactProfile(true)
  p.nickname = ''
  p.socialAccounts = social.length ? social.map((r) => ({ ...r })) : [emptyLeadSocialAccountRowLocal()]
  p.gender = normalizedLeadContactGenderSlug(typeof base.gender === 'string' ? base.gender : '')
  p.jobTitle = typeof base.jobTitle === 'string' ? base.jobTitle.trim() : ''
  p.contactRemarks = typeof base.contactRemarks === 'string' ? base.contactRemarks.trim() : ''
  p.contactImageUrl = typeof base.contactImageUrl === 'string' ? base.contactImageUrl.trim() : ''
  return finalizeLeadProfilesForEditor([p])
}

/**
 * Strips per-contact keys from a string map before merging **`contactProfiles`** into **`extended_fields`**.
 *
 * @param form - Full extended form row
 * @returns Shallow copy without profile-owned keys
 */
export function omitLeadContactProfileStringKeys(
  form: Record<LeadExtendedFieldKey, string>,
): Record<LeadExtendedFieldKey, string> {
  const out = { ...form }
  for (const k of LEAD_CONTACT_PROFILE_TOP_LEVEL_KEYS) {
    out[k] = ''
  }
  return out
}

/**
 * Serializes profiles for JSONB (drops empty optional fragments where practical).
 *
 * @param profiles - Editor list
 * @returns JSON-safe array
 */
export function sanitizeContactProfilesForSave(profiles: readonly LeadContactProfile[]): LeadContactProfile[] {
  const list = profiles.length
    ? profiles.map((p) => ({
        ...p,
        socialAccounts: p.socialAccounts.map((r) => ({ ...r })),
        phones: p.phones.map((x) => ({ ...x })),
      }))
    : [emptyLeadContactProfile(true)]
  ensureSinglePrimary(list)
  const deduped = dedupeCustomerContactIdsAcrossProfiles(list)
  return deduped.map((p) => {
    const socialAccounts = p.socialAccounts
      .map((r) => ({
        platform: r.platform.trim(),
        account: r.account.trim(),
        ...(r.custom?.trim() ? { custom: r.custom.trim() } : {}),
      }))
      .filter((r) => r.platform && r.account)
    const phones = p.phones
      .map((ph) => {
        const phoneCountry = (ph.phoneCountry ?? '').trim().toUpperCase()
        let phone = (ph.phone ?? '').trim()
        if (!phone && (ph.dialCode || ph.number)) {
          const dial = (ph.dialCode ?? '').trim()
          const num = (ph.number ?? '').replace(/\D/g, '')
          phone = dial && num ? `${dial} ${num}` : dial || num
        }
        return { phoneCountry, phone, dialCode: '', number: '' }
      })
      .filter((ph) => ph.phone.trim() !== '')
    return {
      id: p.id.trim() || newLeadContactProfileId(),
      isPrimary: !!p.isPrimary,
      customerContactId: (p.customerContactId ?? '').trim(),
      nickname: '',
      email: '',
      socialAccounts: socialAccounts.length ? socialAccounts : [emptyLeadSocialAccountRowLocal()],
      phones: phones.length ? phones : [emptyLeadContactPhoneRow()],
      gender: normalizedLeadContactGenderSlug(p.gender),
      jobTitle: p.jobTitle.trim(),
      contactRemarks: p.contactRemarks.trim(),
      contactImageUrl: p.contactImageUrl.trim(),
    }
  })
}

/**
 * Joins non-empty nicknames for **`leads.contact_name`** (legacy only — identity is normally from the customer).
 *
 * @param profiles - Saved profiles
 * @returns Joined display string or empty
 */
export function leadContactProfilesToContactName(profiles: readonly LeadContactProfile[]): string {
  return profiles
    .map((p) => p.nickname.trim())
    .filter(Boolean)
    .join('、')
}

/**
 * True if any profile has a **platform** set and empty **account** on a social row.
 *
 * @param profiles - Contact cards
 */
export function hasIncompleteSocialInContactProfiles(profiles: readonly LeadContactProfile[]): boolean {
  return profiles.some((p) =>
    p.socialAccounts.some((r) => r.platform.trim() !== '' && r.account.trim() === ''),
  )
}
