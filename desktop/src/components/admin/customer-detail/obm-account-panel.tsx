/**
 * Shop dealer (NEXDOT) login panel for a CRM customer.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { EyeIcon, EyeOffIcon } from '@/icons/AllIcons'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import {
  SHOP_DEALER_PASSWORD_MIN_LENGTH,
  createShopDealer,
  isShopDealerApiConfigured,
  listShopDealers,
  updateShopDealer,
} from '@/services/shop-dealer-api'
import type { ShopDealerAccount } from '@/types/customer'

interface ObmAccountPanelProps {
  customerId: string
  groupId: string
  canCreate: boolean
  canUpdate: boolean
}

const fieldClass =
  'w-full rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink outline-none focus:border-brand disabled:opacity-50'

/**
 * Resolves workspace group id from prop or customers row.
 * @param customerId - CRM customer id.
 * @param groupId - Prop group id.
 * @returns Group UUID or empty string.
 */
async function resolveWorkspaceGroupId(
  customerId: string,
  groupId: string,
): Promise<string> {
  const fromProp = groupId.trim()
  if (fromProp) {
    return fromProp
  }
  if (!isSupabaseConfigured || !supabase || !customerId) {
    return ''
  }
  const { data, error } = await supabase
    .from('customers')
    .select('group_id')
    .eq('id', customerId)
    .maybeSingle()
  if (error || !data) {
    return ''
  }
  const gid = (data as { group_id?: string | null }).group_id
  return typeof gid === 'string' ? gid.trim() : ''
}

/**
 * OBM / shop dealer account tab (Vue customer-obm-account-panel parity).
 * @param props - Customer id, group, create/update gates.
 * @returns Panel UI.
 */
export function ObmAccountPanel({
  customerId,
  groupId,
  canCreate,
  canUpdate,
}: ObmAccountPanelProps) {
  const { t } = useTranslation()
  const apiConfigured = isShopDealerApiConfigured()

  const [resolvedGroupId, setResolvedGroupId] = useState('')
  const [dealer, setDealer] = useState<ShopDealerAccount | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [createUsername, setCreateUsername] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createPasswordConfirm, setCreatePasswordConfirm] = useState('')
  const [changePassword, setChangePassword] = useState('')
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const canCallApi =
    apiConfigured && Boolean(resolvedGroupId) && Boolean(customerId)

  const loadDealer = useCallback(async (): Promise<void> => {
    if (!apiConfigured || !customerId) {
      setDealer(null)
      setResolvedGroupId('')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const gid = await resolveWorkspaceGroupId(customerId, groupId)
      setResolvedGroupId(gid)
      if (!gid) {
        setDealer(null)
        return
      }
      const rows = await listShopDealers(gid)
      setDealer(rows.find((d) => d.customerId === customerId) ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDealer(null)
    } finally {
      setLoading(false)
    }
  }, [apiConfigured, customerId, groupId])

  useEffect(() => {
    setCreateUsername('')
    setCreatePassword('')
    setCreatePasswordConfirm('')
    setChangePassword('')
    setChangePasswordConfirm('')
    setSuccess(null)
    void loadDealer()
  }, [loadDealer])

  /**
   * Creates a dealer login for this customer.
   * @returns Nothing.
   */
  async function submitCreate(): Promise<void> {
    if (!canCreate || !canCallApi || saving) {
      return
    }
    const username = createUsername.trim()
    const password = createPassword
    if (!username || !password) {
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
    if (password !== createPasswordConfirm) {
      setError(t('admin.obmUsers.errorPasswordMismatch'))
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const created = await createShopDealer(resolvedGroupId, {
        customerId,
        loginUsername: username,
        password,
      })
      setDealer(created)
      setCreateUsername('')
      setCreatePassword('')
      setCreatePasswordConfirm('')
      setSuccess(t('admin.obmUsers.created'))
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err)
      if (code === 'customer_has_account') {
        setError(t('admin.obmUsers.errorCustomerHasAccount'))
      } else if (code === 'username_taken') {
        setError(t('admin.obmUsers.errorUsernameTaken'))
      } else {
        setError(code)
      }
    } finally {
      setSaving(false)
    }
  }

  /**
   * Toggles active status and persists immediately.
   * @returns Nothing.
   */
  async function toggleActive(): Promise<void> {
    if (!canUpdate || !dealer || !canCallApi || saving) {
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await updateShopDealer(resolvedGroupId, dealer.id, {
        isActive: !dealer.isActive,
      })
      setDealer(updated)
      setSuccess(t('admin.obmUsers.statusSaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Saves a new password for the linked dealer.
   * @returns Nothing.
   */
  async function submitPassword(): Promise<void> {
    if (!canUpdate || !dealer || !canCallApi) {
      return
    }
    if (changePassword.length < SHOP_DEALER_PASSWORD_MIN_LENGTH) {
      setError(
        t('admin.obmUsers.errorPasswordLength', {
          min: SHOP_DEALER_PASSWORD_MIN_LENGTH,
        }),
      )
      return
    }
    if (changePassword !== changePasswordConfirm) {
      setError(t('admin.obmUsers.errorPasswordMismatch'))
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await updateShopDealer(resolvedGroupId, dealer.id, {
        password: changePassword,
      })
      setDealer(updated)
      setChangePassword('')
      setChangePasswordConfirm('')
      setSuccess(t('admin.obmUsers.passwordSaved'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={detailSectionCardClass()}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-ink">
          {t('admin.customers.detail.obmAccountSectionTitle')}
        </h3>
        <button
          type="button"
          className="rounded-xl border border-ink/10 px-2.5 py-1.5 text-xs font-bold text-ink hover:border-brand/40 disabled:opacity-50"
          disabled={loading}
          onClick={() => void loadDealer()}
        >
          {t('admin.obmUsers.refresh')}
        </button>
      </div>

      {!apiConfigured ? (
        <p className="text-sm font-medium text-amber-600">
          {t('admin.obmUsers.apiNotConfigured')}
        </p>
      ) : null}
      {apiConfigured && !loading && !resolvedGroupId ? (
        <p className="text-sm font-medium text-amber-600">
          {t('admin.customers.detail.obmAccountMissingGroup')}
        </p>
      ) : null}
      {error ? <p className="mb-2 text-sm font-medium text-rose-500">{error}</p> : null}
      {success ? (
        <p className="mb-2 text-sm font-medium text-emerald-600">{success}</p>
      ) : null}

      {loading && !dealer ? (
        <p className="py-8 text-center text-sm font-medium text-muted">
          {t('admin.obmUsers.loading')}
        </p>
      ) : null}

      {!loading && dealer ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-muted">
                {t('admin.obmUsers.username')}
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                {dealer.loginUsername}
              </p>
            </div>
            {canUpdate ? (
              <button
                type="button"
                className={`rounded-md px-2 py-1 text-xs font-bold transition disabled:opacity-60 ${
                  dealer.isActive
                    ? 'text-emerald-600 hover:bg-emerald-500/10'
                    : 'text-muted hover:bg-ink/5'
                }`}
                disabled={saving}
                onClick={() => void toggleActive()}
              >
                {dealer.isActive
                  ? t('admin.obmUsers.active')
                  : t('admin.obmUsers.inactive')}
              </button>
            ) : (
              <span
                className={`text-xs font-bold ${
                  dealer.isActive ? 'text-emerald-600' : 'text-muted'
                }`}
              >
                {dealer.isActive
                  ? t('admin.obmUsers.active')
                  : t('admin.obmUsers.inactive')}
              </span>
            )}
          </div>

          {canUpdate ? (
            <div className="space-y-3 border-t border-ink/10 pt-4">
              <p className="text-sm font-bold text-ink">
                {t('admin.obmUsers.changePassword')}
              </p>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted">
                  {t('admin.obmUsers.password')}
                </span>
                <div className="relative">
                  <input
                    className={`${fieldClass} pr-10`}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={changePassword}
                    onChange={(e) => setChangePassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
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
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted">
                  {t('admin.obmUsers.passwordConfirm')}
                </span>
                <input
                  className={fieldClass}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={changePasswordConfirm}
                  onChange={(e) => setChangePasswordConfirm(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-60"
                disabled={saving || !changePassword}
                onClick={() => void submitPassword()}
              >
                {saving
                  ? t('admin.obmUsers.saving')
                  : t('admin.obmUsers.savePassword')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !dealer && canCallApi ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted">
            {t('admin.customers.detail.obmAccountEmpty')}
          </p>
          {canCreate ? (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted">
                  {t('admin.obmUsers.username')}
                </span>
                <input
                  className={fieldClass}
                  type="text"
                  autoComplete="off"
                  value={createUsername}
                  onChange={(e) => setCreateUsername(e.target.value)}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted">
                  {t('admin.obmUsers.password')}
                </span>
                <div className="relative">
                  <input
                    className={`${fieldClass} pr-10`}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
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
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-muted">
                  {t('admin.obmUsers.passwordConfirm')}
                </span>
                <input
                  className={fieldClass}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={createPasswordConfirm}
                  onChange={(e) => setCreatePasswordConfirm(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-60"
                disabled={saving}
                onClick={() => void submitCreate()}
              >
                {saving
                  ? t('admin.obmUsers.creating')
                  : t('admin.obmUsers.createSubmit')}
              </button>
            </>
          ) : (
            <p className="text-sm font-medium text-muted">
              {t('admin.customers.detail.obmAccountReadOnlyEmpty')}
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}
