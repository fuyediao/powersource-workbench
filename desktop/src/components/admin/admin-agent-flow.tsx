/**
 * Agent list ↔ company detail / sales rep with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { AgentDetailPane } from '@/components/admin/agent-detail-pane'
import { AgentSalesRepPane } from '@/components/admin/agent-sales-rep-pane'
import { AgentsPane } from '@/components/admin/agents-pane'
import { useDesktopDomainWritesContext } from '@/hooks/use-desktop-domain-writes'
import {
  parseAgentDrillPath,
  sameAgentDrillRoute,
  type AgentDrillRoute,
} from '@/utils/agent-routes'

/** Matches customers drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface AdminAgentFlowProps {
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the agent list and company / sales-rep panes.
 * @param props - Shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function AdminAgentFlow({
  path,
  writes,
  onNavigate,
}: AdminAgentFlowProps) {
  const domainWrites = useDesktopDomainWritesContext()
  const drillRoute = parseAgentDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<AgentDrillRoute | null>(
    drillRoute,
  )
  const [slideReady, setSlideReady] = useState(false)
  const [groupOverride, setGroupOverride] = useState<string | null>(null)

  const workspaceGroupId = groupOverride ?? domainWrites.groupId

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseAgentDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) => (sameAgentDrillRoute(prev, next) ? prev : next))
      return
    }
    const timer = window.setTimeout(() => setDisplayedDrill(null), FORM_SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [path])

  /**
   * Stable React key for the drill pane.
   * @param route - Displayed drill route.
   * @returns Key string.
   */
  function drillKey(route: AgentDrillRoute): string {
    if (route.kind === 'company') {
      return `company:${route.companyId}`
    }
    if (route.kind === 'salesRep') {
      return `rep:${route.companyId}:${route.repId ?? 'new'}`
    }
    return 'create'
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          slideReady ? 'transition-transform duration-[320ms]' : ''
        } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
      >
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          <AgentsPane
            writes={writes}
            workspaceGroupId={workspaceGroupId}
            onWorkspaceGroupChange={setGroupOverride}
            onNavigate={onNavigate}
          />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill?.kind === 'salesRep' ? (
            <AgentSalesRepPane
              key={drillKey(displayedDrill)}
              companyId={displayedDrill.companyId}
              repId={displayedDrill.repId}
              workspaceGroupId={workspaceGroupId}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
          {displayedDrill?.kind === 'company' ||
          displayedDrill?.kind === 'form' ? (
            <AgentDetailPane
              key={drillKey(displayedDrill)}
              mode={displayedDrill.kind === 'company' ? 'detail' : 'create'}
              companyId={
                displayedDrill.kind === 'company'
                  ? displayedDrill.companyId
                  : null
              }
              workspaceGroupId={workspaceGroupId}
              onWorkspaceGroupChange={setGroupOverride}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
