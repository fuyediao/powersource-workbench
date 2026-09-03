/**
 * Opportunities Freeform board (Vue process board + unbounded canvas).
 * Hosted by the Kanban Function at `/kanban/opportunities`.
 * A sales-process dropdown swaps the stage cards; those cards can be dragged
 * anywhere. Windows: Ctrl+wheel zoom, Alt+left-drag or middle-drag pan.
 * macOS: click-drag pan, pinch zoom (and two-finger scroll pan). Layout
 * (per-process positions, pan, zoom) is stored in a per-user SQLite file
 * on this device.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import { GripIcon, RefreshIcon } from '@/icons/AllIcons'
import { listOpportunitiesBoard } from '@/services/opportunities-api'
import {
  DEFAULT_SALES_PROCESS,
  isOpportunitySalesProcess,
  pipelineStagesForSalesProcess,
  SALES_PROCESS_VALUES,
  type Opportunity,
  type OpportunitySalesProcess,
} from '@/types/opportunity'
import {
  clampOpportunityBoardScale,
  defaultOpportunityBoardStagePositions,
  OPPORTUNITY_BOARD_MODULE_WIDTH,
  readOpportunityBoardLayout,
  resolveOpportunityBoardStagePositions,
  sanitizeOpportunityBoardPosition,
  writeOpportunityBoardLayout,
  type OpportunityBoardLayout,
  type OpportunityBoardPosition,
} from '@/utils/opportunity-board-layout'
import { opportunityDetailPath } from '@/utils/opportunity-list-routes'

interface OpportunitiesBoardPaneProps {
  userId: string
  onNavigate: (path: string) => void
}

type BoardPositions = Record<string, OpportunityBoardPosition>

const ZERO_PAN: OpportunityBoardPosition = { x: 0, y: 0 }
const DOT_PX = 18

/**
 * Whether this renderer is running on macOS.
 * @returns True on Mac.
 */
function isMacDesktop(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  return /Mac/i.test(navigator.platform) || /Mac OS X/i.test(navigator.userAgent)
}

/**
 * Formats an amount for a board card.
 * @param amount - Numeric amount, or null.
 * @param currencyCode - Currency code.
 * @returns Compact label, or empty string.
 */
function formatBoardAmount(amount: number | null, currencyCode: string): string {
  if (amount == null || !Number.isFinite(amount)) {
    return ''
  }
  return `${currencyCode} ${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(amount)}`
}

interface BoardStageGroup {
  stage: string
  items: Opportunity[]
}

/**
 * Builds stage groups for the active sales process (catalog + leftovers).
 * @param process - Active sales process.
 * @param items - Opportunities in this process.
 * @returns Ordered stage groups.
 */
function boardStageGroups(
  process: OpportunitySalesProcess,
  items: Opportunity[],
): BoardStageGroup[] {
  const stages = pipelineStagesForSalesProcess(process)
  const known = new Set(stages.map((row) => row.stage))
  const groups: BoardStageGroup[] = stages.map((row) => ({
    stage: row.stage,
    items: items.filter((item) => item.stage === row.stage),
  }))
  const leftover = new Map<string, Opportunity[]>()
  for (const item of items) {
    if (known.has(item.stage)) {
      continue
    }
    const list = leftover.get(item.stage) ?? []
    list.push(item)
    leftover.set(item.stage, list)
  }
  leftover.forEach((stageItems, stage) => {
    groups.push({ stage, items: stageItems })
  })
  return groups
}

/**
 * Empty layout store used before SQLite hydrates.
 * @returns Empty layout.
 */
function emptyBoardLayout(): OpportunityBoardLayout {
  return { selectedProcess: DEFAULT_SALES_PROCESS, processes: {} }
}

/**
 * Freeform opportunity board: one process at a time, draggable stage cards.
 * @param props - User and navigation.
 * @returns Board UI.
 */
export function OpportunitiesBoardPane({
  userId,
  onNavigate,
}: OpportunitiesBoardPaneProps) {
  const { t } = useTranslation()
  const mac = useMemo(() => isMacDesktop(), [])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    stage: string
    startX: number
    startY: number
    origin: OpportunityBoardPosition
  } | null>(null)
  const panDragRef = useRef<{
    startX: number
    startY: number
    origin: OpportunityBoardPosition
  } | null>(null)
  const layoutStoreRef = useRef<OpportunityBoardLayout>(emptyBoardLayout())
  const hydratedRef = useRef(false)
  const selectedProcessRef = useRef<OpportunitySalesProcess>(DEFAULT_SALES_PROCESS)
  const positionsRef = useRef<BoardPositions>({})
  const panRef = useRef<OpportunityBoardPosition>(ZERO_PAN)
  const scaleRef = useRef(1)
  const wheelPersistTimer = useRef<number | null>(null)

  const [rows, setRows] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(800)
  const [selectedProcess, setSelectedProcess] = useState<OpportunitySalesProcess>(
    DEFAULT_SALES_PROCESS,
  )
  const [positions, setPositions] = useState<BoardPositions>({})
  const [pan, setPan] = useState<OpportunityBoardPosition>(ZERO_PAN)
  const [scale, setScale] = useState(1)
  const [dragging, setDragging] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  const [altHeld, setAltHeld] = useState(false)
  const [zOrder, setZOrder] = useState<string[]>([])

  const salesProcessOptions = useMemo(
    () =>
      SALES_PROCESS_VALUES.map((process) => ({
        value: process,
        label: t(`admin.opportunities.salesProcess.${process}`),
      })),
    [t],
  )

  /**
   * Reloads board rows.
   * @returns Nothing.
   */
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const data = await listOpportunitiesBoard()
      setRows(data)
    } catch (err) {
      console.error('[OpportunitiesBoardPane] load:', err)
      setError(t('admin.opportunities.errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void reload()
  }, [reload])

  /**
   * Tracks Alt so Windows can show a pan cursor.
   * @returns Nothing.
   */
  useEffect(() => {
    if (mac) {
      return
    }

    /**
     * Updates Alt-held from a keyboard event.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function onKey(event: KeyboardEvent): void {
      setAltHeld(event.altKey)
    }

    /**
     * Clears Alt when the window loses focus.
     * @returns Nothing.
     */
    function onBlur(): void {
      setAltHeld(false)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [mac])

  /**
   * Blocks Chromium middle-click autoscroll so the wheel button can pan.
   * @returns Nothing.
   */
  useEffect(() => {
    const node = canvasRef.current
    if (!node || mac) {
      return
    }

    /**
     * Prevents the default middle-button autoscroll gesture.
     * @param event - Mouse event.
     * @returns Nothing.
     */
    function onMouseDown(event: MouseEvent): void {
      if (event.button === 1) {
        event.preventDefault()
      }
    }

    node.addEventListener('mousedown', onMouseDown, true)
    return () => node.removeEventListener('mousedown', onMouseDown, true)
  }, [mac])

  /**
   * Applies a process slice to refs and React state.
   * @param process - Process to show.
   * @param width - Canvas width for wrap defaults.
   * @param extraStages - Extra stage slugs.
   * @returns Nothing.
   */
  function applyProcessSlice(
    process: OpportunitySalesProcess,
    width: number,
    extraStages: readonly string[],
  ): void {
    const slice = layoutStoreRef.current.processes[process]
    const nextPositions = resolveOpportunityBoardStagePositions(
      process,
      width,
      slice?.stages,
      extraStages,
    )
    const nextPan = slice?.pan ?? ZERO_PAN
    const nextScale = slice?.scale ?? 1
    selectedProcessRef.current = process
    positionsRef.current = nextPositions
    panRef.current = nextPan
    scaleRef.current = nextScale
    setSelectedProcess(process)
    setPositions(nextPositions)
    setPan(nextPan)
    setScale(nextScale)
    setZOrder(Object.keys(nextPositions))
  }

  /**
   * Writes the live layout to SQLite (falls back to localStorage).
   * @returns Nothing.
   */
  const persist = useCallback((): void => {
    if (!hydratedRef.current) {
      return
    }
    const process = selectedProcessRef.current
    layoutStoreRef.current = {
      selectedProcess: process,
      processes: {
        ...layoutStoreRef.current.processes,
        [process]: {
          stages: positionsRef.current,
          pan: panRef.current,
          scale: scaleRef.current,
        },
      },
    }
    void writeOpportunityBoardLayout(userId, layoutStoreRef.current)
  }, [userId])

  /**
   * Measures the viewport and hydrates from SQLite once.
   * @returns Nothing.
   */
  useEffect(() => {
    const node = canvasRef.current
    if (!node) {
      return
    }
    let cancelled = false
    let started = false
    hydratedRef.current = false

    /**
     * Applies measured width; hydrates from SQLite on the first pass.
     * @param width - Measured canvas width.
     * @returns Nothing.
     */
    function applyWidth(width: number): void {
      const nextWidth = Math.max(320, Math.floor(width))
      setCanvasWidth(nextWidth)
      if (started || dragRef.current || panDragRef.current) {
        return
      }
      started = true
      void (async () => {
        const saved = await readOpportunityBoardLayout(userId)
        if (cancelled) {
          return
        }
        if (saved) {
          layoutStoreRef.current = saved
        }
        applyProcessSlice(
          saved?.selectedProcess ?? DEFAULT_SALES_PROCESS,
          nextWidth,
          [],
        )
        hydratedRef.current = true
      })()
    }

    applyWidth(node.clientWidth)
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? node.clientWidth
      applyWidth(width)
    })
    observer.observe(node)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [userId])

  /**
   * Debounces camera persist after wheel / pinch.
   * @returns Nothing.
   */
  const scheduleCameraPersist = useCallback((): void => {
    if (wheelPersistTimer.current != null) {
      window.clearTimeout(wheelPersistTimer.current)
    }
    wheelPersistTimer.current = window.setTimeout(() => {
      wheelPersistTimer.current = null
      persist()
    }, 280)
  }, [persist])

  /**
   * Zooms the camera around a client point (pinch / Ctrl+wheel).
   * @param clientX - Pointer X in viewport.
   * @param clientY - Pointer Y in viewport.
   * @param factor - Multiplier applied to the current scale.
   * @returns Nothing.
   */
  const zoomAtClient = useCallback(
    (clientX: number, clientY: number, factor: number): void => {
      const node = canvasRef.current
      if (!node) {
        return
      }
      const prev = scaleRef.current
      const nextScale = clampOpportunityBoardScale(prev * factor)
      if (nextScale === prev) {
        return
      }
      const rect = node.getBoundingClientRect()
      const cx = clientX - rect.left
      const cy = clientY - rect.top
      const nextPan = {
        x: cx - ((cx - panRef.current.x) / prev) * nextScale,
        y: cy - ((cy - panRef.current.y) / prev) * nextScale,
      }
      scaleRef.current = nextScale
      panRef.current = nextPan
      setScale(nextScale)
      setPan(nextPan)
    },
    [],
  )

  /**
   * Wheel: Windows Ctrl+wheel and Mac pinch zoom; Mac two-finger scroll pans.
   * @returns Nothing.
   */
  useEffect(() => {
    const node = canvasRef.current
    if (!node) {
      return
    }

    /**
     * Handles zoom vs pan from a wheel / pinch event.
     * @param event - Wheel event.
     * @returns Nothing.
     */
    function onWheel(event: WheelEvent): void {
      if (event.ctrlKey) {
        event.preventDefault()
        const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
        zoomAtClient(event.clientX, event.clientY, Math.exp(-dy * 0.01))
        scheduleCameraPersist()
        return
      }
      if (!mac) {
        return
      }
      event.preventDefault()
      const next = {
        x: panRef.current.x - event.deltaX,
        y: panRef.current.y - event.deltaY,
      }
      panRef.current = next
      setPan(next)
      scheduleCameraPersist()
    }

    node.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      node.removeEventListener('wheel', onWheel, true)
      if (wheelPersistTimer.current != null) {
        window.clearTimeout(wheelPersistTimer.current)
      }
    }
  }, [mac, scheduleCameraPersist, zoomAtClient])

  const processRows = useMemo(() => {
    return rows.filter((row) => {
      const raw = row.salesProcess
      const process =
        raw && isOpportunitySalesProcess(raw) ? raw : DEFAULT_SALES_PROCESS
      return process === selectedProcess
    })
  }, [rows, selectedProcess])

  const extraStages = useMemo(() => {
    const known = new Set(
      pipelineStagesForSalesProcess(selectedProcess).map((row) => row.stage),
    )
    const extra: string[] = []
    for (const row of processRows) {
      if (!known.has(row.stage) && !extra.includes(row.stage)) {
        extra.push(row.stage)
      }
    }
    return extra
  }, [processRows, selectedProcess])

  const stageGroups = useMemo(
    () => boardStageGroups(selectedProcess, processRows),
    [processRows, selectedProcess],
  )

  useEffect(() => {
    if (Object.keys(positionsRef.current).length === 0) {
      return
    }
    const defaults = defaultOpportunityBoardStagePositions(
      selectedProcess,
      canvasWidth,
      extraStages,
    )
    const next = { ...positionsRef.current }
    let changed = false
    for (const stage of Object.keys(defaults)) {
      if (!next[stage]) {
        next[stage] = defaults[stage]
        changed = true
      }
    }
    if (!changed) {
      return
    }
    positionsRef.current = next
    setPositions(next)
    setZOrder((prev) => {
      const missing = Object.keys(next).filter((stage) => !prev.includes(stage))
      return missing.length === 0 ? prev : [...prev, ...missing]
    })
  }, [canvasWidth, extraStages, selectedProcess])

  /**
   * Switches the active sales process and replaces stage cards.
   * @param nextValue - Selected process slug.
   * @returns Nothing.
   */
  function onSalesProcessChange(nextValue: string): void {
    if (!isOpportunitySalesProcess(nextValue) || nextValue === selectedProcess) {
      return
    }
    persist()
    applyProcessSlice(nextValue, canvasWidth, extraStagesForProcess(nextValue, rows))
    persist()
  }

  /**
   * Starts dragging a stage card from its header.
   * @param event - Pointer event.
   * @param stage - Stage slug.
   * @returns Nothing.
   */
  function onStagePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    stage: string,
  ): void {
    if (event.button !== 0 || (!mac && event.altKey)) {
      return
    }
    const origin = positionsRef.current[stage]
    if (!origin) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      stage,
      startX: event.clientX,
      startY: event.clientY,
      origin,
    }
    setDragging(stage)
    setZOrder((prev) => [...prev.filter((id) => id !== stage), stage])
  }

  /**
   * Moves the captured stage card in world space (pointer delta / zoom).
   * @param event - Pointer event.
   * @returns Nothing.
   */
  function onStagePointerMove(event: ReactPointerEvent<HTMLButtonElement>): void {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const zoom = scaleRef.current || 1
    const nextPos = sanitizeOpportunityBoardPosition({
      x: drag.origin.x + (event.clientX - drag.startX) / zoom,
      y: drag.origin.y + (event.clientY - drag.startY) / zoom,
    })
    const next = { ...positionsRef.current, [drag.stage]: nextPos }
    positionsRef.current = next
    setPositions(next)
  }

  /**
   * Ends the stage drag and writes SQLite.
   * @returns Nothing.
   */
  function onStagePointerUp(): void {
    if (!dragRef.current) {
      return
    }
    dragRef.current = null
    setDragging(null)
    persist()
  }

  /**
   * Starts panning: Mac empty-canvas drag, Windows Alt+left-drag, or
   * Windows middle-button drag.
   * @param event - Pointer event.
   * @returns Nothing.
   */
  function onCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    const panFromMiddle = !mac && event.button === 1
    const panFromAlt = !mac && event.button === 0 && event.altKey
    const panFromMacBg =
      mac && event.button === 0 && event.target === event.currentTarget
    if (!panFromMiddle && !panFromAlt && !panFromMacBg) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    panDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: panRef.current,
    }
    setPanning(true)
  }

  /**
   * Pans the camera while the canvas is captured.
   * @param event - Pointer event.
   * @returns Nothing.
   */
  function onCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = panDragRef.current
    if (!drag) {
      return
    }
    const next = {
      x: drag.origin.x + (event.clientX - drag.startX),
      y: drag.origin.y + (event.clientY - drag.startY),
    }
    panRef.current = next
    setPan(next)
  }

  /**
   * Ends canvas pan and writes SQLite.
   * @returns Nothing.
   */
  function onCanvasPointerUp(): void {
    if (!panDragRef.current) {
      return
    }
    panDragRef.current = null
    setPanning(false)
    persist()
  }

  /**
   * Restores wrap defaults for the current process only.
   * @returns Nothing.
   */
  function resetLayout(): void {
    const next = defaultOpportunityBoardStagePositions(
      selectedProcess,
      canvasWidth,
      extraStages,
    )
    positionsRef.current = next
    panRef.current = ZERO_PAN
    scaleRef.current = 1
    setPositions(next)
    setPan(ZERO_PAN)
    setScale(1)
    setZOrder(Object.keys(next))
    persist()
  }

  const panCursor = panning
    ? 'cursor-grabbing'
    : mac || altHeld
      ? 'cursor-grab'
      : 'cursor-default'

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
        <h1 className="shrink-0 text-xl font-extrabold text-brand">
          {t('admin.opportunities.board.title')}
        </h1>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <CrmFilterSelect
            className="w-auto min-w-52 max-w-72 shrink-0"
            value={selectedProcess}
            options={salesProcessOptions}
            ariaLabel={t('admin.opportunities.form.salesProcess')}
            onChange={onSalesProcessChange}
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            title={t('admin.leadsTable.refresh')}
            onClick={() => void reload()}
          >
            <RefreshIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('admin.leadsTable.refresh')}</span>
          </button>
          <button
            type="button"
            className="rounded-2xl bg-zinc-950/5 px-3 py-2 text-sm font-bold text-brand dark:bg-white/10"
            onClick={resetLayout}
          >
            {t('admin.opportunities.board.resetLayout')}
          </button>
        </div>
      </div>

      {error ? (
        <p className="px-5 text-sm font-medium text-rose-500 sm:px-6">{error}</p>
      ) : null}

      <div
        ref={canvasRef}
        className={`relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle,rgba(24,24,27,0.12)_1px,transparent_1px)] touch-none dark:bg-[radial-gradient(circle,rgba(255,255,255,0.12)_1px,transparent_1px)] ${panCursor}`}
        style={{
          backgroundSize: `${DOT_PX * scale}px ${DOT_PX * scale}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
        onPointerDownCapture={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onPointerCancel={onCanvasPointerUp}
        onLostPointerCapture={onCanvasPointerUp}
      >
        {loading && rows.length === 0 ? (
          <p className="pointer-events-none absolute top-6 left-6 z-20 text-sm font-medium text-muted">
            {t('admin.leadsTable.loading')}
          </p>
        ) : null}
        <div
          className="absolute top-0 left-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          {stageGroups.map((group) => {
            const pos = positions[group.stage]
            if (!pos) {
              return null
            }
            const z = 10 + Math.max(0, zOrder.indexOf(group.stage))
            return (
              <section
                key={group.stage}
                className={`absolute cursor-auto rounded-2xl border border-ink/10 bg-white/90 shadow-sm backdrop-blur-sm dark:bg-zinc-950/80 ${
                  dragging === group.stage ? 'ring-2 ring-brand/30' : ''
                }`}
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: OPPORTUNITY_BOARD_MODULE_WIDTH,
                  zIndex: z,
                }}
              >
                <button
                  type="button"
                  className="flex w-full cursor-grab touch-none items-center gap-2 rounded-t-2xl px-3 py-2.5 text-left select-none active:cursor-grabbing"
                  aria-label={t('admin.opportunities.board.dragModule', {
                    name: t(`admin.opportunities.stage.${group.stage}`, {
                      defaultValue: group.stage,
                    }),
                  })}
                  aria-grabbed={dragging === group.stage}
                  onPointerDown={(event) => onStagePointerDown(event, group.stage)}
                  onPointerMove={onStagePointerMove}
                  onPointerUp={onStagePointerUp}
                  onPointerCancel={onStagePointerUp}
                  onLostPointerCapture={onStagePointerUp}
                >
                  <GripIcon className="size-4 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-ink">
                    {t(`admin.opportunities.stage.${group.stage}`, {
                      defaultValue: group.stage,
                    })}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-muted">
                    {group.items.length}
                  </span>
                </button>
                <div className="max-h-[22rem] space-y-1.5 overflow-y-auto px-3 pb-3">
                  {group.items.length === 0 ? (
                    <p className="truncate py-4 text-center text-[11px] text-muted">
                      {t('admin.opportunities.board.emptyStage')}
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className="w-full rounded-xl border border-ink/10 bg-white/80 px-2.5 py-2 text-left hover:border-brand/30 dark:bg-white/5"
                            onClick={() => onNavigate(opportunityDetailPath(item.id))}
                          >
                            <p className="truncate text-xs font-semibold text-ink">
                              {item.name}
                            </p>
                            <p className="truncate text-[11px] text-muted">
                              {item.companyName || '—'}
                              {formatBoardAmount(item.amount, item.currencyCode)
                                ? ` · ${formatBoardAmount(item.amount, item.currencyCode)}`
                                : ''}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Extra stage slugs for a process from live opportunity rows.
 * @param process - Sales process.
 * @param rows - All board rows.
 * @returns Unique leftover stage slugs.
 */
function extraStagesForProcess(
  process: OpportunitySalesProcess,
  rows: Opportunity[],
): string[] {
  const known = new Set(
    pipelineStagesForSalesProcess(process).map((row) => row.stage),
  )
  const extra: string[] = []
  for (const row of rows) {
    const raw = row.salesProcess
    const rowProcess =
      raw && isOpportunitySalesProcess(raw) ? raw : DEFAULT_SALES_PROCESS
    if (rowProcess !== process || known.has(row.stage) || extra.includes(row.stage)) {
      continue
    }
    extra.push(row.stage)
  }
  return extra
}
