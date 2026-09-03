/**
 * Competitor shop list ↔ shop / line detail with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CompetitorLinePane } from '@/components/admin/competitor-line-pane'
import { CompetitorShopDetailPane } from '@/components/admin/competitor-shop-detail-pane'
import { CompetitorShopsPane } from '@/components/admin/competitor-shops-pane'
import {
  parseCompetitorDrillPath,
  sameCompetitorDrillRoute,
  type CompetitorDrillRoute,
} from '@/utils/competitor-routes'

/** Matches customers drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface AdminCompetitorFlowProps {
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the competitor list plus shop / line drill panes.
 * @param props - Shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function AdminCompetitorFlow({
  path,
  writes,
  onNavigate,
}: AdminCompetitorFlowProps) {
  const drillRoute = parseCompetitorDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] =
    useState<CompetitorDrillRoute | null>(drillRoute)
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseCompetitorDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) =>
        sameCompetitorDrillRoute(prev, next) ? prev : next,
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
  function drillKey(route: CompetitorDrillRoute): string {
    if (route.kind === 'shop') {
      return `shop:${route.shopId}`
    }
    if (route.kind === 'line') {
      return `line:${route.shopId}:${route.lineId ?? 'new'}`
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
          <CompetitorShopsPane writes={writes} onNavigate={onNavigate} />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill?.kind === 'line' ? (
            <CompetitorLinePane
              key={drillKey(displayedDrill)}
              shopId={displayedDrill.shopId}
              lineId={displayedDrill.lineId}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
          {displayedDrill?.kind === 'shop' || displayedDrill?.kind === 'form' ? (
            <CompetitorShopDetailPane
              key={drillKey(displayedDrill)}
              mode={displayedDrill.kind === 'shop' ? 'detail' : 'create'}
              shopId={
                displayedDrill.kind === 'shop' ? displayedDrill.shopId : null
              }
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
