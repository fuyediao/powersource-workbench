/** Structured renderer for CRM and MCP tool results. */

/**
 * Parses a JSON tool result without throwing into rendering.
 * @param source - Tool result text.
 * @returns Parsed value, or null when the result is not JSON.
 */
function parseResult(source: string): unknown {
  try {
    return JSON.parse(source) as unknown
  } catch {
    return null
  }
}

/**
 * Formats one unknown scalar for display.
 * @param value - Cell or metric value.
 * @returns Compact text.
 */
function displayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

/**
 * Finds the most useful record array in a common API result envelope.
 * @param value - Parsed JSON result.
 * @returns Record rows, or an empty array.
 */
function resultRows(value: unknown): Record<string, unknown>[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
      ? ['data', 'rows', 'records', 'items']
          .map((key) => (value as Record<string, unknown>)[key])
          .find(Array.isArray)
      : null
  return Array.isArray(candidate)
    ? candidate.filter((row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === 'object' && !Array.isArray(row),
      )
    : []
}

/**
 * Renders JSON tool output as a responsive table or metric grid with a raw fallback.
 * @param props - Raw result text.
 * @returns Structured tool result.
 */
export function HarnessToolResult({ result }: { result: string }) {
  const parsed = parseResult(result)
  const rows = resultRows(parsed)
  if (rows.length > 0) {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12)
    return (
      <div className="max-h-80 overflow-auto rounded-xl border border-zinc-950/10 dark:border-white/10">
        <table className="w-full min-w-max text-left text-[11px]">
          <thead className="sticky top-0 bg-zinc-100 text-muted dark:bg-zinc-800">
            <tr>{columns.map((column) => <th key={column} className="px-3 py-2 font-extrabold">{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-zinc-950/8 dark:border-white/8">
                {columns.map((column) => <td key={column} className="max-w-72 truncate px-3 py-2 text-ink" title={displayValue(row[column])}>{displayValue(row[column])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>)
    return (
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {entries.slice(0, 18).map(([key, value]) => (
          <div key={key} className="rounded-xl bg-zinc-950/5 px-3 py-2 dark:bg-white/5">
            <dt className="truncate text-[10px] font-extrabold text-muted">{key}</dt>
            <dd className="mt-1 break-words text-xs font-semibold text-ink">{displayValue(value)}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return <pre className="max-h-72 overflow-auto rounded-xl bg-zinc-950/5 p-3 font-mono text-[11px] whitespace-pre-wrap text-ink dark:bg-white/5">{result}</pre>
}
