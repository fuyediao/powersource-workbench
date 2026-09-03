/**
 * Custom calendar picker with color swatch (replaces native select in event dialog).
 * Options panel portals to `document.body` so overflow ancestors do not clip it.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronDownIcon } from '@/icons/AllIcons'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import type { CalendarListRecord } from '@/services/calendar-calendars-api'

export interface CalendarSelectFieldProps {
  /** Field label (string or markup, e.g. required asterisk). */
  label: ReactNode
  calendars: CalendarListRecord[]
  value: string
  disabled?: boolean
  onChange: (calendarId: string) => void
}

/**
 * Brand-styled calendar listbox with color dots and open/close motion.
 * @param props - Field label, options, and selection handlers.
 * @returns Labeled picker control.
 */
export function CalendarSelectField({
  label,
  calendars,
  value,
  disabled = false,
  onChange,
}: CalendarSelectFieldProps) {
  const { t } = useTranslation()
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const presence = useDialogPresence(open, 180)
  const selected = calendars.find((calendar) => calendar.id === value) ?? calendars[0] ?? null

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      return
    }
    /**
     * Positions the portaled menu under (or above) the trigger.
     * @returns Nothing.
     */
    function measure(): void {
      const trigger = triggerRef.current
      if (!trigger) {
        return
      }
      const rect = trigger.getBoundingClientRect()
      const gap = 4
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8
      const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove
      const maxHeight = Math.min(224, preferBelow ? spaceBelow : spaceAbove)
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        maxHeight,
        zIndex: 220,
        ...(preferBelow
          ? { top: rect.bottom + gap, bottom: 'auto' }
          : { bottom: window.innerHeight - rect.top + gap, top: 'auto' }),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    /**
     * Closes the listbox on outside pointer down.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    /**
     * Closes the listbox on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (disabled) {
      setOpen(false)
    }
  }, [disabled])

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1 text-xs font-semibold text-muted">
      <span id={`${listboxId}-label`}>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || calendars.length === 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-labelledby={`${listboxId}-label`}
        aria-controls={presence.mounted ? listboxId : undefined}
        className="inline-flex w-full items-center gap-2 rounded-xl border border-ink/10 bg-canvas px-3 py-2 text-left text-sm font-medium text-ink outline-none transition hover:border-brand/40 focus:border-brand disabled:opacity-60"
        onClick={() => setOpen((prev) => !prev)}
      >
        {selected ? (
          <>
            <span
              className="size-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: selected.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted">
            {t('calendar.calendars.empty')}
          </span>
        )}
        <ChevronDownIcon
          className={[
            'size-3.5 shrink-0 text-muted transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]',
            open ? 'rotate-180' : '',
          ].join(' ')}
          aria-hidden
        />
      </button>
      {presence.mounted && menuStyle
        ? createPortal(
            <ul
              ref={panelRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={`${listboxId}-label`}
              style={menuStyle}
              className={[
                'overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900',
                presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in',
              ].join(' ')}
            >
              {calendars.map((calendar) => {
                const isSelected = calendar.id === (selected?.id ?? value)
                return (
                  <li key={calendar.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={[
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition',
                        isSelected ? 'bg-brand/10 text-brand' : 'text-ink hover:bg-ink/5',
                      ].join(' ')}
                      onClick={() => {
                        onChange(calendar.id)
                        setOpen(false)
                      }}
                    >
                      <span
                        className="size-3.5 shrink-0 rounded-full"
                        style={{ backgroundColor: calendar.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate">{calendar.name}</span>
                      {isSelected ? <CheckIcon className="size-3.5 shrink-0" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
