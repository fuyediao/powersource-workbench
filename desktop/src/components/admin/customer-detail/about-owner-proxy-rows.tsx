/**
 * Customer detail About-panel rows: owner, proxy agent, and sales representative
 * (Vue CustomerDetailView left-rail parity).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { ABOUT_ROW_CLASS } from '@/components/admin/customer-detail/detail-shared'
import {
  ExternalLinkIcon,
  UserIcon,
  UsersIcon,
} from '@/icons/AllIcons'
import {
  getAgentCompany,
  isAgentApiConfigured,
  listAgents,
  listAgentSalesReps,
  setAgentGrants,
  type AgentAccount,
  type AgentSalesRep,
} from '@/services/agents-api'
import {
  fetchProfileSnippets,
  type ProfileSnippet,
} from '@/services/groups-api'
import type { CustomerDetail } from '@/types/customer'

interface AboutOwnerProxyRowsProps {
  customer: CustomerDetail
  onNavigate: (path: string) => void
}

/**
 * Human-readable profile label for the owner row.
 * @param profile - Profile snippet.
 * @returns Display name.
 */
function profileDisplayName(profile: ProfileSnippet): string {
  return (
    profile.display_name?.trim() ||
    profile.full_name?.trim() ||
    profile.email?.trim() ||
    profile.employee_id?.trim() ||
    profile.id.slice(0, 8)
  )
}

/**
 * Rebuilds a company's grant set with one customer added or removed.
 * @param account - Fresh company account (source of truth).
 * @param customerId - Customer to add or remove.
 * @param add - True to add the grant, false to remove it.
 * @returns Next customer ids and rep assignment map.
 */
function buildNextGrants(
  account: AgentAccount,
  customerId: string,
  add: boolean,
): { customerIds: string[]; repAssignments: Record<string, string | null> } {
  const currentIds = account.customerIds ?? []
  const repMap: Record<string, string | null> = {
    ...account.customerRepAssignments,
  }
  let nextIds: string[]
  if (add) {
    nextIds = currentIds.includes(customerId)
      ? [...currentIds]
      : [...currentIds, customerId]
  } else {
    nextIds = currentIds.filter((id) => id !== customerId)
    delete repMap[customerId]
  }
  return { customerIds: nextIds, repAssignments: repMap }
}

/**
 * Label for a proxy agent option (company name, else login username).
 * @param agent - Agent account.
 * @returns Display label.
 */
function proxyAgentOptionLabel(agent: AgentAccount): string {
  const name = (agent.companyName ?? '').trim()
  return name || agent.loginUsername
}

/**
 * Label for a sales-rep option (full name, else login username).
 * @param rep - Sales rep row.
 * @returns Display label.
 */
function salesRepOptionLabel(rep: AgentSalesRep): string {
  const fullName = (rep.fullName ?? '').trim()
  if (fullName) {
    return fullName
  }
  const username = (rep.loginUsername ?? '').trim()
  return username || '—'
}

/**
 * Owner + proxy agent + sales rep rows for the About list.
 * @param props - Customer and navigation.
 * @returns About rows (fragment).
 */
export function AboutOwnerProxyRows({
  customer,
  onNavigate,
}: AboutOwnerProxyRowsProps) {
  const { t } = useTranslation()
  const proxyConfigured = isAgentApiConfigured()
  const canAssign = Boolean(customer.id) && proxyConfigured

  const [ownerLabel, setOwnerLabel] = useState('—')
  const [proxyAgents, setProxyAgents] = useState<AgentAccount[]>([])
  const [salesReps, setSalesReps] = useState<AgentSalesRep[]>([])
  const [assignedSalesRepAccountId, setAssignedSalesRepAccountId] = useState<
    string | null
  >(null)
  const [saving, setSaving] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  /**
   * Loads proxy agents and the assigned sales-rep for this customer.
   * @returns Nothing.
   */
  const loadProxyState = useCallback(async (): Promise<void> => {
    setProxyAgents([])
    setSalesReps([])
    setAssignedSalesRepAccountId(null)
    if (!proxyConfigured) {
      return
    }
    const gid = customer.groupId?.trim()
    if (!customer.id || !gid) {
      return
    }
    try {
      const agents = await listAgents(gid)
      setProxyAgents(agents)
      const assigned =
        agents.find((a) => a.customerIds.includes(customer.id)) ?? null
      if (!assigned) {
        return
      }
      const companyId = (assigned.companyId || assigned.id).trim()
      if (!companyId) {
        return
      }
      const [companyDetail, reps] = await Promise.all([
        getAgentCompany(gid, companyId),
        listAgentSalesReps(gid, companyId),
      ])
      setAssignedSalesRepAccountId(
        companyDetail.account?.customerRepAssignments?.[customer.id] ?? null,
      )
      setSalesReps(reps)
    } catch {
      setProxyAgents([])
      setSalesReps([])
      setAssignedSalesRepAccountId(null)
    }
  }, [customer.groupId, customer.id, proxyConfigured])

  useEffect(() => {
    void loadProxyState()
  }, [loadProxyState])

  useEffect(() => {
    const ownerId = customer.ownerUserId?.trim()
    if (!ownerId) {
      setOwnerLabel('—')
      return
    }
    let cancelled = false
    void fetchProfileSnippets([ownerId]).then((map) => {
      if (cancelled) {
        return
      }
      const profile = map.get(ownerId)
      setOwnerLabel(
        profile
          ? profileDisplayName(profile)
          : `${ownerId.slice(0, 8)}…`,
      )
    })
    return () => {
      cancelled = true
    }
  }, [customer.ownerUserId])

  const assignedProxyAgent = useMemo((): AgentAccount | null => {
    if (!customer.id || !proxyConfigured) {
      return null
    }
    return proxyAgents.find((a) => a.customerIds.includes(customer.id)) ?? null
  }, [customer.id, proxyAgents, proxyConfigured])

  const assignedProxyLabel = useMemo((): string => {
    if (!assignedProxyAgent) {
      return '—'
    }
    return proxyAgentOptionLabel(assignedProxyAgent)
  }, [assignedProxyAgent])

  const assignedSalesRepLabel = useMemo((): string => {
    if (!assignedSalesRepAccountId) {
      return '—'
    }
    const rep = salesReps.find(
      (r) => (r.accountId ?? '') === assignedSalesRepAccountId,
    )
    if (!rep) {
      return '—'
    }
    return salesRepOptionLabel(rep)
  }, [assignedSalesRepAccountId, salesReps])

  const proxyOptions = useMemo(
    () => [
      {
        value: '',
        label: t('admin.customers.detail.proxyAgentUnset'),
      },
      ...proxyAgents.map((agent) => ({
        value: (agent.companyId || agent.id).trim(),
        label: proxyAgentOptionLabel(agent),
      })),
    ],
    [proxyAgents, t],
  )

  const salesRepOptions = useMemo(
    () => [
      {
        value: '',
        label: t('admin.customers.detail.salesRepUnset'),
      },
      ...salesReps
        .filter((r) => Boolean((r.accountId ?? '').trim()))
        .map((rep) => ({
          value: (rep.accountId ?? '').trim(),
          label: salesRepOptionLabel(rep),
        })),
    ],
    [salesReps, t],
  )

  /**
   * Assigns or clears the proxy agent holding this customer.
   * @param companyId - Target company id, or empty to unassign.
   * @returns Nothing.
   */
  async function assignProxyAgent(companyId: string): Promise<void> {
    const gid = customer.groupId?.trim()
    if (!customer.id || !gid || saving) {
      return
    }
    const targetCompanyId = companyId.trim() || null
    const currentCompanyId = assignedProxyAgent
      ? (assignedProxyAgent.companyId || assignedProxyAgent.id).trim()
      : null
    if (targetCompanyId === currentCompanyId) {
      return
    }
    setSaving(true)
    setAssignError(null)
    try {
      if (currentCompanyId) {
        const detail = await getAgentCompany(gid, currentCompanyId)
        if (detail.account) {
          const next = buildNextGrants(detail.account, customer.id, false)
          await setAgentGrants(
            gid,
            currentCompanyId,
            next.customerIds,
            next.repAssignments,
          )
        }
      }
      if (targetCompanyId) {
        const detail = await getAgentCompany(gid, targetCompanyId)
        if (detail.account) {
          const next = buildNextGrants(detail.account, customer.id, true)
          await setAgentGrants(
            gid,
            targetCompanyId,
            next.customerIds,
            next.repAssignments,
          )
        }
      }
      await loadProxyState()
    } catch (e) {
      setAssignError(
        e instanceof Error
          ? e.message
          : t('admin.customers.detail.assignError'),
      )
    } finally {
      setSaving(false)
    }
  }

  /**
   * Assigns or clears the sales rep under the current proxy company.
   * @param repAccountId - Sales-rep account id, or empty to unassign.
   * @returns Nothing.
   */
  async function assignSalesRep(repAccountId: string): Promise<void> {
    const gid = customer.groupId?.trim()
    const companyId = assignedProxyAgent
      ? (assignedProxyAgent.companyId || assignedProxyAgent.id).trim()
      : null
    const nextRepId = repAccountId.trim() || null
    if (!customer.id || !gid || !companyId || saving) {
      return
    }
    if ((assignedSalesRepAccountId ?? null) === nextRepId) {
      return
    }
    setSaving(true)
    setAssignError(null)
    try {
      const detail = await getAgentCompany(gid, companyId)
      if (detail.account) {
        const currentIds = detail.account.customerIds ?? []
        const repMap: Record<string, string | null> = {
          ...detail.account.customerRepAssignments,
        }
        if (nextRepId) {
          repMap[customer.id] = nextRepId
        } else {
          delete repMap[customer.id]
        }
        await setAgentGrants(gid, companyId, currentIds, repMap)
      }
      await loadProxyState()
    } catch (e) {
      setAssignError(
        e instanceof Error
          ? e.message
          : t('admin.customers.detail.assignError'),
      )
    } finally {
      setSaving(false)
    }
  }

  const assignedCompanyId = assignedProxyAgent
    ? (assignedProxyAgent.companyId || assignedProxyAgent.id).trim()
    : ''

  return (
    <>
      <div className={ABOUT_ROW_CLASS}>
        <dt className="w-20 shrink-0 text-xs text-muted">
          {t('admin.customers.form.owner')}
        </dt>
        <dd className="flex min-w-0 items-center gap-1 text-xs font-medium text-ink">
          <UserIcon className="size-3 shrink-0 text-muted" aria-hidden />
          <span className="truncate">{ownerLabel}</span>
        </dd>
      </div>

      {proxyConfigured ? (
        <>
          <div className={ABOUT_ROW_CLASS}>
            <dt className="w-20 shrink-0 text-xs text-muted">
              {t('admin.customers.detail.proxyAgent')}
            </dt>
            <dd className="flex min-w-0 flex-1 items-center gap-1">
              <UsersIcon className="size-3 shrink-0 text-muted" aria-hidden />
              {canAssign ? (
                <>
                  <CrmFilterSelect
                    className="min-w-0 flex-1"
                    size="xs"
                    value={assignedCompanyId}
                    options={proxyOptions}
                    disabled={saving}
                    placeholder={t('admin.customers.detail.proxyAgentUnset')}
                    ariaLabel={t('admin.customers.detail.proxyAgent')}
                    onChange={(next) => {
                      void assignProxyAgent(next)
                    }}
                  />
                  {assignedCompanyId ? (
                    <button
                      type="button"
                      className="shrink-0 text-muted transition-colors hover:text-brand"
                      title={t('admin.customers.detail.proxyAgent')}
                      onClick={() =>
                        onNavigate(`/admin/agent/${assignedCompanyId}`)
                      }
                    >
                      <ExternalLinkIcon className="size-3" aria-hidden />
                    </button>
                  ) : null}
                </>
              ) : assignedCompanyId ? (
                <button
                  type="button"
                  className="truncate text-xs font-medium text-brand hover:underline"
                  onClick={() =>
                    onNavigate(`/admin/agent/${assignedCompanyId}`)
                  }
                >
                  {assignedProxyLabel}
                </button>
              ) : (
                <span className="truncate text-xs font-medium text-ink">
                  {assignedProxyLabel}
                </span>
              )}
            </dd>
          </div>

          <div className={ABOUT_ROW_CLASS}>
            <dt className="w-20 shrink-0 text-xs text-muted">
              {t('admin.customers.detail.salesRep')}
            </dt>
            <dd className="flex min-w-0 flex-1 items-center gap-1">
              <UserIcon className="size-3 shrink-0 text-muted" aria-hidden />
              {canAssign && assignedProxyAgent ? (
                <CrmFilterSelect
                  className="min-w-0 flex-1"
                  size="xs"
                  value={assignedSalesRepAccountId ?? ''}
                  options={salesRepOptions}
                  disabled={saving}
                  placeholder={t('admin.customers.detail.salesRepUnset')}
                  ariaLabel={t('admin.customers.detail.salesRep')}
                  onChange={(next) => {
                    void assignSalesRep(next)
                  }}
                />
              ) : canAssign ? (
                <span className="truncate text-xs text-muted">
                  {t('admin.customers.detail.assignAgentFirst')}
                </span>
              ) : (
                <span className="truncate text-xs font-medium text-ink">
                  {assignedSalesRepLabel}
                </span>
              )}
            </dd>
          </div>

          {assignError ? (
            <div className="px-4 pb-2">
              <p className="text-[11px] text-rose-500">{assignError}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  )
}
