/**
 * Admin agent sales-rep detail / create pane: profile plus login account.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import { ArrowLeftIcon, MailIcon, PhoneIcon } from '@/icons/AllIcons'
import {
  createAgentSalesRep,
  deleteAgentSalesRep,
  listAgentSalesReps,
  updateAgentSalesRep,
  type AgentSalesRep,
  type AgentSalesRepInput,
} from '@/services/agents-api'
import { agentCompanyPath, agentSalesRepPath } from '@/utils/agent-routes'
import { openMailCompose } from '@/utils/mail/mail-compose-request'
import { openExternalUrl } from '@/utils/shared/api'

interface AgentSalesRepPaneProps {
  companyId: string
  /** Null when creating a new rep. */
  repId: string | null
  workspaceGroupId: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

const labelClass = 'text-xs font-bold tracking-wide text-muted uppercase'

/** Minimum password length; keep in sync with the proxy backend. */
const AGENT_PASSWORD_MIN_LENGTH = 8

/**
 * Builds a blank sales-rep form model.
 * @returns Empty rep input.
 */
function emptyForm(): AgentSalesRepInput {
  return {
    fullName: null,
    phone: null,
    mobile: null,
    email: null,
    notes: null,
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
 * Sales-rep profile and login account editor.
 * @param props - Ids, workspace group, writes, and navigation.
 * @returns Sales-rep UI.
 */
export function AgentSalesRepPane({
  companyId,
  repId,
  workspaceGroupId,
  writes,
  onNavigate,
}: AgentSalesRepPaneProps) {
  const { t } = useTranslation()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)
  const isCreate = repId === null
  const fieldsEditable = canEdit || isCreate
  const showContactLinks = !fieldsEditable

  const [rep, setRep] = useState<AgentSalesRep | null>(null)
  const [form, setForm] = useState<AgentSalesRepInput>(emptyForm)
  const [loginUsername, setLoginUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(!isCreate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Loads the sales rep from the company rep list.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    if (isCreate || !workspaceGroupId) {
      if (!workspaceGroupId && !isCreate) {
        setError(t('admin.agent.noWorkspaceGroup'))
        setLoading(false)
      }
      return
    }
    setLoading(true)
    setError(null)
    try {
      const reps = await listAgentSalesReps(workspaceGroupId, companyId)
      const found = reps.find((row) => row.id === repId) ?? null
      if (!found) {
        setError(t('admin.agent.errorLoad'))
        return
      }
      setRep(found)
      setForm({
        fullName: found.fullName,
        phone: found.phone,
        mobile: found.mobile,
        email: found.email,
        notes: found.notes,
      })
      setLoginUsername(found.loginUsername ?? '')
    } catch (err) {
      console.error('[AgentSalesRepPane] load:', err)
      setError(t('admin.agent.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [companyId, isCreate, repId, t, workspaceGroupId])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Updates one form field.
   * @param patch - Partial form values.
   * @returns Nothing.
   */
  function patchForm(patch: Partial<AgentSalesRepInput>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  /**
   * Saves the sales rep profile and optional account changes.
   * @returns Nothing.
   */
  async function submit(): Promise<void> {
    if (saving || !workspaceGroupId) {
      return
    }
    const wantsAccount = Boolean(loginUsername.trim() || password.trim())
    if (
      wantsAccount &&
      password.trim() &&
      password.trim().length < AGENT_PASSWORD_MIN_LENGTH
    ) {
      setError(
        t('admin.agent.errorPasswordTooShort', {
          min: AGENT_PASSWORD_MIN_LENGTH,
        }),
      )
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (isCreate) {
        if (!canCreate) {
          return
        }
        const created = await createAgentSalesRep(
          workspaceGroupId,
          companyId,
          form,
          loginUsername.trim() && password.trim()
            ? {
                loginUsername: loginUsername.trim(),
                password: password.trim(),
              }
            : undefined,
        )
        setPassword('')
        onNavigate(agentSalesRepPath(companyId, created.id))
        return
      }
      if (!canEdit || !repId) {
        return
      }
      const updated = await updateAgentSalesRep(
        workspaceGroupId,
        companyId,
        repId,
        form,
        {
          ...(loginUsername.trim() ? { loginUsername: loginUsername.trim() } : {}),
          ...(password.trim() ? { password: password.trim() } : {}),
        },
      )
      setRep(updated)
      setPassword('')
    } catch (err) {
      console.error('[AgentSalesRepPane] save:', err)
      setError(t('admin.agent.errorUpdate'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Toggles the rep login account between active and inactive.
   * @returns Nothing.
   */
  async function toggleActive(): Promise<void> {
    if (!rep?.accountId || !repId || !workspaceGroupId || !canEdit || saving) {
      return
    }
    setSaving(true)
    try {
      const updated = await updateAgentSalesRep(
        workspaceGroupId,
        companyId,
        repId,
        form,
        { isActive: !rep.isActive },
      )
      setRep(updated)
    } catch (err) {
      console.error('[AgentSalesRepPane] toggle:', err)
      setError(t('admin.agent.errorUpdate'))
    } finally {
      setSaving(false)
    }
  }

  /**
   * Deletes the sales rep and returns to the company detail.
   * @returns Nothing.
   */
  async function remove(): Promise<void> {
    if (!repId || !workspaceGroupId || !canDelete || saving) {
      return
    }
    setSaving(true)
    try {
      await deleteAgentSalesRep(workspaceGroupId, companyId, repId)
      onNavigate(agentCompanyPath(companyId))
    } catch (err) {
      console.error('[AgentSalesRepPane] delete:', err)
      setError(t('admin.agent.errorDelete'))
    } finally {
      setSaving(false)
    }
  }

  const title = isCreate
    ? t('admin.agent.addSalesRep')
    : rep?.fullName || rep?.loginUsername || t('admin.agent.sectionSalesReps')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.agent.backToCompany')}
          aria-label={t('admin.agent.backToCompany')}
          onClick={() => onNavigate(agentCompanyPath(companyId))}
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold text-brand">
          {title}
        </h1>
        {!isCreate && rep?.accountId && canEdit ? (
          <button
            type="button"
            disabled={saving}
            className="shrink-0 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
            onClick={() => void toggleActive()}
          >
            {rep.isActive
              ? t('admin.agent.statusInactive')
              : t('admin.agent.statusActive')}
          </button>
        ) : null}
        {!isCreate && canDelete ? (
          <button
            type="button"
            disabled={saving}
            className="shrink-0 rounded-2xl border border-rose-400/40 px-3 py-2 text-sm font-bold text-rose-500 disabled:opacity-50"
            onClick={() => void remove()}
          >
            {t('admin.agent.delete')}
          </button>
        ) : null}
        {canEdit || (isCreate && canCreate) ? (
          <button
            type="button"
            disabled={saving}
            className="shrink-0 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
            onClick={() => void submit()}
          >
            {saving ? t('admin.kolDetail.saving') : t('admin.agent.save')}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
        {error ? (
          <p className="text-sm font-medium text-rose-500">{error}</p>
        ) : null}
        {loading ? (
          <p className="text-sm font-medium text-muted">{t('status.loading')}</p>
        ) : null}

        {!loading ? (
          <>
            <section className={detailSectionCardClass()}>
              <h2 className="mb-3 text-sm font-extrabold text-ink">
                {t('admin.agent.sectionRepProfile')}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.agent.field.fullName')}
                  </span>
                  <input
                    type="text"
                    value={form.fullName ?? ''}
                    disabled={!canEdit && !isCreate}
                    onChange={(e) =>
                      patchForm({ fullName: textValue(e.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>{t('admin.agent.field.email')}</span>
                  {showContactLinks ? (
                    form.email?.trim() ? (
                      <button
                        type="button"
                        className="block text-left text-sm font-medium text-brand hover:underline"
                        onClick={() => {
                          const address = form.email!.trim()
                          const name = (form.fullName ?? '').trim()
                          openMailCompose({
                            to: name ? `${name} <${address}>` : address,
                          })
                        }}
                      >
                        {form.email.trim()}
                      </button>
                    ) : (
                      <p className="text-sm text-ink/80">—</p>
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={form.email ?? ''}
                        disabled={!fieldsEditable}
                        onChange={(e) =>
                          patchForm({ email: textValue(e.target.value) })
                        }
                        className={`${inputClass} min-w-0 flex-1`}
                      />
                      {!isCreate && form.email?.trim() ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-xl border border-ink/10 p-2 text-brand hover:bg-brand/10"
                          aria-label={t('admin.agent.field.email')}
                          onClick={() => {
                            const address = form.email!.trim()
                            const name = (form.fullName ?? '').trim()
                            openMailCompose({
                              to: name ? `${name} <${address}>` : address,
                            })
                          }}
                        >
                          <MailIcon className="size-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  )}
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>{t('admin.agent.field.phone')}</span>
                  {showContactLinks ? (
                    form.phone?.trim() ? (
                      <button
                        type="button"
                        className="block text-left text-sm font-medium text-brand hover:underline"
                        onClick={() => {
                          const dialable = form.phone!.trim().replace(/[\s()-]/g, '')
                          if (dialable) {
                            void openExternalUrl(`tel:${dialable}`)
                          }
                        }}
                      >
                        {form.phone.trim()}
                      </button>
                    ) : (
                      <p className="text-sm text-ink/80">—</p>
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        value={form.phone ?? ''}
                        disabled={!fieldsEditable}
                        onChange={(e) =>
                          patchForm({ phone: textValue(e.target.value) })
                        }
                        className={`${inputClass} min-w-0 flex-1`}
                      />
                      {!isCreate && form.phone?.trim() ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-xl border border-ink/10 p-2 text-brand hover:bg-brand/10"
                          aria-label={t('admin.agent.field.phone')}
                          onClick={() => {
                            const dialable = form.phone!.trim().replace(
                              /[\s()-]/g,
                              '',
                            )
                            if (dialable) {
                              void openExternalUrl(`tel:${dialable}`)
                            }
                          }}
                        >
                          <PhoneIcon className="size-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  )}
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {t('admin.agent.field.mobile')}
                  </span>
                  {showContactLinks ? (
                    form.mobile?.trim() ? (
                      <button
                        type="button"
                        className="block text-left text-sm font-medium text-brand hover:underline"
                        onClick={() => {
                          const dialable = form.mobile!.trim().replace(/[\s()-]/g, '')
                          if (dialable) {
                            void openExternalUrl(`tel:${dialable}`)
                          }
                        }}
                      >
                        {form.mobile.trim()}
                      </button>
                    ) : (
                      <p className="text-sm text-ink/80">—</p>
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        value={form.mobile ?? ''}
                        disabled={!fieldsEditable}
                        onChange={(e) =>
                          patchForm({ mobile: textValue(e.target.value) })
                        }
                        className={`${inputClass} min-w-0 flex-1`}
                      />
                      {!isCreate && form.mobile?.trim() ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-xl border border-ink/10 p-2 text-brand hover:bg-brand/10"
                          aria-label={t('admin.agent.field.mobile')}
                          onClick={() => {
                            const dialable = form.mobile!.trim().replace(
                              /[\s()-]/g,
                              '',
                            )
                            if (dialable) {
                              void openExternalUrl(`tel:${dialable}`)
                            }
                          }}
                        >
                          <PhoneIcon className="size-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  )}
                </label>
                <label className="block space-y-1.5 sm:col-span-2">
                  <span className={labelClass}>{t('admin.agent.field.notes')}</span>
                  <textarea
                    rows={3}
                    value={form.notes ?? ''}
                    disabled={!canEdit && !isCreate}
                    onChange={(e) =>
                      patchForm({ notes: textValue(e.target.value) })
                    }
                    className={inputClass}
                  />
                </label>
              </div>
            </section>

            <section className={detailSectionCardClass()}>
              <h2 className="mb-3 text-sm font-extrabold text-ink">
                {t('admin.agent.sectionAccount')}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className={labelClass}>{t('admin.agent.username')}</span>
                  <input
                    type="text"
                    value={loginUsername}
                    disabled={!canEdit && !isCreate}
                    placeholder={t('admin.agent.usernamePlaceholder')}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>
                    {rep?.accountId
                      ? t('admin.agent.passwordNew')
                      : t('admin.agent.password')}
                  </span>
                  <input
                    type="password"
                    value={password}
                    disabled={!canEdit && !isCreate}
                    placeholder={t('admin.agent.passwordPlaceholder')}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <p className="text-xs font-medium text-muted sm:col-span-2">
                  {t('admin.agent.passwordHint')}
                </p>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  )
}
