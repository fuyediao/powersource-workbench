/**
 * Customers list ↔ detail / create / edit with a right-to-left drill-down slide.
 */

import { useEffect, useState } from 'react'
import type { AdminShellWrites } from '@/components/admin/admin-shell'
import { CustomerDetailPane } from '@/components/admin/customer-detail-pane'
import { CustomerFormPane } from '@/components/admin/customer-form-pane'
import { CustomersPane } from '@/components/admin/customers-pane'
import {
  parseCustomerDrillPath,
  sameCustomerDrillRoute,
  type CustomerDrillRoute,
} from '@/utils/customer-routes'

/** Matches map / group-management drill-down slide timing. */
const FORM_SLIDE_MS = 320

interface AdminCustomersFlowProps {
  userId: string
  path: string | null
  writes: AdminShellWrites | null
  onNavigate: (path: string) => void
}

/**
 * Hosts the customers list and detail/form panes; slides the drill pane in from the right.
 * @param props - Shell path, writes, and navigation.
 * @returns Sliding list/drill host.
 */
export function AdminCustomersFlow({
  userId,
  path,
  writes,
  onNavigate,
}: AdminCustomersFlowProps) {
  const drillRoute = parseCustomerDrillPath(path)
  const showDrill = drillRoute !== null
  const [displayedDrill, setDisplayedDrill] = useState<CustomerDrillRoute | null>(drillRoute)
  const [slideReady, setSlideReady] = useState(false)

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setSlideReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  // Depend on `path` (string), not `drillRoute` (new object every render).
  useEffect(() => {
    const next = parseCustomerDrillPath(path)
    if (next) {
      setDisplayedDrill((prev) => (sameCustomerDrillRoute(prev, next) ? prev : next))
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
  function drillKey(route: CustomerDrillRoute): string {
    if (route.kind === 'detail') {
      return `detail:${route.customerId}`
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
          <CustomersPane userId={userId} writes={writes} onNavigate={onNavigate} />
        </div>
        <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
          {displayedDrill?.kind === 'detail' ? (
            <CustomerDetailPane
              key={drillKey(displayedDrill)}
              userId={userId}
              customerId={displayedDrill.customerId}
              writes={writes}
              onNavigate={onNavigate}
            />
          ) : null}
          {displayedDrill?.kind === 'form' ? (
            <CustomerFormPane
              key={drillKey(displayedDrill)}
              userId={userId}
              writes={writes}
              mode={displayedDrill.mode}
              customerId={displayedDrill.customerId}
              onNavigate={onNavigate}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
