import {
  LEAD_EXTENDED_FIELD_KEYS,
  emptyLeadExtendedForm,
  type LeadExtendedFieldKey,
} from '@/constants/lead-extended-form'
import { LEAD_SOCIAL_PLATFORM_OTHER_ID, isKnownLeadSocialPlatform } from '@/constants/lead-social-platforms'
import type { LeadContactProfile, LeadExtendedFields, LeadSocialAccountEntry } from '@/types/lead'
import {
  LEAD_CONTACT_PROFILE_TOP_LEVEL_KEYS,
  parseContactProfilesFromJson,
} from '@/utils/lead-contact-profiles'

/**
 * Parses `extended_fields.socialAccounts` from raw JSON into typed rows.
 *
 * @param raw - Parsed JSON object from Postgres
 * @returns Validated account rows (may be empty)
 */
/** Splits legacy **`contact_name`** when several names were joined. */
const LEAD_CONTACT_NAME_SPLIT_PATTERN = /[,;、，]\s*/

/**
 * Drops duplicate contact display names (trimmed, ASCII case-insensitive) while keeping first occurrence order.
 *
 * @param names - Raw name strings
 * @returns Trimmed names without duplicates
 */
function dedupeContactNameList(names: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const key = n.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(n.trim())
  }
  return out
}

/**
 * Reads **`extended_fields.selectedContactNames`** from raw JSON.
 *
 * @param raw - Parsed JSON object from Postgres
 * @returns Trimmed non-empty strings, or **`undefined`** if absent/invalid
 */
function parseSelectedContactNamesFromJson(raw: Record<string, unknown>): string[] | undefined {
  const v = raw.selectedContactNames
  if (!Array.isArray(v)) return undefined
  const out: string[] = []
  for (const item of v) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
  }
  const deduped = dedupeContactNameList(out)
  return deduped.length ? deduped : undefined
}

function parseSocialAccountsFromJson(raw: Record<string, unknown>): LeadSocialAccountEntry[] {
  const sa = raw.socialAccounts
  if (!Array.isArray(sa)) return []
  const rows: LeadSocialAccountEntry[] = []
  for (const item of sa) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const platform = typeof rec.platform === 'string' ? rec.platform.trim() : ''
    const account = typeof rec.account === 'string' ? rec.account.trim() : ''
    const customRaw = typeof rec.custom === 'string' ? rec.custom.trim() : ''
    if (!platform && !account) continue
    rows.push({
      platform,
      account,
      ...(platform === LEAD_SOCIAL_PLATFORM_OTHER_ID && customRaw ? { custom: customRaw } : {}),
    })
  }
  return rows
}

/**
 * Parses a Supabase `extended_fields` JSONB value into a typed partial map.
 * Reads **`socialAccounts`** array and migrates legacy **`socialPlatform`** / **`socialPlatformCustom`** into it.
 *
 * @param raw - Raw JSON from Postgres (may be null or non-object)
 * @returns Known string keys plus optional **`socialAccounts`**
 */
export function parseExtendedFields(raw: unknown): LeadExtendedFields {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const o = raw as Record<string, unknown>
  const out: LeadExtendedFields = {}

  const fromJson = parseSocialAccountsFromJson(o)
  if (fromJson.length > 0) {
    out.socialAccounts = fromJson
  } else {
    const legacyP = typeof o.socialPlatform === 'string' ? o.socialPlatform.trim() : ''
    if (legacyP) {
      const legacyC = typeof o.socialPlatformCustom === 'string' ? o.socialPlatformCustom.trim() : ''
      out.socialAccounts = [
        {
          platform: legacyP,
          account: '',
          ...(legacyP === LEAD_SOCIAL_PLATFORM_OTHER_ID && legacyC ? { custom: legacyC } : {}),
        },
      ]
    }
  }

  for (const key of LEAD_EXTENDED_FIELD_KEYS) {
    if (key === 'socialPlatform' || key === 'socialPlatformCustom') {
      if (out.socialAccounts?.length) continue
    }
    const v = o[key]
    if (typeof v === 'string' && v.trim() !== '') out[key] = v.trim()
  }

  const scn = parseSelectedContactNamesFromJson(o)
  if (scn?.length) out.selectedContactNames = scn

  const ccid = o.customerContactId
  if (typeof ccid === 'string' && ccid.trim()) out.customerContactId = ccid.trim()

  const cp = parseContactProfilesFromJson(o)
  if (cp?.length) {
    out.contactProfiles = cp
    for (const k of LEAD_CONTACT_PROFILE_TOP_LEVEL_KEYS) {
      delete out[k]
    }
    delete out.socialAccounts
    delete out.selectedContactNames
  }

  return out
}

/**
 * One empty row for the social-accounts editor (mutable in the UI).
 *
 * @returns Fresh entry with empty strings
 */
export function emptyLeadSocialAccountRow(): LeadSocialAccountEntry {
  return { platform: '', account: '' }
}

/**
 * Builds editor state from stored **`extendedFields`** (new array or legacy single platform).
 *
 * @param extended - Parsed extended fields from a {@link Lead}
 * @returns At least one row so the UI always has a slot to type in
 */
export function extractSocialAccountsForForm(extended: LeadExtendedFields | undefined): LeadSocialAccountEntry[] {
  const ef = extended ?? {}
  if (ef.socialAccounts?.length) {
    return ef.socialAccounts.map((r) => ({
      platform: r.platform ?? '',
      account: r.account ?? '',
      custom: r.custom ?? '',
    }))
  }
  const p = typeof ef.socialPlatform === 'string' ? ef.socialPlatform.trim() : ''
  if (p) {
    const c = typeof ef.socialPlatformCustom === 'string' ? ef.socialPlatformCustom.trim() : ''
    return [
      {
        platform: p,
        account: '',
        ...(p === LEAD_SOCIAL_PLATFORM_OTHER_ID && c ? { custom: c } : {}),
      },
    ]
  }
  return [emptyLeadSocialAccountRow()]
}

/**
 * Merges stored extended fields with empty defaults for string form binding.
 * **`socialPlatform`** / **`socialPlatformCustom`** are always cleared — use **`extractSocialAccountsForForm`** for social rows.
 *
 * @param existing - Parsed `extendedFields` from a {@link Lead}
 * @returns Full string map for v-model on non-social controls
 */
export function mergeLeadExtendedForForm(
  existing: LeadExtendedFields | undefined,
): Record<LeadExtendedFieldKey, string> {
  const base = emptyLeadExtendedForm()
  if (!existing) return base
  for (const key of LEAD_EXTENDED_FIELD_KEYS) {
    if (key === 'socialPlatform' || key === 'socialPlatformCustom') {
      base[key] = ''
      continue
    }
    const v = existing[key]
    if (typeof v === 'string' && v.trim()) base[key] = v.trim()
  }
  return base
}

/**
 * Restores multi-select contact names for the lead form from **`extendedFields`** and **`contact_name`**.
 *
 * @param extended - Parsed extended fields
 * @param fallbackJoinedContactName - DB **`contact_name`** (may list several names separated by commas or fullwidth enumeration marks).
 * @param orderedOptionNames - Contact names from the linked customer, in display order
 * @returns Names to pre-check in the UI (extras not in options are kept at the end)
 */
export function extractSelectedContactNamesForForm(
  extended: LeadExtendedFields | undefined,
  fallbackJoinedContactName: string | null | undefined,
  orderedOptionNames: readonly string[],
): string[] {
  const valid = new Set(orderedOptionNames.filter((n) => n.trim()))
  const fromExt = extended?.selectedContactNames?.filter((n) => typeof n === 'string' && n.trim())
  if (fromExt?.length) {
    const ordered = orderedOptionNames.filter((n) => fromExt.includes(n))
    const extras = fromExt.filter((n) => !valid.has(n))
    return dedupeContactNameList([...ordered, ...extras])
  }
  const fb = (fallbackJoinedContactName ?? '').trim()
  if (!fb) return []
  const parts = dedupeContactNameList(
    fb.split(LEAD_CONTACT_NAME_SPLIT_PATTERN).map((s) => s.trim()).filter(Boolean),
  )
  if (parts.length === 0) return []
  if (valid.size > 0 && parts.every((p) => valid.has(p))) {
    return dedupeContactNameList(orderedOptionNames.filter((n) => parts.includes(n)))
  }
  return parts
}

/**
 * Whether any social row has a **platform** chosen but an empty **account** (invalid for save).
 *
 * @param socialAccounts - Editor rows
 * @returns True if the user must fill missing handles before saving
 */
export function hasIncompleteSocialAccountRows(socialAccounts: readonly LeadSocialAccountEntry[]): boolean {
  return socialAccounts.some((r) => r.platform.trim() !== '' && r.account.trim() === '')
}

/**
 * Builds the **`LeadExtendedFields`** object to send on create/update (non-empty strings + **`socialAccounts`** + **`selectedContactNames`**).
 *
 * @param formStrings - Full extended string form (social string keys ignored)
 * @param socialAccounts - Rows from **`LeadSocialAccountsEditor`**
 * @param selectedContactNames - Legacy path: names from the customer list (unused when **`contactProfiles`** is saved)
 * @param opts - When **`contactProfiles`** is non-empty, top-level **`socialAccounts`** / **`selectedContactNames`** are omitted (contact card holds social data).
 * @returns Payload suitable for **`serializeLeadExtendedToJson`**
 */
export function buildLeadExtendedFieldsForSave(
  formStrings: Record<LeadExtendedFieldKey, string>,
  socialAccounts: LeadSocialAccountEntry[],
  selectedContactNames: readonly string[] = [],
  opts?: { contactProfiles?: readonly LeadContactProfile[] },
): LeadExtendedFields {
  const out: LeadExtendedFields = {}
  const skipContactKeys = new Set<string>(LEAD_CONTACT_PROFILE_TOP_LEVEL_KEYS)
  for (const key of LEAD_EXTENDED_FIELD_KEYS) {
    if (key === 'socialPlatform' || key === 'socialPlatformCustom') continue
    if (skipContactKeys.has(key)) continue
    const v = formStrings[key]?.trim()
    if (v) out[key] = v
  }
  // Contact cards persist in `lead_contacts` (+ phones/socials); do not write them into JSON.
  if (opts?.contactProfiles?.length) {
    return out
  }
  const rows = socialAccounts
    .map((r) => ({
      platform: r.platform.trim(),
      account: r.account.trim(),
      ...(r.custom?.trim() ? { custom: r.custom.trim() } : {}),
    }))
    .filter((r) => r.platform && r.account)
  if (rows.length) out.socialAccounts = rows
  const names = selectedContactNames.map((n) => n.trim()).filter(Boolean)
  if (names.length) out.selectedContactNames = names
  return out
}

/**
 * Serializes **`LeadExtendedFields`** to a plain JSON object for PostgREST (**`extended_fields`** column).
 * Omits legacy **`socialPlatform`** when **`socialAccounts`** is present.
 *
 * @param fields - Merged extended fields (e.g. from **`buildLeadExtendedFieldsForSave`**)
 * @returns JSON-safe object (strings + optional **`socialAccounts`** array)
 */
export function serializeLeadExtendedToJson(fields: LeadExtendedFields | undefined): Record<string, unknown> {
  if (!fields) return {}
  const out: Record<string, unknown> = {}
  const skipContactKeys = new Set<string>(LEAD_CONTACT_PROFILE_TOP_LEVEL_KEYS)
  for (const key of LEAD_EXTENDED_FIELD_KEYS) {
    if (key === 'socialPlatform' || key === 'socialPlatformCustom') continue
    if (skipContactKeys.has(key)) continue
    const v = fields[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  if (fields.socialAccounts?.length) {
    const rows = fields.socialAccounts
      .map((r) => ({
        platform: r.platform.trim(),
        account: r.account.trim(),
        ...(r.custom?.trim() ? { custom: r.custom.trim() } : {}),
      }))
      .filter((r) => r.platform && r.account)
    if (rows.length) out.socialAccounts = rows
  }
  if (fields.selectedContactNames?.length) {
    const names = fields.selectedContactNames.map((n) => n.trim()).filter(Boolean)
    if (names.length) out.selectedContactNames = names
  }
  // contactProfiles / customerContactId live in `lead_contacts` — never write them to JSON.
  return out
}

/**
 * Human-readable lines for lead detail (**platform — account**), honoring legacy single-field data.
 *
 * @param ef - Parsed extended fields
 * @param platformLabel - Maps a platform slug to a localized label (e.g. **`t('…socialPlatformOption.x')`**)
 * @returns Non-empty display lines
 */
export function formatLeadSocialAccountDisplayLines(
  ef: LeadExtendedFields,
  platformLabel: (slug: string) => string,
): string[] {
  const rows: LeadSocialAccountEntry[] =
    (ef.socialAccounts?.length ?? 0) > 0
      ? (ef.socialAccounts ?? [])
      : extractSocialAccountsForForm(ef).filter((r) => r.platform.trim())

  const lines: string[] = []
  for (const r of rows) {
    const p = r.platform.trim()
    if (!p) continue
    let label = p
    if (p === LEAD_SOCIAL_PLATFORM_OTHER_ID) {
      const c = r.custom?.trim()
      label = c ? `${platformLabel('other')}: ${c}` : platformLabel('other')
    } else if (isKnownLeadSocialPlatform(p)) {
      label = platformLabel(p)
    }
    const acc = r.account.trim()
    lines.push(acc ? `${label} — ${acc}` : label)
  }
  return lines
}

/**
 * @deprecated Use **`buildLeadExtendedFieldsForSave`** + **`serializeLeadExtendedToJson`** for writes.
 * Kept for any code paths that only stringify flat string extended maps.
 */
export function compactExtendedFields(
  fields: Partial<Record<LeadExtendedFieldKey, string>> | undefined,
): Record<string, string> {
  if (!fields) return {}
  const out: Record<string, string> = {}
  for (const key of LEAD_EXTENDED_FIELD_KEYS) {
    const v = fields[key]
    if (typeof v === 'string' && v.trim() !== '') out[key] = v.trim()
  }
  return out
}
