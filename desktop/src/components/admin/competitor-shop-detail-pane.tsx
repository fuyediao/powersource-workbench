/**
 * Admin competitor shop create / detail pane (Vue CompetitorShopNew + Detail parity).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CompetitorPhotoUrlListField } from '@/components/admin/competitor-photo-url-list-field'
import {
  dash,
  detailSectionCardClass,
} from '@/components/admin/customer-detail/detail-shared'
import { memberLabelForOwner } from '@/components/admin/kol-detail/detail-shared'
import { CountryFlag } from '@/components/common/country-flag'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import {
  COMPETITOR_IMPORTANCE_VALUES,
  COMPETITOR_THREAT_VALUES,
  competitorImportanceBadgeClass,
  competitorThreatBadgeClass,
} from '@/constants/competitor-constants'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { ArrowLeftIcon, PlusIcon } from '@/icons/AllIcons'
import { supabase } from '@/lib/supabase'
import { listCompetitorLines } from '@/services/competitor-lines-api'
import {
  createCompetitorShop,
  deleteCompetitorShop,
  getCompetitorShop,
  updateCompetitorShop,
} from '@/services/competitor-shops-api'
import { uploadCompetitorShopPhoto } from '@/services/competitor-storage'
import {
  listCustomerPickerOptions,
  type CustomerPickerOption,
} from '@/services/customers-api'
import {
  fetchGroupMembers,
  fetchProfileSnippets,
  listGroups,
  type GroupMemberRecord,
  type GroupRecord,
  type ProfileSnippet,
} from '@/services/groups-api'
import type {
  CompetitorImportanceLevel,
  CompetitorLine,
  CompetitorShop,
  CompetitorShopInput,
} from '@/types/competitor'
import {
  competitorLinePath,
  competitorListPath,
  competitorShopPath,
} from '@/utils/competitor-routes'
import { normalizeCompetitorPhotoUrlList } from '@/utils/competitor-photo-urls'
import { countryMatchesSearch, getCountryDisplayName } from '@/utils/map/country-alpha2'

interface CompetitorShopDetailPaneProps {
  mode: 'create' | 'detail'
  shopId: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

type ShopDetailTab = 'shop' | 'lines'

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

const labelClass = 'text-xs font-bold tracking-wide text-muted uppercase'

/**
 * Builds a blank shop form model.
 * @returns Empty shop input.
 */
function emptyForm(): CompetitorShopInput {
  return {
    storeName: '',
    country: null,
    stateProvince: null,
    city: null,
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    latitude: null,
    longitude: null,
    reporterUserId: null,
    importanceLevel: null,
    customerId: null,
    siteNotes: null,
    sitePhotoUrls: [],
  }
}

/**
 * Maps a loaded shop to the editable form model.
 * @param shop - Loaded shop.
 * @returns Shop input.
 */
function formFromShop(shop: CompetitorShop): CompetitorShopInput {
  return {
    storeName: shop.storeName,
    country: shop.country,
    stateProvince: shop.stateProvince,
    city: shop.city,
    addressLine1: shop.addressLine1,
    addressLine2: shop.addressLine2,
    postalCode: shop.postalCode,
    latitude: shop.latitude,
    longitude: shop.longitude,
    reporterUserId: shop.reporterUserId,
    importanceLevel: shop.importanceLevel,
    customerId: shop.customerId,
    siteNotes: shop.siteNotes,
    sitePhotoUrls: [...shop.sitePhotoUrls],
  }
}

/**
 * Copies (or clears) company-address fields from a linked customer.
 * @param customer - Picker row, or null to clear.
 * @returns Form patch.
 */
function addressPatchFromCustomer(
  customer: CustomerPickerOption | null,
): Partial<CompetitorShopInput> {
  if (!customer) {
    return {
      customerId: null,
      country: null,
      stateProvince: null,
      city: null,
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      latitude: null,
      longitude: null,
    }
  }
  return {
    customerId: customer.id,
    country: customer.companyCountry?.trim() || null,
    stateProvince: customer.companyState?.trim() || null,
    city: customer.companyCity?.trim() || null,
    addressLine1: customer.companyAddressLine1?.trim() || null,
    addressLine2: customer.companyAddressLine2?.trim() || null,
    postalCode: customer.companyPostalCode?.trim() || null,
    latitude: customer.latitude,
    longitude: customer.longitude,
  }
}

/**
 * Normalizes a text input into a nullable stored value.
 * @param value - Raw input.
 * @returns Trimmed string, or null.
 */
function textValue(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Normalizes a numeric input into a nullable stored value.
 * @param value - Raw input.
 * @returns Finite number, or null.
 */
function numberValue(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Maps a photo-upload error code to an i18n key suffix.
 * @param code - Storage helper error.
 * @returns Locale key under `admin.competitor.photoUrls`, or the raw code.
 */
function photoErrorKey(code: string): string {
  if (code === 'not_image') {
    return 'errorNotImage'
  }
  if (code === 'file_too_large') {
    return 'errorFileTooLarge'
  }
  if (code === 'Storage is not configured') {
    return 'errorStorage'
  }
  return code
}

/**
 * Resolves a reporter display label from group members, a profile, or a stored name.
 * @param userId - Reporter auth user id.
 * @param members - Members loaded for the shop group.
 * @param extra - Profile fetched when the reporter is not a group member.
 * @param storedName - Name already resolved on the shop row.
 * @returns Display name, email, or truncated id.
 */
function reporterDisplayLabel(
  userId: string | null,
  members: GroupMemberRecord[],
  extra: ProfileSnippet | null,
  storedName: string | null | undefined,
): string {
  if (!userId) {
    return '—'
  }
  const member = members.find((row) => row.userId === userId)
  if (member?.user) {
    return memberLabelForOwner(member)
  }
  if (extra) {
    return memberLabelForOwner({
      id: '',
      groupId: '',
      userId,
      status: 'active',
      user: extra,
    })
  }
  return storedName?.trim() || `${userId.slice(0, 8)}…`
}

/**
 * Competitor shop detail with shop / lines tabs.
 * @param props - Mode, id, writes, and navigation.
 * @returns Shop detail UI.
 */
export function CompetitorShopDetailPane({
  mode,
  shopId,
  writes,
  onNavigate,
}: CompetitorShopDetailPaneProps) {
  const { t, i18n } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)

  const [shop, setShop] = useState<CompetitorShop | null>(null)
  const [form, setForm] = useState<CompetitorShopInput>(emptyForm)
  const [lines, setLines] = useState<CompetitorLine[]>([])
  const [lineThreatFilter, setLineThreatFilter] = useState<string>('all')
  const [customers, setCustomers] = useState<CustomerPickerOption[]>([])
  const [members, setMembers] = useState<GroupMemberRecord[]>([])
  const [reporterSnippet, setReporterSnippet] = useState<ProfileSnippet | null>(
    null,
  )
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [createGroupId, setCreateGroupId] = useState<string | null>(null)
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [activeTab, setActiveTab] = useState<ShopDetailTab>('shop')
  const [loading, setLoading] = useState(mode === 'detail')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(mode === 'create')
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deletePresence = useDialogPresence(deleteOpen)

  const targetGroupId = useMemo(() => {
    if (mode !== 'create') {
      return shop?.groupId ?? domainWrites.groupId
    }
    if (domainWrites.isSystemAdmin) {
      return createGroupId
    }
    return domainWrites.groupId
  }, [
    createGroupId,
    domainWrites.groupId,
    domainWrites.isSystemAdmin,
    mode,
    shop?.groupId,
  ])

  const linkedCustomer = useMemo(
    () => customers.find((row) => row.id === form.customerId) ?? null,
    [customers, form.customerId],
  )

  const lockCountry = Boolean(linkedCustomer?.companyCountry?.trim())
  const lockState = Boolean(linkedCustomer?.companyState?.trim())
  const lockCity = Boolean(linkedCustomer?.companyCity?.trim())
  const lockLine1 = Boolean(linkedCustomer?.companyAddressLine1?.trim())
  const lockLine2 = Boolean(linkedCustomer?.companyAddressLine2?.trim())
  const lockPostal = Boolean(linkedCustomer?.companyPostalCode?.trim())
  const lockLat = linkedCustomer?.latitude != null
  const lockLng = linkedCustomer?.longitude != null

  const importanceOptions = useMemo(
    () => [
      { value: '', label: t('admin.competitor.importance.unset') },
      ...COMPETITOR_IMPORTANCE_VALUES.map((level) => ({
        value: level,
        label: t(`admin.competitor.importance.${level}`),
      })),
    ],
    [t],
  )

  const groupOptions = useMemo(
    () => groups.map((group) => ({ value: group.id, label: group.name })),
    [groups],
  )

  const customerOptions = useMemo(
    () => [
      { value: '', label: t('admin.competitor.field.linkedCustomerNone') },
      ...customers.map((customer) => ({
        value: customer.id,
        label: customer.companyName || customer.id,
        description: customer.customerCode ?? undefined,
      })),
    ],
    [customers, t],
  )

  const reporterOptions = useMemo(() => {
    const options = [
      { value: '', label: '—' },
      ...members.map((member) => ({
        value: member.userId,
        label: memberLabelForOwner(member),
      })),
    ]
    const reporterId = form.reporterUserId
    if (reporterId && !options.some((option) => option.value === reporterId)) {
      options.splice(1, 0, {
        value: reporterId,
        label: reporterDisplayLabel(
          reporterId,
          members,
          reporterSnippet,
          shop?.reporterDisplayName,
        ),
      })
    }
    return options
  }, [form.reporterUserId, members, reporterSnippet, shop?.reporterDisplayName])

  const countryOptions = useMemo(
    () => [
      { value: '', label: t('admin.kolDetail.field.countryPlaceholder') },
      ...COUNTRY_OPTIONS.map((name) => ({
        value: name,
        label: getCountryDisplayName(name, i18n.language) || name,
      })),
    ],
    [i18n.language, t],
  )

  const threatFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('admin.competitor.linesThreatFilterAll') },
      ...COMPETITOR_THREAT_VALUES.map((level) => ({
        value: level,
        label: t(`admin.competitor.threat.${level}`),
      })),
    ],
    [t],
  )

  const filteredLines = useMemo(() => {
    if (lineThreatFilter === 'all') {
      return lines
    }
    return lines.filter((line) => line.threatLevel === lineThreatFilter)
  }, [lineThreatFilter, lines])

  /**
   * Loads system-admin group options and defaults the create target group.
   * @returns Nothing.
   */
  useEffect(() => {
    if (mode !== 'create' || !domainWrites.isSystemAdmin) {
      return
    }
    let cancelled = false
    void listGroups()
      .then((rows) => {
        if (cancelled) {
          return
        }
        setGroups(rows)
        setCreateGroupId((current) => {
          if (current && rows.some((group) => group.id === current)) {
            return current
          }
          if (
            domainWrites.groupId &&
            rows.some((group) => group.id === domainWrites.groupId)
          ) {
            return domainWrites.groupId
          }
          return rows[0]?.id ?? null
        })
      })
      .catch((err) => {
        console.error('[CompetitorShopDetailPane] listGroups:', err)
        if (!cancelled) {
          setGroups([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [domainWrites.groupId, domainWrites.isSystemAdmin, mode])

  /**
   * Loads the shop, its lines, and customer picker options.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    setError(null)
    const pickerPromise = listCustomerPickerOptions({
      isSystemAdmin: domainWrites.isSystemAdmin,
      groupId: domainWrites.groupId,
      filterGroupId: mode === 'create' ? targetGroupId : null,
    }).catch(() => [] as CustomerPickerOption[])

    if (mode !== 'detail' || !shopId) {
      setCustomers(await pickerPromise)
      return
    }
    setLoading(true)
    try {
      const [detail, lineRows, options] = await Promise.all([
        getCompetitorShop(shopId),
        listCompetitorLines(shopId).catch(() => [] as CompetitorLine[]),
        pickerPromise,
      ])
      setCustomers(options)
      if (!detail) {
        setError(t('admin.competitor.error.load'))
        return
      }
      setShop(detail)
      setForm(formFromShop(detail))
      setLines(lineRows)
    } catch (err) {
      console.error('[CompetitorShopDetailPane] load:', err)
      setError(t('admin.competitor.error.load'))
    } finally {
      setLoading(false)
    }
  }, [
    domainWrites.groupId,
    domainWrites.isSystemAdmin,
    mode,
    shopId,
    t,
    targetGroupId,
  ])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Loads group members for the reporter picker.
   * @returns Nothing.
   */
  useEffect(() => {
    const gid = targetGroupId
    if (!gid) {
      setMembers([])
      return
    }
    let cancelled = false
    void fetchGroupMembers(gid)
      .then((rows) => {
        if (!cancelled) {
          setMembers(rows)
        }
      })
      .catch((err) => {
        console.error('[CompetitorShopDetailPane] fetchGroupMembers:', err)
        if (!cancelled) {
          setMembers([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [targetGroupId])

  /**
   * Loads a profile when the reporter is not in the group member list.
   * @returns Nothing.
   */
  useEffect(() => {
    const reporterId = form.reporterUserId
    if (!reporterId) {
      setReporterSnippet(null)
      return
    }
    const fromMember = members.find((member) => member.userId === reporterId)
    if (fromMember?.user) {
      setReporterSnippet(fromMember.user)
      return
    }
    let cancelled = false
    void fetchProfileSnippets([reporterId]).then((map) => {
      if (!cancelled) {
        setReporterSnippet(map.get(reporterId) ?? null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [form.reporterUserId, members])

  /**
   * Defaults the reporter to the signed-in member on create.
   * @returns Nothing.
   */
  useEffect(() => {
    if (mode !== 'create' || form.reporterUserId || members.length === 0) {
      return
    }
    let cancelled = false
    void supabase?.auth.getUser().then(({ data }) => {
      if (cancelled) {
        return
      }
      const uid = data.user?.id
      if (uid && members.some((member) => member.userId === uid)) {
        setForm((prev) =>
          prev.reporterUserId ? prev : { ...prev, reporterUserId: uid },
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [form.reporterUserId, members, mode])

  /**
   * Updates one form field.
   * @param patch - Partial form values.
   * @returns Nothing.
   */
  function patchForm(patch: Partial<CompetitorShopInput>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  /**
   * Applies a linked-customer selection and copies company address.
   * @param customerId - Customer UUID, or empty to clear.
   * @returns Nothing.
   */
  function selectLinkedCustomer(customerId: string): void {
    if (!customerId) {
      patchForm(addressPatchFromCustomer(null))
      return
    }
    const customer = customers.find((row) => row.id === customerId) ?? null
    patchForm(addressPatchFromCustomer(customer))
  }

  /**
   * Saves the create or update form, including deferred site photos.
   * @returns Nothing.
   */
  async function submit(): Promise<void> {
    if (saving) {
      return
    }
    if (!form.storeName.trim()) {
      setError(t('admin.competitor.error.storeNameRequired'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        if (!canCreate) {
          return
        }
        if (!targetGroupId) {
          setError(t('admin.competitor.error.noGroup'))
          return
        }
        let created = await createCompetitorShop(targetGroupId, {
          ...form,
          sitePhotoUrls: [],
        })
        if (pendingPhotos.length > 0) {
          let merged = [...created.sitePhotoUrls]
          for (const file of pendingPhotos) {
            const up = await uploadCompetitorShopPhoto(
              created.groupId,
              created.id,
              file,
            )
            if ('error' in up) {
              const key = photoErrorKey(up.error)
              setError(
                key.startsWith('error')
                  ? t(`admin.competitor.photoUrls.${key}`)
                  : up.error,
              )
              return
            }
            merged = normalizeCompetitorPhotoUrlList([...merged, up.publicUrl])
          }
          created = await updateCompetitorShop(created.id, {
            ...formFromShop(created),
            sitePhotoUrls: merged,
          })
        }
        onNavigate(competitorShopPath(created.id))
        return
      }
      if (!canEdit || !shopId) {
        return
      }
      const updated = await updateCompetitorShop(shopId, form)
      setShop(updated)
      setForm(formFromShop(updated))
      setEditing(false)
    } catch (err) {
      console.error('[CompetitorShopDetailPane] save:', err)
      setError(t('admin.competitor.error.save'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes the shop and returns to the list.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!shopId || !canDelete || saving) {
      return
    }
    setSaving(true)
    try {
      await deleteCompetitorShop(shopId)
      onNavigate(competitorListPath())
    } catch (err) {
      console.error('[CompetitorShopDetailPane] delete:', err)
      setError(t('admin.competitor.error.delete'))
      setSaving(false)
    }
  }

  const title =
    mode === 'create'
      ? t('admin.competitor.addShop')
      : shop?.storeName || t('admin.competitor.shopDetailTitle')

  const lockedInput = (locked: boolean): string =>
    locked ? `${inputClass} cursor-not-allowed opacity-60` : inputClass

  const reporterViewLabel = reporterDisplayLabel(
    form.reporterUserId,
    members,
    reporterSnippet,
    shop?.reporterDisplayName,
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.competitor.backToList')}
          aria-label={t('admin.competitor.backToList')}
          onClick={() => onNavigate(competitorListPath())}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-brand">
          {title}
        </h1>
        {editing ? (
          <div className="flex shrink-0 items-center gap-2">
            {mode === 'create' && domainWrites.isSystemAdmin ? (
              <CrmFilterSelect
                className="w-auto min-w-36 max-w-52 shrink-0"
                value={createGroupId ?? ''}
                options={groupOptions}
                ariaLabel={t('admin.competitor.field.targetGroupAria')}
                emptyLabel={t('admin.competitor.error.noGroup')}
                disabled={groupOptions.length === 0}
                onChange={(next) => {
                  setCreateGroupId(next || null)
                  patchForm({ customerId: null, reporterUserId: null })
                }}
              />
            ) : null}
            {mode === 'detail' ? (
              <button
                type="button"
                disabled={saving}
                className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={() => {
                  if (shop) {
                    setForm(formFromShop(shop))
                  }
                  setPendingPhotos([])
                  setEditing(false)
                  setError(null)
                }}
              >
                {t('actions.cancel')}
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
              onClick={() => void submit()}
            >
              {saving ? t('admin.kolDetail.saving') : t('admin.kolDetail.save')}
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            {canDelete ? (
              <button
                type="button"
                className="rounded-2xl border border-rose-400/40 px-3 py-2 text-sm font-bold text-rose-500"
                onClick={() => setDeleteOpen(true)}
              >
                {t('admin.competitor.deleteShop')}
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="shrink-0 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
                onClick={() => {
                  if (shop) {
                    const next = formFromShop(shop)
                    const customer =
                      customers.find((row) => row.id === next.customerId) ?? null
                    setForm(
                      customer
                        ? { ...next, ...addressPatchFromCustomer(customer) }
                        : next,
                    )
                  }
                  setEditing(true)
                }}
              >
                {t('admin.kolDetail.edit')}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {mode === 'detail' ? (
        <div className="grid grid-cols-2 border-b border-ink/10">
          {(['shop', 'lines'] as const).map((tabId) => {
            const active = activeTab === tabId
            return (
              <button
                key={tabId}
                type="button"
                className={`border-b-2 px-2 py-2.5 text-sm font-semibold ${
                  active
                    ? 'border-brand text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
                onClick={() => setActiveTab(tabId)}
              >
                {tabId === 'shop'
                  ? t('admin.competitor.section.shopInfo')
                  : t('admin.competitor.section.lines')}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
        {error ? (
          <p className="text-sm font-medium text-rose-500">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
        ) : null}

        {!loading && (mode === 'create' || activeTab === 'shop') ? (
          <section className={detailSectionCardClass()}>
            {mode === 'create' ? (
              <h2 className="mb-3 text-sm font-extrabold text-ink">
                {t('admin.competitor.section.shopInfo')}
              </h2>
            ) : null}
            {editing ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.storeName')}{' '}
                    <span className="text-rose-500" aria-hidden>
                      *
                    </span>
                  </span>
                  <input
                    type="text"
                    value={form.storeName}
                    onChange={(e) => patchForm({ storeName: e.target.value })}
                    className={inputClass}
                    required
                  />
                </label>
                <div className="space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.linkedCustomer')}
                    {linkedCustomer ? (
                      <span className="ml-2 inline-flex rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand normal-case">
                        {t('admin.competitor.addressFromLinkedCustomerHint')}
                      </span>
                    ) : null}
                  </span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.customerId ?? ''}
                    options={customerOptions}
                    searchable
                    searchPlaceholder={t(
                      'admin.competitor.field.linkedCustomerSearch',
                    )}
                    closeAriaLabel={t('common.inlineSearchComboboxClose')}
                    emptyLabel={t('admin.followUps.form.noCustomerMatch')}
                    ariaLabel={t('admin.competitor.field.linkedCustomer')}
                    onChange={selectLinkedCustomer}
                    filterOption={(option, query) => {
                      const q = query.toLowerCase()
                      return (
                        option.label.toLowerCase().includes(q) ||
                        (option.description?.toLowerCase().includes(q) ?? false)
                      )
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.reporter')}
                  </span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.reporterUserId ?? ''}
                    options={reporterOptions}
                    searchable
                    emptyLabel={t('admin.kolDetail.ownerNoMembers')}
                    ariaLabel={t('admin.competitor.field.reporter')}
                    onChange={(next) =>
                      patchForm({ reporterUserId: next || null })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.importanceLevel')}
                  </span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.importanceLevel ?? ''}
                    options={importanceOptions}
                    ariaLabel={t('admin.competitor.field.importanceLevel')}
                    onChange={(next) =>
                      patchForm({
                        importanceLevel: (next ||
                          null) as CompetitorImportanceLevel | null,
                      })
                    }
                  />
                </div>
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.longitude')}
                  </span>
                  <input
                    type="number"
                    step="any"
                    readOnly={lockLng}
                    value={form.longitude ?? ''}
                    onChange={(e) =>
                      patchForm({ longitude: numberValue(e.target.value) })
                    }
                    className={lockedInput(lockLng)}
                    placeholder="121.5171"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.latitude')}
                  </span>
                  <input
                    type="number"
                    step="any"
                    readOnly={lockLat}
                    value={form.latitude ?? ''}
                    onChange={(e) =>
                      patchForm({ latitude: numberValue(e.target.value) })
                    }
                    className={lockedInput(lockLat)}
                    placeholder="25.0479"
                  />
                </label>
                <div className="space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.country')}
                  </span>
                  <CrmFilterSelect
                    className="w-full"
                    value={form.country ?? ''}
                    options={countryOptions}
                    searchable
                    disabled={lockCountry}
                    searchPlaceholder={t(
                      'admin.kolDetail.field.countryPlaceholder',
                    )}
                    emptyLabel={t('admin.kolDetail.field.countryNoMatch')}
                    ariaLabel={t('admin.competitor.field.country')}
                    renderLeading={(option) =>
                      option.value ? (
                        <CountryFlag countryName={option.value} size={16} />
                      ) : null
                    }
                    filterOption={(option, query) =>
                      countryMatchesSearch(option.value, query) ||
                      option.label.toLowerCase().includes(query.toLowerCase())
                    }
                    onChange={(next) => patchForm({ country: next || null })}
                  />
                </div>
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.stateProvince')}
                  </span>
                  <input
                    type="text"
                    readOnly={lockState}
                    value={form.stateProvince ?? ''}
                    onChange={(e) =>
                      patchForm({ stateProvince: textValue(e.target.value) })
                    }
                    className={lockedInput(lockState)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.city')}
                  </span>
                  <input
                    type="text"
                    readOnly={lockCity}
                    value={form.city ?? ''}
                    onChange={(e) =>
                      patchForm({ city: textValue(e.target.value) })
                    }
                    className={lockedInput(lockCity)}
                  />
                </label>
                <label className="block space-y-1.5 lg:col-span-1">
                  <span className={labelClass}>
                    {t('admin.competitor.field.addressLine1')}
                  </span>
                  <input
                    type="text"
                    readOnly={lockLine1}
                    value={form.addressLine1 ?? ''}
                    onChange={(e) =>
                      patchForm({ addressLine1: textValue(e.target.value) })
                    }
                    className={lockedInput(lockLine1)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.addressLine2')}
                  </span>
                  <input
                    type="text"
                    readOnly={lockLine2}
                    value={form.addressLine2 ?? ''}
                    onChange={(e) =>
                      patchForm({ addressLine2: textValue(e.target.value) })
                    }
                    className={lockedInput(lockLine2)}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.competitor.field.postalCode')}
                  </span>
                  <input
                    type="text"
                    readOnly={lockPostal}
                    value={form.postalCode ?? ''}
                    onChange={(e) =>
                      patchForm({ postalCode: textValue(e.target.value) })
                    }
                    className={lockedInput(lockPostal)}
                  />
                </label>
                <label className="block space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <span className={labelClass}>
                    {t('admin.competitor.field.siteNotes')}
                  </span>
                  <textarea
                    rows={3}
                    value={form.siteNotes ?? ''}
                    onChange={(e) =>
                      patchForm({ siteNotes: textValue(e.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <span className={labelClass}>
                    {t('admin.competitor.photoUrls.sitePhotos')}
                  </span>
                  <CompetitorPhotoUrlListField
                    idPrefix="comp-shop-site-photos"
                    variant="shop"
                    uploadMode={mode === 'create' ? 'deferred' : 'live'}
                    groupId={targetGroupId ?? ''}
                    shopId={shopId ?? ''}
                    readonly={false}
                    urls={form.sitePhotoUrls}
                    onUrlsChange={(next) => patchForm({ sitePhotoUrls: next })}
                    pendingFiles={pendingPhotos}
                    onPendingFilesChange={setPendingPhotos}
                  />
                </div>
              </div>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.storeName')}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold text-ink">
                    {dash(shop?.storeName)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.linkedCustomer')}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {dash(shop?.linkedCustomerName)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.reporter')}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink/80">{reporterViewLabel}</dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.importanceLevel')}
                  </dt>
                  <dd className="mt-0.5">
                    {shop?.importanceLevel ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${competitorImportanceBadgeClass(
                          shop.importanceLevel,
                        )}`}
                      >
                        {t(`admin.competitor.importance.${shop.importanceLevel}`)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.country')}
                  </dt>
                  <dd className="mt-0.5 flex items-center gap-2 text-sm text-ink/80">
                    {shop?.country ? (
                      <CountryFlag countryName={shop.country} size={16} />
                    ) : null}
                    <span>
                      {shop?.country
                        ? getCountryDisplayName(shop.country, i18n.language) ||
                          shop.country
                        : '—'}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.stateProvince')}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {dash(shop?.stateProvince)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.city')}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink/80">{dash(shop?.city)}</dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.addressLine1')}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {dash(shop?.addressLine1)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.addressLine2')}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {dash(shop?.addressLine2)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.postalCode')}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink/80">
                    {dash(shop?.postalCode)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.latitude')}
                  </dt>
                  <dd className="mt-0.5 text-sm tabular-nums text-ink/80">
                    {dash(shop?.latitude)}
                  </dd>
                </div>
                <div>
                  <dt className={labelClass}>
                    {t('admin.competitor.field.longitude')}
                  </dt>
                  <dd className="mt-0.5 text-sm tabular-nums text-ink/80">
                    {dash(shop?.longitude)}
                  </dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className={labelClass}>
                    {t('admin.competitor.field.siteNotes')}
                  </dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-wrap text-ink/80">
                    {dash(shop?.siteNotes)}
                  </dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className={`${labelClass} mb-1.5`}>
                    {t('admin.competitor.photoUrls.sitePhotos')}
                  </dt>
                  <CompetitorPhotoUrlListField
                    idPrefix="comp-shop-site-photos-view"
                    variant="shop"
                    uploadMode="live"
                    groupId={shop?.groupId ?? ''}
                    shopId={shop?.id ?? ''}
                    readonly
                    urls={shop?.sitePhotoUrls ?? []}
                    onUrlsChange={() => undefined}
                    pendingFiles={[]}
                    onPendingFilesChange={() => undefined}
                  />
                </div>
              </dl>
            )}
          </section>
        ) : null}

        {!loading && mode === 'detail' && shopId && activeTab === 'lines' ? (
          <section className={detailSectionCardClass()}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold text-ink">
                {t('admin.competitor.section.lines')}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <CrmFilterSelect
                  className="min-w-36 max-w-52"
                  value={lineThreatFilter}
                  options={threatFilterOptions}
                  ariaLabel={t('admin.competitor.linesThreatFilterAria')}
                  onChange={setLineThreatFilter}
                />
                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline"
                    onClick={() => onNavigate(competitorLinePath(shopId, null))}
                  >
                    <PlusIcon className="size-3" aria-hidden />
                    {t('admin.competitor.addLine')}
                  </button>
                ) : null}
              </div>
            </div>
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm font-medium text-muted">
                {t('admin.competitor.noLines')}
              </p>
            ) : filteredLines.length === 0 ? (
              <p className="py-6 text-center text-sm font-medium text-muted">
                {t('admin.competitor.linesThreatFilterEmpty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredLines.map((line) => (
                  <li key={line.id}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 rounded-xl border border-ink/10 bg-white/90 px-3 py-2.5 text-left transition-colors hover:border-brand/40 dark:bg-zinc-900/90"
                      onClick={() =>
                        onNavigate(competitorLinePath(shopId, line.id))
                      }
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {line.competitorProductName ??
                            line.competitorCompanyName ??
                            '—'}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {line.competitorCompanyName ?? '—'}
                          {line.price != null ? ` · ${line.price}` : ''}
                        </span>
                      </span>
                      {line.threatLevel ? (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${competitorThreatBadgeClass(line.threatLevel)}`}
                        >
                          {t(`admin.competitor.threat.${line.threatLevel}`)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
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
                if (!saving) {
                  setDeleteOpen(false)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(event) => event.stopPropagation()}
              >
                <h2 className="text-base font-extrabold text-brand">
                  {t('admin.competitor.deleteShop')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.competitor.deleteShopConfirm')}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteOpen(false)}
                  >
                    {t('actions.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                    onClick={() => void confirmDelete()}
                  >
                    {t('admin.customers.deleteConfirm.confirm')}
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
