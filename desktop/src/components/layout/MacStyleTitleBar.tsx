import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { titleBarIconForTab } from '@/constants/title-bar-tab-icons'
import { AiIcon, ChevronRightIcon, CloseIcon, HomeIcon, PinIcon } from '@/icons/AllIcons'

const CLOSE_ACTIVE = '#FF5F57'
const MINIMIZE_ACTIVE = '#FFBD2E'
const MAXIMIZE_ACTIVE = '#28CA42'
const INACTIVE = '#787878'
/** Close / minimize glyph (WinUI #AARRGGBB BF3C0700 → CSS #RRGGBBAA). */
const GLYPH_CLOSE_MIN = '#3c0700bf'
/** Maximize / restore glyph (WinUI #AARRGGBB BF003A08 → CSS #RRGGBBAA). */
const GLYPH_MAX = '#003a08bf'

/** Title-bar tab id (`home`, `settings`, or `browser:<uuid>`). */
export type TitleBarTabId = string

export interface TitleBarTab {
  id: TitleBarTabId
  label: string
  /** When true, shows an × that can dismiss the tab. */
  closable?: boolean
  /** Site favicon for in-app browser tabs (`<link rel="icon">`). */
  faviconUrl?: string
}

interface MacStyleTitleBarProps {
  /** Chrome-style tabs after the traffic lights (authenticated shell). */
  tabs?: TitleBarTab[]
  activeTabId?: TitleBarTabId
  onSelectTab?: (tabId: TitleBarTabId) => void
  onCloseTab?: (tabId: TitleBarTabId) => void
  /** Reorders closable tabs after a drag. */
  onReorderTabs?: (activeId: TitleBarTabId, overId: TitleBarTabId) => void
  /**
   * Tears off a tab dropped outside this window's strip (Chrome-style tab
   * tear-off / merge). Called with the drag's screen-space end point.
   */
  onTearOffTab?: (activeId: TitleBarTabId, screenPoint: { x: number; y: number }) => void
  /** Moves the tab into a brand-new window (submenu "New window"). */
  onOpenTabInNewWindow?: (tabId: TitleBarTabId) => void
  /** Moves the tab into an existing peer window (submenu window list). */
  onMoveTabToWindow?: (tabId: TitleBarTabId, windowId: number) => void
  /** Reloads the tab (in-app browser page, or remounts a feature/Settings/Folio page). */
  onReloadTab?: (tabId: TitleBarTabId) => void
  /** Shows the Home launcher button (authenticated shell). */
  showHome?: boolean
  /** Shows the persistent Ask AI control on the right (Chrome-style). */
  showAskAi?: boolean
  askAiOpen?: boolean
  onAskAiClick?: () => void
  /** Compact sign-in chrome: no pin, no maximize. */
  compactChrome?: boolean
}

interface SortableTitleTabProps {
  tab: TitleBarTab
  active: boolean
  onSelect: () => void
  onClose?: () => void
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
}

interface TrafficLightClusterProps {
  focused: boolean
  maximized: boolean
  hovering: boolean
  onHoverChange: (hovering: boolean) => void
  onClose: () => void
  onMinimize: () => void
  onMaximize: () => void
  showMaximize?: boolean
}

/** Viewport-space point where a tab drag ended. */
interface ClientPoint {
  x: number
  y: number
}

/** Right-click menu origin for one title-bar tab. */
interface TitleBarTabMenuState {
  tabId: TitleBarTabId
  x: number
  y: number
}

const TAB_MENU_MIN_WIDTH = 220
const TAB_MENU_VIEWPORT_PAD = 8
const TAB_FLYOUT_MIN_WIDTH = 180

/** Peer window shown in the Move-to submenu (omitted when this is the only window). */
interface TitleBarPeerWindow {
  id: number
  title: string
}

/**
 * Reports whether a drag ended inside this window's viewport.
 * @param point - Viewport-space drop point.
 * @returns True when the point is over this window's own content.
 */
function isWithinViewport(point: ClientPoint): boolean {
  return (
    point.x >= 0 &&
    point.x <= window.innerWidth &&
    point.y >= 0 &&
    point.y <= window.innerHeight
  )
}

/**
 * Resolves the viewport-space point where a tab drag ended. Prefers the
 * pointer (drag activator plus total delta) because the dragged tab's own
 * rect is clamped by the sortable strategy and understates how far the
 * pointer left the window; falls back to the tab's center otherwise.
 * @param activatorEvent - Event that started the drag.
 * @param delta - Total drag translation.
 * @param active - Dragged item with its measured rects.
 * @returns Client coordinates, or null when neither source is available.
 */
function clientDropPoint(
  activatorEvent: DragEndEvent['activatorEvent'],
  delta: DragEndEvent['delta'],
  active: DragEndEvent['active'],
): ClientPoint | null {
  // PointerEvent extends MouseEvent, so this covers the PointerSensor activator.
  if (activatorEvent instanceof MouseEvent) {
    return { x: activatorEvent.clientX + delta.x, y: activatorEvent.clientY + delta.y }
  }
  if (activatorEvent instanceof TouchEvent) {
    const touch = activatorEvent.touches[0] ?? activatorEvent.changedTouches[0]
    if (touch) {
      return { x: touch.clientX + delta.x, y: touch.clientY + delta.y }
    }
  }
  const rect = active.rect.current.translated ?? active.rect.current.initial
  if (!rect) {
    return null
  }
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * Clamps a context-menu origin so the panel stays inside the viewport.
 * @param x - Requested left.
 * @param y - Requested top.
 * @param width - Panel width.
 * @param height - Panel height.
 * @returns Clamped origin.
 */
function clampMenuOrigin(x: number, y: number, width: number, height: number): ClientPoint {
  const maxX = Math.max(TAB_MENU_VIEWPORT_PAD, window.innerWidth - width - TAB_MENU_VIEWPORT_PAD)
  const maxY = Math.max(TAB_MENU_VIEWPORT_PAD, window.innerHeight - height - TAB_MENU_VIEWPORT_PAD)
  return {
    x: Math.min(Math.max(TAB_MENU_VIEWPORT_PAD, x), maxX),
    y: Math.min(Math.max(TAB_MENU_VIEWPORT_PAD, y), maxY),
  }
}

/**
 * Formats a context-menu keyboard chord for this OS.
 * @param mac - Label on macOS (⌘ glyph).
 * @param other - Label on Windows / Linux.
 * @returns Shortcut label.
 */
function menuShortcutLabel(mac: string, other: string): string {
  return /Mac/i.test(navigator.platform) ? mac : other
}

/**
 * Title-bar tab right-click menu (Move to another window / Reload / Close).
 * @param props - Menu origin, actions, and close handler.
 * @returns Portaled menu.
 */
function TitleBarTabContextMenu({
  point,
  onOpenInNewWindow,
  onMoveToWindow,
  onReload,
  onCloseTab,
  onDismiss,
}: {
  point: ClientPoint
  onOpenInNewWindow: () => void
  onMoveToWindow: (windowId: number) => void
  onReload: () => void
  onCloseTab?: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const [origin, setOrigin] = useState(point)
  const [peers, setPeers] = useState<TitleBarPeerWindow[]>([])
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [flyoutSide, setFlyoutSide] = useState<'right' | 'left'>(() =>
    point.x + TAB_MENU_MIN_WIDTH + TAB_FLYOUT_MIN_WIDTH > window.innerWidth ? 'left' : 'right',
  )

  useEffect(() => {
    let cancelled = false
    const listPeers = window.workbench?.tabs?.listPeerWindows
    if (!listPeers) {
      return
    }
    void listPeers()
      .then((list) => {
        if (!cancelled) {
          setPeers(list ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPeers([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useLayoutEffect(() => {
    const node = menuRef.current
    if (!node) {
      return
    }
    const rect = node.getBoundingClientRect()
    const next = clampMenuOrigin(point.x, point.y, rect.width, rect.height)
    setOrigin((prev) => (prev.x === next.x && prev.y === next.y ? prev : next))
  }, [point.x, point.y])

  useLayoutEffect(() => {
    if (!flyoutOpen) {
      return
    }
    const node = flyoutRef.current
    if (!node) {
      return
    }
    const rect = node.getBoundingClientRect()
    if (rect.right > window.innerWidth - TAB_MENU_VIEWPORT_PAD) {
      setFlyoutSide('left')
    } else if (rect.left < TAB_MENU_VIEWPORT_PAD) {
      setFlyoutSide('right')
    }
  }, [flyoutOpen, peers.length])

  useEffect(() => {
    /**
     * Closes when the pointer is outside the menu (flyout included).
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function onPointerDown(event: PointerEvent): void {
      const node = event.target
      if (!(node instanceof Node) || !menuRef.current?.contains(node)) {
        onDismiss()
      }
    }
    /**
     * Closes on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onDismiss()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onDismiss)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onDismiss)
    }
  }, [onDismiss])

  const menuItemClass =
    'flex w-full items-center px-3 py-1.5 text-left font-medium text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5'

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[280] rounded-xl border border-zinc-950/10 bg-white py-1 text-sm shadow-xl dark:border-white/10 dark:bg-zinc-900"
      style={{ left: origin.x, top: origin.y, minWidth: TAB_MENU_MIN_WIDTH }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="relative"
        onPointerEnter={() => setFlyoutOpen(true)}
        onPointerLeave={() => setFlyoutOpen(false)}
      >
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={flyoutOpen}
          className={`${menuItemClass} justify-between gap-6`}
          onClick={() => setFlyoutOpen(true)}
        >
          <span>{t('titleBar.moveToAnotherWindow')}</span>
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </button>
        {flyoutOpen ? (
          <div
            className={`absolute top-0 z-10 ${
              flyoutSide === 'right' ? 'left-full pl-1' : 'right-full pr-1'
            }`}
          >
            <div
              ref={flyoutRef}
              role="menu"
              className="rounded-xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900"
              style={{ minWidth: TAB_FLYOUT_MIN_WIDTH }}
            >
              <button
                type="button"
                role="menuitem"
                className={menuItemClass}
                onClick={() => {
                  onOpenInNewWindow()
                  onDismiss()
                }}
              >
                {t('titleBar.newWindow')}
              </button>
              {peers.length > 0 ? (
                <>
                  <div className="my-1 h-px bg-zinc-950/10 dark:bg-white/10" role="separator" />
                  {peers.map((peer) => (
                    <button
                      key={peer.id}
                      type="button"
                      role="menuitem"
                      className={menuItemClass}
                      onClick={() => {
                        onMoveToWindow(peer.id)
                        onDismiss()
                      }}
                    >
                      <span className="max-w-52 truncate">{peer.title}</span>
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        role="menuitem"
        className={`${menuItemClass} justify-between gap-6`}
        onClick={() => {
          onReload()
          onDismiss()
        }}
      >
        <span>{t('titleBar.reload')}</span>
        <span className="shrink-0 text-[11px] text-muted">{menuShortcutLabel('⌘R', 'Ctrl+R')}</span>
      </button>
      {onCloseTab ? (
        <button
          type="button"
          role="menuitem"
          className={`${menuItemClass} justify-between gap-6`}
          onClick={() => {
            onCloseTab()
            onDismiss()
          }}
        >
          <span>{t('titleBar.closeTab')}</span>
          <span className="shrink-0 text-[11px] text-muted">
            {menuShortcutLabel('⌘W', 'Alt+W')}
          </span>
        </button>
      ) : null}
    </div>,
    document.body,
  )
}

/**
 * Windows-only caption traffic lights (macOS uses native window buttons).
 * @param props - Colors, hover glyphs, and window actions.
 * @returns Traffic-light cluster.
 */
function TrafficLightCluster({
  focused,
  maximized,
  hovering,
  onHoverChange,
  onClose,
  onMinimize,
  onMaximize,
  showMaximize = true,
}: TrafficLightClusterProps) {
  const closeColor = focused ? CLOSE_ACTIVE : INACTIVE
  const minimizeColor = focused ? MINIMIZE_ACTIVE : INACTIVE
  const maximizeColor = focused ? MAXIMIZE_ACTIVE : INACTIVE
  const showGlyphs = hovering && focused

  return (
    <div
      className="title-bar-no-drag ml-4 flex shrink-0 items-center gap-2 self-center"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <button
        type="button"
        className="title-bar-traffic grid size-3.5 place-items-center rounded-full"
        style={{ backgroundColor: closeColor }}
        onClick={onClose}
      >
        <svg
          viewBox="0 0 8 8"
          className="size-2 transition-opacity duration-100"
          style={{ opacity: showGlyphs ? 1 : 0 }}
          aria-hidden
        >
          <path
            d="M2 2 L6 6 M6 2 L2 6"
            fill="none"
            stroke={GLYPH_CLOSE_MIN}
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="title-bar-traffic grid size-3.5 place-items-center rounded-full"
        style={{ backgroundColor: minimizeColor }}
        onClick={onMinimize}
      >
        <svg
          viewBox="0 0 8 8"
          className="size-2 transition-opacity duration-100"
          style={{ opacity: showGlyphs ? 1 : 0 }}
          aria-hidden
        >
          <path
            d="M2 4 L6 4"
            fill="none"
            stroke={GLYPH_CLOSE_MIN}
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {showMaximize ? (
      <button
        type="button"
        className="title-bar-traffic grid size-3.5 place-items-center rounded-full"
        style={{ backgroundColor: maximizeColor }}
        onClick={onMaximize}
      >
        <svg
          viewBox="0 0 8 8"
          className="size-2 transition-opacity duration-100"
          style={{ opacity: showGlyphs ? 1 : 0 }}
          aria-hidden
        >
          {maximized ? (
            <path
              d="M2.5 5 L2.5 2.5 L5 2.5 M5 5 L5 2.5 M5.5 5.5 L5.5 3 L8 3 M8 5.5 L5.5 5.5"
              fill="none"
              stroke={GLYPH_MAX}
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          ) : (
            <path
              d="M4 2 L4 6 M2 4 L6 4"
              fill="none"
              stroke={GLYPH_MAX}
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          )}
        </svg>
      </button>
      ) : null}
    </div>
  )
}

/**
 * One Chrome-style title-bar tab (Settings, features, browser, Folio).
 * @param props - Tab model and actions.
 * @returns Sortable tab chrome.
 */
function SortableTitleTab({ tab, active, onSelect, onClose, onContextMenu }: SortableTitleTabProps) {
  const Icon = titleBarIconForTab(tab.id)
  const [faviconFailed, setFaviconFailed] = useState(false)
  const faviconUrl = tab.faviconUrl?.trim() ?? ''
  const showFavicon = Boolean(faviconUrl) && !faviconFailed
  const sortable = useSortable({
    id: tab.id,
  })
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.55 : undefined,
    zIndex: sortable.isDragging ? 2 : undefined,
  }

  useEffect(() => {
    setFaviconFailed(false)
  }, [faviconUrl])

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={`group relative flex h-7 max-w-48 min-w-0 cursor-grab items-stretch rounded-lg transition-[background-color,color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:cursor-grabbing ${
        active
          ? 'bg-brand/15 text-brand'
          : 'text-muted hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/5'
      }`}
      {...sortable.attributes}
      {...sortable.listeners}
      onContextMenu={onContextMenu}
    >
      {/* Fill the whole pill so padding / sides are clickable, not only the label glyphs. */}
      <button
        type="button"
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5 text-xs font-semibold leading-normal"
        aria-current={active ? 'page' : undefined}
        onClick={onSelect}
      >
        {showFavicon ? (
          <img
            src={faviconUrl}
            alt=""
            draggable={false}
            className="size-3.5 shrink-0"
            onError={() => {
              setFaviconFailed(true)
            }}
          />
        ) : Icon ? (
          <Icon className="size-3.5 shrink-0" aria-hidden />
        ) : null}
        <span className="min-w-0 truncate leading-normal">{tab.label}</span>
      </button>
      {tab.closable ? (
        <button
          type="button"
          className={`my-auto mr-1 grid size-5 shrink-0 place-items-center rounded-md transition ${
            active
              ? 'text-brand/70 hover:bg-brand/20 hover:text-brand'
              : 'opacity-0 group-hover:opacity-100 hover:bg-zinc-950/10 dark:hover:bg-white/10'
          }`}
          onPointerDown={(event) => {
            // Keep close clicks from starting a tab drag.
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            onClose?.()
          }}
        >
          <CloseIcon className="size-3" />
        </button>
      ) : null}
    </div>
  )
}

/**
 * Caption overlay with optional Home button, Chrome-like tab strip, and Ask AI.
 * Windows paints traffic lights; macOS uses a Cursor-style hidden title bar
 * with native traffic lights.
 * @param props - Optional Home control, tab strip, and Ask AI control.
 * @returns Custom caption bar, or null when the native frame is used.
 */
export function MacStyleTitleBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  onTearOffTab,
  onOpenTabInNewWindow,
  onMoveTabToWindow,
  onReloadTab,
  showHome = false,
  showAskAi = false,
  askAiOpen = false,
  onAskAiClick,
  compactChrome = false,
}: MacStyleTitleBarProps) {
  const { t } = useTranslation()
  const bridge = window.workbench?.window
  const paintTrafficLights = Boolean(bridge?.usesCustomTrafficLights)
  const [maximized, setMaximized] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const [focused, setFocused] = useState(true)
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [tabMenu, setTabMenu] = useState<TitleBarTabMenuState | null>(null)
  const showTabs = Boolean(tabs && tabs.length > 0)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  )

  useEffect(() => {
    if (!bridge?.usesCustomTitleBar) {
      return
    }
    if (paintTrafficLights) {
      void bridge.isMaximized().then(setMaximized)
    }
    void bridge.isFullScreen?.().then(setFullScreen)
    void bridge.isFocused().then(setFocused)
    void bridge.isAlwaysOnTop().then(setAlwaysOnTop)
    const unMax = paintTrafficLights ? bridge.onMaximizedChange(setMaximized) : undefined
    const unFullScreen = bridge.onFullScreenChange?.(setFullScreen)
    const unFocus = bridge.onFocusChange(setFocused)
    return () => {
      unMax?.()
      unFullScreen?.()
      unFocus()
    }
  }, [bridge, paintTrafficLights])

  /**
   * Tears the tab off into a new / merged window when the drag ends outside
   * this window, otherwise applies a horizontal reorder. The out-of-window
   * test runs first because `closestCenter` still reports an `over` tab for
   * drops far past the caption, which would otherwise swallow every tear-off.
   * Dropping elsewhere inside this same window (e.g. below the strip) cancels
   * — the tab stays put, matching Chrome.
   * @param event - dnd-kit drag end event.
   * @returns Nothing.
   */
  function handleDragEnd(event: DragEndEvent): void {
    const { active, over, delta, activatorEvent } = event
    const dropPoint = clientDropPoint(activatorEvent, delta, active)
    if (dropPoint && !isWithinViewport(dropPoint)) {
      onTearOffTab?.(String(active.id), {
        x: Math.round(window.screenX + dropPoint.x),
        y: Math.round(window.screenY + dropPoint.y),
      })
      return
    }
    if (over && active.id !== over.id) {
      onReorderTabs?.(String(active.id), String(over.id))
    }
  }

  /**
   * Opens the tab context menu at the pointer.
   * @param tabId - Tab that was right-clicked.
   * @param event - Context-menu event.
   * @returns Nothing.
   */
  function openTabContextMenu(tabId: TitleBarTabId, event: MouseEvent<HTMLElement>): void {
    event.preventDefault()
    event.stopPropagation()
    setTabMenu({ tabId, x: event.clientX, y: event.clientY })
  }

  if (!bridge?.usesCustomTitleBar) {
    return null
  }

  const tabIds = tabs?.map((tab) => tab.id) ?? []
  const nativeInsetClass = paintTrafficLights
    ? ''
    : fullScreen
      ? 'title-bar-native-inset-fullscreen'
      : 'title-bar-native-inset'
  const homeActive = activeTabId === 'home'
  const leadingGutter = paintTrafficLights || !fullScreen ? 'ml-3' : 'ml-0'

  return (
    <header
      className={`title-bar title-bar-drag fixed inset-x-0 top-0 z-[100] flex h-10 items-stretch bg-(--canvas) ${nativeInsetClass}`}
    >
      {paintTrafficLights ? (
        <TrafficLightCluster
          focused={focused}
          maximized={maximized}
          hovering={hovering}
          onHoverChange={setHovering}
          onClose={() => {
            void bridge.close()
          }}
          onMinimize={() => {
            void bridge.minimize()
          }}
          onMaximize={() => {
            void bridge.maximize().then(setMaximized)
          }}
          showMaximize={!compactChrome}
        />
      ) : null}

      {showHome ? (
        <button
          type="button"
          title={t('nav.home')}
          aria-label={t('nav.home')}
          aria-current={homeActive ? 'page' : undefined}
          className={`title-bar-no-drag inline-flex size-7 shrink-0 items-center justify-center self-center rounded-full transition ${leadingGutter} ${
            homeActive
              ? 'bg-brand/20 text-brand'
              : 'bg-zinc-950/8 text-ink hover:bg-zinc-950/12 dark:bg-white/10 dark:hover:bg-white/15'
          }`}
          onClick={() => onSelectTab?.('home')}
        >
          <HomeIcon className="size-3.5" aria-hidden />
        </button>
      ) : null}

      {showTabs ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <nav
              className={`title-bar-no-drag flex min-w-0 items-center gap-0.5 self-stretch ${
                showHome ? 'ml-1' : leadingGutter
              }`}
            >
              {tabs?.map((tab) => (
                <SortableTitleTab
                  key={tab.id}
                  tab={tab}
                  active={tab.id === activeTabId}
                  onSelect={() => onSelectTab?.(tab.id)}
                  onClose={tab.closable ? () => onCloseTab?.(tab.id) : undefined}
                  onContextMenu={
                    tab.closable ? (event) => openTabContextMenu(tab.id, event) : undefined
                  }
                />
              ))}
            </nav>
          </SortableContext>
        </DndContext>
      ) : null}

      <div
        className="ml-2 flex min-w-0 flex-1 items-center self-stretch"
        onDoubleClick={
          paintTrafficLights && !compactChrome
            ? () => {
                void bridge.maximize().then(setMaximized)
              }
            : undefined
        }
      >
        {!showTabs && !showHome ? (
          <span
            className={`truncate pl-1 text-xs font-medium ${
              focused ? 'text-ink' : 'text-muted'
            }`}
          >
            {t('desktopMenu.productName')}
          </span>
        ) : null}
      </div>

      <div className="title-bar-no-drag mr-3 flex shrink-0 items-center gap-1.5 self-center">
        {showAskAi ? (
          <button
            type="button"
            className={`title-bar-ask-ai inline-flex h-7 items-center justify-center gap-1.5 rounded-full px-2.5 text-xs leading-normal transition ${
              askAiOpen
                ? 'bg-brand/20 text-brand'
                : 'bg-zinc-950/8 text-ink hover:bg-zinc-950/12 dark:bg-white/10 dark:hover:bg-white/15'
            }`}
            aria-pressed={askAiOpen}
            onClick={onAskAiClick}
          >
            <AiIcon className="block size-3.5 shrink-0 text-brand" aria-hidden />
            <span className="title-bar-ask-ai-label max-w-24 truncate">{t('askAi.title')}</span>
          </button>
        ) : null}
        {compactChrome ? null : (
        <button
          type="button"
          title={t('titleBar.alwaysOnTop')}
          aria-label={t('titleBar.alwaysOnTop')}
          aria-pressed={alwaysOnTop}
          className={`inline-flex size-7 items-center justify-center rounded-full transition ${
            alwaysOnTop
              ? 'bg-brand/20 text-brand'
              : 'bg-zinc-950/8 text-ink hover:bg-zinc-950/12 dark:bg-white/10 dark:hover:bg-white/15'
          }`}
          onClick={() => {
            void bridge.toggleAlwaysOnTop().then(setAlwaysOnTop)
          }}
        >
          <PinIcon className="size-3.5" />
        </button>
        )}
      </div>
      {tabMenu ? (
        <TitleBarTabContextMenu
          key={`${tabMenu.tabId}:${tabMenu.x}:${tabMenu.y}`}
          point={{ x: tabMenu.x, y: tabMenu.y }}
          onOpenInNewWindow={() => onOpenTabInNewWindow?.(tabMenu.tabId)}
          onMoveToWindow={(windowId) => onMoveTabToWindow?.(tabMenu.tabId, windowId)}
          onReload={() => onReloadTab?.(tabMenu.tabId)}
          onCloseTab={
            tabs?.some((tab) => tab.id === tabMenu.tabId && tab.closable)
              ? () => onCloseTab?.(tabMenu.tabId)
              : undefined
          }
          onDismiss={() => setTabMenu(null)}
        />
      ) : null}
    </header>
  )
}
