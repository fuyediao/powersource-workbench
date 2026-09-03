/**
 * NEXDOT dealer users list + create modal.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { EyeIcon, EyeOffIcon, PlusIcon, RefreshIcon } from '@/icons/AllIcons'
import { listCustomers } from '@/services/customers-api'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import {
  SHOP_DEALER_PASSWORD_MIN_LENGTH,
  createShopDealer,
  isShopDealerApiConfigured,
  listShopDealers,
} from '@/services/shop-dealer-api'
import type { CustomerListItem, ShopDealerAccount } from '@/types/customer'
import { formatDisplayDateTime } from '@/utils/format-display-date'

interface NexdotUsersPaneProps {
  writes: AdminShellWrites | null
  /** Active workspace group (shared with dealer detail via AdminNexdotFlow). */
  workspaceGroupId: string | null
  /** System-admin group picker updates the shared override. */
  onWorkspaceGroupChange: (groupId: string | null) => void
  onNavigate: (path: string) => void
}

/**
 * Dealer account list for the NEXDOT Function (web AdminObmUsersView parity).
 * @param props - Writes, shared workspace group, and navigation.
 * @returns List UI.
 */
export function NexdotUsersPane({
  writes,
  workspaceGroupId,
  onWorkspaceGroupChange,
  onNavigate,
}: NexdotUsersPaneProps): ReactNode {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const apiConfigured = isShopDealerApiConfigured()
  const canCreate = Boolean(writes?.canCreate)

  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [dealers, setDealers] = useState<ShopDealerAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    if (!domainWrites.isSystemAdmin) return
    let cancelled = false
    void listGroups()
      .then((rows) => {
        if (cancelled) return
        setGroups(rows)
        if (workspaceGroupId && rows.some((g) => g.id === workspaceGroupId)) {
          return
        }
        if (domainWrites.groupId && rows.some((g) => g.id === domainWrites.groupId)) {
          onWorkspaceGroupChange(domainWrites.groupId)
          return
        }
        onWorkspaceGroupChange(rows[0]?.id ?? null)
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
    return () => {
      cancelled = true
    }
  }, [
    domainWrites.groupId,
    domainWrites.isSystemAdmin,
    onWorkspaceGroupChange,
    workspaceGroupId,
  ])

  const loadDealers = useCallback(async (): Promise<void> => {
    if (!apiConfigured || !workspaceGroupId) {
      setDealers([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      setDealers(await listShopDealers(workspaceGroupId))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obmUsers.loading'))
      setDealers([])
    } finally {
      setLoading(false)
    }
  }, [apiConfigured, t, workspaceGroupId])

  useEffect(() => {
    void loadDealers()
  }, [loadDealers])

  if (!apiConfigured) {
    return (
      <p className="p-6 text-sm font-medium text-ink">{t('admin.obmUsers.apiNotConfigured')}</p>
    )
  }

  if (!workspaceGroupId) {
    return <p className="p-6 text-sm font-medium text-ink">{t('admin.obmUsers.noWorkspace')}</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight text-ink">
          {t('admin.obmUsers.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {domainWrites.isSystemAdmin ? (
            <CrmFilterSelect
              className="!w-auto min-w-40 max-w-56"
              size="sm"
              value={workspaceGroupId}
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              ariaLabel={t('admin.obmUsers.title')}
              onChange={onWorkspaceGroupChange}
            />
          ) : null}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold"
            onClick={() => void loadDealers()}
          >
            <RefreshIcon className="size-3.5" />
            {t('admin.obmUsers.refresh')}
          </button>
          {canCreate ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg"
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              {t('admin.obmUsers.create')}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      {loading ? (
        <p className="text-sm font-medium text-ink">{t('admin.obmUsers.loading')}</p>
      ) : dealers.length === 0 ? (
        <p className="text-sm text-muted">{t('admin.obmUsers.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm dark:bg-zinc-950">
          <table className="w-full min-w-[640px] border-collapse text-sm text-ink">
            <thead>
              <tr className="border-b border-ink/10 bg-zinc-100 text-left text-xs font-semibold dark:bg-zinc-900">
                <th className="px-4 py-2.5">{t('admin.obmUsers.colCustomer')}</th>
                <th className="px-4 py-2.5">{t('admin.obmUsers.colUsername')}</th>
                <th className="px-4 py-2.5">{t('admin.obmUsers.colStatus')}</th>
                <th className="px-4 py-2.5">{t('admin.obmUsers.colCreated')}</th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((dealer) => (
                <tr
                  key={dealer.id}
                  className="cursor-pointer border-t border-ink/10 hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                  onClick={() =>
                    onNavigate(`/nexdot/users/${encodeURIComponent(dealer.id)}`)
                  }
                >
                  <td className="px-4 py-2.5">
                    <p className="font-semibold">{dealer.companyName || '—'}</p>
                    <p className="text-xs text-muted">{dealer.customerCode}</p>
                  </td>
                  <td className="px-4 py-2.5">{dealer.loginUsername}</td>
                  <td className="px-4 py-2.5">
                    {dealer.isActive
                      ? t('admin.obmUsers.active')
                      : t('admin.obmUsers.inactive')}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-muted">
                    {formatDisplayDateTime(dealer.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && workspaceGroupId ? (
        <CreateDealerModal
          workspaceGroupId={workspaceGroupId}
          existingCustomerIds={new Set(dealers.map((d) => d.customerId))}
          isSystemAdmin={domainWrites.isSystemAdmin}
          onClose={() => setCreateOpen(false)}
          onCreated={(dealer) => {
            setCreateOpen(false)
            onNavigate(`/nexdot/users/${encodeURIComponent(dealer.id)}`)
          }}
        />
      ) : null}
    </div>
  )
}

interface CreateDealerModalProps {
  workspaceGroupId: string
  existingCustomerIds: Set<string>
  isSystemAdmin: boolean
  onClose: () => void
  onCreated: (dealer: ShopDealerAccount) => void
}

/**
 * Modal to create a shop dealer login for a CRM customer.
 * @param props - Workspace and callbacks.
 * @returns Modal UI.
 */
function CreateDealerModal({
  workspaceGroupId,
  existingCustomerIds,
  isSystemAdmin,
  onClose,
  onCreated,
}: CreateDealerModalProps): ReactNode {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<CustomerListItem[]>([])
  const [selected, setSelected] = useState<CustomerListItem | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCustomerQueryChange = useCallback((query: string) => {
    setSearch(query)
  }, [])

  useEffect(() => {
    const query = search.trim()
    if (!query) {
      setCustomers([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(() => {
      void listCustomers({
        page: 1,
        pageSize: 20,
        searchQuery: query,
        groupId: workspaceGroupId,
        isSystemAdmin,
      })
        .then((result) => {
          if (cancelled) return
          setCustomers(
            result.rows.filter((c) => !existingCustomerIds.has(c.id)),
          )
        })
        .catch(() => {
          if (!cancelled) setCustomers([])
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [existingCustomerIds, isSystemAdmin, search, workspaceGroupId])

  const customerOptions = useMemo<CrmFilterOption[]>(() => {
    const byId = new Map<string, CrmFilterOption>()
    if (selected) {
      byId.set(selected.id, {
        value: selected.id,
        label: selected.companyName,
        description: selected.customerCode ?? undefined,
      })
    }
    for (const row of customers) {
      if (byId.has(row.id)) continue
      byId.set(row.id, {
        value: row.id,
        label: row.companyName,
        description: row.customerCode ?? undefined,
      })
    }
    const rows = [...byId.values()]
    if (selected) {
      return [
        { value: '', label: t('admin.obmUsers.clearCustomer') },
        ...rows,
      ]
    }
    return rows
  }, [customers, selected, t])

  /**
   * Submits create dealer form.
   * @returns void
   */
  async function onSubmit(): Promise<void> {
    setError(null)
    if (!selected || !username.trim() || !password) {
      setError(t('admin.obmUsers.errorFieldsRequired'))
      return
    }
    if (password.length < SHOP_DEALER_PASSWORD_MIN_LENGTH) {
      setError(
        t('admin.obmUsers.errorPasswordLength', {
          min: SHOP_DEALER_PASSWORD_MIN_LENGTH,
        }),
      )
      return
    }
    if (password !== passwordConfirm) {
      setError(t('admin.obmUsers.errorPasswordMismatch'))
      return
    }
    setSaving(true)
    try {
      const dealer = await createShopDealer(workspaceGroupId, {
        customerId: selected.id,
        loginUsername: username.trim(),
        password,
      })
      onCreated(dealer)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('customer_has_account')) {
        setError(t('admin.obmUsers.errorCustomerHasAccount'))
      } else if (msg.includes('username_taken')) {
        setError(t('admin.obmUsers.errorUsernameTaken'))
      } else {
        setError(msg || t('admin.obmUsers.loading'))
      }
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-xl dark:bg-zinc-950">
        <div className="border-b border-ink/10 px-4 py-3">
          <h3 className="text-sm font-bold text-ink">{t('admin.obmUsers.createTitle')}</h3>
        </div>
        <div className="space-y-3 overflow-auto p-4">
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
          <div className="min-w-0 space-y-1.5">
            <span className="block text-xs font-semibold text-muted">
              {t('admin.obmUsers.pickCustomer')}
            </span>
            <CrmFilterSelect
              className="w-full"
              value={selected?.id ?? ''}
              options={customerOptions}
              searchable
              placeholder={t('admin.obmUsers.pickCustomerPlaceholder')}
              searchPlaceholder={t('admin.obmUsers.customerSearchPlaceholder')}
              closeAriaLabel={t('common.inlineSearchComboboxClose')}
              emptyLabel={
                search.trim()
                  ? t('admin.obmUsers.noCustomers')
                  : t('admin.obmUsers.customerSearchHint')
              }
              ariaLabel={t('admin.obmUsers.pickCustomer')}
              filterOption={() => true}
              onQueryChange={onCustomerQueryChange}
              onChange={(nextId) => {
                if (!nextId) {
                  setSelected(null)
                  return
                }
                const fromResults = customers.find((row) => row.id === nextId)
                if (fromResults) {
                  setSelected(fromResults)
                  return
                }
                if (selected?.id === nextId) {
                  return
                }
                setSelected(null)
              }}
            />
          </div>
          <label className="block text-xs font-semibold text-muted">
            {t('admin.obmUsers.username')}
            <input
              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink dark:bg-zinc-900"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-semibold text-muted">
            {t('admin.obmUsers.password')}
            <div className="relative mt-1">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 pr-10 text-sm text-ink dark:bg-zinc-900"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
          </label>
          <label className="block text-xs font-semibold text-muted">
            {t('admin.obmUsers.passwordConfirm')}
            <input
              type={showPassword ? 'text' : 'password'}
              className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink dark:bg-zinc-900"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink/10 px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold"
            onClick={onClose}
          >
            {t('admin.obmUsers.cancel')}
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
            disabled={saving}
            onClick={() => void onSubmit()}
          >
            {saving ? t('admin.obmUsers.creating') : t('admin.obmUsers.createSubmit')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
