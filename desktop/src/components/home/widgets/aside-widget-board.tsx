import type { ReactNode } from 'react'
import { BusinessFocusWidgetCard } from '@/components/home/widgets/BusinessFocusWidgetCard'
import { CurrencyCard } from '@/components/home/widgets/CurrencyCard'
import { MailReminderWidgetCard } from '@/components/home/widgets/MailReminderWidgetCard'
import { MarketsCard } from '@/components/home/widgets/MarketsCard'
import { NewsCard } from '@/components/home/widgets/NewsCard'
import { PageWidgetSlot } from '@/components/home/widgets/PageWidgetSlot'
import { ScheduleWidgetCard } from '@/components/home/widgets/ScheduleWidgetCard'
import { TodoCard } from '@/components/home/widgets/TodoCard'
import { WeatherCard } from '@/components/home/widgets/WeatherCard'
import { CrmAsideWidgetsProvider } from '@/hooks/use-crm-aside-widgets'
import type { AsideWidgetId } from '@/constants/aside-widgets'

interface AsideWidgetVisibility {
  weather: boolean
  todo: boolean
  currency: boolean
  markets: boolean
  news: boolean
  schedule: boolean
  mail: boolean
  focus: boolean
}

interface AsideWidgetBoardProps {
  /** Signed-in user id (CRM schedule create + owner scope). */
  userId: string
  order: AsideWidgetId[]
  visibility: AsideWidgetVisibility
  leadId: AsideWidgetId | undefined
  /** Two-column stack packing under the apps panel (sm+). */
  pair: boolean
  /**
   * Opens Admin on a CRM path (schedule / focus shortcuts).
   * @param path - Absolute Admin path.
   */
  onOpenAdminPath: (path: string) => void
  /** Opens the Mail Function tab. */
  onOpenMail: () => void
}

/**
 * Renders one aside widget slot by id.
 * @param id - Widget id.
 * @param show - Visibility flag.
 * @param lead - Whether this slot spans the full pair row.
 * @param userId - Signed-in user id.
 * @param onOpenAdminPath - Admin path opener.
 * @param onOpenMail - Mail feature opener.
 * @returns Widget slot.
 */
function renderAsideWidget(
  id: AsideWidgetId,
  show: boolean,
  lead: boolean,
  userId: string,
  onOpenAdminPath: (path: string) => void,
  onOpenMail: () => void,
): ReactNode {
  if (id === 'weather') {
    return (
      <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
        <WeatherCard />
      </PageWidgetSlot>
    )
  }
  if (id === 'todo') {
    return (
      <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
        <TodoCard />
      </PageWidgetSlot>
    )
  }
  if (id === 'currency') {
    return (
      <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
        <CurrencyCard />
      </PageWidgetSlot>
    )
  }
  if (id === 'markets') {
    return (
      <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
        <MarketsCard />
      </PageWidgetSlot>
    )
  }
  if (id === 'news') {
    return (
      <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
        <NewsCard />
      </PageWidgetSlot>
    )
  }
  if (id === 'schedule') {
    return (
      <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
        <ScheduleWidgetCard
          userId={userId}
          onOpenAdminPath={onOpenAdminPath}
        />
      </PageWidgetSlot>
    )
  }
  if (id === 'mail') {
    return (
      <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
        <MailReminderWidgetCard onOpenMail={onOpenMail} />
      </PageWidgetSlot>
    )
  }
  return (
    <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
      <BusinessFocusWidgetCard onOpenAdminPath={onOpenAdminPath} />
    </PageWidgetSlot>
  )
}

/**
 * Lays out aside widgets in a single column, or as lead + two packed columns.
 * @param props - Order, visibility, lead id, pair mode, and CRM navigation.
 * @returns Widget board.
 */
export function AsideWidgetBoard({
  userId,
  order,
  visibility,
  leadId,
  pair,
  onOpenAdminPath,
  onOpenMail,
}: AsideWidgetBoardProps) {
  /**
   * Resolves visibility for one widget id.
   * @param id - Widget id.
   * @returns Whether the widget should show.
   */
  function isShown(id: AsideWidgetId): boolean {
    return visibility[id]
  }

  const needsCrmData = order.some(
    (id) =>
      (id === 'schedule' && visibility.schedule) ||
      (id === 'mail' && visibility.mail) ||
      (id === 'focus' && visibility.focus),
  )

  /**
   * Renders the ordered slots (with or without CRM provider).
   * @returns Slot tree.
   */
  function renderBoard(): ReactNode {
    if (!pair || !leadId) {
      return (
        <>
          {order.map((id) =>
            renderAsideWidget(
              id,
              isShown(id),
              id === leadId,
              userId,
              onOpenAdminPath,
              onOpenMail,
            ),
          )}
        </>
      )
    }

    const restIds = order.filter((id) => id !== leadId)
    const leftIds = restIds.filter((_, index) => index % 2 === 0)
    const rightIds = restIds.filter((_, index) => index % 2 === 1)

    return (
      <>
        {renderAsideWidget(
          leadId,
          isShown(leadId),
          true,
          userId,
          onOpenAdminPath,
          onOpenMail,
        )}
        <div className="content-stage-aside-pair-cols">
          <div className="content-stage-aside-pair-col">
            {leftIds.map((id) =>
              renderAsideWidget(
                id,
                isShown(id),
                false,
                userId,
                onOpenAdminPath,
                onOpenMail,
              ),
            )}
          </div>
          <div className="content-stage-aside-pair-col">
            {rightIds.map((id) =>
              renderAsideWidget(
                id,
                isShown(id),
                false,
                userId,
                onOpenAdminPath,
                onOpenMail,
              ),
            )}
          </div>
        </div>
      </>
    )
  }

  if (!needsCrmData) {
    return <>{renderBoard()}</>
  }

  return (
    <CrmAsideWidgetsProvider userId={userId}>
      {renderBoard()}
    </CrmAsideWidgetsProvider>
  )
}
