/**
 * Multi-card lead contacts editor (web LeadContactProfilesEditor parity).
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LeadSocialAccountsEditor } from '@/components/admin/lead-social-accounts-editor'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PhoneInput } from '@/components/settings/phone-input'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import type { CustomerContact } from '@/types/customer'
import type { LeadContactProfile, LeadLinkedCustomer } from '@/types/lead'
import {
  buildLeadImportedContactSummaryForContactCard,
  clampContactProfilesToSingle,
  dedupeCustomerContactIdsAcrossProfiles,
  effectivePinOrAutoCustomerContactId,
  emptyLeadContactPhoneRow,
  emptyLeadContactProfile,
  ensureSinglePrimary,
  normalizedLeadContactGenderSlug,
  resolvedCustomerContactIdForProfile,
  type LeadContactGenderSlug,
} from '@/utils/lead-contact-profiles'
import { combinePhoneParts } from '@/utils/settings/phone-number-parts'

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

const labelClass = 'text-xs font-medium text-muted'

interface LeadContactProfilesEditorProps {
  value: LeadContactProfile[]
  onChange: (next: LeadContactProfile[]) => void
  disabled?: boolean
  singleContact?: boolean
  hideManualIdentityFields?: boolean
  customer?: LeadLinkedCustomer | null
  customerContacts?: CustomerContact[]
}

/**
 * One-line label for a CRM contact picker row.
 * @param contact - Customer contact row.
 * @returns Name · email or phone.
 */
function contactSelectLabel(contact: CustomerContact): string {
  const name = contact.name.trim() || '—'
  const email = (contact.email ?? '').trim()
  if (email) {
    return email.length > 44 ? `${name} · ${email.slice(0, 41)}…` : `${name} · ${email}`
  }
  const phone = (contact.mobile ?? contact.phone ?? '').trim()
  if (phone) {
    return `${name} · ${phone}`
  }
  return name
}

/**
 * Combined dial string for PhoneInput from a phone row.
 * @param phone - Phone row.
 * @returns Storage dial string.
 */
function phoneRowCombined(phone: {
  phone?: string
  dialCode?: string
  number?: string
}): string {
  const direct = (phone.phone ?? '').trim()
  if (direct) {
    return direct
  }
  return combinePhoneParts(phone.dialCode ?? '', phone.number ?? '')
}

/**
 * Lead contact cards: CRM identity, social rows, optional gender / notes.
 * @param props - Profiles, customer context, and change handler.
 * @returns Editor UI.
 */
export function LeadContactProfilesEditor({
  value,
  onChange,
  disabled = false,
  singleContact = true,
  hideManualIdentityFields = true,
  customer = null,
  customerContacts = [],
}: LeadContactProfilesEditorProps) {
  const { t } = useTranslation()
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({})
  const [duplicatePickId, setDuplicatePickId] = useState<string | null>(null)

  useEffect(() => {
    if (!duplicatePickId) {
      return
    }
    const timer = window.setTimeout(() => setDuplicatePickId(null), 4000)
    return () => window.clearTimeout(timer)
  }, [duplicatePickId])

  /**
   * Emits a sanitized profile list.
   * @param next - New profiles.
   */
  function emitList(next: LeadContactProfile[]): void {
    let out = singleContact ? clampContactProfilesToSingle(next) : [...next]
    if (!singleContact) {
      ensureSinglePrimary(out)
      out = dedupeCustomerContactIdsAcrossProfiles(out)
    }
    onChange(out)
  }

  /**
   * Patches one profile.
   * @param index - Profile index.
   * @param patch - Partial profile.
   */
  function patchProfile(index: number, patch: Partial<LeadContactProfile>): void {
    emitList(value.map((profile, i) => (i === index ? { ...profile, ...patch } : profile)))
  }

  /**
   * True when another card already uses this customer_contacts.id.
   * @param profileIndex - Index of the card opening the picker.
   * @param contactId - CRM row id.
   * @returns Whether the id is claimed.
   */
  function isCustomerContactIdClaimedByOtherProfile(
    profileIndex: number,
    contactId: string,
  ): boolean {
    const id = contactId.trim()
    if (!id) {
      return false
    }
    return value.some((profile, j) => {
      if (j === profileIndex) {
        return false
      }
      if ((profile.customerContactId ?? '').trim() === id) {
        return true
      }
      return resolvedCustomerContactIdForProfile(customer, customerContacts, profile, j, value) === id
    })
  }

  /**
   * Contacts shown in this card’s picker.
   * @param profileIndex - Index in the list.
   * @returns Rows for the dropdown.
   */
  function customerContactsForPickerRow(profileIndex: number): CustomerContact[] {
    const self = value[profileIndex]
    if (!self) {
      return customerContacts
    }
    const selfResolved = resolvedCustomerContactIdForProfile(
      customer,
      customerContacts,
      self,
      profileIndex,
      value,
    )
    return customerContacts.filter((contact) => {
      if (isCustomerContactIdClaimedByOtherProfile(profileIndex, contact.id)) {
        const isSelfExplicit = (self.customerContactId ?? '').trim() === contact.id
        return isSelfExplicit || selfResolved === contact.id
      }
      return true
    })
  }

  const genderOptions = useMemo(
    () =>
      (
        [
          { value: '', labelKey: 'admin.leadsTable.contactProfiles.genderUnset' },
          { value: 'male', labelKey: 'admin.leadsTable.contactProfiles.genderMale' },
          { value: 'female', labelKey: 'admin.leadsTable.contactProfiles.genderFemale' },
        ] as const
      ).map((opt) => ({ value: opt.value, label: t(opt.labelKey) })),
    [t],
  )

  if (disabled) {
    return (
      <div className="space-y-4">
        <p className={labelClass}>
          {t('admin.leadsTable.form.contactName')}
          {!singleContact ? (
            <span className="font-normal text-muted"> ({value.length})</span>
          ) : null}
        </p>
        <p className="rounded-2xl border border-ink/10 bg-ink/5 px-3 py-2 text-xs text-muted">
          {t('admin.leadsTable.form.selectContactFirst')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className={labelClass}>
          {t('admin.leadsTable.form.contactName')}
          {!singleContact ? (
            <span className="font-normal text-muted"> ({value.length})</span>
          ) : null}
        </p>
        {!singleContact ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-dashed border-brand/40 bg-brand/10 px-2.5 py-1 text-xs font-bold text-brand"
            onClick={() => emitList([...value, emptyLeadContactProfile(false)])}
          >
            <PlusIcon className="size-3.5" />
            {t('admin.leadsTable.contactProfiles.addContact')}
          </button>
        ) : null}
      </div>

      <div className="space-y-4">
        {value.map((profile, index) => {
          const summary = customer?.id
            ? buildLeadImportedContactSummaryForContactCard(
                customer,
                customerContacts,
                profile,
                index,
                value,
              )
            : null
          const eff = effectivePinOrAutoCustomerContactId(profile, index, value)
          const pickerValue = (profile.customerContactId ?? '').trim()
          const triggerEmpty =
            !pickerValue && eff === null
              ? t('admin.leadsTable.contactProfiles.contactOptionNotSelected')
              : null
          const pickerOptions = [
            ...(triggerEmpty
              ? []
              : [{ value: '', label: t('admin.leadsTable.contactProfiles.contactOptionAuto') }]),
            ...customerContactsForPickerRow(index).map((contact) => ({
              value: contact.id,
              label: contactSelectLabel(contact),
            })),
          ]

          return (
            <div
              key={profile.id}
              className="space-y-3 rounded-2xl border border-ink/10 bg-white/50 p-4 dark:bg-white/5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {singleContact
                      ? t('admin.leadsTable.contactProfiles.singleCardTitle')
                      : t('admin.leadsTable.contactProfiles.cardTitle', { n: index + 1 })}
                  </span>
                  {!singleContact && profile.isPrimary ? (
                    <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                      {t('admin.leadsTable.contactProfiles.primaryBadge')}
                    </span>
                  ) : null}
                </div>
                {!singleContact && !profile.isPrimary ? (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      className="rounded-xl p-1.5 text-muted hover:bg-brand/10 hover:text-brand"
                      title={t('admin.leadsTable.contactProfiles.setPrimary')}
                      onClick={() => {
                        const chosen = value[index]
                        if (!chosen) return
                        const rest = value.filter((_, i) => i !== index)
                        emitList([
                          { ...chosen, isPrimary: true },
                          ...rest.map((row) => ({ ...row, isPrimary: false })),
                        ])
                      }}
                    >
                      <StarIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === 0}
                      className="rounded-xl p-1.5 text-muted hover:bg-ink/5 disabled:opacity-30"
                      title={t('admin.leadsTable.contactProfiles.moveUp')}
                      onClick={() => {
                        if (index === 0) return
                        const next = [...value]
                        const tmp = next[index]!
                        next[index] = next[index - 1]!
                        next[index - 1] = tmp
                        emitList(next)
                      }}
                    >
                      <ChevronUpIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index >= value.length - 1}
                      className="rounded-xl p-1.5 text-muted hover:bg-ink/5 disabled:opacity-30"
                      title={t('admin.leadsTable.contactProfiles.moveDown')}
                      onClick={() => {
                        if (index >= value.length - 1) return
                        const next = [...value]
                        const tmp = next[index]!
                        next[index] = next[index + 1]!
                        next[index + 1] = tmp
                        emitList(next)
                      }}
                    >
                      <ChevronDownIcon className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={value.length <= 1}
                      className="rounded-xl p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500 disabled:opacity-30"
                      title={t('admin.leadsTable.contactProfiles.remove')}
                      onClick={() => {
                        if (value.length <= 1) return
                        emitList(value.filter((_, i) => i !== index))
                      }}
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  </div>
                ) : null}
              </div>

              {hideManualIdentityFields && customerContacts.length > 0 ? (
                <div className="space-y-1.5">
                  <p className={labelClass}>
                    {t('admin.leadsTable.contactProfiles.selectLinkedContact')}
                  </p>
                  {duplicatePickId === profile.id ? (
                    <p className="text-xs text-amber-600" role="status">
                      {t('admin.leadsTable.contactProfiles.customerContactAlreadyUsed')}
                    </p>
                  ) : null}
                  <CrmFilterSelect
                    className="w-full"
                    value={pickerValue}
                    options={pickerOptions}
                    placeholder={
                      triggerEmpty
                        ? t('admin.leadsTable.contactProfiles.contactOptionNotSelected')
                        : undefined
                    }
                    ariaLabel={t('admin.leadsTable.contactProfiles.selectLinkedContact')}
                    onChange={(next) => {
                      if (next && isCustomerContactIdClaimedByOtherProfile(index, next)) {
                        setDuplicatePickId(profile.id)
                        return
                      }
                      setDuplicatePickId(null)
                      patchProfile(index, { customerContactId: next })
                    }}
                  />
                </div>
              ) : null}

              {hideManualIdentityFields && summary ? (
                <div className="space-y-1.5 rounded-2xl border border-ink/10 bg-ink/5 px-3 py-2.5 text-xs text-ink/80">
                  {summary.name ? (
                    <p>
                      <span className="text-muted">
                        {t('admin.leadsTable.contactProfiles.importedLabelName')}:{' '}
                      </span>
                      {summary.name}
                    </p>
                  ) : null}
                  {summary.email ? (
                    <p>
                      <span className="text-muted">
                        {t('admin.leadsTable.contactProfiles.importedLabelEmail')}:{' '}
                      </span>
                      {summary.email}
                    </p>
                  ) : null}
                  {summary.phone ? (
                    <p>
                      <span className="text-muted">
                        {t('admin.leadsTable.contactProfiles.importedLabelLandline')}:{' '}
                      </span>
                      {summary.phone}
                    </p>
                  ) : null}
                  {summary.mobile ? (
                    <p>
                      <span className="text-muted">
                        {t('admin.leadsTable.contactProfiles.importedLabelMobile')}:{' '}
                      </span>
                      {summary.mobile}
                    </p>
                  ) : null}
                  {summary.title ? (
                    <p>
                      <span className="text-muted">
                        {t('admin.leadsTable.contactProfiles.importedLabelJobTitle')}:{' '}
                      </span>
                      {summary.title}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {hideManualIdentityFields && customer?.id && !summary ? (
                <p className="rounded-2xl border border-dashed border-ink/20 bg-ink/5 px-3 py-2 text-[11px] leading-snug text-muted">
                  {t('admin.leadsTable.contactProfiles.identityOnCustomerHint')}
                </p>
              ) : null}

              {!hideManualIdentityFields ? (
                <>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.leadsTable.form.field.contactNickname')}
                    </span>
                    <input
                      type="text"
                      value={profile.nickname}
                      className={inputClass}
                      onChange={(e) => patchProfile(index, { nickname: e.target.value })}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.leadsTable.contactProfiles.email')}
                    </span>
                    <input
                      type="email"
                      value={profile.email}
                      className={inputClass}
                      onChange={(e) => patchProfile(index, { email: e.target.value })}
                    />
                  </label>
                </>
              ) : null}

              <div className="space-y-1.5">
                <p className={labelClass}>{t('admin.leadsTable.form.field.socialAccounts')}</p>
                <LeadSocialAccountsEditor
                  value={profile.socialAccounts}
                  onChange={(next) => patchProfile(index, { socialAccounts: next })}
                />
              </div>

              {!hideManualIdentityFields ? (
                <div className="space-y-2">
                  <p className={labelClass}>
                    {t('admin.leadsTable.contactProfiles.phonesLabel')}
                  </p>
                  {profile.phones.map((phone, phoneIdx) => (
                    <div key={`${profile.id}-ph-${phoneIdx}`} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <PhoneInput
                          id={`${profile.id}-phone-${phoneIdx}`}
                          value={phoneRowCombined(phone)}
                          countryCode={phone.phoneCountry || ''}
                          onChange={(combined, iso) => {
                            patchProfile(index, {
                              phones: profile.phones.map((row, i) =>
                                i === phoneIdx
                                  ? {
                                      ...row,
                                      phone: combined.trim(),
                                      phoneCountry: iso.trim().toUpperCase(),
                                      dialCode: '',
                                      number: '',
                                    }
                                  : row,
                              ),
                            })
                          }}
                        />
                      </div>
                      {profile.phones.length > 1 ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-xl p-2 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                          title={t('admin.leadsTable.contactProfiles.removePhone')}
                          onClick={() => {
                            if (profile.phones.length <= 1) return
                            patchProfile(index, {
                              phones: profile.phones.filter((_, i) => i !== phoneIdx),
                            })
                          }}
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      ) : null}
                      {phoneIdx === profile.phones.length - 1 ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-xl p-2 text-brand hover:bg-brand/10"
                          title={t('admin.leadsTable.contactProfiles.addPhone')}
                          onClick={() =>
                            patchProfile(index, {
                              phones: [...profile.phones, emptyLeadContactPhoneRow()],
                            })
                          }
                        >
                          <PlusIcon className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/20 py-2 text-xs font-medium text-muted hover:border-brand/40 hover:text-brand"
                onClick={() =>
                  setExpandedById((prev) => ({
                    ...prev,
                    [profile.id]: !prev[profile.id],
                  }))
                }
              >
                <ChevronDownIcon
                  className={`size-4 transition-transform ${expandedById[profile.id] ? 'rotate-180' : ''}`}
                />
                {expandedById[profile.id]
                  ? t('admin.leadsTable.contactProfiles.collapseOptional')
                  : t('admin.leadsTable.contactProfiles.expandOptional')}
              </button>

              {expandedById[profile.id] ? (
                <div className="space-y-3 border-t border-ink/10 pt-3">
                  <div className="space-y-2">
                    <p className={labelClass}>{t('admin.leadsTable.form.field.gender')}</p>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2" role="radiogroup">
                      {genderOptions.map((opt) => (
                        <label
                          key={opt.value === '' ? 'unset' : opt.value}
                          className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink"
                        >
                          <input
                            type="radio"
                            className="size-3.5 accent-brand"
                            name={`lead-contact-gender-${profile.id}`}
                            checked={
                              normalizedLeadContactGenderSlug(profile.gender) === opt.value
                            }
                            onChange={() =>
                              patchProfile(index, {
                                gender: opt.value as LeadContactGenderSlug,
                              })
                            }
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {!(hideManualIdentityFields && summary) ? (
                    <label className="block space-y-1.5">
                      <span className={labelClass}>
                        {t('admin.leadsTable.form.field.jobTitle')}
                      </span>
                      <input
                        type="text"
                        value={profile.jobTitle}
                        className={inputClass}
                        onChange={(e) => patchProfile(index, { jobTitle: e.target.value })}
                      />
                    </label>
                  ) : null}
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.leadsTable.form.field.contactRemarks')}
                    </span>
                    <textarea
                      value={profile.contactRemarks}
                      rows={5}
                      className={`${inputClass} min-h-36 resize-y`}
                      onChange={(e) =>
                        patchProfile(index, { contactRemarks: e.target.value })
                      }
                    />
                  </label>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
