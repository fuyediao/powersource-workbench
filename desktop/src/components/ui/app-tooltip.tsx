import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'

interface AppTooltipProps {
  /** Tooltip label (Docs-style dark chip). */
  label: string
  /** Trigger control; must accept className / event handlers. */
  children: ReactElement<{
    className?: string
    onMouseEnter?: (event: React.MouseEvent) => void
    onMouseLeave?: (event: React.MouseEvent) => void
    onFocus?: (event: React.FocusEvent) => void
    onBlur?: (event: React.FocusEvent) => void
    'aria-describedby'?: string
    ref?: Ref<HTMLElement>
  }>
}

type TooltipCoords = { top: number; left: number }

/**
 * Assigns a callback/object ref.
 * @param ref - React ref.
 * @param node - DOM node.
 */
function assignRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === 'function') {
    ref(node)
    return
  }
  if (ref && typeof ref === 'object') {
    ;(ref as { current: T | null }).current = node
  }
}

/**
 * Docs/Univer-style hover tooltip: dark rounded label with a top arrow, portaled
 * to `document.body` so overflow parents do not clip it.
 * @param props - Label and single trigger child.
 * @returns Trigger plus optional portal tip.
 */
export function AppTooltip({ label, children }: AppTooltipProps): ReactNode {
  const tipId = useId()
  const triggerRef = useRef<HTMLElement | null>(null)
  const tipRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<TooltipCoords | null>(null)

  /**
   * Positions the tip centered under the trigger.
   */
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tip = tipRef.current
    if (!trigger || !tip) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()
    const gap = 8
    let left = rect.left + rect.width / 2 - tipRect.width / 2
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8))
    const top = rect.bottom + gap
    setCoords({ top, left })
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    updatePosition()
    const onReposition = (): void => updatePosition()
    window.addEventListener('scroll', onReposition, true)
    window.addEventListener('resize', onReposition)
    return () => {
      window.removeEventListener('scroll', onReposition, true)
      window.removeEventListener('resize', onReposition)
    }
  }, [open, label, updatePosition])

  if (!isValidElement(children)) {
    return children
  }

  const child = children
  const show = (): void => setOpen(true)
  const hide = (): void => setOpen(false)

  return (
    <>
      {cloneElement(child, {
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node
          assignRef(child.props.ref, node)
        },
        className: [child.props.className, 'relative'].filter(Boolean).join(' '),
        'aria-describedby': open ? tipId : undefined,
        onMouseEnter: (event: React.MouseEvent) => {
          child.props.onMouseEnter?.(event)
          show()
        },
        onMouseLeave: (event: React.MouseEvent) => {
          child.props.onMouseLeave?.(event)
          hide()
        },
        onFocus: (event: React.FocusEvent) => {
          child.props.onFocus?.(event)
          show()
        },
        onBlur: (event: React.FocusEvent) => {
          child.props.onBlur?.(event)
          hide()
        },
      })}
      {open && label
        ? createPortal(
            <div
              ref={tipRef}
              id={tipId}
              role="tooltip"
              className="pointer-events-none fixed z-[200] max-w-xs rounded-md bg-zinc-700 px-2.5 py-1.5 text-[11px] leading-4 font-medium text-white shadow-lg"
              style={{
                top: coords?.top ?? -9999,
                left: coords?.left ?? -9999,
                opacity: coords ? 1 : 0,
              }}
            >
              <span
                aria-hidden
                className="absolute top-0 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-zinc-700"
              />
              <span className="relative z-10">{label}</span>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
