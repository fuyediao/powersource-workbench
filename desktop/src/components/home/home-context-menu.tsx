import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSharedPageWidgets } from '@/hooks/page-widgets-context'
import { CheckIcon } from '@/icons/AllIcons'

const MENU_MIN_WIDTH = 220
const VIEWPORT_PAD = 8

type MenuPoint = { x: number; y: number }

interface HomeContextMenuProps {
  children: ReactNode
  onOpenSettings: () => void
}

/**
 * Returns whether the event target should keep the native cut/copy/paste menu.
 * @param target - Event target.
 * @returns True for text fields and contenteditable.
 */
function isNativeEditTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

/**
 * Clamps a menu origin so the panel stays inside the viewport.
 * @param x - Requested left.
 * @param y - Requested top.
 * @param width - Panel width.
 * @param height - Panel height.
 * @returns Clamped origin.
 */
function clampOrigin(x: number, y: number, width: number, height: number): MenuPoint {
  const maxX = Math.max(VIEWPORT_PAD, window.innerWidth - width - VIEWPORT_PAD)
  const maxY = Math.max(VIEWPORT_PAD, window.innerHeight - height - VIEWPORT_PAD)
  return {
    x: Math.min(Math.max(VIEWPORT_PAD, x), maxX),
    y: Math.min(Math.max(VIEWPORT_PAD, y), maxY),
  }
}

/**
 * Home right-click menu: open Settings, and toggle widget visibility with checks.
 * @param props - Children host and Settings opener.
 * @returns Host plus portal menu.
 */
export function HomeContextMenu({ children, onOpenSettings }: HomeContextMenuProps) {
  const { t } = useTranslation()
  const pageWidgets = useSharedPageWidgets()
  const [point, setPoint] = useState<MenuPoint | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const appsVisible = pageWidgets.widgets.showApps || pageWidgets.widgets.peekApps

  const widgetRows = [
    {
      id: 'apps',
      label: t('home.contextMenu.apps'),
      visible: appsVisible,
      toggle: () => pageWidgets.setShowApps(!appsVisible),
    },
    {
      id: 'weather',
      label: t('weather.title'),
      visible: pageWidgets.widgets.showWeather,
      toggle: () => pageWidgets.setShowWeather(!pageWidgets.widgets.showWeather),
    },
    {
      id: 'markets',
      label: t('markets.title'),
      visible: pageWidgets.widgets.showMarkets,
      toggle: () => pageWidgets.setShowMarkets(!pageWidgets.widgets.showMarkets),
    },
    {
      id: 'news',
      label: t('news.title'),
      visible: pageWidgets.widgets.showNews,
      toggle: () => pageWidgets.setShowNews(!pageWidgets.widgets.showNews),
    },
    {
      id: 'todo',
      label: t('todo.title'),
      visible: pageWidgets.widgets.showTodo,
      toggle: () => pageWidgets.setShowTodo(!pageWidgets.widgets.showTodo),
    },
    {
      id: 'currency',
      label: t('currency.title'),
      visible: pageWidgets.widgets.showCurrency,
      toggle: () => pageWidgets.setShowCurrency(!pageWidgets.widgets.showCurrency),
    },
    {
      id: 'schedule',
      label: t('home.aside.scheduleReminder'),
      visible: pageWidgets.widgets.showSchedule,
      toggle: () => pageWidgets.setShowSchedule(!pageWidgets.widgets.showSchedule),
    },
    {
      id: 'mail',
      label: t('home.aside.mailReminder'),
      visible: pageWidgets.widgets.showMail,
      toggle: () => pageWidgets.setShowMail(!pageWidgets.widgets.showMail),
    },
    {
      id: 'focus',
      label: t('home.aside.businessFocus'),
      visible: pageWidgets.widgets.showFocus,
      toggle: () => pageWidgets.setShowFocus(!pageWidgets.widgets.showFocus),
    },
  ]

  /**
   * Closes the context menu.
   * @returns Nothing.
   */
  const close = useCallback((): void => {
    setPoint(null)
  }, [])

  /**
   * Opens the menu at the pointer, replacing any previous instance.
   * @param event - Context-menu event.
   * @returns Nothing.
   */
  function onContextMenu(event: MouseEvent): void {
    if (isNativeEditTarget(event.target)) {
      return
    }
    event.preventDefault()
    setPoint({ x: event.clientX, y: event.clientY })
  }

  useLayoutEffect(() => {
    if (!point || !menuRef.current) {
      return
    }
    const rect = menuRef.current.getBoundingClientRect()
    const next = clampOrigin(point.x, point.y, rect.width, rect.height)
    if (next.x !== point.x || next.y !== point.y) {
      setPoint(next)
    }
  }, [point])

  useEffect(() => {
    if (!point) {
      return
    }
    /**
     * Closes when the pointer is outside the menu.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function onPointerDown(event: PointerEvent): void {
      const node = event.target
      if (!(node instanceof Node)) {
        close()
        return
      }
      if (menuRef.current?.contains(node)) {
        return
      }
      close()
    }
    /**
     * Closes on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
    }
  }, [close, point])

  return (
    <div className="min-h-full" onContextMenu={onContextMenu}>
      {children}
      {point
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed z-[280] rounded-xl border border-zinc-950/10 bg-white py-1 text-sm shadow-xl dark:border-white/10 dark:bg-zinc-900"
              style={{ left: point.x, top: point.y, minWidth: MENU_MIN_WIDTH }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center px-3 py-1.5 text-left font-medium text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5"
                onClick={() => {
                  onOpenSettings()
                  close()
                }}
              >
                {t('functions.apps.settings')}
              </button>
              <div className="my-1 h-px bg-ink/10" role="separator" />
              <p className="px-3 py-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                {t('home.contextMenu.widgets')}
              </p>
              {widgetRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={row.visible}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-medium text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5"
                  onClick={row.toggle}
                >
                  <span className="grid size-4 shrink-0 place-items-center">
                    {row.visible ? (
                      <CheckIcon className="size-3.5 text-brand" aria-hidden />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
