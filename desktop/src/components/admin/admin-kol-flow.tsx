/**
 * KOL list ↔ detail / create with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { KolDetailPane } from '@/components/admin/kol-detail-pane'
import { KolsPane } from '@/components/admin/kols-pane'
import {
  parseKolDrillPath,
  sameKolDrillRoute,
  type KolDrillRoute,
} from '@/utils/kol-routes'

/** Matches customers drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface AdminKolFlowProps {
  userId: string
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the KOL list and detail/create panes; slides the drill pane in from the right.
 * @param props - Signed-in user, shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function AdminKolFlow({ userId, path, writes, onNavigate }: AdminKolFlowProps) {
  const drillRoute = parseKolDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<KolDrillRoute | null>(
    drillRoute,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseKolDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) => (sameKolDrillRoute(prev, next) ? prev : next))
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
  function drillKey(route: KolDrillRoute): string {
    return route.kind === 'detail' ? `detail:${route.kolId}` : 'create'
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          slideReady ? 'transition-transform duration-[320ms]' : ''
        } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
      >
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          <KolsPane writes={writes} onNavigate={onNavigate} />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill ? (
            <KolDetailPane
              key={drillKey(displayedDrill)}
              mode={displayedDrill.kind === 'detail' ? 'detail' : 'create'}
              userId={userId}
              kolId={
                displayedDrill.kind === 'detail' ? displayedDrill.kolId : null
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
