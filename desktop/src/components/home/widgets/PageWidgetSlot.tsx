import type { ReactNode } from 'react'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { AsideWidgetId } from '@/constants/aside-widgets'

/** Leave animation duration for home page widgets (ms). */
export const PAGE_WIDGET_LEAVE_MS = 320

interface PageWidgetSlotProps {
  /** Aside widget id for reorder FLIP measurement. */
  widgetId: AsideWidgetId
  /** Whether the widget should be visible. */
  show: boolean
  /** Spans the full Markets/News pair row (weather lead). */
  lead?: boolean
  children: ReactNode
}

/**
 * Mounts a home widget through enter/leave animations when toggled in Page settings.
 * @param props - Widget id, visibility, optional lead layout, and content.
 * @returns Animated slot, or null when fully unmounted.
 */
export function PageWidgetSlot({
  widgetId,
  show,
  lead = false,
  children,
}: PageWidgetSlotProps) {
  const { mounted, leaving } = useDialogPresence(show, PAGE_WIDGET_LEAVE_MS)
  if (!mounted) {
    return null
  }
  return (
    <div
      data-aside-widget-id={widgetId}
      className={`${lead ? 'content-stage-aside-lead' : ''} ${
        leaving ? 'animate-page-widget-out' : 'animate-page-widget-in'
      }`}
    >
      {children}
    </div>
  )
}
