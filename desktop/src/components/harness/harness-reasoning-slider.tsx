/**
 * Compact Agent reasoning-effort control: a stepped drag slider whose dots
 * match the catalog levels for the selected model.
 */

import { useCallback, useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ZapIcon } from '@/icons/AllIcons'
import {
  effortAtSliderIndex,
  effortSliderIndex,
  isHarnessReasoningEffort,
  reasoningShowsQuotaHint,
  snapSliderIndex,
} from '@/utils/harness/reasoning-effort'

/**
 * Discrete reasoning slider opened from the Harness composer footer.
 * @param props - Catalog levels, current effort, and exclusive open state
 * @returns Trigger plus popover slider
 */
export function HarnessReasoningSlider({
  levels,
  value,
  disabled,
  open,
  onOpenChange,
  onChange,
}: {
  levels: readonly string[]
  value: string
  disabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (effort: string) => void
}) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const index = effortSliderIndex(levels, value)
  const last = Math.max(levels.length - 1, 1)
  const fillPercent = (index / last) * 100
  const currentLabel = isHarnessReasoningEffort(value)
    ? t(`harness.composer.reasoning.${value}`)
    : value

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open, onOpenChange])

  /**
   * Snaps the pointer onto a catalog step and commits it.
   * @param clientX - Pointer X
   * @returns Nothing
   */
  const applyPointer = useCallback(
    (clientX: number): void => {
      const track = trackRef.current
      if (!track || levels.length < 2) return
      const rect = track.getBoundingClientRect()
      const nextIndex = snapSliderIndex(clientX, rect.left, rect.width, levels.length)
      const next = effortAtSliderIndex(levels, nextIndex)
      if (next && next !== value && isHarnessReasoningEffort(next)) onChange(next)
    },
    [levels, onChange, value],
  )

  /**
   * Starts a drag on the track.
   * @param event - Pointer down
   * @returns Nothing
   */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (disabled) return
    event.preventDefault()
    draggingRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    applyPointer(event.clientX)
  }

  /**
   * Continues a captured drag.
   * @param event - Pointer move
   * @returns Nothing
   */
  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return
    applyPointer(event.clientX)
  }

  /**
   * Ends a captured drag.
   * @returns Nothing
   */
  const onPointerUp = (): void => {
    draggingRef.current = false
  }

  /**
   * Moves one catalog step with the keyboard.
   * @param event - Key event
   * @returns Nothing
   */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled || levels.length < 2) return
    let nextIndex = index
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextIndex = index - 1
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextIndex = index + 1
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = levels.length - 1
    else return
    event.preventDefault()
    const next = effortAtSliderIndex(levels, nextIndex)
    if (next && isHarnessReasoningEffort(next)) onChange(next)
  }

  if (levels.length < 2) return null

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        title={t('harness.composer.reasoningLabel')}
        aria-label={t('harness.composer.reasoningLabel')}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex max-w-36 min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-50"
        onClick={(event) => {
          event.stopPropagation()
          onOpenChange(!open)
        }}
      >
        <ZapIcon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{currentLabel}</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={t('harness.composer.reasoningLabel')}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-2xl border border-zinc-950/10 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-zinc-900"
        >
          <p className="mb-3 truncate text-[11px] font-semibold text-muted">
            {t('harness.composer.reasoningLabel')}
          </p>
          <div
            ref={trackRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={index}
            aria-valuetext={currentLabel}
            aria-label={t('harness.composer.reasoningLabel')}
            className="relative h-7 cursor-pointer touch-none outline-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          >
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-zinc-950/15 dark:bg-white/15" />
            <div
              className="absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-full bg-brand"
              style={{ width: `${fillPercent}%` }}
            />
            {levels.map((level, step) => (
              <span
                key={level}
                className="pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-950/40 dark:bg-white/50"
                style={{ left: `${(step / last) * 100}%` }}
              />
            ))}
            <span
              className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-zinc-950/10 dark:ring-white/20"
              style={{ left: `${fillPercent}%` }}
            />
          </div>
          {reasoningShowsQuotaHint(value) ? (
            <p className="mt-2 text-[10px] font-medium text-muted">
              {t('harness.composer.reasoningQuotaHint')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
