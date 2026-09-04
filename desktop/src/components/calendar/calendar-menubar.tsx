/**
 * Calendar top menubar: Personal/Group scope pill and optional group switcher.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronDownIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { CalendarCapabilities, CalendarScopeMode } from '@/hooks/use-calendar-scope'
import type { CalendarListRecord } from '@/services/calendar-calendars-api'
import type { GroupRecord } from '@/services/groups-api'
import { CalendarColorSwatches } from '@/components/calendar/calendar-color-swatches'
import { usesNativeCalendarMenu } from '@/utils/calendar/calendar-menu'

const GROUP_MENU_PANEL =
  'fixed z-100 max-h-64 min-w-[11rem] origin-top overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900'

export interface CalendarMenubarProps {
  mode: CalendarScopeMode
  onModeChange: (mode: CalendarScopeMode) => void
  canSwitchGroups: boolean
  switchableGroups: GroupRecord[]
  selectedGroupId: string | null
  onGroupChange: (groupId: string) => void
  capabilities: CalendarCapabilities
  onNewEvent: () => void
  calendars: CalendarListRecord[]
  visibleCalendarIds: Set<string>
  onToggleCalendarVisibility: (calendarId: string) => void
  onAddCalendar: () => void
  /** Opens rename for a named calendar. */
  onRenameCalendar: (calendar: CalendarListRecord) => void
  /** Deletes a non-default named calendar. */
  onDeleteCalendar: (calendar: CalendarListRecord) => void
  /** Updates a calendar color from the palette. */
  onChangeCalendarColor: (calendar: CalendarListRecord, color: string) => void
  /** Import events from a local .ics file. */
  onImportIcs?: () => void
  /** Export visible calendar events as .ics. */
  onExportIcs?: () => void
}

/**
 * Glass calendar menubar with sliding Personal/Group pill.
 * @param props - Scope and action handlers.
 * @returns Menubar element.
 */
export function CalendarMenubar({
  mode,
  onModeChange,
  canSwitchGroups,
  switchableGroups,
  selectedGroupId,
  onGroupChange,
  capabilities,
  onNewEvent,
  calendars,
  visibleCalendarIds,
  onToggleCalendarVisibility,
  onAddCalendar,
  onRenameCalendar,
  onDeleteCalendar,
  onChangeCalendarColor,
  onImportIcs,
  onExportIcs,
}: CalendarMenubarProps) {
  const { t } = useTranslation()
  const [groupMenuOpen, setGroupMenuOpen] = useState(false)
  const [calendarsMenuOpen, setCalendarsMenuOpen] = useState(false)
  const [colorPickerId, setColorPickerId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 176 })
  const [calendarsMenuPos, setCalendarsMenuPos] = useState({ top: 0, left: 0, width: 240 })
  const [calendarCtx, setCalendarCtx] = useState<{
    calendar: CalendarListRecord
    top: number
    left: number
  } | null>(null)
  const groupMenuPresence = useDialogPresence(groupMenuOpen, 180)
  const calendarsMenuPresence = useDialogPresence(calendarsMenuOpen, 180)
  const calendarCtxPresence = useDialogPresence(Boolean(calendarCtx), 180)
  const showGroupSwitcher = mode === 'group' && canSwitchGroups && switchableGroups.length > 0
  const groupSwitcherPresence = useDialogPresence(showGroupSwitcher, 200)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLUListElement>(null)
  const calendarsTriggerRef = useRef<HTMLButtonElement>(null)
  const calendarsMenuRef = useRef<HTMLDivElement>(null)
  const calendarCtxRef = useRef<HTMLUListElement>(null)
  const scopeTrackRef = useRef<HTMLDivElement>(null)
  const personalBtnRef = useRef<HTMLButtonElement>(null)
  const groupBtnRef = useRef<HTMLButtonElement>(null)
  const [scopePill, setScopePill] = useState({ x: 0, width: 0, ready: false })
  const selectedGroupName =
    switchableGroups.find((group) => group.id === selectedGroupId)?.name ??
    t('calendar.scope.groupSwitcher')
  const calendarCtxTarget = calendarCtx?.calendar ?? null
  const visibleCount =
    visibleCalendarIds.size === 0 ? calendars.length : visibleCalendarIds.size

  /**
   * Measures the active Personal/Group chip for the sliding pill.
   * @returns Nothing.
   */
  function syncScopePill(): void {
    const track = scopeTrackRef.current
    const active = mode === 'personal' ? personalBtnRef.current : groupBtnRef.current
    if (!track || !active) {
      return
    }
    setScopePill({
      x: active.offsetLeft,
      width: active.offsetWidth,
      ready: true,
    })
  }

  useLayoutEffect(() => {
    syncScopePill()
  }, [mode, t])

  useEffect(() => {
    const track = scopeTrackRef.current
    if (!track) {
      return
    }
    /**
     * Keeps the scope pill aligned after layout / locale changes.
     * @returns Nothing.
     */
    function handleResize(): void {
      syncScopePill()
    }
    window.addEventListener('resize', handleResize)
    const observer = new ResizeObserver(handleResize)
    observer.observe(track)
    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
    }
  }, [mode])

  /**
   * Anchors the portaled menu under the trigger.
   * @returns Nothing.
   */
  function updateMenuPosition(): void {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    setMenuPos({
      top: Math.round(rect.bottom + 6),
      left: Math.round(rect.left),
      width: Math.max(176, Math.round(rect.width)),
    })
  }

  /**
   * Anchors the calendars dropdown under its trigger (right-aligned).
   * @returns Nothing.
   */
  function updateCalendarsMenuPosition(): void {
    const rect = calendarsTriggerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    const width = 260
    const left = Math.min(
      Math.max(8, Math.round(rect.right - width)),
      window.innerWidth - width - 8,
    )
    setCalendarsMenuPos({
      top: Math.round(rect.bottom + 6),
      left,
      width,
    })
  }

  useLayoutEffect(() => {
    if (!calendarsMenuOpen) {
      return
    }
    updateCalendarsMenuPosition()
  }, [calendarsMenuOpen, calendars.length])

  useLayoutEffect(() => {
    if (!groupMenuOpen) {
      return
    }
    updateMenuPosition()
  }, [groupMenuOpen])

  useEffect(() => {
    if (!groupMenuOpen) {
      return
    }
    /**
     * Closes when clicking outside the trigger and portaled menu.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }
      setGroupMenuOpen(false)
    }
    /**
     * Closes on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setGroupMenuOpen(false)
      }
    }
    /**
     * Repositions on scroll/resize while open.
     * @returns Nothing.
     */
    function handleReposition(): void {
      updateMenuPosition()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [groupMenuOpen])

  useEffect(() => {
    if (!calendarsMenuOpen) {
      return
    }
    /**
     * Closes calendars menu on outside click.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (
        calendarsTriggerRef.current?.contains(target) ||
        calendarsMenuRef.current?.contains(target) ||
        calendarCtxRef.current?.contains(target)
      ) {
        return
      }
      setCalendarsMenuOpen(false)
      setCalendarCtx(null)
    }
    /**
     * Closes calendars menu on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setCalendarsMenuOpen(false)
        setCalendarCtx(null)
      }
    }
    /**
     * Repositions on scroll/resize.
     * @returns Nothing.
     */
    function handleReposition(): void {
      updateCalendarsMenuPosition()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [calendarsMenuOpen])

  useEffect(() => {
    if (!calendarCtx) {
      return
    }
    /**
     * Closes the calendar context menu on outside click.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (calendarCtxRef.current?.contains(target)) {
        return
      }
      setCalendarCtx(null)
    }
    /**
     * Closes the calendar context menu on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setCalendarCtx(null)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [calendarCtx])

  useEffect(() => {
    if (mode !== 'group') {
      setGroupMenuOpen(false)
    }
  }, [mode])

  if (usesNativeCalendarMenu()) {
    return null
  }

  return (
    <div className="calendar-menubar flex h-9 shrink-0 items-center gap-2 border-b border-ink/8 bg-white/55 px-3 backdrop-blur-xl dark:bg-zinc-950/40">
      <div
        ref={scopeTrackRef}
        role="group"
        aria-label={t('calendar.scope.toggle')}
        className="relative flex items-center rounded-full bg-ink/5 p-0.5"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute top-0.5 left-0 bottom-0.5 rounded-full bg-white shadow-sm transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-zinc-900"
          style={{
            width: scopePill.width,
            opacity: scopePill.ready ? 1 : 0,
            transform: `translateX(${scopePill.x}px)`,
          }}
        />
        <button
          ref={personalBtnRef}
          type="button"
          aria-pressed={mode === 'personal'}
          className={[
            'relative z-10 rounded-full px-3 py-1 text-xs font-bold transition-colors duration-300',
            mode === 'personal' ? 'text-brand' : 'text-muted',
          ].join(' ')}
          onClick={() => onModeChange('personal')}
        >
          {t('calendar.scope.personal')}
        </button>
        <button
          ref={groupBtnRef}
          type="button"
          aria-pressed={mode === 'group'}
          className={[
            'relative z-10 rounded-full px-3 py-1 text-xs font-bold transition-colors duration-300',
            mode === 'group' ? 'text-brand' : 'text-muted',
          ].join(' ')}
          onClick={() => onModeChange('group')}
        >
          {t('calendar.scope.group')}
        </button>
      </div>

      {groupSwitcherPresence.mounted ? (
        <div
          className={[
            'transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
            groupSwitcherPresence.leaving
              ? '-translate-y-0.5 opacity-0'
              : 'translate-y-0 opacity-100',
          ].join(' ')}
        >
          <button
            ref={triggerRef}
            type="button"
            className="inline-flex max-w-48 items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-ink/8"
            aria-expanded={groupMenuOpen}
            aria-haspopup="listbox"
            onClick={() => setGroupMenuOpen((open) => !open)}
          >
            <span className="truncate">{selectedGroupName}</span>
            <ChevronDownIcon
              className={[
                'size-3.5 shrink-0 text-muted transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                groupMenuOpen ? 'rotate-180' : '',
              ].join(' ')}
              aria-hidden
            />
          </button>
        </div>
      ) : null}

      {groupMenuPresence.mounted
        ? createPortal(
            <ul
              ref={menuRef}
              role="listbox"
              className={[
                GROUP_MENU_PANEL,
                groupMenuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in',
              ].join(' ')}
              style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            >
              {switchableGroups.map((group) => {
                const selected = group.id === selectedGroupId
                return (
                  <li key={group.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      className={[
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition',
                        selected ? 'bg-brand/10 text-brand' : 'text-ink hover:bg-ink/5',
                      ].join(' ')}
                      onClick={() => {
                        onGroupChange(group.id)
                        setGroupMenuOpen(false)
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{group.name}</span>
                      {selected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}

      {calendarCtxPresence.mounted && calendarCtx
        ? createPortal(
            <ul
              ref={calendarCtxRef}
              role="menu"
              className={[
                GROUP_MENU_PANEL,
                'min-w-[9rem]',
                calendarCtxPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in',
              ].join(' ')}
              style={{ top: calendarCtx.top, left: calendarCtx.left }}
            >
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={capabilities.readOnly}
                  className={[
                    'flex w-full items-center px-3 py-2 text-left text-xs font-semibold transition',
                    capabilities.readOnly
                      ? 'cursor-not-allowed text-muted opacity-60'
                      : 'text-ink hover:bg-ink/5',
                  ].join(' ')}
                  onClick={() => {
                    if (!calendarCtxTarget || capabilities.readOnly) {
                      return
                    }
                    const target = calendarCtxTarget
                    setCalendarCtx(null)
                    setCalendarsMenuOpen(false)
                    onRenameCalendar(target)
                  }}
                >
                  {t('calendar.calendars.rename')}
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!capabilities.canDelete || calendars.length <= 1}
                  className={[
                    'flex w-full items-center px-3 py-2 text-left text-xs font-semibold transition',
                    !capabilities.canDelete || calendars.length <= 1
                      ? 'cursor-not-allowed text-muted opacity-60'
                      : 'text-red-600 hover:bg-red-500/10',
                  ].join(' ')}
                  title={
                    calendars.length <= 1
                      ? t('calendar.calendars.cannotDeleteLast')
                      : undefined
                  }
                  onClick={() => {
                    if (!calendarCtxTarget || !capabilities.canDelete || calendars.length <= 1) {
                      return
                    }
                    const target = calendarCtxTarget
                    setCalendarCtx(null)
                    onDeleteCalendar(target)
                  }}
                >
                  {t('calendar.calendars.delete')}
                </button>
              </li>
            </ul>,
            document.body,
          )
        : null}

      <div className="ml-auto flex min-w-0 items-center gap-2">
        <button
          ref={calendarsTriggerRef}
          type="button"
          className="inline-flex max-w-44 items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink transition hover:bg-ink/8"
          aria-expanded={calendarsMenuOpen}
          aria-haspopup="menu"
          onClick={() => {
            setCalendarsMenuOpen((open) => !open)
            setCalendarCtx(null)
            setColorPickerId(null)
          }}
        >
          <span className="truncate">
            {t('calendar.calendars.menu', { count: visibleCount })}
          </span>
          <ChevronDownIcon
            className={[
              'size-3.5 shrink-0 text-muted transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
              calendarsMenuOpen ? 'rotate-180' : '',
            ].join(' ')}
            aria-hidden
          />
        </button>
        {capabilities.readOnly ? (
          <span className="text-[11px] font-medium text-muted">{t('calendar.readOnly')}</span>
        ) : null}
        {capabilities.canCreate ? (
          <button
            type="button"
            className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-brand-fg transition hover:opacity-90"
            onClick={onNewEvent}
          >
            {t('calendar.newEvent')}
          </button>
        ) : null}
      </div>

      {calendarsMenuPresence.mounted
        ? createPortal(
            <div
              ref={calendarsMenuRef}
              role="menu"
              className={[
                'fixed z-100 max-h-[min(70dvh,24rem)] origin-top overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900',
                calendarsMenuPresence.leaving
                  ? 'animate-dropdown-out'
                  : 'animate-dropdown-in',
              ].join(' ')}
              style={{
                top: calendarsMenuPos.top,
                left: calendarsMenuPos.left,
                width: calendarsMenuPos.width,
              }}
            >
              <p className="px-3 pt-2 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">
                {t('calendar.calendars.section')}
              </p>
              {calendars.length === 0 ? (
                <p className="px-3 py-2 text-xs font-medium text-muted">
                  {t('calendar.calendars.empty')}
                </p>
              ) : (
                calendars.map((calendar) => {
                  const visible =
                    visibleCalendarIds.size === 0 || visibleCalendarIds.has(calendar.id)
                  const showPalette = colorPickerId === calendar.id
                  return (
                    <div key={calendar.id} className="border-b border-ink/5 last:border-b-0">
                      <div className="flex w-full items-center gap-1 px-2 py-1">
                        <button
                          type="button"
                          className={[
                            'size-6 shrink-0 rounded-full transition ring-offset-1 ring-offset-white dark:ring-offset-zinc-900',
                            showPalette ? 'ring-2 ring-brand' : 'hover:scale-105',
                          ].join(' ')}
                          style={{ backgroundColor: calendar.color }}
                          title={t('calendar.calendars.color')}
                          aria-label={t('calendar.calendars.changeColor')}
                          aria-expanded={showPalette}
                          onClick={(event) => {
                            event.stopPropagation()
                            setColorPickerId((id) => (id === calendar.id ? null : calendar.id))
                          }}
                        />
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={visible}
                          title={
                            capabilities.readOnly
                              ? calendar.name
                              : `${calendar.name} — ${t('calendar.calendars.contextHint')}`
                          }
                          className={[
                            'flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold transition',
                            visible
                              ? 'text-ink hover:bg-ink/5'
                              : 'text-muted line-through hover:bg-ink/5',
                          ].join(' ')}
                          onClick={() => onToggleCalendarVisibility(calendar.id)}
                          onContextMenu={(event) => {
                            event.preventDefault()
                            setCalendarCtx({
                              calendar,
                              top: event.clientY,
                              left: event.clientX,
                            })
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{calendar.name}</span>
                          {visible ? (
                            <CheckIcon className="size-3.5 shrink-0 text-brand" />
                          ) : null}
                        </button>
                      </div>
                      <div
                        className={[
                          'grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
                          showPalette
                            ? 'grid-rows-[1fr] opacity-100'
                            : 'grid-rows-[0fr] opacity-0',
                        ].join(' ')}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="px-3 pt-1.5 pb-2.5" aria-hidden={!showPalette}>
                            <CalendarColorSwatches
                              value={calendar.color}
                              tabbable={showPalette}
                              onChange={(color) => onChangeCalendarColor(calendar, color)}
                              onPresetPicked={() => setColorPickerId(null)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              {capabilities.canCreate ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-ink/5"
                  onClick={() => {
                    setCalendarsMenuOpen(false)
                    onAddCalendar()
                  }}
                >
                  {t('calendar.calendars.add')}
                </button>
              ) : null}
              {onImportIcs && capabilities.canCreate ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-ink/5"
                  onClick={() => {
                    setCalendarsMenuOpen(false)
                    onImportIcs()
                  }}
                >
                  {t('calendar.ics.import')}
                </button>
              ) : null}
              {onExportIcs ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center px-3 py-2 text-left text-xs font-semibold text-ink transition hover:bg-ink/5"
                  onClick={() => {
                    setCalendarsMenuOpen(false)
                    onExportIcs()
                  }}
                >
                  {t('calendar.ics.export')}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
