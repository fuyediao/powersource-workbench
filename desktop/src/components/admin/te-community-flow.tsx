/**
 * T&E Community list ↔ post detail with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { TeCommunityPane } from '@/components/admin/te-community-pane'
import { TeCommunityPostDetailPane } from '@/components/admin/te-community-post-detail-pane'
import {
  parseTeCommunityDrillPath,
  sameTeCommunityDrillRoute,
  type TeCommunityDrillRoute,
} from '@/utils/te-community-routes'

/** Matches customers / KOL drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface TeCommunityFlowProps {
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the community post list and detail panes; slides the drill pane in from the right.
 *
 * @param props - Shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function TeCommunityFlow({ path, writes, onNavigate }: TeCommunityFlowProps) {
  const drillRoute = parseTeCommunityDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<TeCommunityDrillRoute | null>(
    drillRoute,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseTeCommunityDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) => (sameTeCommunityDrillRoute(prev, next) ? prev : next))
      return
    }
    const timer = window.setTimeout(() => setDisplayedDrill(null), FORM_SLIDE_MS)
    return () => window.clearTimeout(timer)
  }, [path])

  const liveDrill = parseTeCommunityDrillPath(path)
  const displayedTab = liveDrill ? liveDrill.tab : (displayedDrill?.tab ?? null)

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          slideReady ? 'transition-transform duration-[320ms]' : ''
        } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
      >
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          <TeCommunityPane listActive={!showDrill} onNavigate={onNavigate} />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill ? (
            <TeCommunityPostDetailPane
              key={`detail:${displayedDrill.postId}`}
              postId={displayedDrill.postId}
              tab={displayedTab}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
