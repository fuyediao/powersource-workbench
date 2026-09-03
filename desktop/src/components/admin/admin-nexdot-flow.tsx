/**
 * NEXDOT Function path router (CMS / dealer users).
 * Dealer users list ↔ detail uses the same right-to-left drill slide as customers.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { NexdotCmsPane } from '@/components/admin/nexdot-cms-pane'
import { NexdotUserDetailPane } from '@/components/admin/nexdot-user-detail-pane'
import { NexdotUsersPane } from '@/components/admin/nexdot-users-pane'
import type { AdminModuleKey } from '@/constants/admin-modules'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import { listGroups } from '@/services/groups-api'
import { parseNexdotUserDetailPath } from '@/utils/nexdot-routes'

/** Matches customers drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface AdminNexdotFlowProps {
  path: string | null
  moduleKey: AdminModuleKey | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Routes NEXDOT shell paths to CMS or dealer user panes.
 * System-admin workspace group selection lives here so the list picker
 * carries into dealer detail (detail has no second group control).
 * @param props - Active path, writes, navigation.
 * @returns Pane UI.
 */
export function AdminNexdotFlow({
  path,
  moduleKey,
  writes,
  onNavigate,
}: AdminNexdotFlowProps) {
  const { t } = useTranslation()
  const domainWrites = useDesktopDomainWritesContext()
  const [groupOverride, setGroupOverride] = useState<string | null>(null)
  const workspaceGroupId = groupOverride ?? domainWrites.groupId
  const dealerId = parseNexdotUserDetailPath(path)
  const onUsersList = path === '/nexdot/users' || moduleKey === 'obm_users'
  const showUsersFlow = Boolean(dealerId) || onUsersList
  const showDrill = dealerId !== null
  const [displayedDealerId, setDisplayedDealerId] = useState<string | null>(
    dealerId,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseNexdotUserDetailPath(path)
    if (next) {
      setDisplayedDealerId((prev) => (prev === next ? prev : next))
      return
    }
    const timer = window.setTimeout(() => setDisplayedDealerId(null), FORM_SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [path])

  useEffect(() => {
    if (!domainWrites.isSystemAdmin || groupOverride) {
      return
    }
    let cancelled = false
    void listGroups()
      .then((rows) => {
        if (cancelled || groupOverride) {
          return
        }
        if (domainWrites.groupId && rows.some((g) => g.id === domainWrites.groupId)) {
          setGroupOverride(domainWrites.groupId)
          return
        }
        setGroupOverride(rows[0]?.id ?? null)
      })
      .catch(() => {
        /* List pane still shows empty groups; detail may show noWorkspace. */
      })
    return () => {
      cancelled = true
    }
  }, [domainWrites.groupId, domainWrites.isSystemAdmin, groupOverride])

  if (path === '/nexdot' || moduleKey === 'obm') {
    return <NexdotCmsPane writes={writes} />
  }

  if (showUsersFlow) {
    return (
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
            slideReady ? 'transition-transform duration-[320ms]' : ''
          } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
        >
          <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
            <NexdotUsersPane
              writes={writes}
              workspaceGroupId={workspaceGroupId}
              onWorkspaceGroupChange={setGroupOverride}
              onNavigate={onNavigate}
            />
          </div>
          <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
            {displayedDealerId ? (
              <NexdotUserDetailPane
                key={displayedDealerId}
                dealerId={displayedDealerId}
                workspaceGroupId={workspaceGroupId}
                writes={writes}
                onNavigate={onNavigate}
              />
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <p className="p-6 text-sm font-medium text-muted">{t('admin.content.comingSoon')}</p>
  )
}
