import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import type { LeadContactPhoneRow, LeadContactProfile, LeadSocialAccountEntry } from '@/types/lead'
import {
  emptyLeadContactPhoneRow,
  ensureSinglePrimary,
  newLeadContactProfileId,
  normalizedLeadContactGenderSlug,
  sanitizeContactProfilesForSave,
} from '@/utils/lead-contact-profiles'
import { combinePhoneParts } from '@/utils/settings/phone-number-parts'

interface LeadContactPhoneDbRow {
  id: string
  lead_contact_id: string
  phone_country: string | null
  phone: string
  sort_order: number
}

interface LeadContactSocialDbRow {
  id: string
  lead_contact_id: string
  platform: string
  account: string
  custom: string | null
  sort_order: number
}

interface LeadContactDbRow {
  id: string
  lead_id: string
  is_primary: boolean
  customer_contact_id: string | null
  gender: string | null
  job_title: string | null
  contact_remarks: string | null
  contact_image_url: string | null
  sort_order: number
  lead_contact_phones?: LeadContactPhoneDbRow[] | null
  lead_contact_social_accounts?: LeadContactSocialDbRow[] | null
}

/**
 * Whether a sanitized profile has any persisted contact-card data.
 *
 * @param p - Profile after {@link sanitizeContactProfilesForSave}
 * @returns True when the card should be written to `lead_contacts`
 */
function leadContactProfileHasPersistedData(p: LeadContactProfile): boolean {
  if (p.customerContactId.trim()) return true
  if (p.gender.trim()) return true
  if (p.jobTitle.trim()) return true
  if (p.contactRemarks.trim()) return true
  if (p.contactImageUrl.trim()) return true
  if (p.phones.some((ph) => (ph.phone ?? '').trim() !== '')) return true
  if (p.socialAccounts.some((s) => s.platform.trim() && s.account.trim())) return true
  return false
}

/**
 * Maps nested PostgREST contact rows into editor {@link LeadContactProfile} cards.
 *
 * @param rows - `lead_contacts` with nested phones/socials
 * @returns Sorted profiles (empty array when the lead has no contact rows)
 */
export function mapLeadContactRowsToProfiles(
  rows: LeadContactDbRow[] | null | undefined,
): LeadContactProfile[] {
  if (!rows?.length) return []

  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order)
  const profiles: LeadContactProfile[] = sorted.map((row) => {
    const phonesRaw = [...(row.lead_contact_phones ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    const phones: LeadContactPhoneRow[] = phonesRaw.length
      ? phonesRaw.map((ph) => ({
          phoneCountry: (ph.phone_country ?? '').trim().toUpperCase(),
          phone: (ph.phone ?? '').trim(),
          // Legacy editor fields kept in sync for any remaining dial/number UI.
          dialCode: '',
          number: '',
        }))
      : [emptyLeadContactPhoneRow()]

    const socialsRaw = [...(row.lead_contact_social_accounts ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    const socialAccounts: LeadSocialAccountEntry[] = socialsRaw.length
      ? socialsRaw.map((s) => ({
          platform: s.platform ?? '',
          account: s.account ?? '',
          ...(s.custom?.trim() ? { custom: s.custom.trim() } : {}),
        }))
      : [{ platform: '', account: '' }]

    return {
      id: row.id,
      isPrimary: !!row.is_primary,
      customerContactId: row.customer_contact_id ?? '',
      nickname: '',
      email: '',
      socialAccounts,
      phones,
      gender: normalizedLeadContactGenderSlug(row.gender ?? ''),
      jobTitle: (row.job_title ?? '').trim(),
      contactRemarks: (row.contact_remarks ?? '').trim(),
      contactImageUrl: (row.contact_image_url ?? '').trim(),
    }
  })

  ensureSinglePrimary(profiles)
  return profiles
}

/**
 * PostgREST select fragment for leads + nested contact cards.
 */
export const LEAD_SELECT_WITH_CONTACTS = `
  *,
  lead_contacts (
    *,
    lead_contact_phones (*),
    lead_contact_social_accounts (*)
  )
`.replace(/\s+/g, ' ').trim()

/**
 * Replaces all contact cards for a lead (delete + insert).
 *
 * @param leadId - Parent lead UUID
 * @param profiles - Editor profiles
 */
export async function replaceLeadContacts(
  leadId: string,
  profiles: readonly LeadContactProfile[],
): Promise<void> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const sanitized = sanitizeContactProfilesForSave([...profiles]).filter(
    leadContactProfileHasPersistedData,
  )

  const { error: delError } = await fromLoose('lead_contacts')
    .delete()
    .eq('lead_id', leadId)
  if (delError) throw delError

  for (let i = 0; i < sanitized.length; i++) {
    const p = sanitized[i]!
    const contactId = p.id.trim() || newLeadContactProfileId()

    const { error: contactError } = await fromLoose('lead_contacts').insert({
      id: contactId,
      lead_id: leadId,
      is_primary: !!p.isPrimary,
      customer_contact_id: p.customerContactId.trim() || null,
      gender: p.gender.trim() || null,
      job_title: p.jobTitle.trim() || null,
      contact_remarks: p.contactRemarks.trim() || null,
      contact_image_url: p.contactImageUrl.trim() || null,
      sort_order: i,
    })
    if (contactError) throw contactError

    const phoneRows = p.phones
      .map((ph, sortOrder) => {
        const phoneCountry = (ph.phoneCountry ?? '').trim().toUpperCase()
        let phone = (ph.phone ?? '').trim()
        if (!phone && (ph.dialCode || ph.number)) {
          phone = combinePhoneParts(ph.dialCode ?? '', ph.number ?? '')
        }
        if (!phone) return null
        return {
          lead_contact_id: contactId,
          phone_country: phoneCountry || null,
          phone,
          sort_order: sortOrder,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)

    if (phoneRows.length) {
      const { error: phoneError } = await fromLoose('lead_contact_phones').insert(
        phoneRows,
      )
      if (phoneError) throw phoneError
    }

    const socialRows = p.socialAccounts
      .map((s, sortOrder) => {
        const platform = s.platform.trim()
        const account = s.account.trim()
        if (!platform || !account) return null
        return {
          lead_contact_id: contactId,
          platform,
          account,
          custom: s.custom?.trim() || null,
          sort_order: sortOrder,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row != null)

    if (socialRows.length) {
      const { error: socialError } = await fromLoose(
        'lead_contact_social_accounts',
      ).insert(socialRows)
      if (socialError) throw socialError
    }
  }
}
