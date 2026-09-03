/**
 * Admin KOL detail / create pane: aside + tabbed form (including AI summary).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { AiSummaryPanel } from '@/components/admin/kol-detail/ai-summary-panel'
import { ChannelsPanel } from '@/components/admin/kol-detail/channels-panel'
import { CriteriaModal } from '@/components/admin/kol-detail/criteria-modal'
import {
  datetimeLocalToIso,
  formatCompactNumber,
  isoToDateInput,
  isoToDatetimeLocal,
  KOL_EMAIL_REGEX,
  kolInitials,
  newShipmentId,
  ownerLabel,
  sumChannelFollowers,
  type KolDetailTabId,
} from '@/components/admin/kol-detail/detail-shared'
import { KolDetailTabBar } from '@/components/admin/kol-detail/kol-detail-tab-bar'
import { LocationPanel } from '@/components/admin/kol-detail/location-panel'
import { LogisticsPanel } from '@/components/admin/kol-detail/logistics-panel'
import { OrdersPanel } from '@/components/admin/kol-detail/orders-panel'
import { OverviewPanel } from '@/components/admin/kol-detail/overview-panel'
import { PerformancePanel } from '@/components/admin/kol-detail/performance-panel'
import { StatusPanel } from '@/components/admin/kol-detail/status-panel'
import { VisitsPanel } from '@/components/admin/kol-detail/visits-panel'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import {
  getRatingStarClass,
  kolCooperationBadgeClass,
  kolTierBadgeClass,
} from '@/constants/kol-constants'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  ArrowLeftIcon,
  CloseIcon,
  PencilIcon,
  StarIcon,
  TrashIcon,
  UploadIcon,
} from '@/icons/AllIcons'
import { supabase } from '@/lib/supabase'
import { uploadKolAvatarToStorage } from '@/services/kol-avatar-storage'
import {
  createKol,
  deleteKol,
  getKolById,
  listKolChannels,
  updateKol,
} from '@/services/kols-api'
import {
  fetchGroupMembers,
  fetchProfileSnippets,
  listGroups,
  type GroupMemberRecord,
  type GroupRecord,
  type ProfileSnippet,
} from '@/services/groups-api'
import type { KolChannel, KolDetail, KolFormInput, KolShipment } from '@/types/kol'
import {
  defaultCrmCurrencyForLocale,
  normalizeCrmCurrencyCode,
} from '@/types/opportunity'
import { kolDetailPath, kolsListPath } from '@/utils/kol-routes'

interface KolDetailPaneProps {
  /** `create` renders an empty form; `detail` loads and edits in place. */
  mode: 'create' | 'detail'
  /** Signed-in user id (avatar uploads + favorites). */
  userId: string
  kolId: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Builds a blank KOL form model.
 * @param locale - Active i18n locale for default currency.
 * @returns Empty form input.
 */
function emptyForm(locale?: string): KolFormInput {
  return {
    name: '',
    accountName: null,
    tier: null,
    rating: null,
    followers: null,
    vertical: null,
    info: null,
    background: null,
    remarks: null,
    avatarUrl: null,
    email: null,
    phone: null,
    phoneCountry: null,
    country: null,
    region: null,
    state: null,
    county: null,
    city: null,
    town: null,
    circle: null,
    postalCode: null,
    addressLine1: null,
    addressLine2: null,
    latitude: null,
    longitude: null,
    orderCount: 0,
    totalAmount: 0,
    totalAmountCurrency: locale
      ? defaultCrmCurrencyForLocale(locale)
      : undefined,
    cooperationYears: null,
    promoCode: null,
    viewCount: null,
    engagementRate: null,
    historyLinks: [],
    currentStatus: null,
    cooperationStatus: null,
    ownerId: null,
    lastContactAt: null,
    reconnectAt: null,
    commission: null,
    meetAt: null,
    checkCycleDays: null,
    testedProducts: [],
    communicationHistory: [],
    shippingInfo: {},
    shipments: [],
    trackingNumber: null,
    shippingStatus: null,
    contractFiles: [],
    contractImages: [],
    contractLinks: [],
  }
}

/**
 * Maps a loaded KOL to the editable form model.
 * @param kol - Detail row.
 * @param locale - Active i18n locale for currency fallback.
 * @returns Form input.
 */
function formFromDetail(kol: KolDetail, locale: string): KolFormInput {
  return {
    name: kol.name,
    accountName: kol.accountName,
    tier: kol.tier,
    rating: kol.rating,
    followers: kol.followers,
    vertical: kol.vertical,
    info: kol.info,
    background: kol.background,
    remarks: kol.remarks,
    avatarUrl: kol.avatarUrl,
    email: kol.email,
    phone: kol.phone,
    phoneCountry: kol.phoneCountry,
    country: kol.country,
    region: kol.region,
    state: kol.state,
    county: kol.county,
    city: kol.city,
    town: kol.town,
    circle: kol.circle,
    postalCode: kol.postalCode,
    addressLine1: kol.addressLine1,
    addressLine2: kol.addressLine2,
    latitude: kol.latitude,
    longitude: kol.longitude,
    orderCount: kol.orderCount,
    totalAmount: kol.totalAmount,
    totalAmountCurrency: normalizeCrmCurrencyCode(
      kol.totalAmountCurrency,
      defaultCrmCurrencyForLocale(locale),
    ),
    cooperationYears: kol.cooperationYears,
    promoCode: kol.promoCode,
    viewCount: kol.viewCount,
    engagementRate: kol.engagementRate,
    historyLinks: kol.historyLinks,
    currentStatus: kol.currentStatus,
    cooperationStatus: kol.cooperationStatus,
    ownerId: kol.ownerId,
    lastContactAt: isoToDatetimeLocal(kol.lastContactAt) || null,
    reconnectAt: isoToDateInput(kol.reconnectAt) || null,
    commission: kol.commission,
    meetAt: isoToDatetimeLocal(kol.meetAt) || null,
    checkCycleDays: kol.checkCycleDays,
    testedProducts: kol.testedProducts,
    communicationHistory: kol.communicationHistory,
    shippingInfo: kol.shippingInfo,
    shipments: kol.shipments,
    trackingNumber: kol.trackingNumber,
    shippingStatus: kol.shippingStatus,
    contractFiles: kol.contractFiles,
    contractImages: kol.contractImages,
    contractLinks: kol.contractLinks,
  }
}

/**
 * Builds `shipments` payload for save: trim, ensure ids, drop empty rows.
 * @param rows - Form shipment rows.
 * @returns Cleaned shipment rows.
 */
function buildShipmentsPayload(rows: KolShipment[] | undefined): KolShipment[] {
  return (rows ?? [])
    .map((row) => ({
      id: row.id.trim() || newShipmentId(),
      trackingNumber: row.trackingNumber.trim(),
      shippingStatus: row.shippingStatus.trim(),
    }))
    .filter((row) => row.trackingNumber.length > 0 || row.shippingStatus.length > 0)
}

/**
 * KOL detail pane with aside and tabbed form (including AI summary).
 * @param props - Mode, id, writes, and navigation.
 * @returns Detail UI.
 */
export function KolDetailPane({
  mode,
  userId,
  kolId,
  writes,
  onNavigate,
}: KolDetailPaneProps) {
  const { t, i18n } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const [kol, setKol] = useState<KolDetail | null>(null)
  const [form, setForm] = useState<KolFormInput>(() => emptyForm(i18n.language))
  const [channels, setChannels] = useState<KolChannel[]>([])
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [members, setMembers] = useState<GroupMemberRecord[]>([])
  const [ownerSnippet, setOwnerSnippet] = useState<ProfileSnippet | null>(null)
  const [createGroupId, setCreateGroupId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(mode === 'detail')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(mode === 'create')
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<KolDetailTabId>('overview')
  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const deletePresence = useDialogPresence(deleteOpen)
  const [deleting, setDeleting] = useState(false)

  const targetGroupId = useMemo(() => {
    if (mode !== 'create') {
      return kol?.groupId ?? domainWrites.groupId
    }
    if (domainWrites.isSystemAdmin) {
      return createGroupId
    }
    return domainWrites.groupId
  }, [
    createGroupId,
    domainWrites.groupId,
    domainWrites.isSystemAdmin,
    kol?.groupId,
    mode,
  ])

  const groupOptions = useMemo(
    () => groups.map((group) => ({ value: group.id, label: group.name })),
    [groups],
  )

  const totalFollowers = useMemo(() => {
    const sum = sumChannelFollowers(channels)
    if (sum > 0) {
      return sum
    }
    return form.followers ?? 0
  }, [channels, form.followers])

  const emailValid = useMemo(() => {
    const value = (form.email ?? '').trim()
    if (!value) {
      return true
    }
    return KOL_EMAIL_REGEX.test(value)
  }, [form.email])

  /**
   * Loads the signed-in user's email for communication-history `by`.
   * @returns Nothing.
   */
  useEffect(() => {
    if (!supabase) {
      return
    }
    void supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user.email ?? null)
    })
  }, [])

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
      .catch((err: unknown) => {
        console.error('[KolDetailPane] listGroups:', err)
        if (!cancelled) {
          setGroups([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [domainWrites.groupId, domainWrites.isSystemAdmin, mode])

  /**
   * Loads owner-picker members for the KOL's (or create-target) group.
   * @returns Nothing.
   */
  useEffect(() => {
    const groupId = targetGroupId
    if (!groupId) {
      setMembers([])
      return
    }
    let cancelled = false
    void fetchGroupMembers(groupId)
      .then((rows) => {
        if (!cancelled) {
          setMembers(rows)
        }
      })
      .catch((err: unknown) => {
        console.error('[KolDetailPane] fetchGroupMembers:', err)
        if (!cancelled) {
          setMembers([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [targetGroupId])

  /**
   * Loads a profile when the owner is not in the group member list.
   * @returns Nothing.
   */
  useEffect(() => {
    const ownerId = form.ownerId
    if (!ownerId) {
      setOwnerSnippet(null)
      return
    }
    const fromMember = members.find((member) => member.userId === ownerId)
    if (fromMember?.user) {
      setOwnerSnippet(fromMember.user)
      return
    }
    let cancelled = false
    void fetchProfileSnippets([ownerId]).then((map) => {
      if (!cancelled) {
        setOwnerSnippet(map.get(ownerId) ?? null)
      }
    })
    return () => {
      cancelled = true
    }
  }, [form.ownerId, members])

  /**
   * Loads the KOL and its channels.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    if (mode !== 'detail' || !kolId) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [detail, channelRows] = await Promise.all([
        getKolById(kolId),
        listKolChannels(kolId).catch(() => [] as KolChannel[]),
      ])
      if (!detail) {
        setError(t('admin.kolDetail.loadError'))
        return
      }
      setKol(detail)
      setForm(formFromDetail(detail, i18n.language))
      setChannels(channelRows)
    } catch (err) {
      console.error('[KolDetailPane] load:', err)
      setError(t('admin.kolDetail.loadError'))
    } finally {
      setLoading(false)
    }
  }, [i18n.language, kolId, mode, t])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Updates one form field.
   * @param patch - Partial form values.
   * @returns Nothing.
   */
  function patchForm(patch: Partial<KolFormInput>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  /**
   * Collects form state into a save payload.
   * @returns KolFormInput ready for create/update.
   */
  function buildSaveInput(): KolFormInput {
    const shipmentsPayload = buildShipmentsPayload(form.shipments)
    const followerSum = sumChannelFollowers(channels)
    return {
      ...form,
      name: form.name.trim(),
      accountName: form.accountName?.trim() || null,
      vertical: form.vertical?.trim() || null,
      info: form.info?.trim() || null,
      background: form.background?.trim() || null,
      remarks: form.remarks?.trim() || null,
      email: form.email?.trim() || null,
      phone: form.phone?.trim() || null,
      followers: followerSum > 0 ? followerSum : null,
      cooperationYears: form.cooperationYears ?? null,
      totalAmountCurrency: normalizeCrmCurrencyCode(
        form.totalAmountCurrency,
        defaultCrmCurrencyForLocale(i18n.language),
      ),
      lastContactAt: datetimeLocalToIso(form.lastContactAt ?? ''),
      reconnectAt: form.reconnectAt?.trim() || null,
      meetAt: datetimeLocalToIso(form.meetAt ?? ''),
      shipments: shipmentsPayload,
      trackingNumber: shipmentsPayload[0]?.trackingNumber || null,
      shippingStatus: shipmentsPayload[0]?.shippingStatus || null,
      shippingInfo: {
        recipient: form.shippingInfo?.recipient?.trim() || undefined,
        address: form.shippingInfo?.address?.trim() || undefined,
        phone: form.shippingInfo?.phone?.trim() || undefined,
      },
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
    if (!form.name.trim()) {
      setError(t('admin.kol.error.nameRequired'))
      return
    }
    if (!emailValid) {
      setError(t('admin.kolDetail.field.emailInvalid'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const input = buildSaveInput()
      if (mode === 'create') {
        if (!canCreate) {
          return
        }
        if (!targetGroupId) {
          setError(t('admin.kol.error.noGroup'))
          return
        }
        const created = await createKol(targetGroupId, input)
        onNavigate(kolDetailPath(created.id))
        return
      }
      if (!canEdit || !kolId) {
        return
      }
      const updated = await updateKol(kolId, input)
      setKol(updated)
      setForm(formFromDetail(updated, i18n.language))
      setEditing(false)
    } catch (err) {
      console.error('[KolDetailPane] save:', err)
      setError(t('admin.kolDetail.saveError'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes the current KOL and returns to the list.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!kolId || !canDelete || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteKol(kolId)
      setDeleteOpen(false)
      onNavigate(kolsListPath())
    } catch (err) {
      console.error('[KolDetailPane] delete:', err)
      setError(t('admin.kol.error.delete'))
    } finally {
      setDeleting(false)
    }
  }

  /**
   * Uploads an avatar (create uses `new-kol-temp` until the row exists).
   * @param event - File input change.
   * @returns Nothing.
   */
  async function onAvatarFileChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    setUploadingAvatar(true)
    setAvatarError(null)
    const targetId = mode === 'create' ? 'new-kol-temp' : (kolId ?? 'unknown')
    const result = await uploadKolAvatarToStorage(userId, targetId, file)
    if ('error' in result) {
      setAvatarError(
        result.error === 'file_too_large'
          ? t('admin.kolDetail.avatarTooLarge')
          : result.error,
      )
    } else {
      patchForm({ avatarUrl: result.publicUrl })
    }
    setUploadingAvatar(false)
    if (avatarInputRef.current) {
      avatarInputRef.current.value = ''
    }
  }

  const title =
    mode === 'create' ? t('admin.kol.addButton') : kol?.name || t('admin.kol.title')
  const formEditable = editing || mode === 'create'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.customers.backToList')}
          aria-label={t('admin.customers.backToList')}
          onClick={() => onNavigate(kolsListPath())}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-brand">
          {title}
        </h1>
        {formEditable ? (
          <div className="flex shrink-0 items-center gap-2">
            {mode === 'create' && domainWrites.isSystemAdmin ? (
              <CrmFilterSelect
                className="w-auto min-w-36 max-w-52 shrink-0"
                value={createGroupId ?? ''}
                options={groupOptions}
                ariaLabel={t('admin.kol.field.targetGroupAria')}
                emptyLabel={t('admin.kol.error.noGroup')}
                disabled={groupOptions.length === 0}
                onChange={(next) => setCreateGroupId(next || null)}
              />
            ) : null}
            {mode === 'detail' ? (
              <button
                type="button"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={() => {
                  if (kol) {
                    setForm(formFromDetail(kol, i18n.language))
                  }
                  setEditing(false)
                  setError(null)
                }}
              >
                <CloseIcon className="size-4" />
                <span className="hidden sm:inline">{t('admin.kolDetail.cancel')}</span>
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving || !form.name.trim() || !emailValid}
              title={!emailValid ? t('admin.kolDetail.field.emailInvalid') : undefined}
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
                className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-400/40 px-3 py-2 text-sm font-bold text-rose-500"
                onClick={() => setDeleteOpen(true)}
              >
                <TrashIcon className="size-4" />
                <span className="hidden sm:inline">{t('admin.kolDetail.delete')}</span>
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
                onClick={() => setEditing(true)}
              >
                <PencilIcon className="size-4" />
                {t('admin.kolDetail.edit')}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error ? (
        <p className="mx-4 mt-3 shrink-0 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <span className="inline-block size-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        </div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <aside className="flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-b border-ink/10 p-6 lg:h-full lg:w-72 lg:border-b-0 lg:border-r xl:w-80">
            <div className="flex flex-col items-center gap-3">
              <div className="group relative">
                {form.avatarUrl ? (
                  <img
                    src={form.avatarUrl}
                    alt={form.name}
                    className="size-24 rounded-full object-cover ring-2 ring-brand/30"
                  />
                ) : (
                  <div className="flex size-24 items-center justify-center rounded-full bg-brand/15 text-2xl font-bold text-brand ring-2 ring-brand/25">
                    {form.name ? kolInitials(form.name) : '?'}
                  </div>
                )}
                {formEditable ? (
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-zinc-950/50 opacity-0 transition-opacity group-hover:opacity-100"
                    title={t('admin.kolDetail.uploadAvatar')}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {uploadingAvatar ? (
                      <span className="inline-block size-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <UploadIcon className="size-5 text-white" />
                    )}
                  </button>
                ) : null}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void onAvatarFileChange(event)}
              />
              {avatarError ? (
                <p className="text-center text-xs text-rose-500">{avatarError}</p>
              ) : null}
              <div className="w-full">
                {formEditable ? (
                  <input
                    type="text"
                    value={form.name}
                    placeholder={t('admin.kolDetail.namePlaceholder')}
                    className="w-full bg-transparent pb-0.5 text-center text-xl font-bold text-ink outline-none placeholder:text-muted focus:border-b focus:border-brand/50"
                    onChange={(event) => patchForm({ name: event.target.value })}
                  />
                ) : (
                  <h1 className="truncate text-center text-xl font-bold text-ink">
                    {form.name || '—'}
                  </h1>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              {form.tier ? (
                <span
                  className={`rounded-md px-2.5 py-1 text-sm font-bold ${kolTierBadgeClass(form.tier)}`}
                >
                  {form.tier}
                </span>
              ) : null}
              {form.rating ? (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: form.rating }, (_, index) => (
                    <StarIcon
                      key={index}
                      className={`size-3.5 ${getRatingStarClass(form.rating)}`}
                      filled
                    />
                  ))}
                </div>
              ) : null}
            </div>

            {totalFollowers > 0 ? (
              <div className="text-center">
                <p className="text-2xl font-bold text-ink">
                  {formatCompactNumber(totalFollowers)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {t('admin.kol.col.followers')}
                </p>
              </div>
            ) : null}

            {form.cooperationStatus ? (
              <div className="flex justify-center">
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium ${kolCooperationBadgeClass(
                    form.cooperationStatus,
                  )}`}
                >
                  {t(`admin.kol.cooperationStatus.${form.cooperationStatus}`)}
                </span>
              </div>
            ) : null}

            <div className="space-y-2 text-sm">
              {form.vertical ? (
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted">
                    {t('admin.kolDetail.field.vertical')}
                  </span>
                  <span className="truncate text-right text-ink">{form.vertical}</span>
                </div>
              ) : null}
              {form.lastContactAt ? (
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted">
                    {t('admin.kol.col.lastContact')}
                  </span>
                  <span className="text-right text-xs text-ink">
                    {new Date(form.lastContactAt).toLocaleDateString()}
                  </span>
                </div>
              ) : null}
              {form.ownerId ? (
                <div className="flex justify-between gap-2">
                  <span className="shrink-0 text-muted">{t('admin.kol.col.owner')}</span>
                  <span className="truncate text-right text-xs text-ink">
                    {ownerLabel(form.ownerId, members, ownerSnippet)}
                  </span>
                </div>
              ) : null}
            </div>

            <hr className="border-ink/10" />

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border border-ink/10 bg-canvas/60 p-3">
                <p className="text-lg font-bold text-ink">{form.orderCount ?? 0}</p>
                <p className="text-xs text-muted">
                  {t('admin.kolDetail.field.orderCount')}
                </p>
              </div>
              <div className="rounded-xl border border-ink/10 bg-canvas/60 p-3">
                <p className="text-lg leading-tight font-bold text-ink">
                  {(form.totalAmount ?? 0).toLocaleString()}
                  <span className="ml-1 text-sm font-semibold text-brand">
                    {form.totalAmountCurrency}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {t('admin.kolDetail.field.totalAmount')}
                </p>
              </div>
            </div>

            <div className="mt-auto border-t border-ink/10 pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs tracking-wider text-muted uppercase">
                  {t('admin.kolDetail.field.kolCode')}
                </span>
                {kol?.kolCode ? (
                  <span
                    className="font-mono text-sm font-semibold tabular-nums text-brand select-all"
                    title={t('admin.kolDetail.field.kolCode')}
                  >
                    {kol.kolCode}
                  </span>
                ) : (
                  <span className="font-mono text-xs text-muted italic">
                    {t('admin.kolDetail.field.kolCodePending')}
                  </span>
                )}
              </div>
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <KolDetailTabBar activeTab={activeTab} onChange={setActiveTab} />
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto p-6">
                {activeTab === 'overview' ? (
                  <OverviewPanel
                    form={form}
                    editing={formEditable}
                    onPatch={patchForm}
                    onOpenCriteria={() => setCriteriaOpen(true)}
                  />
                ) : null}
                {activeTab === 'channels' ? (
                  <ChannelsPanel
                    mode={mode}
                    kolId={kolId}
                    groupId={targetGroupId}
                    editing={formEditable}
                    channels={channels}
                    onChannelsChange={setChannels}
                  />
                ) : null}
                {activeTab === 'location' ? (
                  <LocationPanel
                    userId={userId}
                    form={form}
                    editing={formEditable}
                    onPatch={patchForm}
                  />
                ) : null}
                {activeTab === 'performance' ? (
                  <PerformancePanel
                    form={form}
                    editing={formEditable}
                    onPatch={patchForm}
                  />
                ) : null}
                {activeTab === 'aiSummary' ? (
                  kol ? (
                    <AiSummaryPanel
                      kol={kol}
                      channels={channels}
                      editing={formEditable}
                      onKolUpdated={(next) => {
                        setKol(next)
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted">
                      {t('admin.kolDetail.aiSummary.saveFirst')}
                    </p>
                  )
                ) : null}
                {activeTab === 'orders' ? (
                  <OrdersPanel
                    form={form}
                    editing={formEditable}
                    onPatch={patchForm}
                  />
                ) : null}
                {activeTab === 'visits' ? (
                  <VisitsPanel
                    mode={mode}
                    kolId={kolId}
                    onNavigate={onNavigate}
                  />
                ) : null}
                {activeTab === 'status' ? (
                  <StatusPanel
                    form={form}
                    editing={formEditable}
                    members={members}
                    ownerSnippet={ownerSnippet}
                    userEmail={userEmail}
                    onPatch={patchForm}
                  />
                ) : null}
                {activeTab === 'logistics' ? (
                  <LogisticsPanel
                    mode={mode}
                    kol={kol}
                    form={form}
                    editing={formEditable}
                    canDelete={canDelete}
                    onPatch={patchForm}
                  />
                ) : null}
              </div>
          </div>
        </div>
      )}

      <CriteriaModal open={criteriaOpen} onClose={() => setCriteriaOpen(false)} />

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
                onClick={(event) => event.stopPropagation()}
              >
                <h2 className="text-base font-extrabold text-brand">
                  {t('admin.kol.deleteConfirmTitle')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.kol.deleteConfirm')}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteOpen(false)}
                  >
                    {t('admin.kolDetail.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
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
