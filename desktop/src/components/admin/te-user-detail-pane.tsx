/**
 * T&E community-user detail: profile, account, orders, submissions, community.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { dash, detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  TeUserDetailTabs,
  normalizeTeUserDetailTab,
  type TeUserDetailTab,
} from '@/components/admin/te-user-detail-tabs'
import {
  TE_ACCOUNT_STATUSES,
  teAccountStatusClass,
} from '@/components/admin/te-users-pane'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { TE_STATUS_BADGE_CLASSES, type TeStatus } from '@/constants/te-tracking-stages'
import {
  useTeCommunityAccounts,
  type TeCommunityAccount,
  type TeCommunityAccountStatus,
} from '@/hooks/use-te-community-accounts'
import { useTeCommunityUserSubmissions } from '@/hooks/use-te-community-user-submissions'
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  LucideMessagesSquareIcon,
  RefreshIcon,
} from '@/icons/AllIcons'
import { isSupabaseConfigured } from '@/lib/supabase'
import { fromLoose } from '@/lib/supabase-loose'
import {
  fetchProductCatalogIdLabelMap,
  formatTeProductIds as formatTeOrderProductIds,
  listTeOrders,
} from '@/services/orders-te-api'
import {
  mapTeCommunityPostFromRow,
  TE_COMMUNITY_POST_SELECT,
  type TeCommunityPost,
  type TeCommunityPostStatus,
} from '@/services/te-community-posts-repository'
import type { TeSubmission } from '@/services/te-submissions-repository'
import {
  buildTeProductIdLabelMap,
  fetchTeProductCategories,
  formatTeProductIds,
} from '@/services/te-products-api'
import type { TeOrder } from '@/types/orders'
import { communityPostExcerpt } from '@/utils/community-markdown'
import { formatDisplayDateTime } from '@/utils/format-display-date'
import { openOrdersPath } from '@/utils/orders/orders-open-request'
import { teApplicationDetailPath } from '@/utils/te-application-routes'
import { teCommunityDetailPath } from '@/utils/te-community-routes'
import {
  parseTeUserDrillPath,
  teUserDetailPath,
  teUsersListPath,
} from '@/utils/te-user-routes'

interface TeUserDetailPaneProps {
  userId: string
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Badge classes for a T&E submission status.
 *
 * @param status - Submission status.
 * @returns Tailwind class string.
 */
function submissionStatusClass(status: TeStatus): string {
  return TE_STATUS_BADGE_CLASSES[status] ?? TE_STATUS_BADGE_CLASSES.under_review
}

/**
 * Badge classes for a community post status.
 *
 * @param status - Post status.
 * @returns Tailwind class string.
 */
function postStatusClass(status: TeCommunityPostStatus): string {
  switch (status) {
    case 'published':
      return 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
    case 'hidden':
      return 'border border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300'
    case 'draft':
      return 'border border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
    default:
      return 'border border-ink/15 bg-ink/5 text-muted'
  }
}

/**
 * Combines first and last name, or an em dash when both are empty.
 *
 * @param submission - Submission row.
 * @returns Display name.
 */
function submissionDisplayName(submission: TeSubmission): string {
  const parts = [submission.firstName, submission.lastName].filter(Boolean)
  return parts.length ? parts.join(' ') : '—'
}

/**
 * Avatar initials from display name or email.
 *
 * @param account - Community account.
 * @returns Two-character initials.
 */
function accountInitials(account: TeCommunityAccount): string {
  const source = (account.displayName ?? account.email).trim()
  return source.slice(0, 2).toUpperCase() || '—'
}

/**
 * Loads one community account and renders Vue-parity detail tabs.
 *
 * @param props - User id, shell path, writes, and navigation.
 * @returns Detail UI.
 */
export function TeUserDetailPane({
  userId,
  path,
  writes,
  onNavigate,
}: TeUserDetailPaneProps) {
  const { t } = useTranslation()
  const canEdit = Boolean(writes?.canEdit)
  const { error, fetchAccountById, updateAccountStatus } = useTeCommunityAccounts()

  const [account, setAccount] = useState<TeCommunityAccount | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [headerStatusOpen, setHeaderStatusOpen] = useState(false)

  const drillTab = parseTeUserDrillPath(path)?.tab ?? null
  const activeTab = normalizeTeUserDetailTab(drillTab, canEdit)

  /**
   * Reloads the account shown on this detail route.
   */
  const loadAccount = useCallback(async (): Promise<void> => {
    setDetailLoading(true)
    const next = await fetchAccountById(userId)
    setAccount(next)
    setDetailLoading(false)
  }, [fetchAccountById, userId])

  useEffect(() => {
    void loadAccount()
  }, [loadAccount])

  useEffect(() => {
    if (!canEdit && activeTab === 'account') {
      onNavigate(teUserDetailPath(userId, 'profile'))
    }
  }, [activeTab, canEdit, onNavigate, userId])

  const detailTitle = useMemo(() => {
    if (!account) {
      return '...'
    }
    const name = account.displayName?.trim()
    return name || account.email
  }, [account])

  /**
   * Switches the active detail tab and reflects it in the path query.
   *
   * @param tab - Target tab key.
   */
  function setActiveTab(tab: TeUserDetailTab): void {
    onNavigate(teUserDetailPath(userId, tab))
  }

  /**
   * Updates status from the detail header dropdown (no reason, Vue header parity).
   *
   * @param status - New status.
   */
  async function setHeaderStatus(status: TeCommunityAccountStatus): Promise<void> {
    if (!canEdit || !account || account.status === status) {
      setHeaderStatusOpen(false)
      return
    }
    setHeaderStatusOpen(false)
    setUpdating(true)
    const ok = await updateAccountStatus(account.id, status, null, {
      skipListRefresh: true,
    })
    if (ok) {
      const next = await fetchAccountById(account.id)
      if (next) {
        setAccount(next)
      }
    }
    setUpdating(false)
  }

  /**
   * Updates status from the account tab, including an optional reason.
   *
   * @param status - New status.
   * @param reason - Suspension / ban reason.
   * @returns Whether the write succeeded.
   */
  async function saveAccountStatus(
    status: TeCommunityAccountStatus,
    reason: string | null,
  ): Promise<boolean> {
    if (!canEdit || !account) {
      return false
    }
    setUpdating(true)
    const ok = await updateAccountStatus(account.id, status, reason, {
      skipListRefresh: true,
    })
    if (ok) {
      const next = await fetchAccountById(account.id)
      if (next) {
        setAccount(next)
      }
    }
    setUpdating(false)
    return ok
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-semibold text-muted hover:bg-brand/10 hover:text-ink"
          onClick={() => onNavigate(teUsersListPath())}
        >
          <ArrowLeftIcon className="size-4" />
          {t('admin.teUsers.backToList')}
        </button>
        <span className="text-ink/20">/</span>
        <h1 className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">
          {detailTitle}
        </h1>
        {account && canEdit ? (
          <div className="relative shrink-0">
            <button
              type="button"
              disabled={updating}
              className={`inline-flex items-center gap-1.5 rounded-md py-1 pr-1.5 pl-2 text-xs font-medium disabled:opacity-50 ${teAccountStatusClass(account.status)}`}
              onClick={() => setHeaderStatusOpen((open) => !open)}
            >
              <span>{t(`admin.teUsers.status.${account.status}`)}</span>
              <ChevronDownIcon
                className={`size-3 opacity-70 transition-transform ${
                  headerStatusOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {headerStatusOpen ? (
              <div className="absolute right-0 z-50 mt-1 min-w-36 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900">
                {TE_ACCOUNT_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    disabled={account.status === status}
                    className="w-full px-3 py-2 text-left text-sm font-medium text-ink hover:bg-brand/5 disabled:opacity-40"
                    onClick={() => void setHeaderStatus(status)}
                  >
                    {t(`admin.teUsers.status.${status}`)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : account ? (
          <span
            className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${teAccountStatusClass(account.status)}`}
          >
            {t(`admin.teUsers.status.${account.status}`)}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5 sm:p-6">
        {error ? (
          <p className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-500">
            {error}
          </p>
        ) : null}

        {detailLoading ? (
          <div className="py-12 text-center text-muted">
            <RefreshIcon className="mb-2 inline-block size-6 animate-spin" />
            <p className="text-sm font-medium">{t('admin.teUsers.loading')}</p>
          </div>
        ) : account ? (
          <div className="space-y-6">
            <TeUserDetailTabs
              activeTab={activeTab}
              canEdit={canEdit}
              onChange={setActiveTab}
            />
            {activeTab === 'profile' ? (
              <TeUserProfileTab account={account} onNavigate={onNavigate} />
            ) : null}
            {activeTab === 'account' && canEdit ? (
              <TeUserAccountTab
                account={account}
                saving={updating}
                onNavigate={onNavigate}
                onSaveStatus={saveAccountStatus}
              />
            ) : null}
            {activeTab === 'orders' ? (
              <TeUserOrdersTab account={account} />
            ) : null}
            {activeTab === 'teForms' ? (
              <TeUserSubmissionsTab account={account} onNavigate={onNavigate} />
            ) : null}
            {activeTab === 'community' ? (
              <TeUserCommunityTab account={account} onNavigate={onNavigate} />
            ) : null}
          </div>
        ) : (
          <p className="py-12 text-center text-sm font-medium text-muted">
            {t('admin.teUsers.notFound')}
          </p>
        )}
      </div>
    </div>
  )
}

interface TeUserProfileTabProps {
  account: TeCommunityAccount
  onNavigate: (path: string) => void
}

/**
 * Profile fields plus a link to the initial T&E application.
 *
 * @param props - Account and navigation.
 * @returns Profile sections.
 */
function TeUserProfileTab({ account, onNavigate }: TeUserProfileTabProps) {
  const { t } = useTranslation()
  const cardClass = detailSectionCardClass()

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <h3 className="mb-4 text-sm font-semibold text-ink">
          {t('admin.teUsers.section.profile')}
        </h3>
        <div className="mb-5 flex items-center gap-4">
          {account.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt={account.displayName ?? account.email}
              className="size-16 rounded-full border border-ink/10 object-cover shadow"
            />
          ) : (
            <span className="grid size-16 place-items-center rounded-full border border-brand/50 bg-brand/20 text-xl font-bold text-ink select-none">
              {accountInitials(account)}
            </span>
          )}
          <div>
            <p className="text-xs text-muted">{t('admin.teUsers.col.avatar')}</p>
            <p className="mt-0.5 text-xs text-muted">
              {account.avatarUrl
                ? t('admin.teUsers.avatarSet')
                : t('admin.teUsers.avatarNone')}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">{t('admin.teUsers.col.email')}</dt>
            <dd className="mt-1 font-mono text-sm break-all text-ink">
              {account.email}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">
              {t('admin.teUsers.col.displayName')}
            </dt>
            <dd className="mt-1 text-ink">{dash(account.displayName)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('admin.teUsers.col.nickname')}</dt>
            <dd className="mt-1 text-ink">{dash(account.nickname)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">
              {t('admin.teUsers.col.organization')}
            </dt>
            <dd className="mt-1 text-ink">{dash(account.organization)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('admin.te.field.mobile')}</dt>
            <dd className="mt-1 text-ink">{dash(account.phoneNumber)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">
              {t('admin.teUsers.field.initialSubmission')}
            </dt>
            <dd className="mt-1">
              {account.initialSubmissionId ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-brand hover:underline"
                  onClick={() => {
                    const submissionId = account.initialSubmissionId
                    if (submissionId) {
                      onNavigate(teApplicationDetailPath(submissionId))
                    }
                  }}
                >
                  {t('admin.teUsers.viewSubmission')}
                </button>
              ) : (
                <span className="text-sm text-muted">
                  {t('admin.teUsers.noInitialSubmission')}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {account.status !== 'active' ? (
        <section className={cardClass}>
          <h3 className="mb-4 text-sm font-semibold text-ink">
            {t('admin.teUsers.section.moderation')}
          </h3>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">
                {t('admin.teUsers.field.suspendedAt')}
              </dt>
              <dd className="mt-1 text-sm text-ink">
                {formatDisplayDateTime(account.suspendedAt)}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted">
                {t('admin.teUsers.field.suspendedReason')}
              </dt>
              <dd className="mt-1 text-sm text-ink">
                {dash(account.suspendedReason)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  )
}

interface TeUserAccountTabProps {
  account: TeCommunityAccount
  saving: boolean
  onNavigate: (path: string) => void
  onSaveStatus: (
    status: TeCommunityAccountStatus,
    reason: string | null,
  ) => Promise<boolean>
}

/**
 * Account metadata plus status change with an optional reason.
 *
 * @param props - Account, save handler, and navigation.
 * @returns Account sections.
 */
function TeUserAccountTab({
  account,
  saving,
  onNavigate,
  onSaveStatus,
}: TeUserAccountTabProps) {
  const { t } = useTranslation()
  const cardClass = detailSectionCardClass()
  const [draftStatus, setDraftStatus] = useState<TeCommunityAccountStatus>(
    account.status,
  )
  const [reason, setReason] = useState(account.suspendedReason ?? '')

  useEffect(() => {
    setDraftStatus(account.status)
    setReason(account.suspendedReason ?? '')
  }, [account.id, account.status, account.suspendedReason])

  const statusOptions = useMemo(
    () =>
      TE_ACCOUNT_STATUSES.map((status) => ({
        value: status,
        label: t(`admin.teUsers.status.${status}`),
      })),
    [t],
  )

  const dirty =
    draftStatus !== account.status ||
    (draftStatus !== 'active' &&
      reason.trim() !== (account.suspendedReason ?? '').trim())

  /**
   * Persists the draft status and reason.
   */
  async function handleSave(): Promise<void> {
    if (!dirty || saving) {
      return
    }
    await onSaveStatus(
      draftStatus,
      draftStatus === 'active' ? null : reason.trim() || null,
    )
  }

  return (
    <div className="space-y-6">
      <section className={cardClass}>
        <h3 className="mb-4 text-sm font-semibold text-ink">
          {t('admin.teUsers.section.account')}
        </h3>
        <p className="mb-4 text-xs text-muted">{t('admin.teUsers.otpLoginNote')}</p>

        <div className="mb-5 space-y-3 rounded-2xl border border-ink/10 bg-white/50 p-4 dark:bg-white/5">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold tracking-wide text-muted uppercase">
              {t('admin.teUsers.col.status')}
            </span>
            <CrmFilterSelect
              className="max-w-xs"
              value={draftStatus}
              options={statusOptions}
              ariaLabel={t('admin.teUsers.changeStatus')}
              disabled={saving}
              onChange={(next) =>
                setDraftStatus((next as TeCommunityAccountStatus) || account.status)
              }
            />
          </label>
          {draftStatus !== 'active' ? (
            <label className="block space-y-1.5">
              <span className="text-xs font-bold tracking-wide text-muted uppercase">
                {t('admin.teUsers.field.suspendedReason')}
              </span>
              <textarea
                rows={3}
                value={reason}
                disabled={saving}
                placeholder={t('admin.teUsers.field.reasonPlaceholder')}
                className="w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 disabled:opacity-50 dark:bg-white/5"
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          ) : null}
          <button
            type="button"
            disabled={saving || !dirty}
            className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void handleSave()}
          >
            {t('admin.teUsers.saveStatus')}
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">{t('admin.teUsers.col.email')}</dt>
            <dd className="mt-1 font-mono text-sm break-all text-ink">
              {account.email}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('admin.teUsers.col.lastLogin')}</dt>
            <dd className="mt-1 text-sm text-ink">
              {formatDisplayDateTime(account.lastLoginAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('admin.teUsers.col.createdAt')}</dt>
            <dd className="mt-1 text-sm text-ink">
              {formatDisplayDateTime(account.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('admin.teUsers.field.updatedAt')}</dt>
            <dd className="mt-1 text-sm text-ink">
              {formatDisplayDateTime(account.updatedAt)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted">
              {t('admin.teUsers.field.initialSubmission')}
            </dt>
            <dd className="mt-1">
              {account.initialSubmissionId ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-brand hover:underline"
                  onClick={() => {
                    const submissionId = account.initialSubmissionId
                    if (submissionId) {
                      onNavigate(teApplicationDetailPath(submissionId))
                    }
                  }}
                >
                  {t('admin.teUsers.viewSubmission')}
                </button>
              ) : (
                <span className="text-sm text-muted">
                  {t('admin.teUsers.noInitialSubmission')}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}

/**
 * Local T&E logistics orders for this community account (max 15 rows).
 *
 * @param props - Community account.
 * @returns Orders table.
 */
function TeUserOrdersTab({ account }: { account: TeCommunityAccount }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<TeOrder[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [labelMap, setLabelMap] = useState<Record<string, string>>({})

  useEffect(() => {
    void fetchProductCatalogIdLabelMap()
      .then(setLabelMap)
      .catch(() => setLabelMap({}))
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    void listTeOrders({
      page: 1,
      pageSize: 15,
      communityAccountId: account.id,
    })
      .then((result) => {
        if (cancelled) {
          return
        }
        setRows(result.rows)
        setTotalCount(result.totalCount)
      })
      .catch((err: unknown) => {
        console.error('[TeUserOrdersTab] load:', err)
        if (!cancelled) {
          setRows([])
          setTotalCount(0)
          setError(t('admin.teUsers.tabs.ordersError'))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [account.id, t])

  /**
   * Tracking status badge classes.
   * @param status - Tracking status.
   * @returns Tailwind class string.
   */
  function trackingStatusClass(status: TeOrder['trackingStatus']): string {
    switch (status) {
      case 'pending':
        return 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300'
      case 'in_transit':
        return 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300'
      case 'delivered':
        return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      default:
        return 'border-ink/15 bg-ink/5 text-muted'
    }
  }

  /**
   * Localized tracking status label.
   * @param status - Tracking status.
   * @returns Label.
   */
  function statusLabel(status: TeOrder['trackingStatus']): string {
    if (!status) {
      return t('admin.orders.hub.teOrders.statusNotRegistered')
    }
    return t(`admin.orders.teTracking.${status}`)
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-500">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead className="text-xs font-bold tracking-wide text-muted uppercase">
            <tr className="border-b border-ink/10">
              <th className="px-4 py-3">
                {t('admin.orders.hub.teOrders.col.approvedProducts')}
              </th>
              <th className="px-4 py-3">
                {t('admin.orders.hub.teOrders.col.tracking')}
              </th>
              <th className="hidden px-4 py-3 sm:table-cell">
                {t('admin.orders.hub.teOrders.col.carrier')}
              </th>
              <th className="hidden px-4 py-3 md:table-cell">
                {t('admin.orders.hub.teOrders.col.status')}
              </th>
              <th className="hidden px-4 py-3 lg:table-cell">
                {t('admin.orders.hub.teOrders.col.shippedAt')}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted">
                  <RefreshIcon className="mr-2 inline-block size-5 animate-spin" />
                  {t('admin.teUsers.loading')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted">
                  {t('admin.teUsers.tabs.ordersEmpty')}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => openOrdersPath(`/orders/te/${row.id}`)}
                >
                  <td className="px-4 py-3 text-ink">
                    {formatTeOrderProductIds(row.approvedProductIds, labelMap)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-brand">
                    {row.trackingNumber || '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-ink sm:table-cell">
                    {row.carrier || '—'}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${trackingStatusClass(row.trackingStatus)}`}
                    >
                      {statusLabel(row.trackingStatus)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 text-muted lg:table-cell">
                    {formatDisplayDateTime(row.shippedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && totalCount > 0 ? (
        <p className="text-right text-xs text-muted tabular-nums">
          {t('admin.teUsers.tabs.ordersShowing', {
            shown: rows.length,
            total: totalCount,
          })}
        </p>
      ) : null}
    </div>
  )
}

interface TeUserSubmissionsTabProps {
  account: TeCommunityAccount
  onNavigate: (path: string) => void
}

/**
 * Paginated T&E submissions for this community account.
 *
 * @param props - Account and navigation.
 * @returns Submissions table.
 */
function TeUserSubmissionsTab({ account, onNavigate }: TeUserSubmissionsTabProps) {
  const { t } = useTranslation()
  const {
    submissions,
    isLoading,
    error,
    totalCount,
    currentPage,
    totalPages,
    loadForAccount,
    goToPage,
  } = useTeCommunityUserSubmissions()
  const [productLabelMap, setProductLabelMap] = useState<Record<string, string>>(
    {},
  )

  useEffect(() => {
    void fetchTeProductCategories()
      .then((categories) => setProductLabelMap(buildTeProductIdLabelMap(categories)))
      .catch(() => setProductLabelMap({}))
  }, [])

  useEffect(() => {
    void loadForAccount(account)
  }, [account, loadForAccount])

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-500">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="text-xs font-bold tracking-wide text-muted uppercase">
            <tr className="border-b border-ink/10">
              <th className="px-4 py-3">{t('admin.te.col.submittedAt')}</th>
              <th className="px-4 py-3">{t('admin.te.col.name')}</th>
              <th className="hidden px-4 py-3 md:table-cell">
                {t('admin.te.col.agency')}
              </th>
              <th className="hidden px-4 py-3 lg:table-cell">
                {t('admin.te.col.products')}
              </th>
              <th className="px-4 py-3">{t('admin.te.col.status')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted">
                  <RefreshIcon className="mr-2 inline-block size-5 animate-spin" />
                  {t('admin.teUsers.loading')}
                </td>
              </tr>
            ) : submissions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted">
                  {t('admin.teUsers.tabs.submissionsEmpty')}
                </td>
              </tr>
            ) : (
              submissions.map((submission) => (
                <tr
                  key={submission.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(teApplicationDetailPath(submission.id))}
                >
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                    {formatDisplayDateTime(submission.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="leading-snug font-medium text-ink">
                      {submissionDisplayName(submission)}
                    </p>
                    <p className="text-xs text-muted">{submission.email ?? '—'}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">
                    {dash(submission.agency)}
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {submission.product && submission.product.length ? (
                      <span className="text-xs text-ink">
                        {formatTeProductIds(submission.product, productLabelMap)}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${submissionStatusClass(submission.status)}`}
                    >
                      {t(`admin.te.status.${submission.status}`)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-right text-xs text-muted tabular-nums">
        {t('admin.te.totalCount', { count: totalCount })}
      </p>

      <PaginationStrip
        currentPage={currentPage}
        totalPages={totalPages}
        disabled={isLoading}
        onGoToPage={(page) => void goToPage(page)}
      />
    </div>
  )
}

interface TeUserCommunityTabProps {
  account: TeCommunityAccount
  onNavigate: (path: string) => void
}

/**
 * Lists this account's community posts (excluding soft-deleted).
 *
 * @param props - Account and navigation.
 * @returns Posts list.
 */
function TeUserCommunityTab({ account, onNavigate }: TeUserCommunityTabProps) {
  const { t } = useTranslation()
  const [posts, setPosts] = useState<TeCommunityPost[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    /**
     * Loads posts authored by this community account.
     */
    async function loadPosts(): Promise<void> {
      if (!isSupabaseConfigured) {
        setError(t('admin.teCommunity.errorNotConfigured'))
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await fromLoose('te_community_posts')
          .select(TE_COMMUNITY_POST_SELECT)
          .eq('community_account_id', account.id)
          .neq('status', 'deleted')
          .order('created_at', { ascending: false })

        if (fetchError) {
          throw fetchError
        }
        if (cancelled) {
          return
        }
        setPosts((data ?? []).map((row) => mapTeCommunityPostFromRow(row)))
      } catch (err) {
        console.error('TeUserCommunityTab loadPosts error:', err)
        if (!cancelled) {
          setError(t('admin.teCommunity.errorLoad'))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadPosts()
    return () => {
      cancelled = true
    }
  }, [account.id, t])

  return (
    <div className={detailSectionCardClass()}>
      {isLoading ? (
        <div className="py-10 text-center text-muted">
          <RefreshIcon className="mr-2 inline-block size-5 animate-spin" />
          {t('admin.teUsers.loading')}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-500">
          {error}
        </p>
      ) : posts.length === 0 ? (
        <div className="py-12 text-center">
          <LucideMessagesSquareIcon className="mx-auto mb-4 size-10 text-muted opacity-40" />
          <p className="text-sm font-medium text-muted">
            {t('admin.teCommunity.userPostsEmpty')}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {posts.map((post) => {
            const title =
              post.title?.trim() ||
              communityPostExcerpt(post.bodyMarkdown, 60) ||
              t('admin.teCommunity.untitled')
            return (
              <li key={post.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white/40 p-3 text-left transition-colors hover:bg-brand/5 dark:bg-white/5"
                  onClick={() => onNavigate(teCommunityDetailPath(post.id))}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{title}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {formatDisplayDateTime(post.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {post.reportCount > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                        {post.reportCount}
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${postStatusClass(post.status)}`}
                    >
                      {t(`admin.teCommunity.status.${post.status}`)}
                    </span>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
