import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export type PageSwipeDirection = 'next' | 'prev'

interface UseHorizontalPageSwipeOptions {
  /** Whether previous page is available. */
  canGoPrev: boolean
  /** Whether next page is available. */
  canGoNext: boolean
  /** Called when a swipe commits a page change. */
  onPageSwipe: (direction: PageSwipeDirection) => void
  /** Scroll container used for edge-aware swipe (avoids fighting table scroll). */
  scrollRef: React.RefObject<HTMLElement | null>
  /** Minimum horizontal travel in px before a page change commits. */
  thresholdPx?: number
  /** When false, pointer handlers are inert. */
  enabled?: boolean
}

interface UseHorizontalPageSwipeResult {
  /** Live drag offset in px (negative = toward next). */
  dragOffset: number
  /** True while a horizontal page gesture is locked in. */
  swiping: boolean
  /** Pointer handlers for the swipe surface. */
  pointerHandlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  }
}

const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"]'

/**
 * Horizontal pointer swipe that flips paginated lists without fighting mid-table scroll.
 * Swipe right → previous page (only near left scroll edge); swipe left → next (right edge).
 * @param options - Bounds, callback, and scroll container.
 * @returns Drag offset and pointer handlers.
 */
export function useHorizontalPageSwipe(
  options: UseHorizontalPageSwipeOptions,
): UseHorizontalPageSwipeResult {
  const {
    canGoPrev,
    canGoNext,
    onPageSwipe,
    scrollRef,
    thresholdPx = 72,
    enabled = true,
  } = options

  const [dragOffset, setDragOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)

  const pointerIdRef = useRef<number | null>(null)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const lockedRef = useRef(false)
  const offsetRef = useRef(0)

  /**
   * Resets gesture tracking state.
   * @returns Nothing.
   */
  const resetGesture = useCallback((): void => {
    pointerIdRef.current = null
    lockedRef.current = false
    offsetRef.current = 0
    setDragOffset(0)
    setSwiping(false)
  }, [])

  /**
   * Whether the scroll container is at the given horizontal edge.
   * @param edge - Left or right.
   * @returns True when at edge or content is not wider than the viewport.
   */
  const isAtScrollEdge = useCallback(
    (edge: 'left' | 'right'): boolean => {
      const el = scrollRef.current
      if (!el) {
        return true
      }
      const maxScroll = el.scrollWidth - el.clientWidth
      if (maxScroll <= 2) {
        return true
      }
      if (edge === 'left') {
        return el.scrollLeft <= 2
      }
      return el.scrollLeft >= maxScroll - 2
    },
    [scrollRef],
  )

  /**
   * Starts tracking a potential page swipe.
   * @param event - Pointer down.
   * @returns Nothing.
   */
  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (!enabled || event.button !== 0) {
        return
      }
      const target = event.target
      if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) {
        return
      }
      pointerIdRef.current = event.pointerId
      startXRef.current = event.clientX
      startYRef.current = event.clientY
      lockedRef.current = false
      offsetRef.current = 0
    },
    [enabled],
  )

  /**
   * Locks into horizontal swipe when motion is mostly sideways near a scroll edge.
   * @param event - Pointer move.
   * @returns Nothing.
   */
  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (pointerIdRef.current !== event.pointerId) {
        return
      }
      const dx = event.clientX - startXRef.current
      const dy = event.clientY - startYRef.current

      if (!lockedRef.current) {
        if (Math.abs(dx) < 14 && Math.abs(dy) < 14) {
          return
        }
        if (Math.abs(dx) <= Math.abs(dy) * 1.35) {
          pointerIdRef.current = null
          return
        }
        const goingNext = dx < 0
        const goingPrev = dx > 0
        if (goingNext && (!canGoNext || !isAtScrollEdge('right'))) {
          pointerIdRef.current = null
          return
        }
        if (goingPrev && (!canGoPrev || !isAtScrollEdge('left'))) {
          pointerIdRef.current = null
          return
        }
        lockedRef.current = true
        setSwiping(true)
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Ignore capture failures on detached nodes.
        }
      }

      let nextOffset = dx
      if (dx < 0 && !canGoNext) {
        nextOffset = dx * 0.2
      } else if (dx > 0 && !canGoPrev) {
        nextOffset = dx * 0.2
      } else {
        nextOffset = Math.max(-160, Math.min(160, dx * 0.55))
      }
      offsetRef.current = nextOffset
      setDragOffset(nextOffset)
    },
    [canGoNext, canGoPrev, isAtScrollEdge],
  )

  /**
   * Commits or cancels the swipe on pointer release.
   * @param event - Pointer up / cancel.
   * @returns Nothing.
   */
  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (pointerIdRef.current !== event.pointerId) {
        return
      }
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      } catch {
        // Ignore release failures.
      }

      const offset = offsetRef.current
      const wasLocked = lockedRef.current
      resetGesture()

      if (!wasLocked) {
        return
      }
      if (offset <= -thresholdPx && canGoNext) {
        onPageSwipe('next')
        return
      }
      if (offset >= thresholdPx && canGoPrev) {
        onPageSwipe('prev')
      }
    },
    [canGoNext, canGoPrev, onPageSwipe, resetGesture, thresholdPx],
  )

  return {
    dragOffset,
    swiping,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: finishPointer,
    },
  }
}
