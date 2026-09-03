/**
 * Donut pie for Sales Board share breakdowns (customer / product / status).
 */

import { useMemo, useState } from 'react'
import { compactMoney } from '@/services/sales-board-format'

export interface SalesBoardPieSlice {
  id: string
  label: string
  value: number
  color: string
}

interface SalesBoardPieChartProps {
  title: string
  slices: SalesBoardPieSlice[]
  /** When set, legend values render as money; otherwise as counts. */
  currency?: string
  unitLabel?: string
  emptyLabel: string
  ariaLabel: string
}

const SIZE = 160
const CX = SIZE / 2
const CY = SIZE / 2
const OUTER_R = 68
const INNER_R = 40

/**
 * @param cx - Center X.
 * @param cy - Center Y.
 * @param radius - Arc radius.
 * @param angle - Angle in radians from +X, clockwise from top after shift.
 * @returns Cartesian point.
 */
function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  }
}

/**
 * Builds an SVG donut-slice path for a value range.
 * @param startRatio - Start as 0–1 of the full circle.
 * @param endRatio - End as 0–1 of the full circle.
 * @returns Path `d` attribute.
 */
function donutPath(startRatio: number, endRatio: number): string {
  const span = Math.min(Math.max(endRatio - startRatio, 0), 1)
  if (span <= 0) {
    return ''
  }
  // Full circle: two 180° arcs (a single 360° arc is invalid in SVG).
  if (span >= 0.9999) {
    const top = polar(CX, CY, OUTER_R, -Math.PI / 2)
    const bottom = polar(CX, CY, OUTER_R, Math.PI / 2)
    const innerTop = polar(CX, CY, INNER_R, -Math.PI / 2)
    const innerBottom = polar(CX, CY, INNER_R, Math.PI / 2)
    return [
      `M ${top.x} ${top.y}`,
      `A ${OUTER_R} ${OUTER_R} 0 1 1 ${bottom.x} ${bottom.y}`,
      `A ${OUTER_R} ${OUTER_R} 0 1 1 ${top.x} ${top.y}`,
      `L ${innerTop.x} ${innerTop.y}`,
      `A ${INNER_R} ${INNER_R} 0 1 0 ${innerBottom.x} ${innerBottom.y}`,
      `A ${INNER_R} ${INNER_R} 0 1 0 ${innerTop.x} ${innerTop.y}`,
      'Z',
    ].join(' ')
  }
  const startAngle = startRatio * Math.PI * 2 - Math.PI / 2
  const endAngle = endRatio * Math.PI * 2 - Math.PI / 2
  const large = span > 0.5 ? 1 : 0
  const outerStart = polar(CX, CY, OUTER_R, startAngle)
  const outerEnd = polar(CX, CY, OUTER_R, endAngle)
  const innerStart = polar(CX, CY, INNER_R, endAngle)
  const innerEnd = polar(CX, CY, INNER_R, startAngle)
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${INNER_R} ${INNER_R} 0 ${large} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ')
}

/**
 * Donut chart with a compact color legend and hover highlight.
 * @param props - Title, slices, and value formatting.
 * @returns Pie card body.
 */
export function SalesBoardPieChart({
  title,
  slices,
  currency,
  unitLabel,
  emptyLabel,
  ariaLabel,
}: SalesBoardPieChartProps) {
  const [hoverId, setHoverId] = useState<string | null>(null)

  const total = useMemo(
    () => slices.reduce((sum, slice) => sum + Math.max(0, slice.value), 0),
    [slices],
  )

  const arcs = useMemo(() => {
    if (total <= 0) {
      return []
    }
    let cursor = 0
    return slices
      .filter((slice) => slice.value > 0)
      .map((slice) => {
        const start = cursor / total
        cursor += slice.value
        const end = cursor / total
        return { slice, start, end, path: donutPath(start, end) }
      })
  }, [slices, total])

  const hoverSlice = hoverId ? slices.find((slice) => slice.id === hoverId) : undefined

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-brand">{title}</h3>
      {total <= 0 || arcs.length === 0 ? (
        <p className="py-10 text-center text-xs font-medium text-muted">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div className="relative shrink-0">
            <svg
              role="img"
              aria-label={ariaLabel}
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="block"
              onMouseLeave={() => setHoverId(null)}
            >
              {arcs.map(({ slice, path }) => {
                const active = hoverId === slice.id
                const dimmed = hoverId != null && !active
                return (
                  <path
                    key={slice.id}
                    d={path}
                    fill={slice.color}
                    className={`cursor-pointer transition-opacity duration-150 ${
                      dimmed ? 'opacity-35' : 'opacity-100'
                    } ${active ? 'brightness-110' : ''}`}
                    onMouseEnter={() => setHoverId(slice.id)}
                  >
                    <title>{slice.label}</title>
                  </path>
                )
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
              {hoverSlice ? (
                <>
                  <p className="max-w-24 truncate text-[10px] font-medium text-muted">
                    {hoverSlice.label}
                  </p>
                  <p className="text-xs font-bold tabular-nums text-ink">
                    {currency
                      ? compactMoney(hoverSlice.value, currency)
                      : `${hoverSlice.value.toLocaleString()}${unitLabel ? ` ${unitLabel}` : ''}`}
                  </p>
                  <p className="text-[10px] font-semibold tabular-nums text-muted">
                    {((hoverSlice.value / total) * 100).toFixed(1)}%
                  </p>
                </>
              ) : (
                <p className="text-xs font-bold tabular-nums text-ink">
                  {currency
                    ? compactMoney(total, currency)
                    : `${total.toLocaleString()}${unitLabel ? ` ${unitLabel}` : ''}`}
                </p>
              )}
            </div>
          </div>
          <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
            {slices.map((slice) => {
              const share = total > 0 ? (slice.value / total) * 100 : 0
              return (
                <li key={slice.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors ${
                      hoverId === slice.id ? 'bg-ink/5 dark:bg-white/5' : ''
                    }`}
                    onMouseEnter={() => setHoverId(slice.id)}
                    onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(slice.id)}
                    onBlur={() => setHoverId(null)}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
                      {slice.label}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted">
                      {share.toFixed(0)}%
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Palette for share slices (brand → accent progression). */
export const SALES_BOARD_PIE_COLORS = [
  '#18181b',
  '#0ea5e9',
  '#14b8a6',
  '#8b5cf6',
  '#f59e0b',
  '#f43f5e',
  '#94a3b8',
] as const

/**
 * Builds Top-N share slices plus an "Other" remainder against a known total.
 * @param items - Ranked rows with amount (or count) values.
 * @param total - Full set total (amount or count).
 * @param otherLabel - Label for the remainder slice.
 * @param maxNamed - Max named slices before rolling into Other (default 5).
 * @returns Pie slices ready for {@link SalesBoardPieChart}.
 */
export function buildShareSlices(
  items: readonly { id: string; name: string; value: number }[],
  total: number,
  otherLabel: string,
  maxNamed = 5,
): SalesBoardPieSlice[] {
  const positive = items.filter((item) => item.value > 0)
  const named = positive.slice(0, maxNamed)
  const namedSum = named.reduce((sum, item) => sum + item.value, 0)
  const otherValue = Math.max(0, total - namedSum)
  const slices: SalesBoardPieSlice[] = named.map((item, index) => ({
    id: item.id,
    label: item.name,
    value: item.value,
    color: SALES_BOARD_PIE_COLORS[index % SALES_BOARD_PIE_COLORS.length],
  }))
  if (otherValue > 0.0001) {
    slices.push({
      id: '__other__',
      label: otherLabel,
      value: otherValue,
      color: SALES_BOARD_PIE_COLORS[SALES_BOARD_PIE_COLORS.length - 1],
    })
  }
  return slices
}
