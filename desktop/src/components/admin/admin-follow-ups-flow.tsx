/**
 * Follow-ups list ↔ company / entity timeline with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { FollowUpTimelinePane } from '@/components/admin/follow-up-timeline-pane'
import { FollowUpsPane } from '@/components/admin/follow-ups-pane'
import {
  parseFollowUpDrillPath,
  sameFollowUpDrillRoute,
  type FollowUpDrillRoute,
} from '@/utils/follow-up-routes'

/** Matches customers drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface AdminFollowUpsFlowProps {
  userId: string
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the follow-ups list and timeline panes; slides the drill pane in from the right.
 * @param props - Shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function AdminFollowUpsFlow({
  userId,
  path,
  writes,
  onNavigate,
}: AdminFollowUpsFlowProps) {
  const { t } = useTranslation()
  const drillRoute = parseFollowUpDrillPath(path)
  const showDrill =
    drillRoute !== null &&
    (drillRoute.kind === 'company' || drillRoute.kind === 'entity')
  const [displayedDrill, setDisplayedDrill] = useState<FollowUpDrillRoute | null>(
    showDrill ? drillRoute : null,
  )
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const next = parseFollowUpDrillPath(path)
    if (next && (next.kind === 'company' || next.kind === 'entity')) {
      setDisplayedDrill((prev) =>
        sameFollowUpDrillRoute(prev, next) ? prev : next,
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
  function drillKey(route: FollowUpDrillRoute): string {
    if (route.kind === 'entity') {
      return `entity:${route.type}:${route.id}`
    }
    if (route.kind === 'company') {
      return `company:${route.name}:${route.entities.map((e) => `${e.type}:${e.id}`).join(',')}`
    }
    return 'list'
  }

  /**
   * Title for the timeline header.
   * @param route - Drill route.
   * @returns Display title.
   */
  function timelineTitle(route: FollowUpDrillRoute): string {
    if (route.kind === 'company') {
      return route.name || t('admin.followUpTimeline.title')
    }
    if (route.kind === 'entity') {
      return route.name || t('admin.followUpTimeline.title')
    }
    return t('admin.followUpTimeline.title')
  }

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 flex h-full w-[200%] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
          slideReady ? 'transition-transform duration-[320ms]' : ''
        } ${showDrill ? '-translate-x-1/2' : 'translate-x-0'}`}
      >
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          <FollowUpsPane
            userId={userId}
            writes={writes}
            onNavigate={onNavigate}
          />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill?.kind === 'entity' ? (
            <FollowUpTimelinePane
              key={drillKey(displayedDrill)}
              userId={userId}
              writes={writes}
              title={timelineTitle(displayedDrill)}
              entity={{ type: displayedDrill.type, id: displayedDrill.id }}
              createContext={{
                type: displayedDrill.type,
                id: displayedDrill.id,
              }}
              onNavigate={onNavigate}
            />
          ) : null}
          {displayedDrill?.kind === 'company' ? (
            <FollowUpTimelinePane
              key={drillKey(displayedDrill)}
              userId={userId}
              writes={writes}
              title={timelineTitle(displayedDrill)}
              entities={displayedDrill.entities}
              createContext={displayedDrill.entities[0] ?? null}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
