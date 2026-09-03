import {
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'

const ASIDE_FLIP_MS = 380
const ASIDE_FLIP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

interface FlipBox {
  left: number
  top: number
}

/**
 * FLIP-animates `[data-aside-widget-id]` children when `orderKey` changes.
 * @param orderKey - Stable key for the current widget order.
 * @returns Ref for the flip measurement root.
 */
export function useAsideWidgetFlip(orderKey: string): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const positionsRef = useRef(new Map<string, FlipBox>())
  const prevOrderKeyRef = useRef(orderKey)

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const prevOrderKey = prevOrderKeyRef.current
    prevOrderKeyRef.current = orderKey
    const shouldAnimate =
      !reduceMotion &&
      prevOrderKey.length > 0 &&
      orderKey.length > 0 &&
      prevOrderKey !== orderKey

    const previous = positionsRef.current
    const next = new Map<string, FlipBox>()
    const nodes = root.querySelectorAll<HTMLElement>('[data-aside-widget-id]')

    for (const node of nodes) {
      const id = node.dataset.asideWidgetId
      if (!id) {
        continue
      }
      const rect = node.getBoundingClientRect()
      next.set(id, { left: rect.left, top: rect.top })
      if (!shouldAnimate) {
        continue
      }
      const first = previous.get(id)
      if (!first) {
        continue
      }
      const dx = first.left - rect.left
      const dy = first.top - rect.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        continue
      }
      node.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: 'translate(0px, 0px)' },
        ],
        { duration: ASIDE_FLIP_MS, easing: ASIDE_FLIP_EASE },
      )
    }

    positionsRef.current = next
  }, [orderKey])

  return rootRef
}

interface AsideWidgetFlipRootProps {
  orderKey: string
  className?: string
  children: ReactNode
}

/**
 * Measurement root for aside widget reorder FLIP.
 * @param props - Order key, optional class, and slotted widgets.
 * @returns Wrapper element.
 */
export function AsideWidgetFlipRoot({
  orderKey,
  className,
  children,
}: AsideWidgetFlipRootProps) {
  const rootRef = useAsideWidgetFlip(orderKey)
  return (
    <div ref={rootRef} className={className}>
      {children}
    </div>
  )
}
