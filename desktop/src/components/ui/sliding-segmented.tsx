/**
 * Sliding-pill segmented control (Settings accent / Add App dialog parity).
 */

import type { ReactNode } from 'react'

export interface SlidingSegmentOption<T extends string = string> {
  value: T
  label: string
}

interface SlidingSegmentedProps<T extends string> {
  /** Selected option value. */
  value: T
  /** Options (2–6). */
  options: ReadonlyArray<SlidingSegmentOption<T>>
  /** Called when the user picks an option. */
  onChange: (value: T) => void
  /** Optional accessible name. */
  ariaLabel?: string
  /** Extra classes on the root. */
  className?: string
}

/**
 * Segmented control with a sliding brand pill behind the active option.
 * @param props - Value, options, and change handler.
 * @returns Segmented button group.
 */
export function SlidingSegmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: SlidingSegmentedProps<T>): ReactNode {
  const count = Math.min(Math.max(options.length, 1), 6)
  const visible = options.slice(0, count)
  const index = Math.max(
    0,
    visible.findIndex((option) => option.value === value),
  )
  const gapRem = 0.25
  const padRem = 0.5
  const gapsRem = (count - 1) * gapRem

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative grid h-9 shrink-0 rounded-xl bg-zinc-950/5 p-1 dark:bg-white/5 ${className}`.trim()}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 rounded-lg bg-brand shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{
          width: `calc((100% - ${padRem}rem - ${gapsRem}rem) / ${count})`,
          transform: `translateX(calc(${index} * (100% + ${gapRem}rem)))`,
        }}
      />
      {visible.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`relative z-10 rounded-lg px-3 text-xs font-bold transition-colors duration-300 motion-reduce:transition-none ${
              selected ? 'text-brand-fg' : 'text-ink hover:text-brand'
            }`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
