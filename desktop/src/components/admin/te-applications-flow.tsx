/**
 * T&E Applications list ↔ detail with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { TeApplicationDetailPane } from '@/components/admin/te-application-detail-pane'
import { TeApplicationsPane } from '@/components/admin/te-applications-pane'
import { useTeSubmissions } from '@/hooks/use-te-submissions'
import {
  parseTeApplicationDrillPath,
  sameTeApplicationDrillRoute,
  type TeApplicationDrillRoute,
} from '@/utils/te-application-routes'

/** Matches customers drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface TeApplicationsFlowProps {
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the T&E applications list and detail panes; slides the drill pane in from the right.
 *
 * @param props - Shell path, writes, and navigation
 * @returns Sliding list/drill host
 */
export function TeApplicationsFlow({
  path,
  writes,
  onNavigate,
}: TeApplicationsFlowProps) {
  const submissionsState = useTeSubmissions()
  const drillRoute = parseTeApplicationDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<TeApplicationDrillRoute | null>(
    drillRoute,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseTeApplicationDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) => (sameTeApplicationDrillRoute(prev, next) ? prev : next))
      return
    }
    const timer = window.setTimeout(() => setDisplayedDrill(null), FORM_SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [path])

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          slideReady ? 'transition-transform duration-[320ms]' : ''
        } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
      >
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          <TeApplicationsPane
            writes={writes}
            submissionsState={submissionsState}
            onNavigate={onNavigate}
          />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill ? (
            <TeApplicationDetailPane
              key={displayedDrill.submissionId}
              submissionId={displayedDrill.submissionId}
              writes={writes}
              onRefreshList={submissionsState.fetchSubmissions}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
