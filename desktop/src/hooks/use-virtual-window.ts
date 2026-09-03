/**
 * Fixed-row virtual window for long scroll lists (CRM map pins / filter menus).
 */

import { useCallback, useEffect, useMemo, useState, type RefObject, type UIEvent } from 'react'

export interface VirtualWindow {
  /** Absolute scroll height of the full list. */
  totalHeight: number
  /** First visible index (including overscan). */
  startIndex: number
  /** Exclusive end index (including overscan). */
  endIndex: number
  /** Pixel offset for the windowed slice. */
  offsetY: number
  /** Scroll handler to attach to the viewport. */
  onScroll: (event: UIEvent<HTMLElement>) => void
}

interface UseVirtualWindowOptions {
  /** Initial viewport height before ResizeObserver measures (px). */
  initialViewportHeight?: number
  /** Extra rows above/below the viewport. */
  overscan?: number
  /** When this value changes, scroll position resets to 0. */
  resetKey?: string | number
}

/**
 * Computes a scroll window for a fixed-height item list.
 * @param itemCount - Total items.
 * @param itemHeight - Fixed row height in px.
 * @param scrollRef - Scroll container ref (for initial measure).
 * @param options - Overscan number (legacy) or options object.
 * @returns Virtual window metrics and scroll handler.
 */
export function useVirtualWindow(
  itemCount: number,
  itemHeight: number,
  scrollRef: RefObject<HTMLElement | null>,
  options: UseVirtualWindowOptions | number = 8,
): VirtualWindow {
  const normalized =
    typeof options === 'number'
      ? { overscan: options, initialViewportHeight: 400, resetKey: undefined as string | number | undefined }
      : {
          overscan: options.overscan ?? 8,
          initialViewportHeight: options.initialViewportHeight ?? 400,
          resetKey: options.resetKey,
        }

  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(normalized.initialViewportHeight)

  useEffect(() => {
    setScrollTop(0)
    const el = scrollRef.current
    if (el) {
      el.scrollTop = 0
    }
  }, [normalized.resetKey, scrollRef])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    /**
     * Syncs viewport height from the scroll container.
     */
    function measure(): void {
      if (!el) {
        return
      }
      setViewportHeight(el.clientHeight)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRef])

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  return useMemo(() => {
    const totalHeight = itemCount * itemHeight
    if (itemCount === 0 || itemHeight <= 0) {
      return {
        totalHeight: 0,
        startIndex: 0,
        endIndex: 0,
        offsetY: 0,
        onScroll,
      }
    }
    const rawStart = Math.floor(scrollTop / itemHeight)
    const visibleCount = Math.ceil(viewportHeight / itemHeight)
    const startIndex = Math.max(0, rawStart - normalized.overscan)
    const endIndex = Math.min(itemCount, rawStart + visibleCount + normalized.overscan)
    return {
      totalHeight,
      startIndex,
      endIndex,
      offsetY: startIndex * itemHeight,
      onScroll,
    }
  }, [itemCount, itemHeight, normalized.overscan, onScroll, scrollTop, viewportHeight])
}
