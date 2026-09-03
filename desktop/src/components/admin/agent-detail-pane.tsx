/**
 * Admin agent company detail / create pane: profile, login account, sales reps.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import {
  dash,
  detailSectionCardClass,
} from '@/components/admin/customer-detail/detail-shared'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { ArrowLeftIcon, PlusIcon } from '@/icons/AllIcons'
import {
  createAgentAccount,
  createAgentCompany,
  getAgentCompany,
  listAgentSalesReps,
  updateAgentAccount,
  updateAgentCompany,
  type AgentCompanyInput,
  type AgentDetail,
  type AgentSalesRep,
} from '@/services/agents-api'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import {
  agentCompanyPath,
  agentSalesRepPath,
  agentsListPath,
} from '@/utils/agent-routes'
import { openMailCompose } from '@/utils/mail/mail-compose-request'
import { openExternalUrl } from '@/utils/shared/api'

interface AgentDetailPaneProps {
  mode: 'create' | 'detail'
  companyId: string | null
  workspaceGroupId: string | null
  /** Updates the shared workspace group (system-admin create / list sync). */
  onWorkspaceGroupChange?: (groupId: string | null) => void
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

const inputClass =
  'w-full rounded-2xl border border-ink/10 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5'

const labelClass = 'text-xs font-bold tracking-wide text-muted uppercase'

/** Minimum password length; keep in sync with the proxy backend. */
const AGENT_PASSWORD_MIN_LENGTH = 8

/**
 * Builds a blank company form model.
 * @returns Empty company input.
 */
function emptyForm(): AgentCompanyInput {
  return {
    companyName: '',
    shortName: null,
    phone: null,
    fax: null,
    email: null,
    website: null,
    companyCountry: null,
    companyState: null,
    companyCity: null,
    companyPostalCode: null,
    companyAddressLine1: null,
    companyAddressLine2: null,
    taxId: null,
    primaryContactName: null,
    description: null,
  }
}

/**
 * Maps a loaded company to the editable form model.
 * @param detail - Loaded detail.
 * @returns Company input.
 */
function formFromDetail(detail: AgentDetail): AgentCompanyInput {
  const { company } = detail
  return {
    companyName: company.companyName,
    shortName: company.shortName,
    phone: company.phone,
    fax: company.fax,
    email: company.email,
    website: company.website,
    companyCountry: company.companyCountry,
    companyState: company.companyState,
    companyCity: company.companyCity,
    companyPostalCode: company.companyPostalCode,
    companyAddressLine1: company.companyAddressLine1,
    companyAddressLine2: company.companyAddressLine2,
    taxId: company.taxId,
    primaryContactName: company.primaryContactName,
    description: company.description,
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
 * Agent company detail with in-place edit, login account, and sales reps.
 * @param props - Mode, ids, workspace group, writes, and navigation.
 * @returns Detail UI.
 */
export function AgentDetailPane({
  mode,
  companyId,
  workspaceGroupId,
  onWorkspaceGroupChange,
  writes,
  onNavigate,
}: AgentDetailPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)

  const [detail, setDetail] = useState<AgentDetail | null>(null)
  const [form, setForm] = useState<AgentCompanyInput>(emptyForm)
  const [salesReps, setSalesReps] = useState<AgentSalesRep[]>([])
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [loading, setLoading] = useState(mode === 'detail')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(mode === 'create')
  const [error, setError] = useState<string | null>(null)

  const [accountUsername, setAccountUsername] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)

  const groupOptions = useMemo(
    () => groups.map((group) => ({ value: group.id, label: group.name })),
    [groups],
  )

  /**
   * Loads system-admin group options and defaults the create workspace group.
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
        if (workspaceGroupId && rows.some((group) => group.id === workspaceGroupId)) {
          return
        }
        const preferred =
          domainWrites.groupId &&
          rows.some((group) => group.id === domainWrites.groupId)
            ? domainWrites.groupId
            : rows[0]?.id
        if (preferred) {
          onWorkspaceGroupChange?.(preferred)
        }
      })
      .catch((err) => {
        console.error('[AgentDetailPane] listGroups:', err)
        if (!cancelled) {
          setGroups([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [
    domainWrites.groupId,
    domainWrites.isSystemAdmin,
    mode,
    onWorkspaceGroupChange,
    workspaceGroupId,
  ])

  /**
   * Loads the company, its account, and its sales reps.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    if (mode !== 'detail' || !companyId) {
      return
    }
    if (!workspaceGroupId) {
      setError(t('admin.agent.noWorkspaceGroup'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [company, reps] = await Promise.all([
        getAgentCompany(workspaceGroupId, companyId),
        listAgentSalesReps(workspaceGroupId, companyId).catch(
          () => [] as AgentSalesRep[],
        ),
      ])
      setDetail(company)
      setForm(formFromDetail(company))
      setSalesReps(reps)
    } catch (err) {
      console.error('[AgentDetailPane] load:', err)
      setError(t('admin.agent.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [companyId, mode, t, workspaceGroupId])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Updates one company form field.
   * @param patch - Partial form values.
   * @returns Nothing.
   */
  function patchForm(patch: Partial<AgentCompanyInput>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  /**
   * Saves the create or update form.
   * @returns Nothing.
   */
  async function submit(): Promise<void> {
    if (saving) {
      return
    }
    if (!form.companyName.trim()) {
      setError(t('admin.agent.errorCompanyNameRequired'))
      return
    }
    const groupId = workspaceGroupId ?? domainWrites.groupId
    if (!groupId) {
      setError(t('admin.agent.noWorkspaceGroup'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        if (!canCreate) {
          return
        }
        const created = await createAgentCompany(groupId, form)
        onNavigate(agentCompanyPath(created.company.id))
        return
      }
      if (!canEdit || !companyId) {
        return
      }
      const updated = await updateAgentCompany(groupId, companyId, form)
      setDetail(updated)
      setForm(formFromDetail(updated))
      setEditing(false)
    } catch (err) {
      console.error('[AgentDetailPane] save:', err)
      setError(
        mode === 'create'
          ? t('admin.agent.errorCreate')
          : t('admin.agent.errorUpdate'),
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Creates the company login account, or resets its password.
   * @returns Nothing.
   */
  async function submitAccount(): Promise<void> {
    if (!companyId || !workspaceGroupId || accountSaving || !canEdit) {
      return
    }
    if (accountPassword.trim().length < AGENT_PASSWORD_MIN_LENGTH) {
      setError(
        t('admin.agent.errorPasswordTooShort', {
          min: AGENT_PASSWORD_MIN_LENGTH,
        }),
      )
      return
    }
    setAccountSaving(true)
    setError(null)
    try {
      if (detail?.account) {
        const account = await updateAgentAccount(workspaceGroupId, companyId, {
          password: accountPassword.trim(),
        })
        setDetail((prev) => (prev ? { ...prev, account } : prev))
      } else {
        if (!accountUsername.trim()) {
          setError(t('admin.agent.errorUsernameRequired'))
          return
        }
        const account = await createAgentAccount(workspaceGroupId, companyId, {
          loginUsername: accountUsername.trim(),
          password: accountPassword.trim(),
        })
        setDetail((prev) => (prev ? { ...prev, account } : prev))
      }
      setAccountUsername('')
      setAccountPassword('')
    } catch (err) {
      console.error('[AgentDetailPane] account:', err)
      setError(t('admin.agent.errorUpdate'))
    } finally {
      setAccountSaving(false)
    }
  }

  const title =
    mode === 'create'
      ? t('admin.agent.newPageTitle')
      : detail?.company.companyName || t('admin.agent.title')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-ink/10 bg-white/80 px-4 py-3 backdrop-blur-md dark:bg-zinc-950/80">
        <button
          type="button"
          className="rounded-xl p-2 text-brand hover:bg-brand/10"
          title={t('admin.agent.backToList')}
          aria-label={t('admin.agent.backToList')}
          onClick={() => onNavigate(agentsListPath())}
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
                value={workspaceGroupId ?? ''}
                options={groupOptions}
                ariaLabel={t('admin.agent.manageGroupLabel')}
                emptyLabel={t('admin.agent.noWorkspaceGroup')}
                disabled={groupOptions.length === 0}
                onChange={(next) => onWorkspaceGroupChange?.(next || null)}
              />
            ) : null}
            {mode === 'detail' ? (
              <button
                type="button"
                disabled={saving}
                className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={() => {
                  if (detail) {
                    setForm(formFromDetail(detail))
                  }
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
              {saving ? t('admin.kolDetail.saving') : t('admin.agent.save')}
            </button>
          </div>
        ) : canEdit ? (
          <button
            type="button"
            className="shrink-0 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            onClick={() => setEditing(true)}
          >
            {t('admin.kolDetail.edit')}
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
                {t('admin.agent.sectionInfo')}
              </h2>
              {editing ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.col.company')}{' '}
                      <span className="text-rose-500" aria-hidden>
                        *
                      </span>
                    </span>
                    <input
                      type="text"
                      value={form.companyName}
                      onChange={(e) => patchForm({ companyName: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.shortName')}
                    </span>
                    <input
                      type="text"
                      value={form.shortName ?? ''}
                      onChange={(e) =>
                        patchForm({ shortName: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.primaryContactName')}
                    </span>
                    <input
                      type="text"
                      value={form.primaryContactName ?? ''}
                      onChange={(e) =>
                        patchForm({
                          primaryContactName: textValue(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.email')}
                    </span>
                    <input
                      type="email"
                      value={form.email ?? ''}
                      onChange={(e) =>
                        patchForm({ email: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.phone')}
                    </span>
                    <input
                      type="tel"
                      value={form.phone ?? ''}
                      onChange={(e) =>
                        patchForm({ phone: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.website')}
                    </span>
                    <input
                      type="url"
                      value={form.website ?? ''}
                      onChange={(e) =>
                        patchForm({ website: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.taxId')}
                    </span>
                    <input
                      type="text"
                      value={form.taxId ?? ''}
                      onChange={(e) =>
                        patchForm({ taxId: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.col.country')}
                    </span>
                    <input
                      type="text"
                      value={form.companyCountry ?? ''}
                      onChange={(e) =>
                        patchForm({ companyCountry: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.state')}
                    </span>
                    <input
                      type="text"
                      value={form.companyState ?? ''}
                      onChange={(e) =>
                        patchForm({ companyState: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.city')}
                    </span>
                    <input
                      type="text"
                      value={form.companyCity ?? ''}
                      onChange={(e) =>
                        patchForm({ companyCity: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className={labelClass}>
                      {t('admin.agent.field.postalCode')}
                    </span>
                    <input
                      type="text"
                      value={form.companyPostalCode ?? ''}
                      onChange={(e) =>
                        patchForm({
                          companyPostalCode: textValue(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5 sm:col-span-2">
                    <span className={labelClass}>
                      {t('admin.agent.field.addressLine1')}
                    </span>
                    <input
                      type="text"
                      value={form.companyAddressLine1 ?? ''}
                      onChange={(e) =>
                        patchForm({
                          companyAddressLine1: textValue(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                  </label>
                  <label className="block space-y-1.5 sm:col-span-2">
                    <span className={labelClass}>
                      {t('admin.agent.field.description')}
                    </span>
                    <textarea
                      rows={3}
                      value={form.description ?? ''}
                      onChange={(e) =>
                        patchForm({ description: textValue(e.target.value) })
                      }
                      className={inputClass}
                    />
                  </label>
                  {mode === 'create' ? (
                    <p className="text-xs font-medium text-muted sm:col-span-2">
                      {t('admin.agent.newCreateHint')}
                    </p>
                  ) : null}
                </div>
              ) : (
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className={labelClass}>{t('admin.agent.col.company')}</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink">
                      {dash(detail?.company.companyName)}
                    </dd>
                  </div>
                  <div>
                    <dt className={labelClass}>
                      {t('admin.agent.field.shortName')}
                    </dt>
                    <dd className="mt-0.5 text-sm text-ink/80">
                      {dash(detail?.company.shortName)}
                    </dd>
                  </div>
                  <div>
                    <dt className={labelClass}>
                      {t('admin.agent.field.primaryContactName')}
                    </dt>
                    <dd className="mt-0.5 text-sm text-ink/80">
                      {dash(detail?.company.primaryContactName)}
                    </dd>
                  </div>
                  <div>
                    <dt className={labelClass}>{t('admin.agent.field.email')}</dt>
                    <dd className="mt-0.5 text-sm text-ink/80">
                      {detail?.company.email?.trim() ? (
                        <button
                          type="button"
                          className="font-medium text-brand hover:underline"
                          onClick={() => {
                            const address = detail.company.email!.trim()
                            const name = (
                              detail.company.primaryContactName ??
                              detail.company.companyName ??
                              ''
                            ).trim()
                            openMailCompose({
                              to: name ? `${name} <${address}>` : address,
                            })
                          }}
                        >
                          {detail.company.email.trim()}
                        </button>
                      ) : (
                        dash(null)
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className={labelClass}>{t('admin.agent.field.phone')}</dt>
                    <dd className="mt-0.5 text-sm text-ink/80">
                      {detail?.company.phone?.trim() ? (
                        <button
                          type="button"
                          className="font-medium text-brand hover:underline"
                          onClick={() => {
                            const dialable = detail.company
                              .phone!.trim()
                              .replace(/[\s()-]/g, '')
                            if (dialable) {
                              void openExternalUrl(`tel:${dialable}`)
                            }
                          }}
                        >
                          {detail.company.phone.trim()}
                        </button>
                      ) : (
                        dash(null)
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className={labelClass}>
                      {t('admin.agent.field.website')}
                    </dt>
                    <dd className="mt-0.5 truncate text-sm text-ink/80">
                      {dash(detail?.company.website)}
                    </dd>
                  </div>
                  <div>
                    <dt className={labelClass}>{t('admin.agent.field.taxId')}</dt>
                    <dd className="mt-0.5 text-sm text-ink/80">
                      {dash(detail?.company.taxId)}
                    </dd>
                  </div>
                  <div>
                    <dt className={labelClass}>{t('admin.agent.col.country')}</dt>
                    <dd className="mt-0.5 text-sm text-ink/80">
                      {dash(detail?.company.companyCountry)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className={labelClass}>
                      {t('admin.agent.field.addressLine1')}
                    </dt>
                    <dd className="mt-0.5 text-sm text-ink/80">
                      {dash(detail?.company.companyAddressLine1)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className={labelClass}>
                      {t('admin.agent.field.description')}
                    </dt>
                    <dd className="mt-0.5 text-sm whitespace-pre-wrap text-ink/80">
                      {dash(detail?.company.description)}
                    </dd>
                  </div>
                </dl>
              )}
            </section>

            {mode === 'detail' ? (
              <section className={detailSectionCardClass()}>
                <h2 className="mb-3 text-sm font-extrabold text-ink">
                  {t('admin.agent.sectionAccount')}
                </h2>
                {detail?.account ? (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-ink">
                      {detail.account.loginUsername}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                        detail.account.isActive
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-ink/10 text-muted'
                      }`}
                    >
                      {detail.account.isActive
                        ? t('admin.agent.statusActive')
                        : t('admin.agent.statusInactive')}
                    </span>
                  </div>
                ) : (
                  <p className="mb-3 text-sm font-medium text-muted">
                    {t('admin.agent.statusNoAccount')}
                  </p>
                )}
                {canEdit ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {!detail?.account ? (
                      <label className="block space-y-1.5">
                        <span className={labelClass}>
                          {t('admin.agent.username')}
                        </span>
                        <input
                          type="text"
                          value={accountUsername}
                          placeholder={t('admin.agent.usernamePlaceholder')}
                          onChange={(e) => setAccountUsername(e.target.value)}
                          className={inputClass}
                        />
                      </label>
                    ) : null}
                    <label className="block space-y-1.5">
                      <span className={labelClass}>
                        {detail?.account
                          ? t('admin.agent.passwordNew')
                          : t('admin.agent.password')}
                      </span>
                      <input
                        type="password"
                        value={accountPassword}
                        placeholder={t('admin.agent.passwordPlaceholder')}
                        onChange={(e) => setAccountPassword(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                    <div className="flex items-end sm:col-span-2">
                      <button
                        type="button"
                        disabled={accountSaving}
                        className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
                        onClick={() => void submitAccount()}
                      >
                        {detail?.account
                          ? t('admin.agent.resetPassword')
                          : t('admin.agent.save')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {mode === 'detail' && companyId ? (
              <section className={detailSectionCardClass()}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-extrabold text-ink">
                    {t('admin.agent.sectionSalesReps')}
                  </h2>
                  {canEdit ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-bold text-brand hover:underline"
                      onClick={() =>
                        onNavigate(agentSalesRepPath(companyId, null))
                      }
                    >
                      <PlusIcon className="size-3" aria-hidden />
                      {t('admin.agent.addSalesRep')}
                    </button>
                  ) : null}
                </div>
                {salesReps.length === 0 ? (
                  <p className="py-6 text-center text-sm font-medium text-muted">
                    {t('admin.agent.noSalesReps')}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {salesReps.map((rep) => (
                      <li key={rep.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white/90 px-3 py-2.5 text-left transition-colors hover:border-brand/40 dark:bg-zinc-900/90"
                          onClick={() =>
                            onNavigate(agentSalesRepPath(companyId, rep.id))
                          }
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">
                              {rep.fullName ?? rep.loginUsername ?? rep.id}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {rep.loginUsername ?? t('admin.agent.statusNoAccount')}
                            </span>
                          </span>
                          {rep.accountId ? (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                rep.isActive
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : 'bg-ink/10 text-muted'
                              }`}
                            >
                              {rep.isActive
                                ? t('admin.agent.statusActive')
                                : t('admin.agent.statusInactive')}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
