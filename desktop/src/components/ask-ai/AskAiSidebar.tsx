import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { AskAiPanel } from '@/components/ask-ai/ask-ai-panel'
import {
  clampAskAiWidthPx,
  loadAskAiWidthPx,
  MAX_ASK_AI_WIDTH_PX,
  MIN_ASK_AI_WIDTH_PX,
  saveAskAiWidthPx,
} from '@/utils/chat/ask-ai-width'

interface AskAiSidebarProps {
  open: boolean
  user: User
  pageLabel: string
}

/**
 * Docked Ask AI companion panel (Chrome side-panel style: shares the row with the page).
 * Left edge can be dragged to resize; width is cached in localStorage.
 * After the first open, the panel stays mounted so mode, model, and thread
 * remain in memory while the column is collapsed.
 * Close via the title-bar Ask AI control.
 * @param props - Open state, signed-in user, and current tab label for sharing copy
 * @returns Sidebar column or null before the first open
 */
export function AskAiSidebar({ open, user, pageLabel }: AskAiSidebarProps) {
  const [everOpened, setEverOpened] = useState(open)
  const [expanded, setExpanded] = useState(false)
  const [widthPx, setWidthPx] = useState(() => loadAskAiWidthPx())
  const [resizing, setResizing] = useState(false)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (open) {
      setEverOpened(true)
    }
  }, [open])

  useEffect(() => {
    if (!everOpened || !open) {
      setExpanded(false)
      return
    }
    const frame = requestAnimationFrame(() => {
      setExpanded(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [everOpened, open])

  /**
   * Begins a horizontal resize from the left edge.
   * @param event - Pointer down on the resize handle.
   * @returns Nothing.
   */
  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) {
        return
      }
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { startX: event.clientX, startWidth: widthPx }
      setResizing(true)
    },
    [widthPx],
  )

  /**
   * Updates width while the resize handle is dragged.
   * @param event - Pointer move while captured.
   * @returns Nothing.
   */
  function handleResizePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const next = clampAskAiWidthPx(drag.startWidth + (drag.startX - event.clientX))
    setWidthPx(next)
  }

  /**
   * Ends resize and persists the width.
   * @param event - Pointer up / cancel.
   * @returns Nothing.
   */
  function handleResizePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragRef.current) {
      return
    }
    dragRef.current = null
    setResizing(false)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Capture may already be released.
    }
    setWidthPx((current) => saveAskAiWidthPx(current))
  }

  /**
   * Measures the docked sidebar width in CSS pixels for screenshot cropping.
   * @returns Sidebar width
   */
  const getExcludeRightPx = useCallback((): number => {
    const measured = asideRef.current?.getBoundingClientRect().width
    if (typeof measured === 'number' && measured > 0) {
      return measured
    }
    return widthPx
  }, [widthPx])

  if (!everOpened) {
    return null
  }

  const shownWidth = expanded ? widthPx : 0

  return (
    <aside
      ref={asideRef}
      className={`ask-ai-sidebar relative flex h-full shrink-0 flex-col overflow-hidden border-zinc-950/10 bg-panel backdrop-blur-xl text-ink dark:border-white/10 ${
        expanded ? 'border-l' : 'border-l-0'
      } ${resizing ? '' : 'transition-[width] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]'}`}
      style={{ width: shownWidth }}
      aria-hidden={!expanded}
    >
      <div
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={widthPx}
        aria-valuemin={MIN_ASK_AI_WIDTH_PX}
        aria-valuemax={MAX_ASK_AI_WIDTH_PX}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerUp}
        onPointerCancel={handleResizePointerUp}
      />
      <div className="flex h-full min-h-0 flex-col" style={{ width: widthPx }}>
        <AskAiPanel user={user} pageLabel={pageLabel} getExcludeRightPx={getExcludeRightPx} />
      </div>
    </aside>
  )
}
