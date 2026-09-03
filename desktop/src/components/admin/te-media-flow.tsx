/**
 * T&E shared-media list ↔ group detail with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { TeMediaGroupPane } from '@/components/admin/te-media-group-pane'
import { TeMediaPane } from '@/components/admin/te-media-pane'
import {
  parseTeMediaDrillPath,
  sameTeMediaDrillRoute,
  type TeMediaDrillRoute,
} from '@/utils/te-media-routes'

/** Matches customers / KOL drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface TeMediaFlowProps {
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the shared-media set list and group-detail pane; slides the drill pane in from the right.
 *
 * @param props - Shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function TeMediaFlow({ path, writes, onNavigate }: TeMediaFlowProps) {
  const drillRoute = parseTeMediaDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<TeMediaDrillRoute | null>(
    drillRoute,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseTeMediaDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) => (sameTeMediaDrillRoute(prev, next) ? prev : next))
      return
    }
    const timer = window.setTimeout(() => setDisplayedDrill(null), FORM_SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [path])

  /**
   * Stable React key for the drill pane.
   *
   * @param route - Displayed drill route.
   * @returns Key string.
   */
  function drillKey(route: TeMediaDrillRoute): string {
    return `detail:${route.groupId}`
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          slideReady ? 'transition-transform duration-[320ms]' : ''
        } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
      >
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          <TeMediaPane writes={writes} onNavigate={onNavigate} />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill ? (
            <TeMediaGroupPane
              key={drillKey(displayedDrill)}
              groupId={displayedDrill.groupId}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
