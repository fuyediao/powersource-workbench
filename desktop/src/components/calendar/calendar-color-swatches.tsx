/**
 * Preset + custom (native RGB) color swatches for named calendars.
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CALENDAR_COLOR_PALETTE } from '@/services/calendar-calendars-api'

/**
 * Normalizes a CSS color to `#rrggbb` for `<input type="color">`.
 * @param value - Stored calendar color.
 * @returns Six-digit hex with leading `#`.
 */
export function toColorInputValue(value: string): string {
  const trimmed = value.trim()
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed)
  if (short?.[1]) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  const full = /^#([0-9a-f]{6})$/i.exec(trimmed)
  if (full?.[1]) {
    return `#${full[1]}`.toLowerCase()
  }
  return CALENDAR_COLOR_PALETTE[0]
}

/**
 * Returns whether the color matches a preset palette swatch.
 * @param value - Stored calendar color.
 * @returns True when the value is one of {@link CALENDAR_COLOR_PALETTE}.
 */
export function isCalendarPaletteColor(value: string): boolean {
  const normalized = toColorInputValue(value)
  return (CALENDAR_COLOR_PALETTE as readonly string[]).some(
    (swatch) => toColorInputValue(swatch) === normalized,
  )
}

interface CalendarColorSwatchesProps {
  value: string
  onChange: (color: string) => void
  disabled?: boolean
  /** Dot size; menubar uses sm, create dialog uses md. */
  size?: 'sm' | 'md'
  /** When false, buttons are removed from the tab order (collapsed panel). */
  tabbable?: boolean
  /** Called after a preset swatch is chosen (menubar closes the row). */
  onPresetPicked?: () => void
}

/**
 * Renders preset calendar colors plus a native RGB color picker.
 * @param props - Current color and change handlers.
 * @returns Swatch radiogroup.
 */
export function CalendarColorSwatches({
  value,
  onChange,
  disabled = false,
  size = 'sm',
  tabbable = true,
  onPresetPicked,
}: CalendarColorSwatchesProps): ReactNode {
  const { t } = useTranslation()
  const inputValue = toColorInputValue(value)
  const customSelected = !isCalendarPaletteColor(value)
  const dotClass = size === 'md' ? 'size-7' : 'size-5'
  const ringOffset =
    size === 'md'
      ? 'ring-offset-2 ring-offset-white dark:ring-offset-zinc-950'
      : 'ring-offset-1 ring-offset-white dark:ring-offset-zinc-900'

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="radiogroup"
      aria-label={t('calendar.calendars.color')}
    >
      {CALENDAR_COLOR_PALETTE.map((swatch) => {
        const selected = toColorInputValue(swatch) === inputValue
        return (
          <button
            key={swatch}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            title={swatch}
            className={[
              `${dotClass} shrink-0 rounded-full transition`,
              selected ? `ring-2 ring-brand ${ringOffset}` : 'hover:scale-110',
              size === 'md' && selected ? 'scale-110' : '',
            ].join(' ')}
            style={{ backgroundColor: swatch }}
            onClick={() => {
              onChange(swatch)
              onPresetPicked?.()
            }}
          />
        )
      })}
      <label
        className={[
          `relative ${dotClass} shrink-0 cursor-pointer overflow-hidden rounded-full transition`,
          customSelected ? `ring-2 ring-brand ${ringOffset}` : 'hover:scale-110',
          disabled ? 'pointer-events-none opacity-50' : '',
        ].join(' ')}
        title={t('calendar.calendars.customColor')}
        aria-label={t('calendar.calendars.customColor')}
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: customSelected
              ? inputValue
              : 'conic-gradient(from 0deg, #ef4444, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)',
          }}
          aria-hidden
        />
        <input
          type="color"
          className="absolute inset-0 cursor-pointer opacity-0"
          value={inputValue}
          disabled={disabled}
          tabIndex={tabbable ? 0 : -1}
          aria-label={t('calendar.calendars.customColor')}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
        />
      </label>
    </div>
  )
}
