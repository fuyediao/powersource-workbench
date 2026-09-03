/**
 * Admin agent (Sales Representative System) company list pane.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { PaginationStrip } from '@/components/common/pagination-strip'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  LucideHandshakeIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import {
  deleteAgentCompany,
  isAgentApiConfigured,
  listAgentCompanies,
  updateAgentAccount,
  type AgentDetail,
} from '@/services/agents-api'
import { listGroups, type GroupRecord } from '@/services/groups-api'
import { agentCompanyPath, agentCreatePath } from '@/utils/agent-routes'

/** Client-side page size (web parity). */
const AGENTS_PAGE_SIZE = 20

interface AgentsPaneProps {
  writes: AdminShellWrites | null
  /** Active workspace group for proxy admin calls. */
  workspaceGroupId: string | null
  /** Changes the active workspace group (system admins only). */
  onWorkspaceGroupChange: (groupId: string | null) => void
  onNavigate: (path: string) => void
}

/**
 * Agent company list with search, activate toggle, and delete.
 * @param props - Writes, workspace group, and navigation.
 * @returns List UI.
 */
export function AgentsPane({
  writes,
  workspaceGroupId,
  onWorkspaceGroupChange,
  onNavigate,
}: AgentsPaneProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const canCreate = Boolean(writes?.canCreate)
  const canEdit = Boolean(writes?.canEdit)
  const canDelete = Boolean(writes?.canDelete)

  const [companies, setCompanies] = useState<AgentDetail[]>([])
  const [groups, setGroups] = useState<GroupRecord[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AgentDetail | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deletePresence = useDialogPresence(Boolean(deleteTarget))

  const loadSerial = useRef(0)
  const groupsLoadedRef = useRef(false)

  const apiConfigured = isAgentApiConfigured()

  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase()
    if (!q) {
      return companies
    }
    return companies.filter((detail) => {
      const { companyName, shortName, companyCountry } = detail.company
      return (
        companyName.toLowerCase().includes(q) ||
        (shortName ?? '').toLowerCase().includes(q) ||
        (companyCountry ?? '').toLowerCase().includes(q)
      )
    })
  }, [companies, searchInput])

  const totalPages = Math.max(1, Math.ceil(filtered.length / AGENTS_PAGE_SIZE))
  const pageRows = useMemo(
    () =>
      filtered.slice((page - 1) * AGENTS_PAGE_SIZE, page * AGENTS_PAGE_SIZE),
    [filtered, page],
  )

  const rangeLabel = useMemo(() => {
    if (filtered.length === 0) {
      return t('admin.customers.countText', { from: 0, to: 0, total: 0 })
    }
    const from = (page - 1) * AGENTS_PAGE_SIZE + 1
    const to = Math.min(page * AGENTS_PAGE_SIZE, filtered.length)
    return t('admin.customers.countText', {
      from,
      to,
      total: filtered.length,
    })
  }, [filtered.length, page, t])

  const groupOptions = useMemo(
    () => groups.map((group) => ({ value: group.id, label: group.name })),
    [groups],
  )

  useEffect(() => {
    setPage(1)
  }, [searchInput])

  /**
   * System / super admins may lack a membership "current group". Mirror web
   * AdminAgentView: default the proxy workspace to the membership group or the
   * first listed group so list/create calls receive `workspace_group_id`.
   */
  useEffect(() => {
    if (!domainWrites.isSystemAdmin || workspaceGroupId) {
      return
    }
    if (groups.length === 0) {
      return
    }
    const preferred =
      domainWrites.groupId &&
      groups.some((group) => group.id === domainWrites.groupId)
        ? domainWrites.groupId
        : groups[0]?.id
    if (preferred) {
      onWorkspaceGroupChange(preferred)
    }
  }, [
    domainWrites.groupId,
    domainWrites.isSystemAdmin,
    groups,
    onWorkspaceGroupChange,
    workspaceGroupId,
  ])

  /**
   * Loads companies for the active workspace group.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    const serial = ++loadSerial.current
    setLoading(true)
    setListError(null)
    try {
      if (domainWrites.isSystemAdmin && !groupsLoadedRef.current) {
        const allGroups = await listGroups()
        if (serial !== loadSerial.current) {
          return
        }
        setGroups(allGroups)
        groupsLoadedRef.current = true
      }
      if (!apiConfigured) {
        setCompanies([])
        setListError(t('admin.agent.workerNotConfigured'))
        return
      }
      if (!workspaceGroupId) {
        setCompanies([])
        // Web parity: membership users need a current group; system / super
        // admins get a picker default instead of this error.
        if (!domainWrites.isSystemAdmin) {
          setListError(t('admin.agent.noWorkspaceGroup'))
        }
        return
      }
      const rows = await listAgentCompanies(workspaceGroupId)
      if (serial !== loadSerial.current) {
        return
      }
      setCompanies(rows)
    } catch (err) {
      if (serial !== loadSerial.current) {
        return
      }
      console.error('[AgentsPane] load:', err)
      setListError(t('admin.agent.errorLoad'))
      setCompanies([])
    } finally {
      if (serial === loadSerial.current) {
        setLoading(false)
      }
    }
  }, [
    apiConfigured,
    domainWrites.isSystemAdmin,
    t,
    workspaceGroupId,
  ])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Toggles a company login account between active and inactive.
   * @param detail - Company row with an account.
   * @returns Nothing.
   */
  async function toggleActive(detail: AgentDetail): Promise<void> {
    if (!detail.account || !canEdit || !workspaceGroupId || togglingId) {
      return
    }
    setTogglingId(detail.company.id)
    try {
      const updated = await updateAgentAccount(
        workspaceGroupId,
        detail.company.id,
        { isActive: !detail.account.isActive },
      )
      setCompanies((prev) =>
        prev.map((row) =>
          row.company.id === detail.company.id
            ? { ...row, account: updated }
            : row,
        ),
      )
    } catch (err) {
      console.error('[AgentsPane] toggle account:', err)
      setListError(t('admin.agent.errorUpdate'))
    } finally {
      setTogglingId(null)
    }
  }

  /**
   * Deletes the confirmed company.
   * @returns Nothing.
   */
  async function confirmDelete(): Promise<void> {
    if (!deleteTarget || !canDelete || !workspaceGroupId || deleting) {
      return
    }
    setDeleting(true)
    try {
      await deleteAgentCompany(workspaceGroupId, deleteTarget.company.id)
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      console.error('[AgentsPane] delete:', err)
      setListError(t('admin.agent.errorDelete'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-extrabold text-brand">
          {t('admin.agent.title')}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.customers.refresh')}
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('admin.customers.refresh')}</span>
          </button>
          {canCreate ? (
            <button
              type="button"
              disabled={!workspaceGroupId || !apiConfigured}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-3 py-2 text-sm font-bold text-brand-fg disabled:opacity-50"
              onClick={() => onNavigate(agentCreatePath())}
            >
              <PlusIcon className="size-4" />
              <span>{t('admin.agent.newCompany')}</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] max-w-sm flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('admin.agent.searchCompanyPlaceholder')}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-brand/40 dark:bg-white/5"
              aria-label={t('admin.agent.searchCompanyPlaceholder')}
            />
          </div>
          {domainWrites.isSystemAdmin && groupOptions.length > 0 ? (
            <CrmFilterSelect
              className="min-w-36 max-w-52 shrink-0"
              value={workspaceGroupId ?? ''}
              options={groupOptions}
              ariaLabel={t('admin.agent.manageGroupLabel')}
              onChange={(next) => {
                setPage(1)
                onWorkspaceGroupChange(next || null)
              }}
            />
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-medium text-muted">{rangeLabel}</p>
      </div>

      {listError ? (
        <p className="text-sm font-medium text-rose-500">{listError}</p>
      ) : null}

      <div
        role="region"
        aria-label={t('admin.agent.title')}
        className="min-h-0 flex-1 overflow-auto rounded-3xl border border-ink/10 bg-white/60 dark:bg-white/5"
      >
        {!loading && pageRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-20 text-muted">
            <LucideHandshakeIcon className="size-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">
              {searchInput.trim()
                ? t('admin.agent.noSearchMatches')
                : t('admin.agent.noCompanies')}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-white/95 text-xs font-bold tracking-wide text-muted uppercase dark:bg-zinc-950/95">
              <tr>
                <th className="px-4 py-3">{t('admin.agent.col.company')}</th>
                <th className="hidden px-4 py-3 sm:table-cell">
                  {t('admin.agent.col.country')}
                </th>
                <th className="hidden px-4 py-3 lg:table-cell">
                  {t('admin.agent.username')}
                </th>
                <th className="px-4 py-3">{t('admin.agent.status')}</th>
                {canDelete ? (
                  <th className="px-4 py-3 text-right">
                    {t('admin.kol.col.actions')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loading && pageRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted">
                    {t('status.loading')}
                  </td>
                </tr>
              ) : null}
              {pageRows.map((detail) => (
                <tr
                  key={detail.company.id}
                  className="cursor-pointer border-t border-ink/5 hover:bg-brand/5"
                  onClick={() => onNavigate(agentCompanyPath(detail.company.id))}
                >
                  <td className="px-4 py-3">
                    <span className="block truncate font-semibold text-ink">
                      {detail.company.companyName}
                    </span>
                    {detail.company.shortName ? (
                      <span className="block truncate text-xs font-medium text-muted">
                        {detail.company.shortName}
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 sm:table-cell">
                    {detail.company.companyCountry ?? '—'}
                  </td>
                  <td className="hidden px-4 py-3 text-ink/80 lg:table-cell">
                    {detail.account?.loginUsername ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {detail.account ? (
                      <button
                        type="button"
                        disabled={!canEdit || togglingId === detail.company.id}
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-60 ${
                          detail.account.isActive
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-ink/10 text-muted'
                        }`}
                        title={
                          detail.account.isActive
                            ? t('admin.agent.listDeactivateHint')
                            : t('admin.agent.listActivateHint')
                        }
                        onClick={(e) => {
                          e.stopPropagation()
                          void toggleActive(detail)
                        }}
                      >
                        {detail.account.isActive
                          ? t('admin.agent.statusActive')
                          : t('admin.agent.statusInactive')}
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-muted">
                        {t('admin.agent.statusNoAccount')}
                      </span>
                    )}
                  </td>
                  {canDelete ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted hover:bg-rose-500/10 hover:text-rose-500"
                        title={t('admin.agent.deleteCompany')}
                        aria-label={t('admin.agent.deleteCompany')}
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(detail)
                        }}
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PaginationStrip
        currentPage={page}
        totalPages={totalPages}
        disabled={loading}
        onGoToPage={(nextPage) => {
          if (nextPage >= 1 && nextPage <= totalPages) {
            setPage(nextPage)
          }
        }}
      />

      {deletePresence.mounted && deleteTarget
        ? createPortal(
            <div
              className={`fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px] ${
                deletePresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in'
              }`}
              onClick={() => {
                if (!deleting) {
                  setDeleteTarget(null)
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="w-full max-w-sm rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-base font-extrabold text-brand">
                  {t('admin.agent.deleteCompany')}
                </h2>
                <p className="mt-2 text-sm font-medium text-muted">
                  {t('admin.agent.confirmDeleteCompany', {
                    name: deleteTarget.company.companyName,
                  })}
                </p>
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    className="rounded-2xl bg-zinc-950/5 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                    onClick={() => setDeleteTarget(null)}
                  >
                    {t('actions.cancel')}
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
