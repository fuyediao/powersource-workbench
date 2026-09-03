/**
 * Customer detail view pane (Vue CustomerDetailView parity without AI rail).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  CUSTOMER_DETAIL_EDIT_FORM_ID,
  CustomerFormPane,
} from '@/components/admin/customer-form-pane'
import { CountryFlag } from '@/components/common/country-flag'
import { CustomerSubtablesPanel } from '@/components/admin/customer-subtables-panel'
import { AboutOwnerProxyRows } from '@/components/admin/customer-detail/about-owner-proxy-rows'
import { ActivityPanel } from '@/components/admin/customer-detail/activity-panel'
import { AddressesPanel } from '@/components/admin/customer-detail/addresses-panel'
import { AiSummaryPanel } from '@/components/admin/customer-detail/ai-summary-panel'
import { ChannelsPanel } from '@/components/admin/customer-detail/channels-panel'
import { ContactsPanel } from '@/components/admin/customer-detail/contacts-panel'
import { CustomerDetailTabBar } from '@/components/admin/customer-detail/customer-detail-tab-bar'
import { DocumentsPanel } from '@/components/admin/customer-detail/documents-panel'
import {
  ABOUT_ROW_CLASS,
  dash,
  detailSectionCardClass,
  type CustomerDetailTabId,
} from '@/components/admin/customer-detail/detail-shared'
import { FollowUpsPanel } from '@/components/admin/customer-detail/follow-ups-panel'
import { MailPanel } from '@/components/admin/customer-detail/mail-panel'
import { ObmAccountPanel } from '@/components/admin/customer-detail/obm-account-panel'
import { OrdersPanel } from '@/components/admin/customer-detail/orders-panel'
import { OverviewPanel } from '@/components/admin/customer-detail/overview-panel'
import { SpecificInfoPanel } from '@/components/admin/customer-detail/specific-info-panel'
import { VisitLogsPanel } from '@/components/admin/customer-detail/visit-logs-panel'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  GlobeIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import { listCustomerChannels } from '@/services/customer-channels-api'
import { deleteCustomer, getCustomerById } from '@/services/customers-api'
import type { CustomerChannel, CustomerDetail } from '@/types/customer'
import { isCustomerTypeSlug } from '@/constants/customer-types'
import {
  ChannelPlatformIcon,
  normalizeChannelExternalUrl,
  QUICK_SOCIAL_PLATFORM_ORDER,
} from '@/utils/channel-platform-icon'
import { openMailCompose } from '@/utils/mail/mail-compose-request'
import { openExternalUrl } from '@/utils/shared/api'
import {
  getCustomerDetailCache,
  invalidateCustomerDetailCache,
  patchCustomerDetailCache,
  setCustomerDetailCache,
  setCustomerDetailTabCache,
} from '@/utils/customer-detail-cache'
import { formatDisplayDateTime } from '@/utils/format-display-date'

interface CustomerDetailPaneProps {
  userId: string
  customerId: string
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

const LIST_PATH = '/admin/customers'

/**
 * Read-only customer detail with left profile and center tabs (no AI summary).
 * @param props - Customer id, writes, navigation.
 * @returns Detail UI.
 */
export function CustomerDetailPane({
  userId,
  customerId,
  writes,
  onNavigate,
}: CustomerDetailPaneProps) {
  const { t } = useTranslation()
  const { openUrl } = useLinkOpen()
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const canCreate = Boolean(writes?.canCreate)

  const cached = getCustomerDetailCache(customerId)
  const [customer, setCustomer] = useState<CustomerDetail | null>(
    () => cached?.customer ?? null,
  )
  const [channels, setChannels] = useState<CustomerChannel[]>(
    () => cached?.channels ?? [],
  )
  const [loading, setLoading] = useState(() => !cached?.customer)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CustomerDetailTabId>(
    () => cached?.activeTab ?? 'overview',
  )
  const [aboutOpen, setAboutOpen] = useState(() => cached?.aboutOpen ?? true)
  const [deleting, setDeleting] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editFormState, setEditFormState] = useState({ saving: false, canSave: false })

  /**
   * Writes core detail fields into the session cache.
   * @param row - Customer detail.
   * @param ch - Channels list.
   * @returns Nothing.
   */
  function writeCoreCache(row: CustomerDetail, ch: CustomerChannel[]): void {
    const prev = getCustomerDetailCache(customerId)
    setCustomerDetailCache(customerId, {
      customer: row,
      channels: ch,
      activeTab: prev?.activeTab ?? 'overview',
      aboutOpen: prev?.aboutOpen ?? true,
      tabs: { ...prev?.tabs, channels: ch },
    })
    setCustomerDetailTabCache(customerId, 'channels', ch)
  }

  const reload = useCallback(async (): Promise<void> => {
    const hadCache = Boolean(getCustomerDetailCache(customerId)?.customer)
    if (!hadCache) {
      setLoading(true)
    }
    setError(null)
    try {
      const [row, ch] = await Promise.all([
        getCustomerById(customerId),
        listCustomerChannels(customerId).catch(() => [] as CustomerChannel[]),
      ])
      if (!row) {
        setCustomer(null)
        setError(t('admin.customers.detail.subPageNotFound'))
        invalidateCustomerDetailCache(customerId)
        return
      }
      setCustomer(row)
      setChannels(ch)
      writeCoreCache(row, ch)
    } catch (err) {
      console.error('[CustomerDetailPane] load:', err)
      setError(t('admin.customers.errorLoad'))
      if (!hadCache) {
        setCustomer(null)
      }
    } finally {
      setLoading(false)
    }
  }, [customerId, t])

  useEffect(() => {
    const hit = getCustomerDetailCache(customerId)
    if (hit?.customer) {
      setCustomer(hit.customer)
      setChannels(hit.channels)
      setActiveTab(hit.activeTab)
      setAboutOpen(hit.aboutOpen)
      setLoading(false)
    } else {
      setCustomer(null)
      setChannels([])
      setActiveTab('overview')
      setAboutOpen(true)
      setLoading(true)
    }
    void reload()
    // Only re-run when navigating to another customer.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [customerId])

  useEffect(() => {
    patchCustomerDetailCache(customerId, { activeTab })
  }, [activeTab, customerId])

  useEffect(() => {
    patchCustomerDetailCache(customerId, { aboutOpen })
  }, [aboutOpen, customerId])

  /**
   * Applies a customer patch locally and to cache (specific info / AI summary).
   * @param next - Updated customer.
   * @returns Nothing.
   */
  const applyCustomerUpdate = useCallback(
    (next: CustomerDetail): void => {
      setCustomer(next)
      patchCustomerDetailCache(customerId, { customer: next })
    },
    [customerId],
  )

  /**
   * Syncs channels from the channels tab into header + cache.
   * @param next - Channel rows.
   * @returns Nothing.
   */
  const handleChannelsChange = useCallback(
    (next: CustomerChannel[]): void => {
      setChannels(next)
      patchCustomerDetailCache(customerId, {
        channels: next,
        tabs: { channels: next },
      })
      setCustomerDetailTabCache(customerId, 'channels', next)
    },
    [customerId],
  )

  const typeLabel = useMemo(() => {
    const slug = customer?.customerType ?? null
    if (!slug) {
      return '—'
    }
    if (isCustomerTypeSlug(slug)) {
      return t(`admin.customers.customerType.${slug}`)
    }
    return slug
  }, [customer?.customerType, t])

  const socialQuickLinks = useMemo(() => {
    const byPlatform = new Map<string, { url: string; label: string; key: string }>()
    for (const ch of channels) {
      const normalizedKey = ch.platformKey === 'twitter' ? 'twitter-x' : ch.platformKey
      if (
        !QUICK_SOCIAL_PLATFORM_ORDER.includes(
          normalizedKey as (typeof QUICK_SOCIAL_PLATFORM_ORDER)[number],
        )
      ) {
        continue
      }
      if (byPlatform.has(normalizedKey)) {
        continue
      }
      const url = normalizeChannelExternalUrl(ch.channelUrl)
      if (!url) {
        continue
      }
      byPlatform.set(normalizedKey, {
        url,
        key: normalizedKey,
        label:
          ch.platformCustomName?.trim() ||
          t(`admin.customers.channels.platform.${normalizedKey}`, normalizedKey),
      })
    }
    return QUICK_SOCIAL_PLATFORM_ORDER.map((key) => byPlatform.get(key)).filter(
      (item): item is { url: string; label: string; key: string } => Boolean(item),
    )
  }, [channels, t])

  const initial = (customer?.companyName?.trim().charAt(0) || '?').toUpperCase()

  /**
   * Returns to the customers list.
   * @returns Nothing.
   */
  function goBack(): void {
    onNavigate(LIST_PATH)
  }

  /**
   * Enters in-place edit mode (same page as view; Vue parity).
   * @returns Nothing.
   */
  function startEdit(): void {
    if (!canEdit) {
      return
    }
    setIsEditing(true)
  }

  /**
   * Leaves edit mode without saving (stays on detail).
   * @returns Nothing.
   */
  function cancelEdit(): void {
    setIsEditing(false)
    setEditFormState({ saving: false, canSave: false })
  }

  /**
   * Syncs embedded form Save enablement to the detail toolbar.
   * @param state - Saving flag and whether Save is allowed.
   * @returns Nothing.
   */
  function handleEmbeddedStateChange(state: { saving: boolean; canSave: boolean }): void {
    setEditFormState(state)
  }

  /**
   * After embedded save: leave edit and reload detail.
   * @returns Nothing.
   */
  async function handleEmbeddedSaved(): Promise<void> {
    setIsEditing(false)
    setEditFormState({ saving: false, canSave: false })
    await reload()
  }

  /**
   * Deletes the customer after confirm.
   * @returns Nothing.
   */
  async function handleDelete(): Promise<void> {
    if (!canDelete || !customer || deleting) {
      return
    }
    if (!window.confirm(t('admin.customers.deleteConfirm.message'))) {
      return
    }
    setDeleting(true)
    try {
      await deleteCustomer(customer.id)
      invalidateCustomerDetailCache(customer.id)
      onNavigate(LIST_PATH)
    } catch (err) {
      console.error('[CustomerDetailPane] delete:', err)
      setError(t('admin.customers.errorDeleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-6">
        <p className="text-sm font-medium text-muted">{t('admin.customers.detail.subPageLoading')}</p>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
        <button
          type="button"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-brand transition hover:bg-brand/10"
          aria-label={t('admin.customers.backToList')}
          onClick={goBack}
        >
          <ArrowLeftIcon className="size-5" aria-hidden />
        </button>
        <p className="text-sm font-medium text-rose-500">
          {error ?? t('admin.customers.detail.subPageNotFound')}
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-ink/10 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-brand transition hover:bg-brand/10"
              aria-label={t('admin.customers.backToList')}
              onClick={goBack}
            >
              <ArrowLeftIcon className="size-5" aria-hidden />
            </button>
            <span className="truncate text-xl font-extrabold text-brand">
              {customer.companyName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  disabled={editFormState.saving}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-ink/10 bg-white/60 px-3 py-2 text-sm font-bold text-ink transition hover:border-brand/40 hover:text-brand disabled:opacity-50 dark:bg-white/5"
                  onClick={cancelEdit}
                >
                  {t('admin.customers.modal.cancel')}
                </button>
                <button
                  type="submit"
                  form={CUSTOMER_DETAIL_EDIT_FORM_ID}
                  disabled={!editFormState.canSave}
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                >
                  {editFormState.saving
                    ? t('admin.customers.modal.saving')
                    : t('admin.customers.modal.save')}
                </button>
              </>
            ) : (
              <>
                {canEdit ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg"
                    onClick={startEdit}
                  >
                    <PencilIcon className="size-4" />
                    {t('admin.customers.editButton')}
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    disabled={deleting}
                    className="inline-flex items-center gap-1.5 rounded-2xl bg-rose-500/10 px-3 py-2 text-sm font-bold text-rose-600 disabled:opacity-50"
                    onClick={() => void handleDelete()}
                  >
                    <TrashIcon className="size-4" />
                    {t('admin.customers.deleteButton')}
                  </button>
                ) : null}
              </>
            )}
          </div>
        </div>
        {error ? <p className="mt-2 text-sm font-medium text-rose-500">{error}</p> : null}
      </div>

      {/*
        Two-column only when *this pane* is wide enough (~lg). Viewport `lg:`
        ignores the Admin rail + Ask AI dock, so the profile/tabs stack instead.
      */}
      <div className="@container/customer-detail min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 @[64rem]/customer-detail:overflow-hidden">
        <div className="grid gap-6 @[64rem]/customer-detail:h-full @[64rem]/customer-detail:min-h-0 @[64rem]/customer-detail:grid-cols-[300px_minmax(0,1fr)]">
          {/* Left column — same shell in view and edit (Vue parity) */}
          <aside className="space-y-4 @[64rem]/customer-detail:min-h-0 @[64rem]/customer-detail:overflow-y-auto @[64rem]/customer-detail:overscroll-contain">
            <div className={detailSectionCardClass()}>
              <div className="flex flex-col items-center gap-3 text-center">
                {customer.logoUrl ? (
                  <img
                    src={customer.logoUrl}
                    alt={t('admin.customers.detail.companyLogo')}
                    className="size-24 rounded-2xl object-cover ring-2 ring-brand/30"
                  />
                ) : (
                  <div className="grid size-24 place-items-center rounded-2xl bg-brand/10 text-3xl font-extrabold text-brand ring-2 ring-brand/30">
                    {initial}
                  </div>
                )}
                <div className="min-w-0 w-full">
                  <h2 className="truncate text-lg font-extrabold text-ink">
                    {customer.companyName}
                  </h2>
                  {customer.shortName ? (
                    <p className="truncate text-sm text-muted">{customer.shortName}</p>
                  ) : null}
                  {customer.email ? (
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
                      onClick={() => {
                        openMailCompose({ to: customer.email! })
                      }}
                    >
                      <MailIcon className="size-3.5" />
                      {customer.email}
                    </button>
                  ) : null}
                </div>
              </div>

              {isEditing ? (
                <div className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-brand/25 bg-brand/10 px-3 py-2.5">
                  <PencilIcon className="size-3.5 shrink-0 text-brand" aria-hidden />
                  <span className="text-xs font-bold tracking-wide text-brand">
                    {t('admin.customers.detail.editingMode')}
                  </span>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {customer.email ? (
                      <button
                        type="button"
                        className="rounded-xl border border-ink/10 px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-brand/40 hover:text-brand"
                        title={t('admin.customers.col.email')}
                        onClick={() => {
                          openMailCompose({ to: customer.email! })
                        }}
                      >
                        <MailIcon className="size-3.5" />
                      </button>
                    ) : null}
                    {customer.phone ? (
                      <button
                        type="button"
                        className="rounded-xl border border-ink/10 px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-brand/40 hover:text-brand"
                        title={t('admin.customers.detail.quickActionPhone')}
                        onClick={() => {
                          const dialable = customer.phone!.trim().replace(/[\s()-]/g, '')
                          if (dialable) {
                            void openExternalUrl(`tel:${dialable}`)
                          }
                        }}
                      >
                        <PhoneIcon className="size-3.5" />
                      </button>
                    ) : null}
                    {customer.website ? (
                      <button
                        type="button"
                        className="rounded-xl border border-ink/10 px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-brand/40 hover:text-brand"
                        title={t('admin.customers.detail.quickActionWeb')}
                        onClick={() => {
                          const url = customer.website!.startsWith('http')
                            ? customer.website!
                            : `https://${customer.website}`
                          openUrl(url)
                        }}
                      >
                        <GlobeIcon className="size-3.5" />
                      </button>
                    ) : null}
                    {customer.latitude != null && customer.longitude != null ? (
                      <button
                        type="button"
                        className="rounded-xl border border-ink/10 px-2.5 py-1.5 text-xs font-semibold text-ink hover:border-brand/40 hover:text-brand"
                        title={t('admin.customers.detail.quickActionMap')}
                        onClick={() => {
                          openUrl(
                            `https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`,
                          )
                        }}
                      >
                        <MapPinIcon className="size-3.5" />
                      </button>
                    ) : null}
                    {canEdit ? (
                      <button
                        type="button"
                        className="rounded-xl border border-brand/40 bg-brand/10 px-2.5 py-1.5 text-xs font-semibold text-brand"
                        onClick={startEdit}
                        title={t('admin.customers.editButton')}
                      >
                        <PencilIcon className="size-3.5" />
                      </button>
                    ) : null}
                  </div>

                  {socialQuickLinks.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                      {socialQuickLinks.map((social) => (
                        <button
                          type="button"
                          key={social.key}
                          className="inline-flex size-8 items-center justify-center rounded-full border border-ink/10 bg-white/40 text-muted transition hover:border-brand/40 hover:text-brand dark:bg-white/5"
                          title={social.label}
                          aria-label={social.label}
                          onClick={() => {
                            openUrl(social.url)
                          }}
                        >
                          <ChannelPlatformIcon
                            platformKey={social.key}
                            className="size-3.5"
                            aria-hidden
                          />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div className={detailSectionCardClass()}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                onClick={() => setAboutOpen((v) => !v)}
              >
                <span className="text-sm font-extrabold text-ink">
                  {t('admin.customers.detail.about')}
                </span>
                <ChevronDownIcon
                  className={`size-4 text-muted transition-transform ${aboutOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {aboutOpen ? (
                <dl className="-mx-4 mt-3 divide-y divide-ink/10 border-t border-ink/10 text-sm dark:divide-white/10 dark:border-white/10">
                  <AboutRow label={t('admin.customers.col.customerCode')} value={dash(customer.customerCode)} />
                  <AboutRow label={t('admin.customers.col.phone')} value={dash(customer.phone)} />
                  <div className={`${ABOUT_ROW_CLASS} justify-between`}>
                    <dt className="w-20 shrink-0 text-xs text-muted">
                      {t('admin.customers.form.companyCountry')}
                    </dt>
                    <dd className="flex min-w-0 items-center gap-1.5 text-right text-xs font-medium text-ink">
                      {customer.companyCountry ? (
                        <>
                          <CountryFlag countryName={customer.companyCountry} size={16} />
                          <span className="truncate">{customer.companyCountry}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <AboutRow
                    label={t('admin.customers.form.companyPostalCode')}
                    value={dash(customer.companyPostalCode)}
                  />
                  <AboutRow label={t('admin.customers.form.fax')} value={dash(customer.fax)} />
                  <AboutRow label={t('admin.customers.form.industry')} value={dash(customer.industry)} />
                  <AboutRow label={t('admin.customers.form.taxId')} value={dash(customer.taxId)} />
                  <AboutRow
                    label={t('admin.customers.form.employeeCount')}
                    value={dash(customer.employeeCount)}
                  />
                  <AboutRow
                    label={t('admin.customers.form.primaryContactName')}
                    value={dash(customer.primaryContactName)}
                  />
                  <AboutOwnerProxyRows
                    customer={customer}
                    onNavigate={onNavigate}
                  />
                  <AboutRow label={t('admin.customers.col.type')} value={typeLabel} />
                  <AboutRow label={t('admin.customers.form.category')} value={dash(customer.category)} />
                  <AboutRow
                    label={t('admin.customers.detail.highlights.updatedAt')}
                    value={formatDisplayDateTime(customer.updatedAt)}
                  />
                </dl>
              ) : null}
            </div>
          </aside>

          {/* Center: tabs when viewing; field form when editing (same page) */}
          <div className="min-w-0 space-y-4 @[64rem]/customer-detail:min-h-0 @[64rem]/customer-detail:overflow-y-auto @[64rem]/customer-detail:overscroll-contain">
            {isEditing ? (
              <CustomerFormPane
                userId={userId}
                writes={writes}
                mode="edit"
                customerId={customerId}
                onNavigate={onNavigate}
                embedded
                onEmbeddedSaved={() => {
                  void handleEmbeddedSaved()
                }}
                onEmbeddedStateChange={handleEmbeddedStateChange}
              />
            ) : (
              <>
                <CustomerDetailTabBar activeTab={activeTab} onChange={setActiveTab} />

                {activeTab === 'overview' ? <OverviewPanel customer={customer} /> : null}
                {activeTab === 'specificInfo' ? (
                  <SpecificInfoPanel
                    customer={customer}
                    canEdit={canEdit}
                    onSaved={applyCustomerUpdate}
                  />
                ) : null}
                {activeTab === 'aiSummary' ? (
                  <AiSummaryPanel
                    customer={customer}
                    onCustomerUpdated={applyCustomerUpdate}
                  />
                ) : null}
                {activeTab === 'visitLogs' ? (
                  <VisitLogsPanel
                    customerId={customerId}
                    canCreate={canCreate}
                    onNavigate={onNavigate}
                  />
                ) : null}
                {activeTab === 'workItems' ? (
                  <CustomerSubtablesPanel
                    customerId={customerId}
                    groupId={customer.groupId}
                    writes={writes}
                    sections={['workItems']}
                  />
                ) : null}
                {activeTab === 'activity' ? <ActivityPanel customerId={customerId} /> : null}
                {activeTab === 'followUpPlan' ? (
                  <FollowUpsPanel
                    customerId={customerId}
                    customerName={customer.companyName}
                    onNavigate={onNavigate}
                  />
                ) : null}
                {activeTab === 'contacts' ? (
                  <ContactsPanel
                    customerId={customerId}
                    groupId={customer.groupId}
                    writes={writes}
                  />
                ) : null}
                {activeTab === 'addresses' ? (
                  <AddressesPanel
                    customerId={customerId}
                    groupId={customer.groupId}
                    writes={writes}
                  />
                ) : null}
                {activeTab === 'orders' ? (
                  <OrdersPanel customerId={customerId} />
                ) : null}
                {activeTab === 'mail' ? <MailPanel customerId={customerId} /> : null}
                {activeTab === 'documents' ? (
                  <DocumentsPanel
                    customerId={customerId}
                    groupId={customer.groupId}
                    writes={writes}
                  />
                ) : null}
                {activeTab === 'channels' ? (
                  <ChannelsPanel
                    customerId={customerId}
                    groupId={customer.groupId}
                    writes={writes}
                    onChannelsChange={handleChannelsChange}
                  />
                ) : null}
                {activeTab === 'obmAccount' ? (
                  <ObmAccountPanel
                    customerId={customerId}
                    groupId={customer.groupId ?? ''}
                    canCreate={canCreate}
                    canUpdate={canEdit}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface AboutRowProps {
  label: string
  value: string
}

/**
 * One About dl row (web-style divider list item).
 * @param props - Label and value.
 * @returns Row.
 */
function AboutRow({ label, value }: AboutRowProps) {
  return (
    <div className={`${ABOUT_ROW_CLASS} justify-between`}>
      <dt className="w-20 shrink-0 text-xs text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-xs font-medium break-all text-ink">{value}</dd>
    </div>
  )
}

