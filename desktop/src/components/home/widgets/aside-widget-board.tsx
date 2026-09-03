import type { ReactNode } from 'react'
import { CurrencyCard } from '@/components/home/widgets/CurrencyCard'
import { MailReminderWidgetCard } from '@/components/home/widgets/MailReminderWidgetCard'
import { MarketsCard } from '@/components/home/widgets/MarketsCard'
import { NewsCard } from '@/components/home/widgets/NewsCard'
import { PageWidgetSlot } from '@/components/home/widgets/PageWidgetSlot'
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
  mail: boolean
}

interface AsideWidgetBoardProps {
  order: AsideWidgetId[]
  visibility: AsideWidgetVisibility
  leadId: AsideWidgetId | undefined
  /** Two-column stack packing under the apps panel (sm+). */
  pair: boolean
  /** Opens the Mail Function tab. */
  onOpenMail: () => void
}

/**
 * Renders one aside widget slot by id.
 * @param id - Widget id.
 * @param show - Visibility flag.
 * @param lead - Whether this slot spans the full pair row.
 * @param onOpenMail - Mail feature opener.
 * @returns Widget slot.
 */
function renderAsideWidget(
  id: AsideWidgetId,
  show: boolean,
  lead: boolean,
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
  return (
    <PageWidgetSlot key={id} widgetId={id} show={show} lead={lead}>
      <MailReminderWidgetCard onOpenMail={onOpenMail} />
    </PageWidgetSlot>
  )
}

/**
 * Lays out aside widgets in a single column, or as lead + two packed columns.
 * @param props - Order, visibility, lead id, pair mode, and mail navigation.
 * @returns Widget board.
 */
export function AsideWidgetBoard({
  order,
  visibility,
  leadId,
  pair,
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

  const needsMailData = order.some((id) => id === 'mail' && visibility.mail)

  /**
   * Renders the ordered slots (with or without the mail unread provider).
   * @returns Slot tree.
   */
  function renderBoard(): ReactNode {
    if (!pair || !leadId) {
      return (
        <>
          {order.map((id) =>
            renderAsideWidget(id, isShown(id), id === leadId, onOpenMail),
          )}
        </>
      )
    }

    const restIds = order.filter((id) => id !== leadId)
    const leftIds = restIds.filter((_, index) => index % 2 === 0)
    const rightIds = restIds.filter((_, index) => index % 2 === 1)

    return (
      <>
        {renderAsideWidget(leadId, isShown(leadId), true, onOpenMail)}
        <div className="content-stage-aside-pair-cols">
          <div className="content-stage-aside-pair-col">
            {leftIds.map((id) => renderAsideWidget(id, isShown(id), false, onOpenMail))}
          </div>
          <div className="content-stage-aside-pair-col">
            {rightIds.map((id) => renderAsideWidget(id, isShown(id), false, onOpenMail))}
          </div>
        </div>
      </>
    )
  }

  if (!needsMailData) {
    return <>{renderBoard()}</>
  }

  return <CrmAsideWidgetsProvider>{renderBoard()}</CrmAsideWidgetsProvider>
}
