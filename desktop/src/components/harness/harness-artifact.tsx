/** Structured metric and chart artifacts embedded in Harness responses. */

import { useTranslation } from 'react-i18next'

const CHART_COLORS = ['#3182ce', '#7cb5ec', '#22a06b', '#f59e0b', '#7c3aed', '#ef4444'] as const

/** One headline metric displayed above charts. */
export interface HarnessArtifactMetric {
  label: string
  value: string
  detail: string
}

/** One named numeric series. */
export interface HarnessArtifactSeries {
  name: string
  values: number[]
}

/** Supported chart definition. */
export interface HarnessArtifactChart {
  type: 'bar' | 'line' | 'donut'
  title: string
  labels: string[]
  series: HarnessArtifactSeries[]
}

/** One structured result table. */
export interface HarnessArtifactTable {
  title: string
  columns: string[]
  rows: string[][]
}

/** One downloadable text result embedded in an artifact. */
export interface HarnessArtifactFile {
  name: string
  mimeType: string
  content: string
}

/** One complete visual artifact. */
export interface HarnessArtifactData {
  title: string
  subtitle: string
  metrics: HarnessArtifactMetric[]
  charts: HarnessArtifactChart[]
  tables: HarnessArtifactTable[]
  files: HarnessArtifactFile[]
}

/** Markdown extraction result. */
export interface HarnessArtifactExtraction {
  markdown: string
  artifacts: HarnessArtifactData[]
}

/**
 * Reads a trimmed string from an unknown record.
 * @param record - Candidate object.
 * @param key - Property name.
 * @returns Trimmed text or an empty string.
 */
function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Parses one metric row.
 * @param value - Candidate JSON value.
 * @returns Valid metric or null.
 */
function parseMetric(value: unknown): HarnessArtifactMetric | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const label = readString(record, 'label')
  const rawValue = record.value
  if (!label || (typeof rawValue !== 'string' && typeof rawValue !== 'number')) return null
  return {
    label,
    value: String(rawValue),
    detail: readString(record, 'detail'),
  }
}

/**
 * Parses one numeric chart series.
 * @param value - Candidate JSON value.
 * @returns Valid series or null.
 */
function parseSeries(value: unknown): HarnessArtifactSeries | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const values = Array.isArray(record.values)
    ? record.values.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    : []
  if (values.length === 0) return null
  return { name: readString(record, 'name'), values }
}

/**
 * Parses one chart definition.
 * @param value - Candidate JSON value.
 * @returns Valid chart or null.
 */
function parseChart(value: unknown): HarnessArtifactChart | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const type = record.type
  if (type !== 'bar' && type !== 'line' && type !== 'donut') return null
  const labels = Array.isArray(record.labels)
    ? record.labels.filter((entry): entry is string => typeof entry === 'string')
    : []
  const parsedSeries = Array.isArray(record.series)
    ? record.series.flatMap((entry) => {
        const parsed = parseSeries(entry)
        return parsed ? [parsed] : []
      })
    : []
  const directValues = Array.isArray(record.values)
    ? record.values.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))
    : []
  const series = parsedSeries.length > 0
    ? parsedSeries
    : directValues.length > 0
      ? [{ name: readString(record, 'name'), values: directValues }]
      : []
  if (labels.length === 0 || series.length === 0) return null
  return { type, title: readString(record, 'title'), labels, series }
}

/**
 * Parses one result table.
 * @param value - Candidate JSON value.
 * @returns Valid table or null.
 */
function parseTable(value: unknown): HarnessArtifactTable | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const columns = Array.isArray(record.columns)
    ? record.columns.filter((entry): entry is string => typeof entry === 'string')
    : []
  const rows = Array.isArray(record.rows)
    ? record.rows.flatMap((entry): string[][] => Array.isArray(entry)
        ? [entry.map((cell) => cell === null || cell === undefined ? '' : String(cell))]
        : [])
    : []
  return columns.length > 0 && rows.length > 0
    ? { title: readString(record, 'title'), columns, rows }
    : null
}

/**
 * Parses one downloadable text file.
 * @param value - Candidate JSON value.
 * @returns Valid file or null.
 */
function parseFile(value: unknown): HarnessArtifactFile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const name = readString(record, 'name')
  const content = typeof record.content === 'string' ? record.content : ''
  if (!name || !content) return null
  return { name, content, mimeType: readString(record, 'mimeType') || 'text/plain' }
}

/**
 * Parses one fenced Harness artifact payload.
 * @param source - JSON source from the Markdown fence.
 * @returns Valid artifact or null.
 */
function parseArtifact(source: string): HarnessArtifactData | null {
  try {
    const value = JSON.parse(source) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const record = value as Record<string, unknown>
    const title = readString(record, 'title')
    if (!title) return null
    const metricSource = Array.isArray(record.metrics)
      ? record.metrics
      : record.metrics && typeof record.metrics === 'object'
        ? Object.entries(record.metrics as Record<string, unknown>).map(([label, metricValue]) => ({
            label,
            value: metricValue,
          }))
        : []
    const metrics = metricSource.flatMap((entry) => {
          const parsed = parseMetric(entry)
          return parsed ? [parsed] : []
        })
    const chartSource = Array.isArray(record.charts)
      ? record.charts
      : record.chart && typeof record.chart === 'object'
        ? [record.chart]
        : []
    const charts = chartSource.flatMap((entry) => {
          const parsed = parseChart(entry)
          return parsed ? [parsed] : []
        })
    const tables = (Array.isArray(record.tables) ? record.tables : []).flatMap((entry) => {
      const parsed = parseTable(entry)
      return parsed ? [parsed] : []
    })
    const files = (Array.isArray(record.files) ? record.files : []).flatMap((entry) => {
      const parsed = parseFile(entry)
      return parsed ? [parsed] : []
    })
    if (metrics.length === 0 && charts.length === 0 && tables.length === 0 && files.length === 0) return null
    return { title, subtitle: readString(record, 'subtitle'), metrics, charts, tables, files }
  } catch {
    return null
  }
}

/**
 * Extracts valid `harness-artifact` fences from assistant Markdown.
 * @param content - Raw assistant response.
 * @returns Clean Markdown plus parsed artifacts.
 */
export function extractHarnessArtifacts(content: string): HarnessArtifactExtraction {
  const artifacts: HarnessArtifactData[] = []
  const markdown = content.replace(/```harness-artifact\s*([\s\S]*?)```/gi, (full, source: string) => {
    const artifact = parseArtifact(source.trim())
    if (!artifact) return String(full)
    artifacts.push(artifact)
    return ''
  })
  return { markdown: markdown.trim(), artifacts }
}

/**
 * Finds the largest absolute chart value.
 * @param chart - Chart definition.
 * @returns Positive scale maximum.
 */
function chartMaximum(chart: HarnessArtifactChart): number {
  return Math.max(1, ...chart.series.flatMap((series) => series.values.map((value) => Math.abs(value))))
}

/**
 * Renders a compact grouped bar chart.
 * @param props - Chart definition.
 * @returns Bar chart element.
 */
function BarChart({ chart }: { chart: HarnessArtifactChart }) {
  const maximum = chartMaximum(chart)
  return (
    <div className="flex h-48 items-end gap-2 border-b border-zinc-950/10 px-2 pt-4 dark:border-white/10">
      {chart.labels.map((label, labelIndex) => (
        <div key={`${label}-${labelIndex}`} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
          <div className="flex min-h-0 flex-1 items-end justify-center gap-0.5">
            {chart.series.map((series, seriesIndex) => {
              const value = series.values[labelIndex] ?? 0
              return (
                <div
                  key={`${series.name}-${seriesIndex}`}
                  className="min-h-0 w-full max-w-8 rounded-t-md transition-opacity hover:opacity-75"
                  style={{
                    height: `${Math.max(2, (Math.abs(value) / maximum) * 100)}%`,
                    backgroundColor: CHART_COLORS[seriesIndex % CHART_COLORS.length],
                  }}
                  title={`${series.name || label}: ${value}`}
                />
              )
            })}
          </div>
          <span className="truncate pb-1 text-center text-[10px] font-semibold text-muted" title={label}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Renders a compact line chart using the first series.
 * @param props - Chart definition.
 * @returns Line chart element.
 */
function LineChart({ chart }: { chart: HarnessArtifactChart }) {
  const values = chart.series[0]?.values ?? []
  const maximum = chartMaximum(chart)
  const denominator = Math.max(1, values.length - 1)
  const points = values
    .map((value, index) => `${(index / denominator) * 100},${94 - (Math.abs(value) / maximum) * 84}`)
    .join(' ')
  return (
    <div className="pt-4">
      <svg className="h-40 w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={chart.title}>
        <polyline points={points} fill="none" stroke={CHART_COLORS[0]} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {values.map((value, index) => (
          <circle key={`${index}-${value}`} cx={(index / denominator) * 100} cy={94 - (Math.abs(value) / maximum) * 84} r="1.7" fill={CHART_COLORS[0]} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between gap-2 border-t border-zinc-950/10 pt-2 dark:border-white/10">
        {chart.labels.map((label, index) => <span key={`${label}-${index}`} className="min-w-0 flex-1 truncate text-center text-[10px] font-semibold text-muted">{label}</span>)}
      </div>
    </div>
  )
}

/**
 * Builds a conic gradient for a donut chart.
 * @param values - Slice values.
 * @returns CSS conic-gradient value.
 */
function donutGradient(values: number[]): string {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1
  let offset = 0
  const stops = values.map((value, index) => {
    const start = offset
    offset += (Math.max(0, value) / total) * 100
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${offset}%`
  })
  return `conic-gradient(${stops.join(', ')})`
}

/**
 * Renders a donut chart with a value legend.
 * @param props - Chart definition.
 * @returns Donut chart element.
 */
function DonutChart({ chart }: { chart: HarnessArtifactChart }) {
  const values = chart.series[0]?.values ?? []
  return (
    <div className="flex min-h-48 items-center justify-center gap-6 py-4">
      <div className="grid size-36 shrink-0 place-items-center rounded-full" style={{ background: donutGradient(values) }}>
        <div className="grid size-20 place-items-center rounded-full bg-white text-center text-sm font-extrabold text-ink shadow-inner dark:bg-zinc-900">
          {values.reduce((sum, value) => sum + value, 0).toLocaleString()}
        </div>
      </div>
      <div className="min-w-0 space-y-2">
        {chart.labels.map((label, index) => (
          <div key={`${label}-${index}`} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate font-semibold text-muted">{label}</span>
            <span className="font-bold text-ink">{values[index] ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Renders one chart using its declared visual type.
 * @param props - Chart definition.
 * @returns Chart panel.
 */
function ArtifactChart({ chart }: { chart: HarnessArtifactChart }) {
  return (
    <section className="rounded-2xl border border-zinc-950/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
      {chart.title ? <h4 className="text-xs font-extrabold text-ink">{chart.title}</h4> : null}
      {chart.type === 'bar' ? <BarChart chart={chart} /> : chart.type === 'line' ? <LineChart chart={chart} /> : <DonutChart chart={chart} />}
    </section>
  )
}

/**
 * Displays one WorkBuddy-style structured result artifact.
 * @param props - Artifact data.
 * @returns Artifact card.
 */
export function HarnessArtifact({ artifact }: { artifact: HarnessArtifactData }) {
  const { t } = useTranslation()

  /**
   * Downloads one generated text result without sending it to a server.
   * @param file - Embedded file definition.
   * @returns Nothing.
   */
  function downloadFile(file: HarnessArtifactFile): void {
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.name
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-white/80 shadow-sm dark:border-white/10 dark:bg-zinc-950/45">
      <header className="border-b border-zinc-950/10 px-4 py-3 dark:border-white/10">
        <h3 className="text-sm font-extrabold text-ink">{artifact.title}</h3>
        {artifact.subtitle ? <p className="mt-1 text-xs font-medium text-muted">{artifact.subtitle}</p> : null}
      </header>
      <div className="space-y-4 p-4">
        {artifact.metrics.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {artifact.metrics.map((metric, index) => (
              <div key={`${metric.label}-${index}`} className="rounded-xl bg-zinc-950/4 px-4 py-3 dark:bg-white/6">
                <p className="text-[11px] font-bold text-muted">{metric.label}</p>
                <p className="mt-1 text-2xl font-medium tracking-tight text-ink">{metric.value}</p>
                {metric.detail ? <p className="mt-1 text-[11px] font-medium text-muted">{metric.detail}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        {artifact.charts.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {artifact.charts.map((chart, index) => <ArtifactChart key={`${chart.title}-${index}`} chart={chart} />)}
          </div>
        ) : null}
        {artifact.tables.map((table, index) => (
          <section key={`${table.title}-${index}`} className="overflow-hidden rounded-2xl border border-zinc-950/10 dark:border-white/10">
            {table.title ? <h4 className="border-b border-zinc-950/10 px-4 py-3 text-xs font-extrabold text-ink dark:border-white/10">{table.title}</h4> : null}
            <div className="overflow-auto">
              <table className="w-full min-w-max text-left text-xs">
                <thead className="bg-zinc-950/5 text-muted dark:bg-white/5"><tr>{table.columns.map((column) => <th key={column} className="px-3 py-2 font-extrabold">{column}</th>)}</tr></thead>
                <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-zinc-950/8 dark:border-white/8">{table.columns.map((column, columnIndex) => <td key={`${column}-${columnIndex}`} className="max-w-72 px-3 py-2 text-ink">{row[columnIndex] ?? ''}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>
        ))}
        {artifact.files.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {artifact.files.map((file) => <button key={file.name} type="button" className="rounded-xl bg-brand/10 px-3 py-2 text-xs font-bold text-brand hover:bg-brand/15" onClick={() => downloadFile(file)}>{t('harness.artifact.download', { name: file.name })}</button>)}
          </div>
        ) : null}
      </div>
    </section>
  )
}
