import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
} from 'react'
import { SearchIcon, SwapIcon } from '@/icons/AllIcons'

/** Which side of a dual search pair is active. */
export type ToolsPairSide = 'a' | 'b'

type PairPhase = 'idle' | 'exit' | 'enter'

interface ToolsPairSearchFieldsProps {
  activeSide: ToolsPairSide
  searching: boolean
  query: string
  displayA: string
  displayB: string
  placeholder: string
  onFocusSide: (side: ToolsPairSide) => void
  onQueryChange: (side: ToolsPairSide, value: string) => void
  onSwap: () => void
}

interface HighlightBox {
  x: number
  y: number
  width: number
  height: number
  ready: boolean
}

/**
 * Dual search fields with a center swap control (currency + markets tools).
 * Active-side ring slides between fields when focus / search target changes.
 * @param props - Active side, display values, and handlers.
 * @returns Pair search row.
 */
export function ToolsPairSearchFields({
  activeSide,
  searching,
  query,
  displayA,
  displayB,
  placeholder,
  onFocusSide,
  onQueryChange,
  onSwap,
}: ToolsPairSearchFieldsProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const aRef = useRef<HTMLLabelElement>(null)
  const bRef = useRef<HTMLLabelElement>(null)
  const swapTimerRef = useRef<number | null>(null)
  const [rowFocused, setRowFocused] = useState(false)
  const [pairPhase, setPairPhase] = useState<PairPhase>('idle')
  const [iconTurns, setIconTurns] = useState(0)
  const [highlight, setHighlight] = useState<HighlightBox>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ready: false,
  })
  const showHighlight = rowFocused || searching

  useEffect(() => {
    return () => {
      if (swapTimerRef.current !== null) {
        window.clearTimeout(swapTimerRef.current)
      }
    }
  }, [])

  /**
   * Resolves the controlled input value for one side.
   * @param side - Field side.
   * @param display - Committed label when not searching.
   * @returns Input value.
   */
  function fieldValue(side: ToolsPairSide, display: string): string {
    if (activeSide !== side) {
      return display
    }
    return searching ? query : display
  }

  /**
   * Focuses a side without entering search mode yet.
   * @param side - Field side.
   * @returns Nothing.
   */
  function handleFocus(side: ToolsPairSide): void {
    onFocusSide(side)
  }

  /**
   * Starts search mode and updates the query for a side.
   * @param side - Field side.
   * @param event - Input change event.
   * @returns Nothing.
   */
  function handleChange(side: ToolsPairSide, event: ChangeEvent<HTMLInputElement>): void {
    onQueryChange(side, event.target.value)
  }

  /**
   * Swaps pair values with a vertical slide and icon spin (same as CurrencyCard).
   * @returns Nothing.
   */
  function handleSwap(): void {
    if (pairPhase !== 'idle') {
      return
    }
    if (swapTimerRef.current !== null) {
      window.clearTimeout(swapTimerRef.current)
    }
    setPairPhase('exit')
    setIconTurns((turns) => turns + 1)
    swapTimerRef.current = window.setTimeout(() => {
      onSwap()
      setPairPhase('enter')
      swapTimerRef.current = window.setTimeout(() => {
        setPairPhase('idle')
        swapTimerRef.current = null
      }, 220)
    }, 160)
  }

  /**
   * Shows the sliding ring only when a text field is focused, not the swap button.
   * @param event - Focus in event.
   * @returns Nothing.
   */
  function handleRowFocusCapture(event: FocusEvent<HTMLDivElement>): void {
    if (event.target instanceof HTMLInputElement) {
      setRowFocused(true)
      return
    }
    setRowFocused(false)
  }

  /**
   * Hides the ring when focus leaves the text fields (including to the swap button).
   * @param event - Focus out event.
   * @returns Nothing.
   */
  function handleRowBlur(event: FocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget
    if (next instanceof HTMLInputElement && rowRef.current?.contains(next)) {
      return
    }
    setRowFocused(false)
  }

  /**
   * Measures the active field for the sliding ring.
   * @returns Nothing.
   */
  function syncHighlight(): void {
    const row = rowRef.current
    const target = activeSide === 'a' ? aRef.current : bRef.current
    if (!row || !target) {
      return
    }
    const rowRect = row.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    setHighlight({
      x: targetRect.left - rowRect.left,
      y: targetRect.top - rowRect.top,
      width: targetRect.width,
      height: targetRect.height,
      ready: showHighlight,
    })
  }

  useLayoutEffect(() => {
    syncHighlight()
  }, [activeSide, showHighlight, displayA, displayB, query])

  useEffect(() => {
    const row = rowRef.current
    if (!row) {
      return
    }
    const observer = new ResizeObserver(() => {
      syncHighlight()
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [activeSide, showHighlight])

  const fromClass =
    pairPhase === 'exit'
      ? 'currency-pair-from-exit'
      : pairPhase === 'enter'
        ? 'currency-pair-from-enter'
        : ''
  const toClass =
    pairPhase === 'exit'
      ? 'currency-pair-to-exit'
      : pairPhase === 'enter'
        ? 'currency-pair-to-enter'
        : ''

  const fieldClass =
    'relative z-10 flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-2xl border border-zinc-950/10 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/5'

  const inputClass =
    'min-w-0 flex-1 bg-transparent text-sm font-semibold text-brand outline-none placeholder:text-zinc-400'

  return (
    <div
      ref={rowRef}
      className="relative mb-3 flex shrink-0 items-center gap-2 p-0.5"
      onFocusCapture={handleRowFocusCapture}
      onBlurCapture={handleRowBlur}
    >
      <div
        className="pointer-events-none absolute top-0 left-0 z-0 rounded-2xl border-2 border-brand/40 shadow-[0_0_0_2px] shadow-brand/20 transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: highlight.width,
          height: highlight.height,
          opacity: highlight.ready ? 1 : 0,
          transform: `translate(${highlight.x}px, ${highlight.y}px) scale(${
            highlight.ready ? 1 : 0.92
          })`,
        }}
      />
      <label ref={aRef} className={fieldClass}>
        <SearchIcon className="size-4 shrink-0 text-brand" />
        <input
          type="text"
          value={fieldValue('a', displayA)}
          placeholder={placeholder}
          disabled={pairPhase !== 'idle'}
          onFocus={() => handleFocus('a')}
          onChange={(event) => handleChange('a', event)}
          className={`${inputClass} ${fromClass}`}
        />
      </label>
      <button
        type="button"
        disabled={pairPhase !== 'idle'}
        className="relative z-10 grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand transition hover:bg-brand/25 disabled:opacity-60"
        onClick={handleSwap}
      >
        <SwapIcon
          className="size-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `rotate(${iconTurns * 180}deg)` }}
        />
      </button>
      <label ref={bRef} className={fieldClass}>
        <SearchIcon className="size-4 shrink-0 text-brand" />
        <input
          type="text"
          value={fieldValue('b', displayB)}
          placeholder={placeholder}
          disabled={pairPhase !== 'idle'}
          onFocus={() => handleFocus('b')}
          onChange={(event) => handleChange('b', event)}
          className={`${inputClass} ${toClass}`}
        />
      </label>
    </div>
  )
}
