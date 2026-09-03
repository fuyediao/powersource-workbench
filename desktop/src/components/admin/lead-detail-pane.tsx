/**
 * Admin lead detail / create pane: Vue LeadDetailView + LeadsTableView drawer
 * fields, kept as a full page (not a half-width slide-over).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { dash, detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { FollowUpTimelinePane } from '@/components/admin/follow-up-timeline-pane'
import { LeadContactProfilesEditor } from '@/components/admin/lead-contact-profiles-editor'
import { LeadExtendedFieldsForm } from '@/components/admin/lead-extended-fields-form'
import { CountryFlag } from '@/components/common/country-flag'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import {
  LEAD_CUSTOMER_SOURCED_FIELD_KEYS,
  LEAD_EXTENDED_FIELD_KEYS,
  emptyLeadExtendedForm,
  type LeadExtendedFieldKey,
} from '@/constants/lead-extended-form'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { ArrowLeftIcon, ChevronDownIcon } from '@/icons/AllIcons'
import { listCustomerContacts } from '@/services/customer-contacts-api'
import {
  listCustomerPickerOptions,
  type CustomerPickerOption,
} from '@/services/customers-api'
import {
  claimLead,
  createLead,
  deleteLead,
  getLeadById,
  releaseLead,
  updateLead,
} from '@/services/leads-api'
import type { CustomerContact } from '@/types/customer'
import {
  LEAD_STATUS_VALUES,
  type Lead,
  type LeadContactProfile,
  type LeadFormInput,
  type LeadLinkedCustomer,
} from '@/types/lead'
import {
  LEAD_CONTACT_PROFILE_TOP_LEVEL_KEYS,
  buildLeadImportedContactSummaryForContactCard,
  emptyLeadContactProfile,
  extractContactProfilesForForm,
  hasIncompleteSocialInContactProfiles,
  normalizedLeadContactGenderSlug,
  omitLeadContactProfileStringKeys,
  primaryLeadContactProfile,
} from '@/utils/lead-contact-profiles'
import {
  buildLeadImportedContactSummary,
  leadContactNameFromCustomer,
  normalizedLeadCustomerContactId,
} from '@/utils/lead-customer-contact-for-lead'
import { applyCustomerImportedExtendedFields } from '@/utils/lead-customer-import-fields'
import { formatLeadExtendedEnumDetailLabel } from '@/utils/lead-extended-field-display'
import {
  buildLeadExtendedFieldsForSave,
  formatLeadSocialAccountDisplayLines,
  mergeLeadExtendedForForm,
} from '@/utils/lead-extended-fields'
import { leadDetailPath, leadsListPath } from '@/utils/lead-routes'
import { getCountryDisplayName } from '@/utils/map/country-alpha2'

interface LeadDetailPaneProps {
  /** `create` renders an empty form; `detail` loads and edits in place. */
  mode: 'create' | 'detail'
  leadId: string | null
  userId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

const labelClass = 'text-xs font-bold tracking-wide text-muted uppercase'

/**
 * Maps a picker row to the lead import helper shape.
 * @param option - Compact customer picker row.
 * @returns Linked-customer view.
 */
function pickerToLinkedCustomer(option: CustomerPickerOption): LeadLinkedCustomer {
  return {
    id: option.id,
    companyName: option.companyName,
    website: option.website,
    companyCountry: option.companyCountry,
    primaryContactName: option.primaryContactName,
    contactName: option.contactName,
    phone: option.phone,
    email: option.email,
  }
}

/**
 * Builds a blank lead form model.
 * @returns Empty form input.
 */
function emptyForm(): LeadFormInput {
  return {
    companyName: '',
    contactName: null,
    phone: null,
    phoneCountry: null,
    email: null,
    status: 'unhandled',
    customerId: null,
    lastContactDate: null,
    extendedFields: {},
    contactProfiles: [emptyLeadContactProfile(true)],
  }
}

/**
 * Maps a loaded lead to the editable form model.
 * @param lead - Detail row.
 * @returns Form input.
 */
function formFromDetail(lead: Lead): LeadFormInput {
  return {
    companyName: lead.companyName,
    contactName: lead.contactName,
    phone: lead.phone,
    phoneCountry: lead.phoneCountry,
    email: lead.email,
    status: lead.status,
    customerId: lead.customerId,
    lastContactDate: lead.lastContactDate,
    extendedFields: lead.extendedFields,
    contactProfiles: lead.contactProfiles.length
      ? lead.contactProfiles
      : [emptyLeadContactProfile(true)],
  }
}

/**
 * Formats an ISO timestamp for a `datetime-local` input.
 * @param iso - ISO timestamp or null.
 * @returns Local `YYYY-MM-DDTHH:mm` value, or empty string.
 */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) {
    return ''
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Lead detail pane with in-place editing plus claim / release.
 * @param props - Mode, id, current user, writes, and navigation.
 * @returns Detail UI.
 */
export function LeadDetailPane({
  mode,
  leadId,
  userId,
  writes,
  onNavigate,
}: LeadDetailPaneProps) {
  const { t, i18n } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canDelete = Boolean(writes?.canDelete)
  const currentYear = new Date().getFullYear()
  const localeTag = i18n.language || 'en-US'

  const [lead, setLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<LeadFormInput>(emptyForm)
  const [extendedForm, setExtendedForm] = useState<Record<LeadExtendedFieldKey, string>>(
    emptyLeadExtendedForm,
  )
  const [contactProfiles, setContactProfiles] = useState<LeadContactProfile[]>([
    emptyLeadContactProfile(true),
  ])
  const [showLeftOptional, setShowLeftOptional] = useState(false)
  const [customers, setCustomers] = useState<CustomerPickerOption[]>([])
  const [customerContacts, setCustomerContacts] = useState<CustomerContact[]>([])
  const [loading, setLoading] = useState(mode === 'detail')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(mode === 'create')
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deletePresence = useDialogPresence(deleteOpen)
  const [deleting, setDeleting] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const isOwner = mode === 'create' || lead?.ownerId === userId
  const canEdit = Boolean(writes?.canEdit) && isOwner

  const selectedCustomer = useMemo(
    () => customers.find((row) => row.id === form.customerId) ?? null,
    [customers, form.customerId],
  )
  const linkedCustomer = selectedCustomer
    ? pickerToLinkedCustomer(selectedCustomer)
    : null

  const customerOptions = useMemo(
    () => [
      { value: '', label: t('admin.leadsTable.form.selectCompany') },
      ...customers.map((customer) => ({
        value: customer.id,
        label: customer.companyName || customer.id,
        description: customer.customerCode ?? undefined,
      })),
    ],
    [customers, t],
  )

  const statusOptions = useMemo(
    () =>
      LEAD_STATUS_VALUES.map((status) => ({
        value: status,
        label: t(`admin.leadsTable.status.${status}`),
      })),
    [t],
  )

  const leftSections = showLeftOptional
    ? (['commonInfo', 'other'] as const)
    : (['commonInfo'] as const)

  /**
   * Loads the customer picker options once.
   * @returns Nothing.
   */
  useEffect(() => {
    let cancelled = false
    void listCustomerPickerOptions({
      isSystemAdmin: domainWrites.isSystemAdmin,
      groupId: domainWrites.groupId,
    })
      .then((rows) => {
        if (!cancelled) {
          setCustomers(rows)
        }
      })
      .catch((err) => {
        console.error('[LeadDetailPane] listCustomerPickerOptions:', err)
      })
    return () => {
      cancelled = true
    }
  }, [domainWrites.groupId, domainWrites.isSystemAdmin])

  /**
   * Loads contacts for the linked customer.
   * @returns Nothing.
   */
  useEffect(() => {
    let cancelled = false
    const id = form.customerId
    if (!id) {
      setCustomerContacts([])
      return
    }
    void listCustomerContacts(id)
      .then((rows) => {
        if (!cancelled) {
          setCustomerContacts(rows)
        }
      })
      .catch((err) => {
        console.error('[LeadDetailPane] listCustomerContacts:', err)
        if (!cancelled) {
          setCustomerContacts([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [form.customerId])

  /**
   * Hydrates editor state from a loaded lead (or create blank).
   * @param detail - Lead row, or null for create.
   */
  function hydrateFromLead(detail: Lead | null): void {
    if (!detail) {
      setForm(emptyForm())
      setExtendedForm(emptyLeadExtendedForm())
      setContactProfiles([emptyLeadContactProfile(true)])
      setShowLeftOptional(false)
      return
    }
    setForm(formFromDetail(detail))
    const linked = detail.customerId
      ? customers.find((row) => row.id === detail.customerId)
      : undefined
    let nextExtended = mergeLeadExtendedForForm(detail.extendedFields)
    nextExtended = applyCustomerImportedExtendedFields(
      nextExtended,
      linked ? pickerToLinkedCustomer(linked) : null,
    )
    setExtendedForm(nextExtended)
    setContactProfiles(
      extractContactProfilesForForm(detail.extendedFields, detail.contactProfiles),
    )
    setShowLeftOptional(false)
  }

  /**
   * Loads the lead.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    if (mode !== 'detail' || !leadId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const detail = await getLeadById(leadId)
      if (!detail) {
        setError(t('admin.leadsTable.error.load'))
        return
      }
      setLead(detail)
      hydrateFromLead(detail)
    } catch (err) {
      console.error('[LeadDetailPane] load:', err)
      setError(t('admin.leadsTable.error.load'))
    } finally {
      setLoading(false)
    }
  }, [leadId, mode, t, customers])

  useEffect(() => {
    if (mode !== 'create') {
      return
    }
    hydrateFromLead(null)
    setLoading(false)
  }, [mode])

  useEffect(() => {
    if (mode !== 'detail') {
      return
    }
    void reload()
  }, [mode, reload])

  /**
   * Selects or clears the linked company and resets contact cards.
   * @param customerId - Customer uuid, or empty to clear.
   */
  function selectCustomer(customerId: string): void {
    if (!customerId) {
      setForm((prev) => ({
        ...prev,
        companyName: '',
        customerId: null,
        contactName: null,
        phone: null,
        email: null,
      }))
      setContactProfiles([emptyLeadContactProfile(true)])
      setExtendedForm((prev) => applyCustomerImportedExtendedFields(prev, null))
      return
    }
    const option = customers.find((row) => row.id === customerId)
    if (!option) {
      return
    }
    setForm((prev) => ({
      ...prev,
      companyName: option.companyName,
      customerId: option.id,
      contactName: null,
      phone: null,
      email: null,
    }))
    setContactProfiles([emptyLeadContactProfile(true)])
    setExtendedForm((prev) =>
      applyCustomerImportedExtendedFields(prev, pickerToLinkedCustomer(option)),
    )
  }

  /**
   * Builds the create/update payload from the current editor state.
   * @returns Form input, or null when validation fails.
   */
  function buildSavePayload(): LeadFormInput | null {
    if (!form.companyName.trim()) {
      setError(t('admin.leadsTable.form.selectCompany'))
      return null
    }
    if (hasIncompleteSocialInContactProfiles(contactProfiles)) {
      setError(t('admin.leadsTable.form.socialAccountRequiredWhenPlatform'))
      return null
    }
    const merged = { ...extendedForm }
    merged.leadName = merged.leadName.trim() || form.companyName.trim()
    const extendedFields = buildLeadExtendedFieldsForSave(
      omitLeadContactProfileStringKeys(merged),
      [],
      [],
      { contactProfiles },
    )
    const primary = primaryLeadContactProfile(contactProfiles)
    const cc = normalizedLeadCustomerContactId(
      form.customerId,
      customerContacts,
      primary?.customerContactId ?? '',
    )
    const profilesForSave = contactProfiles.map((profile) =>
      profile.isPrimary && cc ? { ...profile, customerContactId: cc } : profile,
    )
    const contactJoined =
      leadContactNameFromCustomer(linkedCustomer, customerContacts, primary?.customerContactId) ||
      (form.contactName ?? '').trim()
    return {
      companyName: form.companyName.trim(),
      contactName: contactJoined || null,
      phone: null,
      phoneCountry: null,
      email: null,
      status: form.status,
      customerId: form.customerId,
      lastContactDate: form.lastContactDate,
      extendedFields,
      contactProfiles: profilesForSave,
    }
  }

  /**
   * Saves the create or update form.
   * @returns Nothing.
   */
  async function submit(): Promise<void> {
    if (saving) {
      return
    }
    const payload = buildSavePayload()
    if (!payload) {
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        if (!canCreate) {
          return
        }
        const created = await createLead(userId, payload)
        onNavigate(leadDetailPath(created.id))
        return
      }
      if (!canEdit || !leadId) {
        return
      }
      const updated = await updateLead(leadId, userId, payload)
      setLead(updated)
      hydrateFromLead(updated)
      setEditing(false)
    } catch (err) {
      console.error('[LeadDetailPane] save:', err)
      setError(t('admin.leadsTable.error.save'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Claims the current pool lead for this user.
   * @returns Nothing.
   */
  async function handleClaim(): Promise<void> {
    if (!leadId || claiming) {
      return
    }
    setClaiming(true)
    try {
      const updated = await claimLead(leadId, userId)
      setLead(updated)
      hydrateFromLead(updated)
    } catch (err) {
      console.error('[LeadDetailPane] claim:', err)
      setError(t('admin.leadsTable.error.claim'))
    } finally {
      setClaiming(false)
    }
  }

  /**
   * Releases the lead back to the public pool.
   * @returns Nothing.
   */
  async function handleRelease(): Promise<void> {
    if (!leadId || releasing) {
      return
    }
    setReleasing(true)
    try {
      const updated = await releaseLead(leadId, userId)
      setLead(updated)
      hydrateFromLead(updated)
      setEditing(false)
    } catch (err) {
      console.error('[LeadDetailPane] release:', err)
      setError(t('admin.leadsTable.error.release'))
    } finally {
      setReleasing(false)
    }
  }

  /**
   * Deletes the current lead and returns to the list.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!leadId || !canDelete || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteLead(leadId, userId)
      setDeleteOpen(false)
      onNavigate(leadsListPath())
    } catch (err) {
      console.error('[LeadDetailPane] delete:', err)
      setError(t('admin.leadsTable.error.delete'))
    } finally {
      setDeleting(false)
    }
  }

  const headerLeadName = (() => {
    const raw = lead?.extendedFields.leadName
    if (typeof raw !== 'string') {
      return null
    }
    const name = raw.trim()
    return name || null
  })()
  const title =
    mode === 'create'
      ? t('admin.leadsTable.modal.createTitle')
      : headerLeadName || lead?.companyName || t('admin.leadsTable.title')

  const skipProfileKeys = new Set<string>(
    lead?.contactProfiles?.length ? [...LEAD_CONTACT_PROFILE_TOP_LEVEL_KEYS] : [],
  )
  const extendedEntries: { key: LeadExtendedFieldKey; value: string }[] = []
  if (lead) {
    for (const key of LEAD_EXTENDED_FIELD_KEYS) {
      if (key === 'socialPlatform' || key === 'socialPlatformCustom' || key === 'imageUrl') {
        continue
      }
      if (key === 'leadName') {
        continue
      }
      if (skipProfileKeys.has(key)) {
        continue
      }
      const raw = lead.extendedFields[key]
      if (typeof raw !== 'string' || !raw.trim()) {
        continue
      }
      extendedEntries.push({ key, value: raw.trim() })
    }
  }
  const socialLines =
    lead && !lead.contactProfiles?.length
      ? formatLeadSocialAccountDisplayLines(lead.extendedFields, (slug) =>
          t(`admin.leadsTable.form.socialPlatformOption.${slug}`),
        )
      : []
  const displayProfiles = lead?.contactProfiles?.length ? lead.contactProfiles : []
  const importedFallback =
    lead && lead.customerId && linkedCustomer && displayProfiles.length === 0
      ? buildLeadImportedContactSummary(linkedCustomer, customerContacts)
      : null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.customers.backToList')}
          aria-label={t('admin.customers.backToList')}
          onClick={() => onNavigate(leadsListPath())}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-brand">
          {title}
        </h1>
        {mode === 'detail' && lead ? (
          <span
            className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs font-bold sm:inline ${
              lead.ownerId === null
                ? 'bg-zinc-500/15 text-zinc-500'
                : 'bg-rose-500/15 text-rose-500'
            }`}
          >
            {lead.ownerId === null
              ? t('admin.leadsTable.poolPublic')
              : t('admin.leadsTable.poolPrivate')}
          </span>
        ) : null}
        {mode === 'detail' && lead?.ownerId === null ? (
          <button
            type="button"
            disabled={claiming}
            className="shrink-0 rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-600 disabled:opacity-50"
            onClick={() => void handleClaim()}
          >
            {claiming ? t('admin.leadsTable.claiming') : t('admin.leadsTable.claim')}
          </button>
        ) : null}
        {editing ? (
          <div className="flex shrink-0 items-center gap-2">
            {mode === 'detail' ? (
              <button
                type="button"
                disabled={saving}
                className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={() => {
                  if (lead) {
                    hydrateFromLead(lead)
                  }
                  setEditing(false)
                  setError(null)
                }}
              >
                {t('admin.leadsTable.modal.cancel')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || !form.companyName.trim()}
              className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
              onClick={() => void submit()}
            >
              {saving ? t('admin.leadsTable.modal.saving') : t('admin.leadsTable.modal.save')}
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {isOwner ? (
              <button
                type="button"
                disabled={releasing}
                className="rounded-2xl bg-amber-500/15 px-3 py-2 text-sm font-bold text-amber-600 disabled:opacity-50"
                onClick={() => void handleRelease()}
              >
                {releasing
                  ? t('admin.leadsTable.releasing')
                  : t('admin.leadsTable.release')}
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
                onClick={() => setEditing(true)}
              >
                {t('admin.leadsTable.edit')}
              </button>
            ) : null}
            {canDelete && isOwner ? (
              <button
                type="button"
                className="rounded-2xl border border-rose-400/40 px-3 py-2 text-sm font-bold text-rose-500"
                onClick={() => setDeleteOpen(true)}
              >
                {t('admin.leadsTable.delete')}
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
        {error ? (
          <p className="text-sm font-medium text-rose-500">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm font-medium text-muted">{t('admin.leadsTable.loading')}</p>
        ) : null}

        {!loading && editing ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr] lg:items-start">
              <div className="min-w-0 space-y-4">
                <div className="space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.leadsTable.form.companyName')}{' '}
                    <span className="text-rose-500" aria-hidden>
                      *
                    </span>
                  </span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.customerId ?? ''}
                    options={customerOptions}
                    searchable
                    searchPlaceholder={t('admin.leadsTable.form.searchCompanyPlaceholder')}
                    closeAriaLabel={t('admin.leadsTable.form.companyPickerClose')}
                    emptyLabel={t('admin.leadsTable.form.noCompanyMatch')}
                    ariaLabel={t('admin.leadsTable.form.companyName')}
                    onChange={selectCustomer}
                    filterOption={(option, query) => {
                      const q = query.toLowerCase()
                      return (
                        option.label.toLowerCase().includes(q) ||
                        (option.description?.toLowerCase().includes(q) ?? false)
                      )
                    }}
                  />
                </div>
                <LeadExtendedFieldsForm
                  value={extendedForm}
                  onChange={setExtendedForm}
                  sections={leftSections}
                  readonlyKeys={LEAD_CUSTOMER_SOURCED_FIELD_KEYS}
                />
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl border border-ink/10 bg-white/50 px-4 py-2.5 text-sm font-medium text-brand dark:bg-white/5"
                  onClick={() => setShowLeftOptional((open) => !open)}
                >
                  <ChevronDownIcon
                    className={`size-4 shrink-0 transition-transform ${showLeftOptional ? 'rotate-180' : ''}`}
                  />
                  <span>
                    {showLeftOptional
                      ? t('admin.leadsTable.form.collapseOptionalOther')
                      : t('admin.leadsTable.form.expandOptionalOther')}
                  </span>
                </button>
              </div>
              <div className="min-w-0 space-y-4">
                <LeadContactProfilesEditor
                  value={contactProfiles}
                  onChange={setContactProfiles}
                  singleContact={false}
                  disabled={!form.customerId}
                  customer={linkedCustomer}
                  customerContacts={customerContacts}
                />
              </div>
            </div>
            {mode === 'detail' ? (
              <label className="block max-w-md space-y-1.5">
                <span className={labelClass}>{t('admin.leadDetail.lastContactDate')}</span>
                <input
                  type="datetime-local"
                  value={toDatetimeLocal(form.lastContactDate)}
                  className={inputClass}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      lastContactDate: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    }))
                  }
                />
              </label>
            ) : null}
            <div className="flex max-w-xs items-center gap-3">
              <span className={labelClass}>{t('admin.leadsTable.form.status')}</span>
              <CrmFilterSelect
                className="w-32"
                value={form.status}
                options={statusOptions}
                menuPlacement="top"
                ariaLabel={t('admin.leadsTable.form.status')}
                onChange={(next) =>
                  setForm((prev) => ({ ...prev, status: next as LeadFormInput['status'] }))
                }
              />
            </div>
          </div>
        ) : null}

        {!loading && !editing && lead ? (
          <>
            <section className={detailSectionCardClass()}>
              <h2 className="mb-3 text-sm font-extrabold text-ink">
                {t('admin.leadDetail.sectionOverview')}
              </h2>
              {headerLeadName && lead.companyName.trim() !== headerLeadName ? (
                <p className="mb-3 text-sm text-ink/80">
                  <span className="text-muted">
                    {t('admin.leadsTable.form.companyName')}:{' '}
                  </span>
                  {lead.companyName}
                </p>
              ) : null}
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className={labelClass}>{t('admin.leadsTable.col.status')}</dt>
                  <dd className="mt-0.5">
                    <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                      {t(`admin.leadsTable.status.${lead.status}`)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>{t('admin.leadsTable.col.contactName')}</dt>
                  <dd className="mt-0.5 text-sm text-ink/80">{dash(lead.contactName)}</dd>
                </div>
                <div>
                  <dt className={labelClass}>{t('admin.leadDetail.createdAt')}</dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {new Date(lead.createdAt).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>{t('admin.leadDetail.lastContactDate')}</dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {lead.lastContactDate
                      ? new Date(lead.lastContactDate).toLocaleString()
                      : '—'}
                  </dd>
                </div>
              </dl>
            </section>

            {displayProfiles.length > 0 || importedFallback ? (
              <section className={detailSectionCardClass()}>
                <h2 className="mb-3 text-sm font-extrabold text-ink">
                  {t('admin.leadDetail.contactProfilesTitle')}
                </h2>
                <div className="space-y-4">
                  {displayProfiles.map((profile, idx) => {
                    const sum = linkedCustomer
                      ? buildLeadImportedContactSummaryForContactCard(
                          linkedCustomer,
                          customerContacts,
                          profile,
                          idx,
                          displayProfiles,
                        )
                      : null
                    const profileSocial = formatLeadSocialAccountDisplayLines(
                      { socialAccounts: profile.socialAccounts },
                      (slug) => t(`admin.leadsTable.form.socialPlatformOption.${slug}`),
                    )
                    return (
                      <div
                        key={profile.id}
                        className="space-y-2 rounded-2xl border border-ink/10 bg-white/40 p-4 text-sm dark:bg-white/5"
                      >
                        {displayProfiles.length > 1 || profile.isPrimary ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {displayProfiles.length > 1 ? (
                              <span className="font-semibold text-ink">
                                {t('admin.leadsTable.contactProfiles.cardTitle', {
                                  n: idx + 1,
                                })}
                              </span>
                            ) : null}
                            {profile.isPrimary ? (
                              <span className="rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-bold text-brand">
                                {t('admin.leadsTable.contactProfiles.primaryBadge')}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {sum ? (
                          <div className="space-y-1 text-xs text-ink/80">
                            {sum.name ? (
                              <p>
                                <span className="text-muted">
                                  {t('admin.leadsTable.contactProfiles.importedLabelName')}:{' '}
                                </span>
                                {sum.name}
                              </p>
                            ) : null}
                            {sum.email ? (
                              <p>
                                <span className="text-muted">
                                  {t('admin.leadsTable.contactProfiles.importedLabelEmail')}:{' '}
                                </span>
                                {sum.email}
                              </p>
                            ) : null}
                            {sum.phone ? (
                              <p>
                                <span className="text-muted">
                                  {t(
                                    'admin.leadsTable.contactProfiles.importedLabelLandline',
                                  )}
                                  :{' '}
                                </span>
                                {sum.phone}
                              </p>
                            ) : null}
                            {sum.mobile ? (
                              <p>
                                <span className="text-muted">
                                  {t('admin.leadsTable.contactProfiles.importedLabelMobile')}:{' '}
                                </span>
                                {sum.mobile}
                              </p>
                            ) : null}
                            {sum.title ? (
                              <p>
                                <span className="text-muted">
                                  {t(
                                    'admin.leadsTable.contactProfiles.importedLabelJobTitle',
                                  )}
                                  :{' '}
                                </span>
                                {sum.title}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        {profileSocial.length ? (
                          <p className="whitespace-pre-line text-sm text-ink/80">
                            {profileSocial.join('\n')}
                          </p>
                        ) : null}
                        {profile.gender.trim() ? (
                          <p className="text-sm text-ink/80">
                            <span className="text-muted">
                              {t('admin.leadsTable.form.field.gender')}:{' '}
                            </span>
                            {normalizedLeadContactGenderSlug(profile.gender) === 'male'
                              ? t('admin.leadsTable.contactProfiles.genderMale')
                              : normalizedLeadContactGenderSlug(profile.gender) === 'female'
                                ? t('admin.leadsTable.contactProfiles.genderFemale')
                                : profile.gender.trim()}
                          </p>
                        ) : null}
                        {profile.contactRemarks.trim() ? (
                          <p className="text-sm text-ink/80">
                            <span className="text-muted">
                              {t('admin.leadsTable.form.field.contactRemarks')}:{' '}
                            </span>
                            {profile.contactRemarks.trim()}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                  {displayProfiles.length === 0 && importedFallback ? (
                    <div className="space-y-1.5 rounded-2xl border border-ink/10 bg-white/40 p-4 text-xs text-ink/80 dark:bg-white/5">
                      {importedFallback.name ? (
                        <p>
                          <span className="text-muted">
                            {t('admin.leadsTable.contactProfiles.importedLabelName')}:{' '}
                          </span>
                          {importedFallback.name}
                        </p>
                      ) : null}
                      {importedFallback.email ? (
                        <p>
                          <span className="text-muted">
                            {t('admin.leadsTable.contactProfiles.importedLabelEmail')}:{' '}
                          </span>
                          {importedFallback.email}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {extendedEntries.length > 0 || socialLines.length > 0 ? (
              <section className={detailSectionCardClass()}>
                <h2 className="mb-3 text-sm font-extrabold text-ink">
                  {t('admin.leadDetail.extendedSectionTitle')}
                </h2>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  {extendedEntries.map((row) => (
                    <div key={row.key}>
                      <dt className="text-muted">
                        {t(`admin.leadsTable.form.field.${row.key}`, {
                          year: currentYear,
                        })}
                      </dt>
                      <dd className="mt-0.5 text-ink wrap-break-word">
                        {row.key === 'visitorIpLocation' ? (
                          <span className="inline-flex items-center gap-2">
                            <CountryFlag countryName={row.value} size={18} />
                            {getCountryDisplayName(row.value, localeTag)}
                          </span>
                        ) : (
                          formatLeadExtendedEnumDetailLabel(row.key, row.value, t)
                        )}
                      </dd>
                    </div>
                  ))}
                  {socialLines.length ? (
                    <div className="sm:col-span-2">
                      <dt className="text-muted">
                        {t('admin.leadsTable.form.field.socialAccounts')}
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-line text-ink">
                        {socialLines.join('\n')}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            ) : null}

            {leadId ? (
              <section className={detailSectionCardClass()}>
                <FollowUpTimelinePane
                  userId={userId}
                  writes={writes}
                  title={t('admin.followUpTimeline.title')}
                  entity={{ type: 'lead', id: leadId }}
                  createContext={{ type: 'lead', id: leadId }}
                  onNavigate={onNavigate}
                  embedded
                />
              </section>
            ) : null}
          </>
        ) : null}
      </div>

      {deletePresence.mounted
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                deletePresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in'
              }`}
              onClick={() => {
                if (!deleting) {
                  setDeleteOpen(false)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-base font-extrabold text-brand">
                  {t('admin.leadsTable.deleteConfirm.title')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.leadsTable.deleteConfirm.message')}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteOpen(false)}
                  >
                    {t('admin.leadsTable.deleteConfirm.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    onClick={() => void confirmDelete()}
                  >
                    {t('admin.leadsTable.deleteConfirm.confirm')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
