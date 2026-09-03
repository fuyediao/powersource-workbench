/**
 * NEXDOT dealer user detail (profile / addresses).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { NexdotDealerAddressesPanel } from '@/components/admin/nexdot-dealer-addresses-panel'
import { SlidingSegmented } from '@/components/ui/sliding-segmented'
import { ArrowLeftIcon, EyeIcon, EyeOffIcon } from '@/icons/AllIcons'
import {
  SHOP_DEALER_PASSWORD_MIN_LENGTH,
  getShopDealer,
  isShopDealerApiConfigured,
  updateShopDealer,
} from '@/services/shop-dealer-api'
import type { ShopDealerAccount } from '@/types/customer'

type DetailTab = 'profile' | 'addresses'

interface NexdotUserDetailPaneProps {
  dealerId: string
  /** Workspace group from the list picker (AdminNexdotFlow); no second selector here. */
  workspaceGroupId: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Dealer account detail pane.
 * @param props - Dealer id, shared workspace group, writes, navigation.
 * @returns Detail UI.
 */
export function NexdotUserDetailPane({
  dealerId,
  workspaceGroupId,
  writes,
  onNavigate,
}: NexdotUserDetailPaneProps): ReactNode {
  const { t } = useTranslation()
  const apiConfigured = isShopDealerApiConfigured()
  const canEdit = Boolean(writes?.canEdit)
  const canWriteAny = Boolean(
    writes?.canCreate || writes?.canEdit || writes?.canDelete,
  )

  const [dealer, setDealer] = useState<ShopDealerAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<DetailTab>('profile')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!apiConfigured || !workspaceGroupId) {
      setDealer(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setDealer(await getShopDealer(workspaceGroupId, dealerId))
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      setError(
        msg === 'not_found' ? t('admin.obmUsers.notFound') : msg || t('admin.obmUsers.loading'),
      )
      setDealer(null)
    } finally {
      setLoading(false)
    }
  }, [apiConfigured, dealerId, t, workspaceGroupId])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Toggles dealer active flag.
   * @returns void
   */
  async function onToggleActive(): Promise<void> {
    if (!dealer || !workspaceGroupId || !canEdit || saving) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const updated = await updateShopDealer(workspaceGroupId, dealer.id, {
        isActive: !dealer.isActive,
      })
      setDealer(updated)
      setMessage(t('admin.obmUsers.statusSaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obmUsers.loading'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Saves a new password.
   * @returns void
   */
  async function onSavePassword(): Promise<void> {
    if (!dealer || !workspaceGroupId || !canEdit || saving) return
    setError(null)
    setMessage(null)
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
      const updated = await updateShopDealer(workspaceGroupId, dealer.id, {
        password,
      })
      setDealer(updated)
      setPassword('')
      setPasswordConfirm('')
      setMessage(t('admin.obmUsers.passwordSaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.obmUsers.loading'))
    } finally {
      setSaving(false)
    }
  }

  if (!apiConfigured) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
        <button
          type="button"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-brand transition hover:bg-brand/10"
          aria-label={t('admin.obmUsers.back')}
          onClick={() => onNavigate('/nexdot/users')}
        >
          <ArrowLeftIcon className="size-5" aria-hidden />
        </button>
        <p className="text-sm font-medium text-ink">{t('admin.obmUsers.apiNotConfigured')}</p>
      </div>
    )
  }

  if (!workspaceGroupId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
        <button
          type="button"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-brand transition hover:bg-brand/10"
          aria-label={t('admin.obmUsers.back')}
          onClick={() => onNavigate('/nexdot/users')}
        >
          <ArrowLeftIcon className="size-5" aria-hidden />
        </button>
        <p className="text-sm font-medium text-ink">{t('admin.obmUsers.noWorkspace')}</p>
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
              aria-label={t('admin.obmUsers.back')}
              onClick={() => onNavigate('/nexdot/users')}
            >
              <ArrowLeftIcon className="size-5" aria-hidden />
            </button>
            <h2 className="truncate text-xl font-extrabold tracking-tight text-ink">
              {dealer?.companyName?.trim() || t('admin.obmUsers.detailTitle')}
            </h2>
          </div>
          {dealer ? (
            <SlidingSegmented
              value={tab}
              ariaLabel={t('admin.obmUsers.tabsLabel')}
              options={[
                { value: 'profile', label: t('admin.obmUsers.tabProfile') },
                { value: 'addresses', label: t('admin.obmUsers.tabAddresses') },
              ]}
              className="w-52 shrink-0"
              onChange={setTab}
            />
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5 sm:p-6">
        {loading ? (
          <p className="text-sm font-medium text-ink">{t('admin.obmUsers.loading')}</p>
        ) : null}
        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-600">{message}</p> : null}

        {dealer ? (
          <>
          {tab === 'profile' ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:bg-zinc-950">
                <h3 className="text-sm font-bold text-ink">{t('admin.obmUsers.customerCard')}</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">{t('admin.obmUsers.colCustomer')}</dt>
                    <dd className="font-semibold text-ink">{dealer.companyName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">{t('admin.obmUsers.customerCode')}</dt>
                    <dd className="font-medium text-ink">{dealer.customerCode || '—'}</dd>
                  </div>
                </dl>
              </section>

              <section className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:bg-zinc-950">
                <h3 className="text-sm font-bold text-ink">{t('admin.obmUsers.accountCard')}</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted">{t('admin.obmUsers.username')}</dt>
                    <dd className="font-semibold text-ink">{dealer.loginUsername}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">{t('admin.obmUsers.colStatus')}</span>
                    <button
                      type="button"
                      className="rounded-lg border border-ink/15 px-2 py-1 text-xs font-semibold disabled:opacity-50"
                      disabled={!canEdit || saving}
                      onClick={() => void onToggleActive()}
                    >
                      {dealer.isActive
                        ? t('admin.obmUsers.active')
                        : t('admin.obmUsers.inactive')}
                    </button>
                  </div>
                </dl>
                {canEdit ? (
                  <div className="mt-4 space-y-2 border-t border-ink/10 pt-4">
                    <p className="text-xs font-semibold text-muted">
                      {t('admin.obmUsers.changePassword')}
                    </p>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 pr-10 text-sm dark:bg-zinc-900"
                        placeholder={t('admin.obmUsers.password')}
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
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm dark:bg-zinc-900"
                      placeholder={t('admin.obmUsers.passwordConfirm')}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                      disabled={saving}
                      onClick={() => void onSavePassword()}
                    >
                      {saving
                        ? t('admin.obmUsers.saving')
                        : t('admin.obmUsers.savePassword')}
                    </button>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {tab === 'addresses' ? (
            <div className="space-y-3">
              <p className="text-xs text-muted">{t('admin.obmUsers.addressesHint')}</p>
              <NexdotDealerAddressesPanel
                workspaceGroupId={workspaceGroupId}
                dealerId={dealer.id}
                canEdit={canWriteAny}
              />
            </div>
          ) : null}
        </>
      ) : null}
      </div>
    </div>
  )
}
