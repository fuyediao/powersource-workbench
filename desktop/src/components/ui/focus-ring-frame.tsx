import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react'

export const FOCUS_RING_EASE =
  'duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]' as const

/** Shared field shell surface (border + fill). */
export const FOCUS_RING_SHELL =
  'rounded-2xl border border-zinc-950/10 bg-white/70 dark:border-white/10 dark:bg-white/5' as const

interface HighlightBox {
  x: number
  y: number
  width: number
  height: number
  ready: boolean
}

interface FocusRingFrameProps {
  children: ReactNode
  /** Extra classes on the outer measure wrapper. */
  className?: string
  /** Classes on the inner shell (under the animated ring). */
  shellClassName?: string
  /** Ring corner radius class. @default rounded-2xl */
  ringClassName?: string
  /**
   * Expand the ring outside the shell (px) so it stays visible on opaque swatches.
   * @default 0
   */
  outset?: number
  /**
   * Controlled active state (e.g. selected swatch).
   * When omitted, the ring follows focus within the frame.
   */
  active?: boolean
}

/**
 * Wraps a control with the shared scale-in focus / selection ring.
 * @param props - Shell content and optional controlled active state.
 * @returns Framed control.
 */
export function FocusRingFrame({
  children,
  className = '',
  shellClassName = '',
  ringClassName = '',
  outset = 0,
  active,
}: FocusRingFrameProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [highlight, setHighlight] = useState<HighlightBox>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ready: false,
  })
  const show = active !== undefined ? active : focused

  /**
   * Clears focus when leaving the frame.
   * @param event - Blur event.
   * @returns Nothing.
   */
  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    if (active !== undefined) {
      return
    }
    const next = event.relatedTarget
    if (next instanceof Node && rowRef.current?.contains(next)) {
      return
    }
    setFocused(false)
  }

  /**
   * Measures the shell for the animated ring.
   * @returns Nothing.
   */
  function syncHighlight(): void {
    const row = rowRef.current
    const shell = shellRef.current
    if (!row || !shell) {
      return
    }
    const rowRect = row.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    setHighlight({
      x: shellRect.left - rowRect.left - outset,
      y: shellRect.top - rowRect.top - outset,
      width: shellRect.width + outset * 2,
      height: shellRect.height + outset * 2,
      ready: show,
    })
  }

  useLayoutEffect(() => {
    syncHighlight()
  }, [show, outset])

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
  }, [show, outset])

  const ringShape = ringClassName.includes('rounded')
    ? ringClassName
    : `rounded-2xl ${ringClassName}`.trim()
  const ringTone = ringClassName.includes('border-brand')
    ? ''
    : 'border-brand/40 shadow-[0_0_0_2px] shadow-brand/20'

  return (
    <div
      ref={rowRef}
      className={`relative ${outset > 0 ? 'p-1.5' : 'p-0.5'} ${className}`}
      onFocusCapture={
        active === undefined
          ? () => {
              setFocused(true)
            }
          : undefined
      }
      onBlurCapture={active === undefined ? handleBlur : undefined}
    >
      <div
        className={`pointer-events-none absolute top-0 left-0 z-0 border-2 bg-transparent transition-[transform,width,height,opacity] ${FOCUS_RING_EASE} ${ringTone} ${ringShape}`}
        style={{
          width: highlight.width,
          height: highlight.height,
          opacity: highlight.ready ? 1 : 0,
          transform: `translate(${highlight.x}px, ${highlight.y}px) scale(${
            highlight.ready ? 1 : 0.92
          })`,
        }}
      />
      <div ref={shellRef} className={`relative z-10 ${shellClassName}`}>
        {children}
      </div>
    </div>
  )
}
