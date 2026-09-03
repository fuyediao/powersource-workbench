/**
 * Brand-themed date / date-time field for calendar event dialogs.
 * Replaces native `datetime-local` so colours and copy follow GeoCRM i18n.
 */

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'

export interface CalendarDateTimeFieldProps {
  /** Accessible label (also shown above the control). */
  label: string
  /** `YYYY-MM-DD` when `dateOnly`, otherwise `YYYY-MM-DDTHH:mm`. */
  value: string
  dateOnly: boolean
  disabled?: boolean
  onChange: (value: string) => void
}

interface ParsedLocal {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/**
 * Pads a number to two digits.
 * @param n - Number.
 * @returns Zero-padded string.
 */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Parses a local date or datetime string.
 * @param value - `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`.
 * @returns Parts, or null when invalid.
 */
function parseLocalValue(value: string): ParsedLocal | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value)
  if (!match) {
    return null
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] !== undefined ? Number(match[4]) : 0,
    minute: match[5] !== undefined ? Number(match[5]) : 0,
  }
}

/**
 * Builds a local value string from parts.
 * @param parts - Calendar parts.
 * @param dateOnly - Whether to omit time.
 * @returns Local string.
 */
function formatLocalValue(parts: ParsedLocal, dateOnly: boolean): string {
  const date = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`
  if (dateOnly) {
    return date
  }
  return `${date}T${pad2(parts.hour)}:${pad2(parts.minute)}`
}

/**
 * Days in a calendar month (1-based month).
 * @param year - Full year.
 * @param month - 1–12.
 * @returns Day count.
 */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Builds a Sunday-start month grid (null = empty cell).
 * @param year - Full year.
 * @param month - 1–12.
 * @returns Flat list of 35 or 42 day numbers / null.
 */
function buildMonthGrid(year: number, month: number): Array<number | null> {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const total = daysInMonth(year, month)
  const cells: Array<number | null> = []
  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null)
  }
  for (let day = 1; day <= total; day += 1) {
    cells.push(day)
  }
  while (cells.length % 7 !== 0) {
    cells.push(null)
  }
  return cells
}

/**
 * Formats the closed-field display string with the active locale.
 * @param value - Local value string.
 * @param dateOnly - Hide time when true.
 * @param locale - BCP 47 tag from i18n.
 * @returns Human-readable label.
 */
function formatDisplay(value: string, dateOnly: boolean, locale: string): string {
  const parts = parseLocalValue(value)
  if (!parts) {
    return value
  }
  const date = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)
  if (dateOnly) {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/**
 * Scrollable hour or minute column with brand selection styling.
 * @param props - Column label, value, length, and change handler.
 * @returns Labeled scroll list.
 */
function TimeScrollColumn({
  label,
  value,
  length,
  onChange,
}: {
  label: string
  value: number
  length: number
  onChange: (next: number) => void
}) {
  const listRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>(`[data-time-value="${value}"]`)
    selected?.scrollIntoView({ block: 'center' })
  }, [value])

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <div
        ref={listRef}
        role="listbox"
        aria-label={label}
        className="max-h-36 overflow-y-auto rounded-xl border border-ink/10 bg-canvas p-1"
      >
        {Array.from({ length }, (_, option) => {
          const selected = option === value
          return (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={selected}
              data-time-value={option}
              className={`flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-sm font-semibold transition ${
                selected
                  ? 'bg-brand text-brand-fg'
                  : 'text-ink hover:bg-ink/5'
              }`}
              onClick={() => onChange(option)}
            >
              {pad2(option)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Date / date-time picker field with brand styling and i18n.
 * @param props - Field props.
 * @returns Labeled control.
 */
export function CalendarDateTimeField({
  label,
  value,
  dateOnly,
  disabled = false,
  onChange,
}: CalendarDateTimeFieldProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const presence = useDialogPresence(open, 180)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 280 })

  const parsed = parseLocalValue(value) ?? {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
    hour: 9,
    minute: 0,
  }

  const [viewYear, setViewYear] = useState(parsed.year)
  const [viewMonth, setViewMonth] = useState(parsed.month)
  /** Calendar body: day grid, year decade, or month list. */
  const [panelMode, setPanelMode] = useState<'days' | 'years' | 'months'>('days')
  const [decadeStart, setDecadeStart] = useState(() => Math.floor(parsed.year / 12) * 12)

  useEffect(() => {
    if (!open) {
      return
    }
    setViewYear(parsed.year)
    setViewMonth(parsed.month)
    setPanelMode('days')
    setDecadeStart(Math.floor(parsed.year / 12) * 12)
  }, [open, parsed.year, parsed.month])

  /**
   * Positions the portal panel under the trigger.
   * @returns Nothing.
   */
  function syncPanelPosition(): void {
    const trigger = triggerRef.current
    if (!trigger) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    const width = Math.max(280, Math.min(320, rect.width + 48))
    let left = rect.left
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8)
    }
    let top = rect.bottom + 6
    const estimatedHeight = dateOnly ? 320 : 380
    if (top + estimatedHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - estimatedHeight - 6)
    }
    setPanelPos({ top, left, width })
  }

  useLayoutEffect(() => {
    if (!presence.mounted) {
      return
    }
    syncPanelPosition()
  }, [presence.mounted, dateOnly])

  useEffect(() => {
    if (!presence.mounted) {
      return
    }
    /**
     * Closes when clicking outside trigger and panel.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    /**
     * Repositions on viewport changes.
     * @returns Nothing.
     */
    function handleReposition(): void {
      syncPanelPosition()
    }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [presence.mounted])

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
    // 2023-01-01 was a Sunday — walk one week for labels.
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2023, 0, 1 + index)),
    )
  }, [locale])

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(viewYear, viewMonth - 1, 1),
      ),
    [locale, viewYear, viewMonth],
  )

  const monthNames = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short' })
    return Array.from({ length: 12 }, (_, index) =>
      formatter.format(new Date(2020, index, 1)),
    )
  }, [locale])

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const yearOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => decadeStart + index),
    [decadeStart],
  )

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
  const headerTitle =
    panelMode === 'years'
      ? `${decadeStart} – ${decadeStart + 11}`
      : panelMode === 'months'
        ? String(viewYear)
        : monthTitle

  /**
   * Writes a new local value from partial updates.
   * @param patch - Fields to override.
   * @returns Nothing.
   */
  function commit(patch: Partial<ParsedLocal>): void {
    onChange(formatLocalValue({ ...parsed, ...patch }, dateOnly))
  }

  /**
   * Moves the visible month, decade, or year depending on panel mode.
   * @param delta - Steps to add (may be negative).
   * @returns Nothing.
   */
  function shiftView(delta: number): void {
    if (panelMode === 'years') {
      setDecadeStart((start) => start + delta * 12)
      return
    }
    if (panelMode === 'months') {
      setViewYear((year) => year + delta)
      return
    }
    const date = new Date(viewYear, viewMonth - 1 + delta, 1)
    setViewYear(date.getFullYear())
    setViewMonth(date.getMonth() + 1)
  }

  /**
   * Opens year or month chooser from the title control.
   * @returns Nothing.
   */
  function handleTitleClick(): void {
    if (panelMode === 'days') {
      setDecadeStart(Math.floor(viewYear / 12) * 12)
      setPanelMode('years')
      return
    }
    if (panelMode === 'months') {
      setDecadeStart(Math.floor(viewYear / 12) * 12)
      setPanelMode('years')
    }
  }

  /**
   * Selects a year and continues to the month grid.
   * @param year - Full year.
   * @returns Nothing.
   */
  function selectYear(year: number): void {
    setViewYear(year)
    setPanelMode('months')
  }

  /**
   * Selects a month and returns to the day grid.
   * @param month - 1–12.
   * @returns Nothing.
   */
  function selectMonth(month: number): void {
    setViewMonth(month)
    setPanelMode('days')
  }

  /**
   * Selects a day in the visible month.
   * @param day - Day of month.
   * @returns Nothing.
   */
  function selectDay(day: number): void {
    commit({ year: viewYear, month: viewMonth, day })
    if (dateOnly) {
      setOpen(false)
    }
  }

  /**
   * Jumps to today (keeps time when not date-only).
   * @returns Nothing.
   */
  function selectToday(): void {
    const now = new Date()
    commit({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    })
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth() + 1)
    setPanelMode('days')
    if (dateOnly) {
      setOpen(false)
    }
  }

  const display = formatDisplay(value, dateOnly, locale)
  const selectedKey = `${parsed.year}-${pad2(parsed.month)}-${pad2(parsed.day)}`
  const prevLabel =
    panelMode === 'years'
      ? t('calendar.dialog.picker.prevYears')
      : panelMode === 'months'
        ? t('calendar.dialog.picker.prevYear')
        : t('calendar.dialog.picker.prevMonth')
  const nextLabel =
    panelMode === 'years'
      ? t('calendar.dialog.picker.nextYears')
      : panelMode === 'months'
        ? t('calendar.dialog.picker.nextYear')
        : t('calendar.dialog.picker.nextMonth')

  return (
    <div className="flex flex-col gap-1 text-xs font-semibold text-muted">
      <span>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={presence.mounted ? listboxId : undefined}
        className="inline-flex items-center gap-2 rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-left text-sm font-medium text-ink outline-none transition hover:border-brand/40 focus:border-brand disabled:opacity-60"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="min-w-0 flex-1 truncate">{display}</span>
        <CalendarIcon className="size-4 shrink-0 text-muted" />
      </button>
      {presence.mounted
        ? createPortal(
            <div
              ref={panelRef}
              id={listboxId}
              role="dialog"
              aria-label={label}
              className={`fixed z-[140] rounded-2xl border border-zinc-950/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
                presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
              style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
            >
              <div className="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-xl text-ink transition hover:bg-ink/5"
                  aria-label={prevLabel}
                  onClick={() => shiftView(-1)}
                >
                  <ChevronLeftIcon className="size-4" />
                </button>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate rounded-xl px-2 py-1.5 text-center text-sm font-extrabold text-ink transition hover:bg-ink/5"
                  aria-label={t('calendar.dialog.picker.chooseYearMonth')}
                  onClick={handleTitleClick}
                >
                  {headerTitle}
                </button>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-xl text-ink transition hover:bg-ink/5"
                  aria-label={nextLabel}
                  onClick={() => shiftView(1)}
                >
                  <ChevronRightIcon className="size-4" />
                </button>
              </div>
              {panelMode === 'years' ? (
                <div className="grid grid-cols-3 gap-1">
                  {yearOptions.map((year) => {
                    const selected = year === viewYear
                    const isCurrent = year === today.getFullYear()
                    return (
                      <button
                        key={year}
                        type="button"
                        className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition ${
                          selected
                            ? 'bg-brand text-brand-fg'
                            : isCurrent
                              ? 'text-brand ring-1 ring-brand/35 hover:bg-brand/10'
                              : 'text-ink hover:bg-ink/5'
                        }`}
                        onClick={() => selectYear(year)}
                      >
                        {year}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {panelMode === 'months' ? (
                <div className="grid grid-cols-3 gap-1">
                  {monthNames.map((name, index) => {
                    const month = index + 1
                    const selected = month === viewMonth && viewYear === parsed.year
                    const isCurrent =
                      month === today.getMonth() + 1 && viewYear === today.getFullYear()
                    return (
                      <button
                        key={name}
                        type="button"
                        className={`rounded-xl px-2 py-2.5 text-sm font-semibold transition ${
                          selected
                            ? 'bg-brand text-brand-fg'
                            : isCurrent
                              ? 'text-brand ring-1 ring-brand/35 hover:bg-brand/10'
                              : 'text-ink hover:bg-ink/5'
                        }`}
                        onClick={() => selectMonth(month)}
                      >
                        {name}
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {panelMode === 'days' ? (
                <>
                  <div className="mb-1 grid grid-cols-7 gap-0.5">
                    {weekdayLabels.map((name, index) => (
                      <span
                        key={`${name}-${index}`}
                        className="grid place-items-center py-1 text-[10px] font-bold uppercase text-muted"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {grid.map((day, index) => {
                      if (day === null) {
                        return <span key={`empty-${index}`} className="size-9" />
                      }
                      const key = `${viewYear}-${pad2(viewMonth)}-${pad2(day)}`
                      const selected = key === selectedKey
                      const isToday = key === todayKey
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`grid size-9 place-items-center rounded-xl text-sm font-semibold transition ${
                            selected
                              ? 'bg-brand text-brand-fg'
                              : isToday
                                ? 'text-brand ring-1 ring-brand/35 hover:bg-brand/10'
                                : 'text-ink hover:bg-ink/5'
                          }`}
                          onClick={() => selectDay(day)}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                  {!dateOnly ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-ink/8 pt-3">
                      <TimeScrollColumn
                        label={t('calendar.dialog.picker.hour')}
                        value={parsed.hour}
                        length={24}
                        onChange={(hour) => commit({ hour })}
                      />
                      <TimeScrollColumn
                        label={t('calendar.dialog.picker.minute')}
                        value={parsed.minute}
                        length={60}
                        onChange={(minute) => commit({ minute })}
                      />
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="mt-3 flex justify-end border-t border-ink/8 pt-2">
                <button
                  type="button"
                  className="rounded-full px-3 py-1 text-xs font-bold text-brand transition hover:bg-brand/10"
                  onClick={selectToday}
                >
                  {t('calendar.dialog.picker.today')}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
