/**
 * Order trend combo chart: bars = order count, line = amount, with a
 * Sheets-style dark hover tooltip showing both series for the active bucket.
 * Layout width tracks the frame via ResizeObserver so SVG text is never
 * non-uniformly stretched when the card grows.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SalesBoardMonthlyPoint } from '@/services/sales-board-types'
import { compactMoney, formatMoney } from '@/services/sales-board-format'

interface SalesBoardMonthlyChartProps {
  months: SalesBoardMonthlyPoint[]
  currency: string
  ordersLabel: string
  amountLabel: string
  ordersUnit: string
  ariaLabel: string
}

const CHART_H = 220
const PAD_TOP = 16
const PAD_BOTTOM = 28
const PAD_LEFT = 44
const PAD_RIGHT = 52
const SLOT_MIN = 44
const TICK_RATIOS = [0, 0.25, 0.5, 0.75, 1] as const

/**
 * Rounds a positive max up to a readable axis ceiling.
 * @param value - Raw max.
 * @returns Ceiling used for the axis.
 */
function niceCeiling(value: number): number {
  if (value <= 0) {
    return 1
  }
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  const normalized = value / base
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * base
}

/**
 * Formats an order-count tick for the left axis.
 * @param value - Order count.
 * @returns Compact integer label.
 */
function formatOrderTick(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`
  }
  return String(Math.round(value))
}

/**
 * Dual-scale combo chart for the Sales Board order trend.
 * @param props - Trend rows, currency, and legend/tooltip labels.
 * @returns SVG combo chart with hover tooltip.
 */
export function SalesBoardMonthlyChart({
  months,
  currency,
  ordersLabel,
  amountLabel,
  ordersUnit,
  ariaLabel,
}: SalesBoardMonthlyChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(0)

  useLayoutEffect(() => {
    const el = frameRef.current
    if (el === null) {
      return
    }
    const frame: HTMLDivElement = el
    /**
     * Syncs layout width to the visible frame so the SVG stays 1:1 with pixels.
     * @returns Nothing.
     */
    function syncWidth(): void {
      setFrameWidth(Math.round(frame.getBoundingClientRect().width))
    }
    syncWidth()
    const observer = new ResizeObserver(syncWidth)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => {
    const n = Math.max(months.length, 1)
    const minPlotW = Math.max(n * SLOT_MIN, 320)
    const plotInnerW =
      frameWidth > 0 ? Math.max(frameWidth - PAD_LEFT - PAD_RIGHT, minPlotW) : minPlotW
    const width = plotInnerW + PAD_LEFT + PAD_RIGHT
    const plotH = CHART_H - PAD_TOP - PAD_BOTTOM
    const maxOrders = niceCeiling(Math.max(1, ...months.map((row) => row.orderCount)))
    const maxAmount = niceCeiling(Math.max(1, ...months.map((row) => row.amount)))
    const slot = plotInnerW / n
    const barW = Math.min(36, Math.max(10, slot * 0.45))

    const points = months.map((row, index) => {
      const cx = PAD_LEFT + slot * index + slot / 2
      const slotX = PAD_LEFT + slot * index
      const barH = (row.orderCount / maxOrders) * plotH
      const barY = PAD_TOP + plotH - barH
      const lineY = PAD_TOP + plotH - (row.amount / maxAmount) * plotH
      return { row, cx, slotX, slot, barH, barY, lineY, barW }
    })

    const linePath =
      points.length === 0
        ? ''
        : points
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.cx} ${point.lineY}`)
            .join(' ')

    const ticks = TICK_RATIOS.map((ratio) => ({
      ratio,
      y: PAD_TOP + plotH * (1 - ratio),
      orders: maxOrders * ratio,
      amount: maxAmount * ratio,
    }))

    return { width, plotH, points, linePath, ticks }
  }, [frameWidth, months])

  const hoverPoint = hoverIndex == null ? null : layout.points[hoverIndex]
  const tipAnchorY = hoverPoint ? Math.min(hoverPoint.barY, hoverPoint.lineY) : 0
  /** Tall bars near the plot top: pin the tooltip to the chart top instead of above the bar. */
  const tipPinnedTop = hoverPoint != null && tipAnchorY < PAD_TOP + 56

  if (months.length === 0) {
    return null
  }

  return (
    <div ref={frameRef} className="w-full overflow-x-auto">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand/80" aria-hidden />
          {ordersLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-full border-2 border-sky-500 bg-white dark:bg-zinc-900"
            aria-hidden
          />
          {amountLabel}
        </span>
      </div>
      <div className="relative" style={{ width: layout.width }}>
        <svg
          role="img"
          aria-label={ariaLabel}
          width={layout.width}
          height={CHART_H}
          viewBox={`0 0 ${layout.width} ${CHART_H}`}
          className="block"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {layout.ticks.map((tick) => (
            <g key={tick.ratio}>
              <line
                x1={PAD_LEFT}
                x2={layout.width - PAD_RIGHT}
                y1={tick.y}
                y2={tick.y}
                className="stroke-ink/10 dark:stroke-white/10"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 6}
                y={tick.y + 3}
                textAnchor="end"
                className="fill-muted text-[10px] tabular-nums"
              >
                {formatOrderTick(tick.orders)}
              </text>
              <text
                x={layout.width - PAD_RIGHT + 6}
                y={tick.y + 3}
                textAnchor="start"
                className="fill-sky-600 text-[10px] tabular-nums dark:fill-sky-400"
              >
                {compactMoney(tick.amount, currency)}
              </text>
            </g>
          ))}

          {hoverPoint ? (
            <line
              x1={hoverPoint.cx}
              x2={hoverPoint.cx}
              y1={PAD_TOP}
              y2={PAD_TOP + layout.plotH}
              className="stroke-ink/25 dark:stroke-white/25"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          {layout.points.map((point, index) => {
            const dimmed = hoverIndex != null && hoverIndex !== index
            return (
              <g
                key={`${point.row.year}-${point.row.month}-${point.row.day ?? 0}-${point.row.label}`}
              >
                <rect
                  x={point.cx - point.barW / 2}
                  y={point.barY}
                  width={point.barW}
                  height={Math.max(point.barH, 2)}
                  rx={4}
                  ry={4}
                  className={`transition-opacity duration-150 ${
                    dimmed ? 'fill-brand/35' : 'fill-brand/80'
                  }`}
                />
                <text
                  x={point.cx}
                  y={CHART_H - 8}
                  textAnchor="middle"
                  className={`text-[10px] font-medium ${
                    hoverIndex === index ? 'fill-ink' : 'fill-muted'
                  }`}
                >
                  {point.row.label}
                </text>
              </g>
            )
          })}

          {layout.linePath ? (
            <path
              d={layout.linePath}
              fill="none"
              className="stroke-sky-500"
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {layout.points.map((point, index) => {
            const active = hoverIndex === index
            const dimmed = hoverIndex != null && !active
            return (
              <circle
                key={`${point.row.year}-${point.row.month}-${point.row.day ?? 0}-${point.row.label}-dot`}
                cx={point.cx}
                cy={point.lineY}
                r={active ? 5.5 : 4.5}
                className={`stroke-sky-500 transition-[r,opacity] duration-150 ${
                  dimmed
                    ? 'fill-white opacity-40 dark:fill-zinc-900'
                    : 'fill-white dark:fill-zinc-900'
                }`}
                strokeWidth={2}
              />
            )
          })}

          {layout.points.map((point, index) => (
            <rect
              key={`${point.row.year}-${point.row.month}-${point.row.day ?? 0}-${point.row.label}-hit`}
              x={point.slotX}
              y={PAD_TOP}
              width={point.slot}
              height={layout.plotH + PAD_BOTTOM}
              fill="transparent"
              className="cursor-crosshair"
              onMouseEnter={() => setHoverIndex(index)}
              onFocus={() => setHoverIndex(index)}
            />
          ))}
        </svg>

        {hoverPoint ? (
          <div
            role="tooltip"
            className={`pointer-events-none absolute z-20 -translate-x-1/2 ${
              tipPinnedTop ? 'translate-y-0' : '-translate-y-full'
            }`}
            style={{
              left: hoverPoint.cx,
              top: tipPinnedTop ? 4 : tipAnchorY - 10,
            }}
          >
            {tipPinnedTop ? (
              <div
                aria-hidden
                className="mx-auto mb-0 h-0 w-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-zinc-900 dark:border-b-zinc-800"
              />
            ) : null}
            <div className="rounded-lg bg-zinc-900 px-2.5 py-1.5 text-left shadow-lg dark:bg-zinc-800">
              <p className="text-[11px] font-semibold text-white">{hoverPoint.row.label}</p>
              <p className="mt-0.5 text-[11px] tabular-nums text-zinc-200">
                <span className="text-zinc-400">{ordersLabel}</span>
                {' · '}
                {hoverPoint.row.orderCount.toLocaleString()} {ordersUnit}
              </p>
              <p className="text-[11px] tabular-nums text-zinc-200">
                <span className="text-zinc-400">{amountLabel}</span>
                {' · '}
                {formatMoney(hoverPoint.row.amount, currency, 2)}
              </p>
            </div>
            {tipPinnedTop ? null : (
              <div
                aria-hidden
                className="mx-auto -mt-px h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-zinc-900 dark:border-t-zinc-800"
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
