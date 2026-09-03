import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { useRef } from 'react'
import { I18nextProvider, useTranslation } from 'react-i18next'

import { LayoutItem } from '@/components/clash/layout/layout-item'
import { LayoutTraffic } from '@/components/clash/layout/layout-traffic'
import { SidebarModeControl } from '@/components/layout/sidebar-mode-control'
import {
  SIDEBAR_COLLAPSED_PX,
  SIDEBAR_EXPANDED_PX,
  type SidebarMode,
} from '@/hooks/use-sidebar-mode'
import workbenchI18n from '@/i18n'

export interface ClashSidebarNavItem {
  path: string
  icon: ReactNode
  label: string
}

interface SortableNavMenuItemProps {
  item: ClashSidebarNavItem
  expanded: boolean
}

/**
 * Drag-enabled Clash nav row.
 * @param props - Item and expand state.
 * @returns Sortable layout item.
 */
function SortableNavMenuItem({ item, expanded }: SortableNavMenuItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.path,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  if (isDragging) {
    style.zIndex = 100
  }

  return (
    <LayoutItem
      to={item.path}
      icon={item.icon}
      expanded={expanded}
      sortable={{
        setNodeRef,
        attributes,
        listeners,
        style,
        isDragging,
      }}
    >
      {item.label}
    </LayoutItem>
  )
}

interface ClashSidebarProps {
  items: ClashSidebarNavItem[]
  expanded: boolean
  mode: SidebarMode
  menuUnlocked: boolean
  onSetMode: (mode: SidebarMode) => void
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocusIn: () => void
  onFocusOut: (event: {
    currentTarget: EventTarget | null
    relatedTarget: EventTarget | null
  }) => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
  onDragEnd: (event: DragEndEvent) => void
}

/**
 * Clash module rail matching Admin CRM chrome (glass panel, Lucide rows,
 * expand / collapse / hover). On macOS the footer control is hidden; mode
 * is chosen from the native application menu instead.
 * @param props - Nav items, mode handlers, and optional reorder.
 * @returns Sidebar.
 */
export function ClashSidebar({
  items,
  expanded,
  mode,
  menuUnlocked,
  onSetMode,
  onPointerEnter,
  onPointerLeave,
  onFocusIn,
  onFocusOut,
  onContextMenu,
  onDragEnd,
}: ClashSidebarProps) {
  const { t } = useTranslation()
  const nativeApplicationMenu = Boolean(window.workbench?.window?.usesNativeApplicationMenu)
  const asideRef = useRef<HTMLElement>(null)
  const hoverOverlay = mode === 'hover'
  const itemIds = items.map((item) => item.path)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const navList = menuUnlocked ? (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={itemIds}>
        {items.map((item) => (
          <SortableNavMenuItem key={item.path} item={item} expanded={expanded} />
        ))}
      </SortableContext>
    </DndContext>
  ) : (
    items.map((item) => (
      <LayoutItem key={item.path} to={item.path} icon={item.icon} expanded={expanded}>
        {item.label}
      </LayoutItem>
    ))
  )

  return (
    <aside
      ref={asideRef}
      className={[
        'glass-panel flex h-full min-h-0 flex-col border-y-0 border-l-0 transition-[width,box-shadow] duration-300 ease-out',
        hoverOverlay ? 'absolute inset-y-0 left-0 z-20' : 'w-full',
        hoverOverlay && expanded ? 'shadow-xl shadow-black/20' : '',
      ].join(' ')}
      style={
        hoverOverlay
          ? { width: expanded ? SIDEBAR_EXPANDED_PX : SIDEBAR_COLLAPSED_PX }
          : undefined
      }
      onPointerEnter={onPointerEnter}
      onPointerLeave={(event) => {
        onPointerLeave()
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
          return
        }
        const root = asideRef.current
        const active = document.activeElement
        if (root && active instanceof HTMLElement && root.contains(active)) {
          active.blur()
        }
      }}
      onFocusCapture={onFocusIn}
      onBlurCapture={(event) =>
        onFocusOut({
          currentTarget: asideRef.current,
          relatedTarget: event.relatedTarget,
        })
      }
    >
      {menuUnlocked ? (
        <div className="mx-1.5 mt-2 mb-1 rounded-lg bg-amber-500/90 px-2 py-1.5 text-center text-[11px] font-semibold text-white">
          {t('layout.components.navigation.menu.reorderMode')}
        </div>
      ) : null}

      <nav
        className={[
          'min-h-0 flex-1 overflow-x-hidden overflow-y-auto py-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          expanded ? 'px-1.5 pr-2.5' : 'px-1.5',
        ].join(' ')}
        aria-label={t('layout.components.navigation.ariaLabel')}
        onContextMenu={onContextMenu}
      >
        {navList}
      </nav>

      <LayoutTraffic expanded={expanded} />

      {nativeApplicationMenu ? null : (
        <I18nextProvider i18n={workbenchI18n}>
          <SidebarModeControl expanded={expanded} mode={mode} onSetMode={onSetMode} />
        </I18nextProvider>
      )}
    </aside>
  )
}
