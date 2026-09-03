import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { animateHeight, HEIGHT_MS, releaseHeight } from '@/utils/home/animate-height'

interface AnimatedHeightRefs {
  shellRef: RefObject<HTMLElement | null>
  contentRef: RefObject<HTMLDivElement | null>
}

/**
 * Animates a shell's height when its content reflows (resize) or deps change.
 * First measure snaps; later changes animate. Releases the inline height after settle.
 * @param deps - Values that should force a re-measure (content identity, loading, etc.).
 * @returns Refs for the height shell and the measured content wrapper.
 */
export function useAnimatedHeight(deps: readonly unknown[] = []): AnimatedHeightRefs {
  const shellRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const readyToAnimateRef = useRef(false)
  const heightAnimatingRef = useRef(false)
  const releaseTimerRef = useRef(0)

  /**
   * Schedules clearing the inline height lock after the transition ends.
   * @param shell - Height shell element.
   * @returns Nothing.
   */
  function scheduleRelease(shell: HTMLElement): void {
    window.clearTimeout(releaseTimerRef.current)
    releaseTimerRef.current = window.setTimeout(() => {
      heightAnimatingRef.current = false
      releaseHeight(shell)
    }, HEIGHT_MS)
  }

  useLayoutEffect(() => {
    const shell = shellRef.current
    const content = contentRef.current
    if (!shell || !content) {
      return
    }
    const shouldAnimate = readyToAnimateRef.current
    readyToAnimateRef.current = true
    const target = content.scrollHeight
    if (!shouldAnimate) {
      releaseHeight(shell)
      return
    }
    if (Math.abs(shell.getBoundingClientRect().height - target) < 1) {
      releaseHeight(shell)
      return
    }
    heightAnimatingRef.current = true
    animateHeight(shell, target, true)
    scheduleRelease(shell)
    return () => {
      window.clearTimeout(releaseTimerRef.current)
      heightAnimatingRef.current = false
      releaseHeight(shell)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes an explicit deps list
  }, deps)

  useEffect(() => {
    const shellEl = shellRef.current
    const contentEl = contentRef.current
    if (!shellEl || !contentEl) {
      return
    }

    let frame = 0
    /**
     * Syncs shell height to content size after reflow.
     * @returns Nothing.
     */
    function syncHeight(): void {
      const next = contentEl!.scrollHeight
      if (Math.abs(shellEl!.getBoundingClientRect().height - next) < 1) {
        return
      }
      if (!readyToAnimateRef.current) {
        releaseHeight(shellEl!)
        return
      }
      heightAnimatingRef.current = true
      animateHeight(shellEl!, next, true)
      scheduleRelease(shellEl!)
    }

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncHeight)
    })
    observer.observe(contentEl)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(releaseTimerRef.current)
      observer.disconnect()
      releaseHeight(shellEl)
    }
  }, deps)

  return { shellRef, contentRef }
}
