/**
 * Brand segmented control with a sliding active pill (Sales Board source /
 * period-mode toggles and similar toolbar switches).
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

export interface CrmSegmentOption<T extends string = string> {
  value: T
  label: ReactNode
}

interface CrmSegmentedControlProps<T extends string = string> {
  value: T
  options: readonly CrmSegmentOption<T>[]
  onChange: (value: T) => void
  /** Accessible name for the radio group. */
  ariaLabel: string
  className?: string
}

interface ThumbBox {
  left: number
  width: number
  height: number
}

/**
 * Pill segmented control: inactive options stay clickable; the brand thumb
 * slides between them with the shared desktop ease curve.
 * @param props - Value, options, and change handler.
 * @returns Segmented control.
 */
export function CrmSegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: CrmSegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [thumb, setThumb] = useState<ThumbBox | null>(null)
  const [thumbReady, setThumbReady] = useState(false)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) {
      return
    }

    /**
     * Measures the active button and updates the sliding thumb box.
     * @returns Nothing.
     */
    function measure(): void {
      const active = buttonRefs.current.get(value)
      if (!active || !trackRef.current) {
        return
      }
      const trackBox = trackRef.current.getBoundingClientRect()
      const buttonBox = active.getBoundingClientRect()
      setThumb({
        left: buttonBox.left - trackBox.left,
        width: buttonBox.width,
        height: buttonBox.height,
      })
      if (!thumbReady) {
        requestAnimationFrame(() => setThumbReady(true))
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    for (const button of buttonRefs.current.values()) {
      observer.observe(button)
    }
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [options, thumbReady, value])

  return (
    <div
      ref={trackRef}
      className={twMerge(
        'relative inline-flex shrink-0 rounded-2xl border border-ink/15 bg-white p-1 shadow-sm dark:border-white/15 dark:bg-zinc-950/60',
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      {thumb ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1 left-0 rounded-xl bg-brand shadow-sm ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
            thumbReady ? 'transition-[transform,width] duration-300' : ''
          }`}
          style={{
            width: thumb.width,
            height: thumb.height,
            transform: `translateX(${thumb.left}px)`,
          }}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            ref={(node) => {
              if (node) {
                buttonRefs.current.set(option.value, node)
              } else {
                buttonRefs.current.delete(option.value)
              }
            }}
            className={`relative z-10 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              active
                ? 'text-brand-fg'
                : 'text-muted hover:text-ink dark:hover:text-white'
            }`}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
