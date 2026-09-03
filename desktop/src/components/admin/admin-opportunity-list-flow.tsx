/**
 * Opportunities list ↔ detail / create with a right-to-left drill-down slide.
 * The Freeform board is a separate page (`/kanban/opportunities` in the Kanban app).
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { OpportunityDetailPane } from '@/components/admin/opportunity-detail-pane'
import { OpportunitiesListPane } from '@/components/admin/opportunities-list-pane'
import {
  parseOpportunityDrillPath,
  sameOpportunityDrillRoute,
  type OpportunityDrillRoute,
} from '@/utils/opportunity-list-routes'

/** Matches customers drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface AdminOpportunityListFlowProps {
  userId: string
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the opportunities list and detail/create panes; slides the drill pane
 * in from the right.
 * @param props - Current user, shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function AdminOpportunityListFlow({
  userId,
  path,
  writes,
  onNavigate,
}: AdminOpportunityListFlowProps) {
  const drillRoute = parseOpportunityDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<OpportunityDrillRoute | null>(
    drillRoute,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseOpportunityDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) =>
        sameOpportunityDrillRoute(prev, next) ? prev : next,
      )
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
  function drillKey(route: OpportunityDrillRoute): string {
    return route.kind === 'detail' ? `detail:${route.opportunityId}` : 'create'
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          slideReady ? 'transition-transform duration-[320ms]' : ''
        } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
      >
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          <OpportunitiesListPane writes={writes} onNavigate={onNavigate} />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill ? (
            <OpportunityDetailPane
              key={drillKey(displayedDrill)}
              mode={displayedDrill.kind === 'detail' ? 'detail' : 'create'}
              opportunityId={
                displayedDrill.kind === 'detail' ? displayedDrill.opportunityId : null
              }
              userId={userId}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
