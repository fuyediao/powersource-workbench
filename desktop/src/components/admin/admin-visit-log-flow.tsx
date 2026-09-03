/**
 * Visit-log list ↔ detail / create with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { VisitLogDetailPane } from '@/components/admin/visit-log-detail-pane'
import { VisitLogFormPane } from '@/components/admin/visit-log-form-pane'
import { VisitLogListPane } from '@/components/admin/visit-log-list-pane'
import {
  parseVisitLogDrillPath,
  sameVisitLogDrillRoute,
  type VisitLogDrillRoute,
} from '@/utils/visit-log-routes'

/** Matches customers / map drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface AdminVisitLogFlowProps {
  userId: string
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the visit-log list and detail/form panes; slides the drill pane in from the right.
 * @param props - Signed-in user, shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function AdminVisitLogFlow({
  userId,
  path,
  writes,
  onNavigate,
}: AdminVisitLogFlowProps) {
  const drillRoute = parseVisitLogDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<VisitLogDrillRoute | null>(
    drillRoute,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  // Depend on `path` (string), not `drillRoute` (new object every render).
  useEffect(() => {
    const next = parseVisitLogDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) => (sameVisitLogDrillRoute(prev, next) ? prev : next))
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
  function drillKey(route: VisitLogDrillRoute): string {
    if (route.kind === 'detail') {
      return `detail:${route.visitLogId}`
    }
    return 'form'
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          slideReady ? 'transition-transform duration-[320ms]' : ''
        } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
      >
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          <VisitLogListPane writes={writes} onNavigate={onNavigate} />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill?.kind === 'detail' ? (
            <VisitLogDetailPane
              key={drillKey(displayedDrill)}
              visitLogId={displayedDrill.visitLogId}
              path={path}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
          {displayedDrill?.kind === 'form' ? (
            <VisitLogFormPane
              key={drillKey(displayedDrill)}
              userId={userId}
              path={path}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
