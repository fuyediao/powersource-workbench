/**
 * Full-page create / edit form for web `/admin/customers/new` field parity.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { ContactsPanel } from '@/components/admin/customer-detail/contacts-panel'
import { CustomerSubtablesPanel } from '@/components/admin/customer-subtables-panel'
import { CountryFlag } from '@/components/common/country-flag'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { PhoneInput } from '@/components/settings/phone-input'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import {
  CURRENCY_VALUES,
  CUSTOMER_ATTRIBUTE_VALUES,
  CUSTOMER_CHANNEL_VALUES,
  CUSTOMER_SOURCE_VALUES,
  MARKET_SEGMENT_VALUES,
  PAYMENT_METHOD_VALUES,
  PRICE_TYPE_VALUES,
} from '@/constants/customer-options'
import { CUSTOMER_LEVEL_VALUES } from '@/constants/customer-levels'
import { CUSTOMER_TYPE_VALUES } from '@/constants/customer-types'
import { useFavorites } from '@/hooks/use-favorites'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { ArrowLeftIcon, ChevronDownIcon, CloseIcon, LucideBuilding2Icon } from '@/icons/AllIcons'
import {
  createCustomer,
  getCustomerById,
  isCustomerCodeAvailable,
  isCustomerCodeUniqueViolation,
  updateCustomer,
  updateCustomerLogoUrl,
} from '@/services/customers-api'
import { uploadCustomerLogoToStorage } from '@/services/customer-logo-storage'
import {
  fetchCurrentGroup,
  fetchGroupMembers,
  type GroupMemberRecord,
} from '@/services/groups-api'
import type { CustomerFormInput } from '@/types/customer'
import type { Favorite } from '@/types/favorite'
import { isValidCustomerCodeFormat, sanitizeCustomerCodeInput } from '@/utils/customer-code'
import { applyFavoriteToCustomerCompanyAddress } from '@/utils/customer-structured-address'
import { isImageSizeWithinLimit } from '@/utils/image-upload'
import { countryMatchesSearch } from '@/utils/map/country-alpha2'

/**
 * Human-readable label for a group member (owner / contact pickers).
 * @param member - Group member row.
 * @returns Display name.
 */
function memberDisplayLabel(member: GroupMemberRecord): string {
  return (
    member.user?.display_name?.trim() ||
    member.user?.full_name?.trim() ||
    member.user?.email?.trim() ||
    member.userId.slice(0, 8)
  )
}

interface CustomerFormPaneProps {
  userId: string
  writes: AdminShellWrites | null
  mode: 'create' | 'edit'
  customerId?: string | null
  onNavigate: (path: string) => void
  /**
   * When true, render field sections only for detail in-place edit
   * (parent keeps left profile + Cancel/Save toolbar).
   */
  embedded?: boolean
  /** Called after a successful save when `embedded`. */
  onEmbeddedSaved?: () => void
  /** Optional: report saving / canSave to parent toolbar. */
  onEmbeddedStateChange?: (state: { saving: boolean; canSave: boolean }) => void
}

/** DOM form id so the detail toolbar Save can submit via the `form` attribute. */
export const CUSTOMER_DETAIL_EDIT_FORM_ID = 'customer-detail-edit-form'

const LIST_PATH = '/admin/customers'

const fieldClass =
  'rounded-2xl border border-ink/10 bg-white/60 px-3 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-brand disabled:opacity-50 dark:border-white/10 dark:bg-zinc-950/40'

/** Center-column section card shell (web parity: info / address / classification). */
const sectionCardClass =
  'overflow-hidden rounded-2xl border border-ink/10 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5'

/** Section title row — theme accent text; no solid brand fill (Settings-style). */
const sectionHeaderClass = 'border-b border-ink/10 bg-white/40 px-5 py-3 dark:bg-white/5'

/** Padded field body under the section header. */
const sectionBodyClass = 'space-y-3 px-5 py-5'

/** Field label above inputs (ink, not muted gray). */
const labelClass = 'flex flex-col gap-1 text-xs font-semibold text-ink'

/** Standalone label text above custom controls. */
const labelTextClass = 'mb-1 text-xs font-semibold text-ink'

/**
 * Empty form defaults for create.
 * @returns Blank form input.
 */
function emptyForm(): CustomerFormInput {
  return {
    companyName: '',
    customerCode: '',
    shortName: '',
    contactName: '',
    phone: '',
    phoneCountry: '',
    email: '',
    note: '',
    description: '',
    address: '',
    latitude: null,
    longitude: null,
    website: '',
    taxId: '',
    fax: '',
    faxCountry: '',
    industry: '',
    employeeCount: null,
    primaryContactName: '',
    ownerUserId: '',
    companyCountry: '',
    companyState: '',
    companyCity: '',
    companyPostalCode: '',
    companyAddressLine1: '',
    companyAddressLine2: '',
    category: '',
    customerType: '',
    customerChannel: '',
    customerAttribute: '',
    marketSegment: '',
    marketSubSegment: '',
    customerSource: '',
    customerLevel: '',
    paymentCycle: '',
    relationshipStartDate: '',
    creditLimit: null,
    paymentMethod: '',
    currency: '',
    priceType: '',
    jobTitle: '',
    handlerDepartment: '',
    handlerDeveloper: '',
    handlerFollower: '',
    logoUrl: '',
  }
}

/**
 * Full-page customer create form, or fields-only body for detail in-place edit.
 * @param props - Mode, write gates, navigation, optional embedded callbacks.
 * @returns Form UI.
 */
export function CustomerFormPane({
  userId,
  writes,
  mode,
  customerId = null,
  onNavigate,
  embedded = false,
  onEmbeddedSaved,
  onEmbeddedStateChange,
}: CustomerFormPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const { favorites, loadFavorites } = useFavorites()
  const [form, setForm] = useState<CustomerFormInput>(emptyForm)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const [members, setMembers] = useState<GroupMemberRecord[]>([])
  const [locationQuery, setLocationQuery] = useState('')
  const [locationOpen, setLocationOpen] = useState(false)
  const [addressFromFavorite, setAddressFromFavorite] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null)
  const [pendingLogoPreview, setPendingLogoPreview] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const blocked =
    (mode === 'create' && !canCreate) || (mode === 'edit' && !canEdit)

  const countryOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.selectPlaceholder') },
      ...COUNTRY_OPTIONS.map((name) => ({ value: name, label: name })),
    ],
    [t],
  )

  const customerTypeOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.customerTypeUnset') },
      ...CUSTOMER_TYPE_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerType.${slug}`),
      })),
    ],
    [t],
  )

  const customerChannelOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.customerChannelUnset') },
      ...CUSTOMER_CHANNEL_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerChannel.${slug}`),
      })),
    ],
    [t],
  )

  const customerAttributeOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.customerAttributeUnset') },
      ...CUSTOMER_ATTRIBUTE_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerAttribute.${slug}`),
      })),
    ],
    [t],
  )

  const marketSegmentOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.marketSegmentUnset') },
      ...MARKET_SEGMENT_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerMarketSegment.${slug}`),
      })),
    ],
    [t],
  )

  const customerSourceOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.customerSourceUnset') },
      ...CUSTOMER_SOURCE_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerSource.${slug}`),
      })),
    ],
    [t],
  )

  const customerLevelOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.customerLevelUnset') },
      ...CUSTOMER_LEVEL_VALUES.map((slug) => ({ value: slug, label: slug })),
    ],
    [t],
  )

  const currencyOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.currencyUnset') },
      ...CURRENCY_VALUES.map((code) => ({
        value: code,
        label: t(`admin.customers.currency.${code}`),
      })),
    ],
    [t],
  )

  const paymentMethodOptions = useMemo<CrmFilterOption[]>(() => {
    const known = PAYMENT_METHOD_VALUES.map((method) => ({
      value: method,
      label: method,
    }))
    const current = (form.paymentMethod ?? '').trim()
    const extras =
      current && !(PAYMENT_METHOD_VALUES as readonly string[]).includes(current)
        ? [{ value: current, label: current }]
        : []
    return [
      { value: '', label: t('admin.customers.form.paymentMethodUnset') },
      ...extras,
      ...known,
    ]
  }, [form.paymentMethod, t])

  const priceTypeOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.priceTypeUnset') },
      ...PRICE_TYPE_VALUES.map((slug) => ({
        value: slug,
        label: t(`admin.customers.customerPriceType.${slug}`),
      })),
    ],
    [t],
  )

  const ownerOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.ownerUnset') },
      ...members.map((member) => ({
        value: member.userId,
        label: memberDisplayLabel(member),
      })),
    ],
    [members, t],
  )

  const memberNameOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.customers.form.selectPlaceholder') },
      ...members.map((member) => {
        const label = memberDisplayLabel(member)
        return { value: label, label }
      }),
    ],
    [members, t],
  )

  const filteredFavorites = useMemo(() => {
    const q = locationQuery.trim().toLowerCase()
    if (!q) {
      return favorites
    }
    return favorites.filter(
      (fav) =>
        fav.shopName.toLowerCase().includes(q) ||
        (fav.address ?? '').toLowerCase().includes(q),
    )
  }, [favorites, locationQuery])

  const selectedLocationLabel = useMemo(() => {
    if (form.latitude == null || form.longitude == null) {
      return ''
    }
    const match = favorites.find(
      (fav) =>
        Math.abs(fav.latitude - (form.latitude ?? 0)) < 0.0001 &&
        Math.abs(fav.longitude - (form.longitude ?? 0)) < 0.0001,
    )
    return match?.shopName ?? form.address ?? ''
  }, [favorites, form.address, form.latitude, form.longitude])

  const logoDisplaySrc =
    pendingLogoPreview?.trim() || form.logoUrl?.trim() || ''

  useEffect(() => {
    return () => {
      if (pendingLogoPreview) {
        URL.revokeObjectURL(pendingLogoPreview)
      }
    }
  }, [pendingLogoPreview])

  useEffect(() => {
    let cancelled = false
    /**
     * Loads group, members, favorites, and optional customer row.
     * @returns Nothing.
     */
    async function load(): Promise<void> {
      setErrorMessage(null)
      try {
        const group = await fetchCurrentGroup(userId)
        if (cancelled) {
          return
        }
        const gid = group?.id ?? null
        setGroupId(gid)
        void loadFavorites(userId)
        if (gid) {
          const memberRows = await fetchGroupMembers(gid, group?.groupAdminId)
          if (!cancelled) {
            setMembers(memberRows)
          }
        }
        if (mode === 'create') {
          setForm(emptyForm())
          setAddressFromFavorite(false)
          setLoading(false)
          return
        }
        if (!customerId) {
          setErrorMessage(t('admin.customers.errorLoad'))
          setLoading(false)
          return
        }
        setLoading(true)
        const row = await getCustomerById(customerId)
        if (cancelled) {
          return
        }
        if (!row) {
          setErrorMessage(t('admin.customers.errorLoad'))
          setForm(emptyForm())
        } else {
          setGroupId(row.groupId)
          setForm({
            ...emptyForm(),
            ...row,
            ownerUserId: row.ownerUserId ?? '',
            phoneCountry: row.phoneCountry ?? '',
            faxCountry: row.faxCountry ?? '',
          })
          setAddressFromFavorite(Boolean(row.latitude != null && row.longitude != null))
        }
      } catch (err) {
        console.error('[CustomerFormPane] load:', err)
        if (!cancelled) {
          setErrorMessage(t('admin.customers.errorLoad'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [customerId, loadFavorites, mode, t, userId])

  /**
   * Patches one form field.
   * @param key - Field key.
   * @param value - Next value.
   * @returns Nothing.
   */
  function setField<K extends keyof CustomerFormInput>(
    key: K,
    value: CustomerFormInput[K],
  ): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  /**
   * Applies a favorite as map location + company address.
   * @param fav - Favorite row.
   * @returns Nothing.
   */
  function selectLocation(fav: Favorite): void {
    const next = { ...form }
    next.address = fav.address?.trim() || fav.shopName
    next.latitude = fav.latitude
    next.longitude = fav.longitude
    const company = {
      companyCountry: next.companyCountry ?? null,
      companyState: next.companyState ?? null,
      companyCity: next.companyCity ?? null,
      companyPostalCode: next.companyPostalCode ?? null,
      companyAddressLine1: next.companyAddressLine1 ?? null,
      companyAddressLine2: next.companyAddressLine2 ?? null,
    }
    applyFavoriteToCustomerCompanyAddress(fav, company)
    next.companyCountry = company.companyCountry ?? ''
    next.companyState = company.companyState ?? ''
    next.companyCity = company.companyCity ?? ''
    next.companyPostalCode = company.companyPostalCode ?? ''
    next.companyAddressLine1 = company.companyAddressLine1 ?? ''
    next.companyAddressLine2 = company.companyAddressLine2 ?? ''
    setForm(next)
    setAddressFromFavorite(true)
    setLocationOpen(false)
    setLocationQuery('')
  }

  /**
   * Clears map location and favorite-synced address lock.
   * @returns Nothing.
   */
  function clearLocation(): void {
    setForm((current) => ({
      ...current,
      address: '',
      latitude: null,
      longitude: null,
    }))
    setAddressFromFavorite(false)
    setLocationQuery('')
    setLocationOpen(false)
  }

  /**
   * Returns to list (create) or customer detail (standalone edit — not used when embedded).
   * @returns Nothing.
   */
  function goBack(): void {
    if (saving) {
      return
    }
    if (mode === 'edit' && customerId) {
      onNavigate(`/admin/customers/${customerId}`)
      return
    }
    onNavigate(LIST_PATH)
  }

  /**
   * Persists create or edit.
   * @returns Nothing.
   */
  async function handleSubmit(): Promise<void> {
    if (saving || blocked) {
      return
    }
    if (!form.companyName.trim()) {
      setErrorMessage(t('admin.customers.errorAdd'))
      return
    }
    const code = (form.customerCode ?? '').trim()
    if (!code) {
      setErrorMessage(t('admin.customers.errorCodeRequired'))
      return
    }
    if (!isValidCustomerCodeFormat(code)) {
      setErrorMessage(t('admin.customers.errorCodeFormat'))
      return
    }
    if (mode === 'create' && !domainWrites.isSystemAdmin && !groupId) {
      setErrorMessage(t('admin.customers.errorNoGroup'))
      return
    }

    setSaving(true)
    setErrorMessage(null)
    try {
      const available = await isCustomerCodeAvailable(
        code,
        mode === 'edit' ? customerId : null,
      )
      if (!available) {
        setErrorMessage(t('admin.customers.errorCodeTaken'))
        setSaving(false)
        return
      }
      const payload: CustomerFormInput = {
        ...form,
        customerCode: code,
        ownerUserId: form.ownerUserId || null,
      }
      if (mode === 'create') {
        const created = await createCustomer(userId, groupId, payload)
        if (pendingLogoFile) {
          const result = await uploadCustomerLogoToStorage(
            userId,
            created.id,
            pendingLogoFile,
          )
          if (!('error' in result)) {
            await updateCustomerLogoUrl(created.id, result.publicUrl)
          }
        }
        onNavigate(`/admin/customers/${created.id}`)
      } else if (customerId) {
        await updateCustomer(customerId, payload)
        if (embedded) {
          onEmbeddedSaved?.()
        } else {
          onNavigate(`/admin/customers/${customerId}`)
        }
      }
    } catch (err) {
      console.error('[CustomerFormPane] save:', err)
      if (isCustomerCodeUniqueViolation(err as { code?: string })) {
        setErrorMessage(t('admin.customers.errorCodeTaken'))
      } else {
        setErrorMessage(
          mode === 'create'
            ? t('admin.customers.errorAdd')
            : t('admin.customers.errorUpdate'),
        )
      }
    } finally {
      setSaving(false)
    }
  }

  /**
   * Opens the hidden logo file picker (create or edit).
   * @returns Nothing.
   */
  function triggerLogoPick(): void {
    if (blocked || logoUploading) {
      return
    }
    if (mode === 'edit' && !customerId) {
      return
    }
    setLogoError(null)
    logoInputRef.current?.click()
  }

  /**
   * Create: stages a local logo preview. Edit: uploads to Storage and persists `logo_url`.
   * @param event - File input change.
   * @returns Nothing.
   */
  async function onLogoFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file || blocked) {
      return
    }
    setLogoError(null)
    if (!isImageSizeWithinLimit(file)) {
      setLogoError(t('admin.customers.detail.logoTooLarge'))
      return
    }
    if (mode === 'create') {
      if (pendingLogoPreview) {
        URL.revokeObjectURL(pendingLogoPreview)
      }
      setPendingLogoFile(file)
      setPendingLogoPreview(URL.createObjectURL(file))
      return
    }
    if (!customerId) {
      return
    }
    setLogoUploading(true)
    try {
      const result = await uploadCustomerLogoToStorage(userId, customerId, file)
      if ('error' in result) {
        setLogoError(
          result.error === 'file_too_large'
            ? t('admin.customers.detail.logoTooLarge')
            : result.error,
        )
        return
      }
      const updated = await updateCustomerLogoUrl(customerId, result.publicUrl)
      setField('logoUrl', updated.logoUrl ?? result.publicUrl)
    } catch (err) {
      console.error('[CustomerFormPane] logo upload:', err)
      setLogoError(t('admin.customers.detail.logoSaveFailed'))
    } finally {
      setLogoUploading(false)
    }
  }

  /**
   * Clears staged create logo or persisted edit logo URL.
   * @returns Nothing.
   */
  async function clearLogo(): Promise<void> {
    if (blocked) {
      return
    }
    setLogoError(null)
    if (mode === 'create') {
      if (pendingLogoPreview) {
        URL.revokeObjectURL(pendingLogoPreview)
      }
      setPendingLogoFile(null)
      setPendingLogoPreview(null)
      return
    }
    if (!customerId || !form.logoUrl?.trim()) {
      return
    }
    setLogoUploading(true)
    try {
      await updateCustomerLogoUrl(customerId, null)
      setField('logoUrl', '')
    } catch (err) {
      console.error('[CustomerFormPane] logo clear:', err)
      setLogoError(t('admin.customers.detail.logoSaveFailed'))
    } finally {
      setLogoUploading(false)
    }
  }

  const title =
    mode === 'create'
      ? t('admin.customers.modal.createTitle')
      : t('admin.customers.modal.editTitle')

  const canSave =
    !saving &&
    !blocked &&
    !loading &&
    Boolean(form.companyName.trim()) &&
    Boolean((form.customerCode ?? '').trim())

  useEffect(() => {
    if (!embedded || !onEmbeddedStateChange) {
      return
    }
    onEmbeddedStateChange({ saving, canSave })
  }, [embedded, onEmbeddedStateChange, saving, canSave])

  /**
   * Form submit handler (native submit / toolbar `form` attribute).
   * @param event - Submit event.
   * @returns Nothing.
   */
  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    void handleSubmit()
  }

  const scrollClass = embedded
    ? '@container/customer-form space-y-6'
    : '@container/customer-form min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6'

  return (
    <div className={embedded ? 'min-w-0' : 'flex min-h-0 flex-1 flex-col overflow-hidden'}>
      {embedded ? null : (
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-brand transition hover:bg-brand/10 disabled:opacity-50"
            disabled={saving}
            aria-label={t('admin.customers.backToList')}
            onClick={goBack}
          >
            <ArrowLeftIcon className="size-5" aria-hidden />
          </button>
          <h1 className="truncate text-xl font-extrabold text-brand">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving}
            className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-2 text-sm font-bold text-ink transition hover:border-brand/40 hover:text-brand disabled:opacity-50 dark:bg-white/5"
            onClick={goBack}
          >
            {t('admin.customers.modal.cancel')}
          </button>
          <button
            type="button"
            disabled={!canSave}
            className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void handleSubmit()}
          >
            {saving ? t('admin.customers.modal.saving') : t('admin.customers.modal.save')}
          </button>
        </div>
      </div>
      )}

      <form
        id={embedded ? CUSTOMER_DETAIL_EDIT_FORM_ID : undefined}
        className={scrollClass}
        onSubmit={onFormSubmit}
      >
        {writes?.readOnly || blocked ? (
          <p className="mb-4 text-sm font-semibold text-muted">
            {t('admin.moduleAccess.readOnly')}
          </p>
        ) : null}
        {loading ? (
          <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
        ) : (
          <div className={embedded ? 'space-y-6' : 'flex flex-col gap-4 @[52rem]/customer-form:flex-row @[52rem]/customer-form:items-start'}>
            <div className="min-w-0 flex-1 space-y-6">
              {embedded ? null : (
              <div className="rounded-2xl border border-ink/10 bg-white/60 px-5 py-4 dark:bg-white/5">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="sr-only"
                  onChange={(event) => void onLogoFileChange(event)}
                />
                <div className="flex items-start gap-4">
                  {!blocked ? (
                    <button
                      type="button"
                      disabled={logoUploading}
                      title={t('admin.customers.detail.logoChangeTitle')}
                      className="group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-brand/40 bg-brand/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:opacity-50"
                      onClick={triggerLogoPick}
                    >
                      {logoDisplaySrc ? (
                        <img
                          src={logoDisplaySrc}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : form.companyName.trim() ? (
                        <span className="select-none text-xl font-bold text-brand">
                          {form.companyName.trim().charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <LucideBuilding2Icon className="size-7 text-brand/50" aria-hidden />
                      )}
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-950/55 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {logoUploading
                          ? t('admin.customers.detail.logoUploading')
                          : t('admin.customers.detail.logoChangeHint')}
                      </span>
                    </button>
                  ) : (
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-brand/30 bg-brand/15">
                      {logoDisplaySrc ? (
                        <img
                          src={logoDisplaySrc}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : form.companyName.trim() ? (
                        <span className="select-none text-xl font-bold text-brand">
                          {form.companyName.trim().charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <LucideBuilding2Icon className="size-7 text-brand/50" aria-hidden />
                      )}
                    </div>
                  )}
                  <div className="min-w-0 flex-1 pt-0.5 text-left">
                    {mode === 'create' ? (
                      <>
                        <h2 className="text-base font-semibold text-brand">
                          {t('admin.customers.detail.newCustomerProfile')}
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                          {t('admin.customers.detail.newCustomerHint')}
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-base font-semibold leading-snug text-brand">
                          {form.companyName.trim() ||
                            t('admin.customers.detail.newCustomerProfile')}
                        </h2>
                        {form.shortName?.trim() ? (
                          <p className="mt-0.5 text-xs text-muted">{form.shortName}</p>
                        ) : null}
                        {form.email?.trim() ? (
                          <a
                            href={`mailto:${form.email}`}
                            className="mt-1 block max-w-full truncate text-xs font-medium text-brand hover:opacity-80"
                          >
                            {form.email}
                          </a>
                        ) : null}
                      </>
                    )}
                    {logoError ? (
                      <p className="mt-1 text-[11px] font-medium text-rose-500">{logoError}</p>
                    ) : null}
                    {(logoDisplaySrc || pendingLogoFile) && !blocked ? (
                      <button
                        type="button"
                        disabled={logoUploading}
                        className="mt-1 text-[11px] font-semibold text-muted transition hover:text-rose-500 disabled:opacity-40"
                        onClick={() => void clearLogo()}
                      >
                        {t('admin.customers.detail.logoRemove')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              )}

              <section id="section-customer-info" className={sectionCardClass}>
                <div className={sectionHeaderClass}>
                  <h2 className="text-sm font-semibold tracking-wide text-brand">
                    {t('admin.customers.section.customerInfo')}
                  </h2>
                </div>
                <div className={sectionBodyClass}>
                <label className={labelClass}>
                  <span>
                    {t('admin.customers.form.companyName')}{' '}
                    <span className="text-rose-500" aria-hidden>
                      *
                    </span>
                  </span>
                  <input
                    className={fieldClass}
                    value={form.companyName}
                    disabled={saving || blocked}
                    placeholder={t('admin.customers.form.companyNamePlaceholder')}
                    autoFocus={mode === 'create'}
                    onChange={(e) => setField('companyName', e.target.value)}
                  />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className={labelClass}>
                    {t('admin.customers.form.shortName')}
                    <input
                      className={fieldClass}
                      value={form.shortName ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('shortName', e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    {t('admin.customers.form.email')}
                    <input
                      className={fieldClass}
                      type="email"
                      value={form.email ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('email', e.target.value)}
                    />
                  </label>
                </div>
                <label className={labelClass}>
                  {t('admin.customers.form.description')}
                  <textarea
                    className={`${fieldClass} min-h-24 resize-y`}
                    value={form.description ?? ''}
                    disabled={saving || blocked}
                    placeholder={t('admin.customers.form.descriptionPlaceholder')}
                    onChange={(e) => setField('description', e.target.value)}
                  />
                </label>

                <div className="relative">
                  <p className={labelTextClass}>
                    {t('admin.customers.form.selectLocation')}
                  </p>
                  {selectedLocationLabel ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 rounded-2xl border border-ink/10 bg-white/60 px-3 py-2.5 dark:border-white/10 dark:bg-zinc-950/40">
                        <p className="min-w-0 truncate text-sm font-medium text-ink">
                          {selectedLocationLabel}
                        </p>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg p-1 text-ink/50 transition hover:bg-brand/10 hover:text-brand disabled:opacity-50"
                          disabled={saving || blocked}
                          aria-label={t('admin.customers.form.clearLocation')}
                          onClick={clearLocation}
                        >
                          <CloseIcon className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="relative w-full">
                        <input
                          type="text"
                          className={`${fieldClass} w-full pr-8`}
                          value={locationQuery}
                          disabled={saving || blocked}
                          placeholder={t('admin.customers.form.locationSearchPlaceholder')}
                          onChange={(e) => {
                            setLocationQuery(e.target.value)
                            setLocationOpen(true)
                          }}
                          onFocus={() => setLocationOpen(true)}
                          onBlur={() => {
                            window.setTimeout(() => setLocationOpen(false), 200)
                          }}
                        />
                        <ChevronDownIcon
                          className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted"
                          aria-hidden
                        />
                      </div>
                      {locationOpen ? (
                        <div className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-zinc-950/10 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900">
                          {filteredFavorites.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted">
                              {favorites.length === 0
                                ? t('admin.customers.form.noFavorites')
                                : t('admin.customers.form.noMatchingFavorites')}
                            </p>
                          ) : (
                            <ul>
                              {filteredFavorites.map((fav) => (
                                <li key={fav.id}>
                                  <button
                                    type="button"
                                    className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-ink/5"
                                    onMouseDown={(event) => {
                                      event.preventDefault()
                                      selectLocation(fav)
                                    }}
                                  >
                                    <span className="font-semibold text-ink">{fav.shopName}</span>
                                    <span className="truncate text-xs text-muted">
                                      {fav.address || `${fav.latitude}, ${fav.longitude}`}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className={labelClass}>
                    {t('admin.customers.form.phone')}
                    <PhoneInput
                      value={form.phone ?? ''}
                      countryCode={form.phoneCountry ?? ''}
                      disabled={saving || blocked}
                      onChange={(nextValue, nextIso) => {
                        setField('phone', nextValue)
                        setField('phoneCountry', nextIso)
                      }}
                    />
                  </label>
                  <label className={labelClass}>
                    {t('admin.customers.form.fax')}
                    <PhoneInput
                      value={form.fax ?? ''}
                      countryCode={form.faxCountry ?? ''}
                      disabled={saving || blocked}
                      onChange={(nextValue, nextIso) => {
                        setField('fax', nextValue)
                        setField('faxCountry', nextIso)
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className={labelClass}>
                    {t('admin.customers.form.website')}
                    <input
                      className={fieldClass}
                      value={form.website ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('website', e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    {t('admin.customers.form.industry')}
                    <input
                      className={fieldClass}
                      value={form.industry ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('industry', e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    {t('admin.customers.form.taxId')}
                    <input
                      className={fieldClass}
                      value={form.taxId ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('taxId', e.target.value)}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className={labelClass}>
                    {t('admin.customers.form.employeeCount')}
                    <input
                      className={fieldClass}
                      type="number"
                      value={form.employeeCount ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) =>
                        setField(
                          'employeeCount',
                          e.target.value === '' ? null : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                  <label className={labelClass}>
                    {t('admin.customers.form.primaryContactName')}
                    <input
                      className={fieldClass}
                      value={form.primaryContactName ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('primaryContactName', e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    <span>
                      {t('admin.customers.form.customerCode')}{' '}
                      <span className="text-rose-500" aria-hidden>
                        *
                      </span>
                    </span>
                    <input
                      className={fieldClass}
                      value={form.customerCode ?? ''}
                      disabled={saving || blocked}
                      placeholder={t('admin.customers.form.customerCodePlaceholder')}
                      onChange={(e) =>
                        setField('customerCode', sanitizeCustomerCodeInput(e.target.value))
                      }
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.owner')}
                    </p>
                    <CrmFilterSelect
                      menuPlacement="top"
                      value={form.ownerUserId ?? ''}
                      options={ownerOptions}
                      searchable
                      disabled={saving || blocked}
                      searchPlaceholder={t('common.inlineSearchComboboxSearch')}
                      closeAriaLabel={t('common.inlineSearchComboboxClose')}
                      emptyLabel={t('common.inlineSearchComboboxEmpty')}
                      ariaLabel={t('admin.customers.form.owner')}
                      onChange={(next) => setField('ownerUserId', next)}
                    />
                  </div>
                  <label className={labelClass}>
                    {t('admin.customers.form.companyAddressPostalCode')}
                    <input
                      className={fieldClass}
                      value={form.companyPostalCode ?? ''}
                      disabled={saving || blocked || addressFromFavorite}
                      onChange={(e) => setField('companyPostalCode', e.target.value)}
                    />
                  </label>
                </div>
                </div>
              </section>
              {errorMessage ? (
                <p className="text-sm font-medium text-rose-500">{errorMessage}</p>
              ) : null}
            </div>

            <div className="@container/classification flex min-w-0 w-full flex-1 flex-col gap-4 @[52rem]/customer-form:sticky @[52rem]/customer-form:top-0">
              <section id="section-company-address" className={sectionCardClass}>
                <div className={sectionHeaderClass}>
                  <h2 className="text-sm font-semibold tracking-wide text-brand">
                    {t('admin.customers.section.companyAddress')}
                  </h2>
                </div>
                <div className={sectionBodyClass}>
                {addressFromFavorite ? (
                  <p className="text-xs font-medium text-muted">
                    {t('admin.customers.form.companyAddressFromFavoriteHint')}
                  </p>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.companyAddressCountry')}
                    </p>
                    <CrmFilterSelect
                      value={form.companyCountry ?? ''}
                      options={countryOptions}
                      searchable
                      disabled={saving || blocked || addressFromFavorite}
                      searchPlaceholder={t('admin.customers.form.countrySearchPlaceholder')}
                      closeAriaLabel={t('common.inlineSearchComboboxClose')}
                      emptyLabel={t('admin.customers.form.noMatchingCountries')}
                      ariaLabel={t('admin.customers.form.companyAddressCountry')}
                      renderLeading={(option) =>
                        option.value ? (
                          <CountryFlag countryName={option.value} size={16} />
                        ) : null
                      }
                      filterOption={(option, query) =>
                        countryMatchesSearch(option.value, query) ||
                        option.label.toLowerCase().includes(query.toLowerCase())
                      }
                      onChange={(next) => setField('companyCountry', next)}
                    />
                  </div>
                  <label className={labelClass}>
                    {t('admin.customers.form.companyAddressState')}
                    <input
                      className={fieldClass}
                      value={form.companyState ?? ''}
                      disabled={saving || blocked || addressFromFavorite}
                      placeholder={t('admin.customers.form.companyAddressStatePlaceholder')}
                      onChange={(e) => setField('companyState', e.target.value)}
                    />
                  </label>
                </div>
                <label className={labelClass}>
                  {t('admin.customers.form.companyAddressCity')}
                  <input
                    className={fieldClass}
                    value={form.companyCity ?? ''}
                    disabled={saving || blocked || addressFromFavorite}
                    placeholder={t('admin.customers.form.companyAddressCityPlaceholder')}
                    onChange={(e) => setField('companyCity', e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  {t('admin.customers.form.companyAddressLine1')}
                  <input
                    className={fieldClass}
                    value={form.companyAddressLine1 ?? ''}
                    disabled={saving || blocked || addressFromFavorite}
                    placeholder={t('admin.customers.form.companyAddressLine1Placeholder')}
                    onChange={(e) => setField('companyAddressLine1', e.target.value)}
                  />
                </label>
                <label className={labelClass}>
                  {t('admin.customers.form.companyAddressLine2')}
                  <input
                    className={fieldClass}
                    value={form.companyAddressLine2 ?? ''}
                    disabled={saving || blocked || addressFromFavorite}
                    placeholder={t('admin.customers.form.companyAddressLine2Placeholder')}
                    onChange={(e) => setField('companyAddressLine2', e.target.value)}
                  />
                </label>
                </div>
              </section>

              <section id="section-classification" className={sectionCardClass}>
                <div className={sectionHeaderClass}>
                  <h2 className="text-sm font-semibold tracking-wide text-brand">
                    {t('admin.customers.section.classification')}
                  </h2>
                </div>
                <div className={sectionBodyClass}>
                <div className="grid grid-cols-1 gap-3 @[18rem]/classification:grid-cols-2 @[26rem]/classification:grid-cols-3">
                  <label className={labelClass}>
                    {t('admin.customers.form.category')}
                    <input
                      className={fieldClass}
                      value={form.category ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('category', e.target.value)}
                    />
                  </label>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.customerType')}
                    </p>
                    <CrmFilterSelect
                      value={form.customerType ?? ''}
                      options={customerTypeOptions}
                      disabled={saving || blocked}
                      ariaLabel={t('admin.customers.form.customerType')}
                      onChange={(next) => setField('customerType', next)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.customerChannel')}
                    </p>
                    <CrmFilterSelect
                      value={form.customerChannel ?? ''}
                      options={customerChannelOptions}
                      disabled={saving || blocked}
                      ariaLabel={t('admin.customers.form.customerChannel')}
                      onChange={(next) => setField('customerChannel', next)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.customerAttribute')}
                    </p>
                    <CrmFilterSelect
                      value={form.customerAttribute ?? ''}
                      options={customerAttributeOptions}
                      disabled={saving || blocked}
                      ariaLabel={t('admin.customers.form.customerAttribute')}
                      onChange={(next) => setField('customerAttribute', next)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.marketSegment')}
                    </p>
                    <CrmFilterSelect
                      value={form.marketSegment ?? ''}
                      options={marketSegmentOptions}
                      disabled={saving || blocked}
                      ariaLabel={t('admin.customers.form.marketSegment')}
                      onChange={(next) => setField('marketSegment', next)}
                    />
                  </div>
                  <label className={labelClass}>
                    {t('admin.customers.form.marketSubSegment')}
                    <input
                      className={fieldClass}
                      value={form.marketSubSegment ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('marketSubSegment', e.target.value)}
                    />
                  </label>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.customerSource')}
                    </p>
                    <CrmFilterSelect
                      value={form.customerSource ?? ''}
                      options={customerSourceOptions}
                      disabled={saving || blocked}
                      ariaLabel={t('admin.customers.form.customerSource')}
                      onChange={(next) => setField('customerSource', next)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.customerLevel')}
                    </p>
                    <CrmFilterSelect
                      value={form.customerLevel ?? ''}
                      options={customerLevelOptions}
                      disabled={saving || blocked}
                      ariaLabel={t('admin.customers.form.customerLevel')}
                      onChange={(next) => setField('customerLevel', next)}
                    />
                  </div>
                  <label className={labelClass}>
                    {t('admin.customers.form.paymentCycle')}
                    <input
                      className={fieldClass}
                      value={form.paymentCycle ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('paymentCycle', e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    {t('admin.customers.form.relationshipStartDate')}
                    <input
                      className={fieldClass}
                      type="date"
                      value={form.relationshipStartDate ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('relationshipStartDate', e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    {t('admin.customers.form.creditLimit')}
                    <input
                      className={fieldClass}
                      type="number"
                      value={form.creditLimit ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) =>
                        setField(
                          'creditLimit',
                          e.target.value === '' ? null : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.paymentMethod')}
                    </p>
                    <CrmFilterSelect
                      menuPlacement="top"
                      value={form.paymentMethod ?? ''}
                      options={paymentMethodOptions}
                      disabled={saving || blocked}
                      ariaLabel={t('admin.customers.form.paymentMethod')}
                      onChange={(next) => setField('paymentMethod', next)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.currency')}
                    </p>
                    <CrmFilterSelect
                      menuPlacement="top"
                      value={form.currency ?? ''}
                      options={currencyOptions}
                      searchable
                      disabled={saving || blocked}
                      searchPlaceholder={t('common.inlineSearchComboboxSearch')}
                      closeAriaLabel={t('common.inlineSearchComboboxClose')}
                      emptyLabel={t('common.inlineSearchComboboxEmpty')}
                      ariaLabel={t('admin.customers.form.currency')}
                      onChange={(next) => setField('currency', next)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.priceType')}
                    </p>
                    <CrmFilterSelect
                      menuPlacement="top"
                      value={form.priceType ?? ''}
                      options={priceTypeOptions}
                      disabled={saving || blocked}
                      ariaLabel={t('admin.customers.form.priceType')}
                      onChange={(next) => setField('priceType', next)}
                    />
                  </div>
                  <label className={labelClass}>
                    {t('admin.customers.form.jobTitle')}
                    <input
                      className={fieldClass}
                      value={form.jobTitle ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('jobTitle', e.target.value)}
                    />
                  </label>
                  <label className={labelClass}>
                    {t('admin.customers.form.handlerDepartment')}
                    <input
                      className={fieldClass}
                      value={form.handlerDepartment ?? ''}
                      disabled={saving || blocked}
                      onChange={(e) => setField('handlerDepartment', e.target.value)}
                    />
                  </label>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.handlerDeveloper')}
                    </p>
                    <CrmFilterSelect
                      menuPlacement="top"
                      value={form.handlerDeveloper ?? ''}
                      options={memberNameOptions}
                      searchable
                      disabled={saving || blocked}
                      searchPlaceholder={t('common.inlineSearchComboboxSearch')}
                      closeAriaLabel={t('common.inlineSearchComboboxClose')}
                      emptyLabel={t('common.inlineSearchComboboxEmpty')}
                      ariaLabel={t('admin.customers.form.handlerDeveloper')}
                      onChange={(next) => setField('handlerDeveloper', next)}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className={labelTextClass}>
                      {t('admin.customers.form.handlerFollower')}
                    </p>
                    <CrmFilterSelect
                      menuPlacement="top"
                      value={form.handlerFollower ?? ''}
                      options={memberNameOptions}
                      searchable
                      disabled={saving || blocked}
                      searchPlaceholder={t('common.inlineSearchComboboxSearch')}
                      closeAriaLabel={t('common.inlineSearchComboboxClose')}
                      emptyLabel={t('common.inlineSearchComboboxEmpty')}
                      ariaLabel={t('admin.customers.form.handlerFollower')}
                      onChange={(next) => setField('handlerFollower', next)}
                    />
                  </div>
                </div>
                </div>
              </section>


              {mode === 'edit' && customerId && !embedded ? (
                <div className="flex w-full flex-col gap-4">
                  <ContactsPanel
                    customerId={customerId}
                    groupId={groupId}
                    writes={writes}
                  />
                  <CustomerSubtablesPanel
                    customerId={customerId}
                    groupId={groupId}
                    writes={writes}
                    sections={['workItems']}
                  />
                </div>
              ) : null}
            </div>
          </div>
        )}
      </form>
    </div>
  )
}

export {
  parseCustomerFormPath,
  parseCustomerDetailPath,
  parseCustomerDrillPath,
  sameCustomerDrillRoute,
} from '@/utils/customer-routes'
export type {
  CustomerDetailRoute,
  CustomerDrillRoute,
  CustomerFormRoute,
} from '@/utils/customer-routes'
