import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Leave duration for tools search results (ms). */
export const TOOLS_SEARCH_BODY_LEAVE_MS = 180

export type ToolsSearchMode =
  | 'loading'
  | 'hint'
  | 'no-results'
  | 'unavailable'
  | 'results'

interface ToolsSearchBodyProps {
  /** Current status to show. */
  mode: ToolsSearchMode
  /** Identity of the results list; changes trigger a swap animation. */
  resultsKey: string
  loading: ReactNode
  hint: ReactNode
  noResults: ReactNode
  unavailable?: ReactNode
  results: ReactNode
}

/**
 * Status / results body for widget-tools search (markets + currency).
 * Only the results list animates enter / leave / swap; hint and other
 * status copy stay static.
 * @param props - Mode, results identity, and status / list nodes.
 * @returns Body region.
 */
export function ToolsSearchBody({
  mode,
  resultsKey,
  loading,
  hint,
  noResults,
  unavailable = null,
  results,
}: ToolsSearchBodyProps) {
  const wantResults = mode === 'results'
  const [resultsMounted, setResultsMounted] = useState(wantResults)
  const [resultsLeaving, setResultsLeaving] = useState(false)
  const [listMotionKey, setListMotionKey] = useState(0)
  const frozenResultsRef = useRef(results)
  const prevResultsKeyRef = useRef(resultsKey)

  useEffect(() => {
    if (!resultsLeaving) {
      frozenResultsRef.current = results
    }
  }, [results, resultsLeaving])

  useEffect(() => {
    if (wantResults) {
      setResultsMounted(true)
      setResultsLeaving(false)
      return
    }
    if (!resultsMounted) {
      return
    }
    setResultsLeaving(true)
    const timer = window.setTimeout(() => {
      setResultsMounted(false)
      setResultsLeaving(false)
    }, TOOLS_SEARCH_BODY_LEAVE_MS)
    return () => window.clearTimeout(timer)
  }, [wantResults, resultsMounted])

  useEffect(() => {
    if (!wantResults || resultsLeaving || !resultsMounted) {
      return
    }
    if (resultsKey === prevResultsKeyRef.current) {
      return
    }
    prevResultsKeyRef.current = resultsKey
    setListMotionKey((key) => key + 1)
  }, [wantResults, resultsLeaving, resultsMounted, resultsKey])

  useEffect(() => {
    if (wantResults) {
      prevResultsKeyRef.current = resultsKey
    }
  }, [wantResults, resultsKey])

  if (resultsMounted) {
    return (
      <div className="min-h-0 flex-1">
        <div
          className={
            resultsLeaving ? 'widget-tools-body-out' : 'widget-tools-body-in'
          }
        >
          <div
            key={listMotionKey}
            className={listMotionKey > 0 ? 'search-panel-list-swap' : undefined}
          >
            {frozenResultsRef.current}
          </div>
        </div>
      </div>
    )
  }

  let status: ReactNode = null
  if (mode === 'loading') {
    status = loading
  } else if (mode === 'hint') {
    status = hint
  } else if (mode === 'no-results') {
    status = noResults
  } else if (mode === 'unavailable') {
    status = unavailable
  }

  return (
    <div className="grid min-h-0 flex-1 place-items-center">{status}</div>
  )
}
