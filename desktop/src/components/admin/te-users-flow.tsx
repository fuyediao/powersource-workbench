/**
 * T&E community-user list ↔ detail with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { TeUserDetailPane } from '@/components/admin/te-user-detail-pane'
import { TeUsersPane } from '@/components/admin/te-users-pane'
import {
  parseTeUserDrillPath,
  sameTeUserDrillRoute,
  type TeUserDrillRoute,
} from '@/utils/te-user-routes'

/** Matches KOL / customers drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface TeUsersFlowProps {
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the T&E users list and detail panes; slides the drill pane in from the right.
 *
 * @param props - Shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function TeUsersFlow({ path, writes, onNavigate }: TeUsersFlowProps) {
  const drillRoute = parseTeUserDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<TeUserDrillRoute | null>(
    drillRoute,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseTeUserDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) => (sameTeUserDrillRoute(prev, next) ? prev : next))
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
          <TeUsersPane
            writes={writes}
            onNavigate={onNavigate}
            listActive={!showDrill}
          />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill ? (
            <TeUserDetailPane
              key={displayedDrill.userId}
              userId={displayedDrill.userId}
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
