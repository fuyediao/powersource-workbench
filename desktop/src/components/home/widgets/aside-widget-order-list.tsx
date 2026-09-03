/**
 * Drag-and-drop lists for left/right home aside widget rails.
 */

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  CurrencyIcon,
  GripIcon,
  MailIcon,
  NewsIcon,
  TodoIcon,
  TrendIcon,
  WeatherIcon,
} from '@/icons/AllIcons'
import {
  normalizeAsideWidgetRails,
  type AsideWidgetId,
  type AsideWidgetRail,
  type AsideWidgetRails,
} from '@/constants/aside-widgets'

interface AsideWidgetOrderListProps {
  rails: AsideWidgetRails
  onChange: (rails: AsideWidgetRails) => void
}

interface WidgetRowVisualProps {
  label: string
  Icon: typeof WeatherIcon
  dragging?: boolean
  muted?: boolean
}

const LEFT_DROPPABLE = 'rail-left'
const RIGHT_DROPPABLE = 'rail-right'

/**
 * Shared row chrome for list items and the drag overlay.
 * @param props - Label, icon, and visual state.
 * @returns Row content.
 */
function WidgetRowVisual({ label, Icon, dragging = false, muted = false }: WidgetRowVisualProps) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-zinc-950/5 px-3 py-2.5 dark:bg-white/5 ${
        dragging ? 'shadow-lg shadow-brand/20 ring-1 ring-brand/25' : ''
      } ${muted ? 'opacity-40' : ''}`}
    >
      <GripIcon className="size-4 shrink-0 text-muted" />
      <Icon className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1 text-sm font-semibold text-brand">{label}</span>
    </div>
  )
}

interface SortableRowProps {
  id: AsideWidgetId
  label: string
  Icon: typeof WeatherIcon
}

/**
 * One sortable row; while active, stays as a muted placeholder (overlay follows the pointer).
 * @param props - Widget id, label, and icon.
 * @returns Sortable row.
 */
function SortableRow({ id, label, Icon }: SortableRowProps) {
  const sortable = useSortable({ id })

  return (
    <li
      ref={sortable.setNodeRef}
      style={{
        // Keep layout slot; do not translate the source off-canvas (overlay handles motion).
        transform: sortable.isDragging
          ? undefined
          : CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className="list-none"
      {...sortable.attributes}
      {...sortable.listeners}
    >
      <WidgetRowVisual label={label} Icon={Icon} muted={sortable.isDragging} />
    </li>
  )
}

interface RailColumnProps {
  droppableId: string
  title: string
  items: AsideWidgetId[]
  labels: Record<AsideWidgetId, string>
  icons: Record<AsideWidgetId, typeof WeatherIcon>
  emptyHint: string
}

/**
 * One droppable rail column with a sortable list.
 * @param props - Rail metadata and items.
 * @returns Column UI.
 */
function RailColumn({
  droppableId,
  title,
  items,
  labels,
  icons,
  emptyHint,
}: RailColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId })

  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{title}</p>
      <div
        ref={setNodeRef}
        className={`min-h-28 overflow-hidden rounded-2xl border border-dashed p-2 transition-colors ${
          isOver ? 'border-brand/50 bg-brand/5' : 'border-ink/15'
        }`}
      >
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs font-medium text-muted">{emptyHint}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((id) => (
                <SortableRow key={id} id={id} label={labels[id]} Icon={icons[id]} />
              ))}
            </ul>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

/**
 * Resolves which rail contains a widget or droppable id.
 * @param id - Active/over id.
 * @param rails - Current rails.
 * @returns Rail key, or null.
 */
function resolveRail(
  id: string | number,
  rails: AsideWidgetRails,
): AsideWidgetRail | null {
  const key = String(id)
  if (key === LEFT_DROPPABLE) {
    return 'left'
  }
  if (key === RIGHT_DROPPABLE) {
    return 'right'
  }
  if (rails.left.includes(key as AsideWidgetId)) {
    return 'left'
  }
  if (rails.right.includes(key as AsideWidgetId)) {
    return 'right'
  }
  return null
}

/**
 * Drag-and-drop dual lists for left/right home widget rails.
 * @param props - Current rails and change handler.
 * @returns Sortable dual-column UI.
 */
export function AsideWidgetOrderList({ rails, onChange }: AsideWidgetOrderListProps) {
  const { t } = useTranslation()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )
  const [draft, setDraft] = useState<AsideWidgetRails | null>(null)
  const [activeId, setActiveId] = useState<AsideWidgetId | null>(null)
  const view = draft ?? rails

  const labels: Record<AsideWidgetId, string> = {
    weather: t('weather.title'),
    todo: t('todo.title'),
    currency: t('currency.title'),
    markets: t('markets.title'),
    news: t('news.title'),
    mail: t('home.aside.mailReminder'),
  }

  const icons: Record<AsideWidgetId, typeof WeatherIcon> = {
    weather: WeatherIcon,
    todo: TodoIcon,
    currency: CurrencyIcon,
    markets: TrendIcon,
    news: NewsIcon,
    mail: MailIcon,
  }

  /**
   * Remembers the active row for the floating overlay.
   * @param event - Drag start event.
   * @returns Nothing.
   */
  function handleDragStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id) as AsideWidgetId)
  }

  /**
   * Live-updates draft rails while dragging across columns.
   * @param event - Drag over event.
   * @returns Nothing.
   */
  function handleDragOver(event: DragOverEvent): void {
    const { active, over } = event
    if (!over) {
      return
    }
    const draggedId = String(active.id) as AsideWidgetId
    const from = resolveRail(active.id, view)
    const to = resolveRail(over.id, view)
    if (!from || !to || from === to) {
      return
    }
    setDraft((current) => {
      const base = current ?? rails
      const fromItems = [...base[from]]
      const toItems = [...base[to]]
      const fromIndex = fromItems.indexOf(draggedId)
      if (fromIndex < 0) {
        return current
      }
      fromItems.splice(fromIndex, 1)
      const overId = String(over.id)
      let toIndex = toItems.indexOf(overId as AsideWidgetId)
      if (toIndex < 0) {
        toIndex = toItems.length
      }
      toItems.splice(toIndex, 0, draggedId)
      return normalizeAsideWidgetRails(
        from === 'left' ? fromItems : to === 'left' ? toItems : base.left,
        from === 'right' ? fromItems : to === 'right' ? toItems : base.right,
      )
    })
  }

  /**
   * Commits a completed drag (reorder within a rail or cross-rail move).
   * @param event - Drag end event.
   * @returns Nothing.
   */
  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    const working = draft ?? rails
    setDraft(null)
    setActiveId(null)
    if (!over) {
      return
    }
    const draggedId = String(active.id) as AsideWidgetId
    const from = resolveRail(active.id, working)
    const to = resolveRail(over.id, working)
    if (!from || !to) {
      return
    }

    if (from === to) {
      const list = [...working[from]]
      const oldIndex = list.indexOf(draggedId)
      const overId = String(over.id)
      const newIndex =
        overId === LEFT_DROPPABLE || overId === RIGHT_DROPPABLE
          ? list.length - 1
          : list.indexOf(overId as AsideWidgetId)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        onChange(working)
        return
      }
      const nextList = arrayMove(list, oldIndex, newIndex)
      onChange(
        normalizeAsideWidgetRails(
          from === 'left' ? nextList : working.left,
          from === 'right' ? nextList : working.right,
        ),
      )
      return
    }

    onChange(working)
  }

  /**
   * Clears draft + overlay when the drag is cancelled.
   * @returns Nothing.
   */
  function handleDragCancel(): void {
    setDraft(null)
    setActiveId(null)
  }

  const ActiveIcon = activeId ? icons[activeId] : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <RailColumn
          droppableId={LEFT_DROPPABLE}
          title={t('widgetTools.orderLeft')}
          items={view.left}
          labels={labels}
          icons={icons}
          emptyHint={t('widgetTools.orderEmpty')}
        />
        <RailColumn
          droppableId={RIGHT_DROPPABLE}
          title={t('widgetTools.orderRight')}
          items={view.right}
          labels={labels}
          icons={icons}
          emptyHint={t('widgetTools.orderEmpty')}
        />
      </div>
      {typeof document !== 'undefined'
        ? createPortal(
            <DragOverlay adjustScale={false} dropAnimation={null} zIndex={300}>
              {activeId && ActiveIcon ? (
                <div className="pointer-events-none w-[min(100vw-2rem,18rem)] cursor-grabbing">
                  <WidgetRowVisual
                    label={labels[activeId]}
                    Icon={ActiveIcon}
                    dragging
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  )
}
