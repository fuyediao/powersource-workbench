import { useEffect, useState } from 'react'
import {
  isWorkbenchSchemeQuery,
  parseWorkbenchSearchTarget,
  type WorkbenchSearchTarget,
} from '@/constants/feature-tabs'
import { useLinkOpen } from '@/hooks/link-open-context'
import { fetchSuggestions } from '@/utils/shared/api'
import {
  deleteSearchHistory,
  fetchSearchEngine,
  fetchSearchHistory,
  recordSearchHistory,
  saveSearchEngine,
  type SearchHistoryItem,
} from '@/utils/home/library-api'
import {
  isSearchEngine,
  isWebSearchEngine,
  type SearchEngine,
  type WebSearchEngine,
} from '@/types/search'

export type { SearchEngine }

const ENGINE_URLS: Record<WebSearchEngine, string> = {
  Google: 'https://www.google.com/search?q=',
  Bing: 'https://www.bing.com/search?q=',
  Yahoo: 'https://search.yahoo.com/search?p=',
}

const ALL_SEARCH_ENGINES: SearchEngine[] = ['Google', 'Bing', 'Yahoo', 'Ask']

/**
 * Returns search engines available in the current runtime.
 * @returns Allowed search engine ids.
 */
export function getAvailableSearchEngines(): SearchEngine[] {
  return ALL_SEARCH_ENGINES
}

/**
 * Clamps an engine to one allowed in the current runtime.
 * @param engine - Preferred engine from storage or UI.
 * @returns An allowed engine.
 */
function resolveAvailableEngine(engine: SearchEngine): SearchEngine {
  const available = getAvailableSearchEngines()
  return available.includes(engine) ? engine : available[0] ?? 'Google'
}

export type UseSearchOptions = {
  /** Opens a known `workbench://` page instead of searching. */
  onOpenWorkbenchTarget?: (target: WorkbenchSearchTarget) => void
  /** Ask AI search (Home / Spotlight). */
  onAskSearch?: (query: string) => void
  /** Engine before library load (Spotlight defaults to Ask). */
  initialEngine?: SearchEngine
  /** Persist engine to user_settings (Home only). */
  persistEngine?: boolean
  /** Load saved engine from the library (Home only). */
  loadSavedEngine?: boolean
}

/**
 * Manages search input, engine, suggestions, and history.
 * @param userId - Signed-in user id, or null while unauthenticated.
 * @param options - Optional deep-link / Ask handlers and engine persistence.
 * @returns Search state and actions.
 */
export function useSearch(userId: string | null, options?: UseSearchOptions): {
  query: string
  engine: SearchEngine
  suggestions: string[]
  history: SearchHistoryItem[]
  setQuery: (query: string) => void
  setEngine: (engine: SearchEngine) => void
  submitSearch: (overrideQuery?: string) => void
  removeHistory: (id: string) => void
  refreshHistory: () => void
} {
  const { openUrl } = useLinkOpen()
  const onOpenWorkbenchTarget = options?.onOpenWorkbenchTarget
  const onAskSearch = options?.onAskSearch
  const persistEngine = options?.persistEngine !== false
  const loadSavedEngine = options?.loadSavedEngine !== false
  const [query, setQuery] = useState('')
  const [engine, setEngineState] = useState<SearchEngine>(options?.initialEngine ?? 'Google')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [history, setHistory] = useState<SearchHistoryItem[]>([])

  useEffect(() => {
    if (!userId) {
      setHistory([])
      return
    }
    void fetchSearchHistory(userId)
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [userId])

  useEffect(() => {
    if (!loadSavedEngine) {
      return undefined
    }
    if (!userId) {
      setEngineState(resolveAvailableEngine(options?.initialEngine ?? 'Google'))
      return undefined
    }
    let active = true
    void fetchSearchEngine(userId)
      .then((next) => {
        if (active) {
          setEngineState(resolveAvailableEngine(isSearchEngine(next) ? next : 'Google'))
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [loadSavedEngine, options?.initialEngine, userId])

  useEffect(() => {
    const normalized = query.trim()
    if (!normalized || isWorkbenchSchemeQuery(normalized)) {
      setSuggestions([])
      return
    }

    let active = true
    const timer = window.setTimeout(() => {
      void fetchSuggestions(engine, normalized)
        .then((next) => {
          if (active) {
            setSuggestions(next)
          }
        })
        .catch(() => {
          if (active) {
            setSuggestions([])
          }
        })
    }, 100)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [engine, query])

  /**
   * Selects a search engine and optionally persists it to Supabase.
   * @param nextEngine - Engine to select.
   * @returns Nothing.
   */
  function setEngine(nextEngine: SearchEngine): void {
    const resolved = resolveAvailableEngine(nextEngine)
    setEngineState(resolved)
    if (!persistEngine || !userId) {
      return
    }
    void saveSearchEngine(userId, resolved)
      .then((saved) => setEngineState(resolveAvailableEngine(saved)))
      .catch(() => undefined)
  }

  /**
   * Opens a known `workbench://` page, Ask AI, or a web search. Deep links are never stored in history.
   * @param overrideQuery - Optional query instead of the input value.
   * @returns Nothing.
   */
  function submitSearch(overrideQuery?: string): void {
    const normalizedQuery = (overrideQuery ?? query).trim()
    const activeEngine = resolveAvailableEngine(engine)
    if (!normalizedQuery) {
      return
    }
    if (isWorkbenchSchemeQuery(normalizedQuery)) {
      const target = parseWorkbenchSearchTarget(normalizedQuery)
      if (target) {
        onOpenWorkbenchTarget?.(target)
        setQuery('')
        return
      }
      const webEngine = isWebSearchEngine(activeEngine) ? activeEngine : 'Google'
      openUrl(`${ENGINE_URLS[webEngine]}${encodeURIComponent(normalizedQuery)}`)
      return
    }
    if (activeEngine === 'Ask') {
      if (userId) {
        void recordSearchHistory(userId, normalizedQuery, activeEngine)
          .then((next) => {
            setHistory(next)
          })
          .catch(() => undefined)
          .finally(() => {
            onAskSearch?.(normalizedQuery)
            setQuery('')
          })
        return
      }
      onAskSearch?.(normalizedQuery)
      setQuery('')
      return
    }
    if (!isWebSearchEngine(activeEngine)) {
      return
    }
    const url = `${ENGINE_URLS[activeEngine]}${encodeURIComponent(normalizedQuery)}`
    if (!userId) {
      openUrl(url)
      return
    }
    void recordSearchHistory(userId, normalizedQuery, activeEngine)
      .then((next) => {
        setHistory(next)
      })
      .catch(() => undefined)
      .finally(() => {
        openUrl(url)
      })
  }

  /**
   * Removes one history entry.
   * @param id - History row id.
   * @returns Nothing.
   */
  function removeHistory(id: string): void {
    if (!userId) {
      return
    }
    void deleteSearchHistory(userId, id)
      .then(setHistory)
      .catch(() => undefined)
  }

  /**
   * Reloads history from the library.
   * @returns Nothing.
   */
  function refreshHistory(): void {
    if (!userId) {
      return
    }
    void fetchSearchHistory(userId)
      .then(setHistory)
      .catch(() => undefined)
  }

  return {
    query,
    engine,
    suggestions,
    history,
    setQuery,
    setEngine,
    submitSearch,
    removeHistory,
    refreshHistory,
  }
}
