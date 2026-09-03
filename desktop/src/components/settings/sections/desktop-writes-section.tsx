/**
 * Group-admin Settings: per-member desktop domain write grants.
 * Only domains whose Function entry key is open for the group are shown.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { CheckIcon, KeyIcon } from '@/icons/AllIcons'
import {
  MODULE_WRITE_ACTIONS,
  MODULE_WRITE_ACTION_LABEL_KEYS,
  type ModuleWriteAction,
} from '@/constants/admin-modules'
import {
  DESKTOP_WRITE_DOMAIN_ENTRY,
  DESKTOP_WRITE_DOMAIN_LABEL_KEYS,
  DESKTOP_WRITE_DOMAINS,
  DESKTOP_WRITE_RESOURCE_LABEL_KEYS,
  DESKTOP_WRITE_RESOURCES,
  desktopWriteGrantKey,
  parseDesktopWriteGrantKey,
  type DesktopWriteDomain,
  type DesktopWriteGrantKey,
} from '@/constants/desktop-modules'
import { fetchDesktopModuleAccessForGroup } from '@/services/group-desktop-module-access-api'
import {
  fetchDesktopGroupWriteGrantSummaries,
  fetchDesktopMemberWriteGrants,
  setDesktopMemberWriteGrants,
  summarizeDesktopWriteGrantKeys,
  type DesktopWriteGrantSummary,
} from '@/services/group-desktop-writes-api'
import { fetchGroupMembers, type GroupMemberRecord } from '@/services/groups-api'

interface DesktopWritesSectionProps {
  groupId: string
  /** Primary group admin user id (excluded from member grant list). */
  groupAdminId?: string | null
}

/**
 * Member label for roster rows.
 * @param member - Group member.
 * @returns Display string.
 */
function memberLabel(member: GroupMemberRecord): string {
  return member.user?.display_name || member.user?.email || member.userId
}

/**
 * Settings section for desktop domain write grants (group admin).
 * @param props - Current group id.
 * @returns Desktop writes editor UI.
 */
export function DesktopWritesSection({ groupId, groupAdminId = null }: DesktopWritesSectionProps) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<GroupMemberRecord[]>([])
  const [openDomains, setOpenDomains] = useState<DesktopWriteDomain[]>([])
  const [summaries, setSummaries] = useState<Map<string, DesktopWriteGrantSummary>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [pendingGrants, setPendingGrants] = useState<Set<DesktopWriteGrantKey>>(new Set())
  const [activeAction, setActiveAction] = useState<ModuleWriteAction>('insert')
  const [activeDomain, setActiveDomain] = useState<DesktopWriteDomain | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const modalPresence = useDialogPresence(expandedUserId !== null, 200)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    try {
      const [entryKeys, roster] = await Promise.all([
        fetchDesktopModuleAccessForGroup(groupId),
        fetchGroupMembers(groupId, groupAdminId),
      ])
      const domains = DESKTOP_WRITE_DOMAINS.filter((domain) =>
        DESKTOP_WRITE_DOMAIN_ENTRY[domain].some((entry) => entryKeys.has(entry)),
      )
      setOpenDomains(domains)
      setMembers(roster.filter((row) => row.userId !== groupAdminId))
      const nextSummaries = await fetchDesktopGroupWriteGrantSummaries(groupId, domains)
      setSummaries(nextSummaries)
    } finally {
      setIsLoading(false)
    }
  }, [groupAdminId, groupId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (openDomains.length === 0) {
      setActiveDomain(null)
      return
    }
    setActiveDomain((prev) =>
      prev && openDomains.includes(prev) ? prev : openDomains[0] ?? null,
    )
  }, [openDomains])

  /**
   * Opens the write-grant modal for a member.
   * @param userId - Member user id.
   */
  async function openEditor(userId: string): Promise<void> {
    setExpandedUserId(userId)
    setSaveError(null)
    setSaveSuccess(false)
    setActiveAction('insert')
    const grants = await fetchDesktopMemberWriteGrants(groupId, userId, openDomains)
    setPendingGrants(grants)
  }

  /** Closes the write-grant modal. */
  function closeEditor(): void {
    setExpandedUserId(null)
    setPendingGrants(new Set())
  }

  /**
   * Toggles one resource grant for the active domain + action.
   * @param resourceKey - Resource within the active domain.
   */
  function toggleGrant(resourceKey: string): void {
    if (!activeDomain) {
      return
    }
    const key = desktopWriteGrantKey(activeDomain, resourceKey, activeAction)
    setPendingGrants((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
    setSaveSuccess(false)
  }

  /** Selects or clears all resources for the active domain + action. */
  function toggleSelectAll(): void {
    if (!activeDomain) {
      return
    }
    const resources = DESKTOP_WRITE_RESOURCES[activeDomain]
    const allOn = resources.every((resource) =>
      pendingGrants.has(desktopWriteGrantKey(activeDomain, resource, activeAction)),
    )
    setPendingGrants((prev) => {
      const next = new Set(prev)
      for (const resource of resources) {
        const key = desktopWriteGrantKey(activeDomain, resource, activeAction)
        if (allOn) {
          next.delete(key)
        } else {
          next.add(key)
        }
      }
      return next
    })
    setSaveSuccess(false)
  }

  /**
   * Persists pending grants for the expanded member.
   */
  async function handleSave(): Promise<void> {
    if (!expandedUserId || openDomains.length === 0) {
      return
    }
    setIsSaving(true)
    setSaveError(null)
    const ok = await setDesktopMemberWriteGrants(
      groupId,
      expandedUserId,
      Array.from(pendingGrants),
      openDomains,
    )
    if (ok) {
      setSaveSuccess(true)
      setSummaries((prev) => {
        const next = new Map(prev)
        next.set(expandedUserId, summarizeDesktopWriteGrantKeys(pendingGrants))
        return next
      })
      window.setTimeout(() => setSaveSuccess(false), 3000)
    } else {
      setSaveError(
        t('settings.desktopWrites.saveError', {
          defaultValue: 'Failed to save desktop write grants',
        }),
      )
    }
    setIsSaving(false)
  }

  const expandedMember = useMemo(
    () => members.find((row) => row.userId === expandedUserId) ?? null,
    [expandedUserId, members],
  )

  const actionCount = useCallback(
    (action: ModuleWriteAction): number => {
      let count = 0
      for (const grant of pendingGrants) {
        const parsed = parseDesktopWriteGrantKey(grant)
        if (parsed?.action === action) {
          count += 1
        }
      }
      return count
    },
    [pendingGrants],
  )

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-brand">
          {t('settings.desktopWrites.title', { defaultValue: 'Desktop write access' })}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t('settings.desktopWrites.description', {
            defaultValue:
              'Grant insert / update / delete for desktop domains that are open for this group.',
          })}
        </p>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted">{t('common.loading')}</p>
      ) : openDomains.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {t('settings.desktopWrites.noOpenDomains', {
            defaultValue:
              'No desktop Function domains are open for this group. Ask a system admin to enable entry keys first.',
          })}
        </p>
      ) : members.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {t('settings.desktopWrites.noMembers', {
            defaultValue: 'No non-admin members to grant writes to',
          })}
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => {
            const summary = summaries.get(member.userId)
            return (
              <li
                key={member.userId}
                className="flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-brand">{memberLabel(member)}</p>
                  <p className="truncate text-xs text-muted">{member.user?.email ?? member.userId}</p>
                  <p className="text-xs text-muted">
                    {t('settings.desktopWrites.summary', {
                      insert: summary?.insert ?? 0,
                      update: summary?.update ?? 0,
                      delete: summary?.delete ?? 0,
                      defaultValue: `Create ${summary?.insert ?? 0} · Edit ${summary?.update ?? 0} · Delete ${summary?.delete ?? 0}`,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-2xl bg-brand px-3 py-2 text-xs font-bold text-brand-fg"
                  onClick={() => void openEditor(member.userId)}
                >
                  <KeyIcon className="size-3.5" />
                  {t('settings.desktopWrites.manageButton', { defaultValue: 'Manage' })}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {modalPresence.mounted ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
            modalPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
          onClick={closeEditor}
        >
          <div
            className="max-h-[min(90vh,44rem)] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <p className="text-base font-bold text-brand">
                {t('settings.desktopWrites.modalTitle', {
                  defaultValue: 'Desktop write grants',
                })}
              </p>
              {expandedMember ? (
                <p className="mt-1 truncate text-sm text-muted">{memberLabel(expandedMember)}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-1 border-b border-zinc-950/10 dark:border-white/10">
              {openDomains.map((domain) => {
                const active = activeDomain === domain
                return (
                  <button
                    key={domain}
                    type="button"
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? 'border-brand text-brand'
                        : 'border-transparent text-muted hover:text-brand'
                    }`}
                    onClick={() => setActiveDomain(domain)}
                  >
                    {t(DESKTOP_WRITE_DOMAIN_LABEL_KEYS[domain], { defaultValue: domain })}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-1 border-b border-zinc-950/10 dark:border-white/10">
              {MODULE_WRITE_ACTIONS.map((action) => {
                const count = actionCount(action)
                const active = activeAction === action
                return (
                  <button
                    key={action}
                    type="button"
                    className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? 'border-brand text-brand'
                        : 'border-transparent text-muted hover:text-brand'
                    }`}
                    onClick={() => setActiveAction(action)}
                  >
                    <span>{t(MODULE_WRITE_ACTION_LABEL_KEYS[action])}</span>
                    {count > 0 ? (
                      <span className="rounded-full bg-brand/15 px-1.5 text-[10px] font-bold text-brand">
                        {count}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>

            {activeDomain ? (
              <>
                <button
                  type="button"
                  className="text-xs font-semibold text-brand underline decoration-brand/40 underline-offset-2"
                  onClick={toggleSelectAll}
                >
                  {t('settings.desktopWrites.selectAll', { defaultValue: 'Select all' })}
                </button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {DESKTOP_WRITE_RESOURCES[activeDomain].map((resource) => {
                    const selected = pendingGrants.has(
                      desktopWriteGrantKey(activeDomain, resource, activeAction),
                    )
                    return (
                      <button
                        type="button"
                        key={resource}
                        onClick={() => toggleGrant(resource)}
                        className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-left text-xs font-semibold transition ${
                          selected
                            ? 'border-brand/60 bg-brand text-brand-fg'
                            : 'border-zinc-950/10 bg-zinc-950/5 text-muted hover:border-brand/40 dark:border-white/10 dark:bg-white/5'
                        }`}
                      >
                        {selected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                        <span className="truncate">
                          {t(DESKTOP_WRITE_RESOURCE_LABEL_KEYS[resource] ?? resource, {
                            defaultValue: resource,
                          })}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : null}

            {saveSuccess ? (
              <p className="text-xs font-semibold text-brand">
                {t('settings.desktopWrites.saveSuccess', { defaultValue: 'Saved' })}
              </p>
            ) : null}
            {saveError ? <p className="text-xs font-semibold text-rose-500">{saveError}</p> : null}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isSaving}
                className="flex-1 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
                onClick={() => void handleSave()}
              >
                {isSaving
                  ? t('settings.desktopWrites.saving', { defaultValue: 'Saving…' })
                  : t('settings.desktopWrites.save', { defaultValue: 'Save' })}
              </button>
              <button
                type="button"
                disabled={isSaving}
                className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 dark:bg-white/10"
                onClick={closeEditor}
              >
                {t('actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
