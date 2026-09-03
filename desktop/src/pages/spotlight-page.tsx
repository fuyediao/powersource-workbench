import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type SVGProps,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  AskAiMarkIcon,
  BingIcon,
  CloseIcon,
  GoogleIcon,
  HistoryIcon,
  SearchIcon,
  YahooIcon,
} from '@/icons/AllIcons'
import {
  geocrmSearchTargetLabelKey,
  parseGeocrmSearchTarget,
  type GeocrmSearchTarget,
} from '@/constants/feature-tabs'
import { useAuth } from '@/hooks/use-auth'
import { useAppearance } from '@/hooks/use-appearance'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { LinkOpenProvider } from '@/hooks/link-open-context'
import { getAvailableSearchEngines, useSearch, type SearchEngine } from '@/hooks/use-search'
import { applyAppearanceFromLocalStorage } from '@/utils/appearance/sync-appearance-storage'
import { askAiSearchUrl } from '@/utils/ask-ai/ask-ai-search-request'
import { searchEngineLabel } from '@/utils/home/search-engine-label'

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

const ALL_ENGINES: Array<{ id: SearchEngine; Icon: IconComponent }> = [
  { id: 'Google', Icon: GoogleIcon },
  { id: 'Bing', Icon: BingIcon },
  { id: 'Yahoo', Icon: YahooIcon },
  { id: 'Ask', Icon: AskAiMarkIcon },
]

type PanelItem =
  | { kind: 'direct'; query: string }
  | { kind: 'suggest'; query: string }
  | { kind: 'history'; id: string; query: string }

/** Matches `search-panel-out` so the window stays tall through the leave animation. */
const PANEL_LEAVE_MS = 380

/** Page chrome (px-2 / pt-2 / pb-3) plus shadow, added to measured column height. */
const SPOTLIGHT_CHROME_PAD = 32

/**
 * Hides the Spotlight BrowserWindow.
 * @returns Nothing.
 */
function hideSpotlightWindow(): void {
  void window.geocrm?.spotlight?.hide?.()
}

/**
 * Builds a `geocrm://` URL for Spotlight to hand off to the main window.
 * @param target - Parsed in-app page.
 * @returns Deep-link URL.
 */
function geocrmTargetUrl(target: GeocrmSearchTarget): string {
  if (target.kind === 'home') {
    return 'geocrm://home'
  }
  if (target.kind === 'settings') {
    return 'geocrm://settings'
  }
  return `geocrm://${target.id}`
}

/**
 * Spotlight search field and separate result pills for the dedicated window.
 * @param props - Signed-in user id.
 * @returns Spotlight UI.
 */
function SpotlightSearchPanel({ userId }: { userId: string | null }) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)
  const {
    query,
    engine,
    suggestions,
    history,
    setQuery,
    setEngine,
    submitSearch,
    removeHistory,
  } = useSearch(userId, {
    initialEngine: 'Ask',
    persistEngine: false,
    loadSavedEngine: false,
    onOpenGeocrmTarget: (target) => {
      void window.geocrm?.spotlight?.openInMain?.(geocrmTargetUrl(target))
    },
    onAskSearch: (searchQuery) => {
      void window.geocrm?.spotlight?.openInMain?.(askAiSearchUrl(searchQuery))
    },
  })
  const engines = ALL_ENGINES.filter((item) => getAvailableSearchEngines().includes(item.id))
  const showEngineSwitcher = engines.length > 1
  const [activeIndex, setActiveIndex] = useState(0)
  const [showMotionKey, setShowMotionKey] = useState(0)
  const frozenItemsRef = useRef<PanelItem[]>([])

  const trimmed = query.trim()
  const matchedHistory = trimmed
    ? history
        .filter((item) => item.query.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 6)
    : []
  const suggestLimit = Math.max(0, 6 - matchedHistory.length)
  const historyQueries = new Set(matchedHistory.map((item) => item.query.toLowerCase()))
  const matchedSuggestions = trimmed
    ? suggestions
        .filter((item) => item.toLowerCase() !== trimmed.toLowerCase())
        .filter((item) => !historyQueries.has(item.toLowerCase()))
        .slice(0, suggestLimit)
    : []

  const historyItems: PanelItem[] = matchedHistory.map((item) => ({
    kind: 'history' as const,
    id: item.id,
    query: item.query,
  }))
  const suggestItems: PanelItem[] = matchedSuggestions.map((item) => ({
    kind: 'suggest' as const,
    query: item,
  }))
  const directItem: PanelItem | null = trimmed
    ? { kind: 'direct', query: trimmed }
    : null
  const panelItems: PanelItem[] = [
    ...(directItem ? [directItem] : []),
    ...historyItems,
    ...suggestItems,
  ]
  const showPanel = panelItems.length > 0
  if (showPanel) {
    frozenItemsRef.current = panelItems
  }
  const renderedItems = showPanel ? panelItems : frozenItemsRef.current
  const panelPresence = useDialogPresence(showPanel, PANEL_LEAVE_MS)

  useEffect(() => {
    setActiveIndex(0)
  }, [query, panelItems.length])

  useEffect(() => {
    return window.geocrm?.spotlight?.onShown?.(() => {
      // Remount for enter animation; focus runs in the layout effect below.
      setShowMotionKey((key) => key + 1)
    })
  }, [])

  useEffect(() => {
    // Each Spotlight open starts on Ask so Enter is Ask without picking an engine.
    setEngine('Ask')
  }, [showMotionKey])

  useLayoutEffect(() => {
    /**
     * Puts keyboard focus in the search field so typing works immediately.
     * @returns Nothing.
     */
    function focusSearchInput(): void {
      const input = inputRef.current
      if (!input) {
        return
      }
      input.focus({ preventScroll: true })
      if (input.value) {
        input.select()
      }
    }

    focusSearchInput()
    const retryIds = [0, 40, 120].map((delay) => window.setTimeout(focusSearchInput, delay))
    return () => {
      for (const id of retryIds) {
        window.clearTimeout(id)
      }
    }
  }, [showMotionKey])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    const column = root

    /**
     * Grows the BrowserWindow to the column height so the dropdown is not clipped.
     * @returns Nothing.
     */
    function reportHeight(): void {
      const height = Math.ceil(column.getBoundingClientRect().height + SPOTLIGHT_CHROME_PAD)
      void window.geocrm?.spotlight?.resize?.(height)
    }

    reportHeight()
    const observer = new ResizeObserver(reportHeight)
    observer.observe(column)
    return () => observer.disconnect()
  }, [showMotionKey, panelPresence.mounted, panelPresence.leaving, engine])

  /**
   * Label for the first suggestion row (open page vs engine search).
   * @param text - Direct query.
   * @returns Localized row text.
   */
  function directRowLabel(text: string): string {
    const target = parseGeocrmSearchTarget(text)
    if (target) {
      return t('search.openPage', { name: t(geocrmSearchTargetLabelKey(target)) })
    }
    return t('search.directSearch', { query: text, engine: searchEngineLabel(t, engine) })
  }

  /**
   * Runs a panel item then hides Spotlight.
   * @param item - Selected history / suggest / direct row.
   * @returns Nothing.
   */
  function runItem(item: PanelItem): void {
    if (item.kind === 'history' || item.kind === 'suggest' || item.kind === 'direct') {
      submitSearch(item.query)
      hideSpotlightWindow()
    }
  }

  /**
   * Keyboard navigation within Spotlight.
   * @param event - Keyboard event.
   * @returns Nothing.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      hideSpotlightWindow()
      return
    }
    if (isComposingRef.current) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(panelItems.length - 1, index + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(0, index - 1))
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0 && panelItems[activeIndex]) {
      event.preventDefault()
      runItem(panelItems[activeIndex])
    }
  }

  return (
    <div
      key={showMotionKey}
      ref={rootRef}
      className="dialog-panel-in mx-auto flex w-full max-w-3xl flex-col gap-3 pb-1"
      role="dialog"
      aria-label={t('search.spotlightLabel')}
    >
      <form
        autoComplete="off"
        className="theme-radius glass-panel flex w-full items-center p-2 shadow-xl shadow-zinc-950/10"
        onSubmit={(event) => {
          event.preventDefault()
          if (isComposingRef.current) {
            return
          }
          if (panelItems[activeIndex]) {
            runItem(panelItems[activeIndex])
            return
          }
          submitSearch()
          hideSpotlightWindow()
        }}
      >
        <SearchIcon className="ml-3 size-5 shrink-0 text-brand" />
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            id="spotlight-search"
            name="spotlight-search-query"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            className="w-full bg-transparent px-3 py-3 text-base text-ink outline-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
            }}
            onKeyDown={handleKeyDown}
          />
          {query.trim() ? null : (
            <div className="pointer-events-none absolute inset-y-0 left-3 right-0 overflow-hidden text-base text-zinc-500 dark:text-zinc-300">
              <div
                className="absolute inset-x-0 top-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  height: `${engines.length * 100}%`,
                  transform: `translateY(-${(engines.findIndex((item) => item.id === engine) * 100) / engines.length}%)`,
                }}
              >
                {engines.map(({ id }) => (
                  <div
                    key={id}
                    className="flex items-center"
                    style={{ height: `${100 / engines.length}%` }}
                  >
                    {t('search.placeholder', { engine: searchEngineLabel(t, id) })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {showEngineSwitcher ? (
          <div className="relative flex items-center gap-1">
            <span
              className="theme-radius pointer-events-none absolute top-0 left-0 size-10 bg-brand/15 transition-[transform,border-radius] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                transform: `translateX(calc(${engines.findIndex((item) => item.id === engine)} * (2.5rem + 0.25rem)))`,
              }}
            />
            {engines.map(({ id, Icon }) => {
              const selected = id === engine
              return (
                <button
                  type="button"
                  key={id}
                  title={searchEngineLabel(t, id)}
                  aria-label={searchEngineLabel(t, id)}
                  aria-pressed={selected}
                  onClick={() => setEngine(id)}
                  className={`theme-radius relative z-10 grid size-10 place-items-center transition ${
                    selected ? 'opacity-100' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <Icon className="size-5" />
                </button>
              )
            })}
          </div>
        ) : null}
      </form>

      {panelPresence.mounted && renderedItems.length > 0 ? (
        <div
          className={`search-suggest-panel w-full rounded-2xl p-2 shadow-xl shadow-zinc-950/10 ${
            panelPresence.leaving ? 'search-panel-out' : 'search-panel-in'
          }`}
        >
          <ul className="flex flex-col">
            {renderedItems.map((item, index) => {
              const active = !panelPresence.leaving && index === activeIndex
              if (item.kind === 'history') {
                return (
                  <li key={`history-${item.id}`}>
                    <div
                      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 transition ${
                        active ? 'bg-brand/10' : 'hover:bg-brand/5'
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => runItem(item)}
                      >
                        <HistoryIcon className="size-4 shrink-0 text-brand" />
                        <span className="truncate text-sm text-ink">{item.query}</span>
                      </button>
                      <button
                        type="button"
                        className="grid size-7 shrink-0 place-items-center rounded-lg text-brand transition hover:bg-brand/10"
                        onClick={(event) => {
                          event.stopPropagation()
                          removeHistory(item.id)
                        }}
                      >
                        <CloseIcon className="size-3.5" />
                      </button>
                    </div>
                  </li>
                )
              }

              return (
                <li key={`${item.kind}-${item.query}-${index}`}>
                  <button
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      active ? 'bg-brand/10' : 'hover:bg-brand/5'
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runItem(item)}
                  >
                    <SearchIcon className="size-4 shrink-0 text-brand" />
                    <span className="truncate text-sm text-ink">
                      {item.kind === 'direct' ? directRowLabel(item.query) : item.query}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Dedicated Spotlight BrowserWindow root (hash `#spotlight`).
 * @returns Spotlight page tree.
 */
export default function SpotlightPage() {
  const auth = useAuth()
  const userId = auth.session?.user?.id ?? null
  // Sync Theme / accent / radii so Spotlight matches Settings (cross-window).
  useAppearance(userId)

  useEffect(() => {
    document.documentElement.classList.add('spotlight-window')
    document.body.classList.add('bg-transparent')
    return () => {
      document.documentElement.classList.remove('spotlight-window')
      document.body.classList.remove('bg-transparent')
    }
  }, [])

  useEffect(() => {
    return window.geocrm?.spotlight?.onShown?.(() => {
      applyAppearanceFromLocalStorage()
    })
  }, [])

  return (
    <LinkOpenProvider
      onOpenInApp={(url) => {
        void window.geocrm?.spotlight?.openInMain?.(url)
      }}
    >
      <div className="flex w-full items-start justify-center overflow-visible bg-transparent px-2 pt-2 pb-4">
        <SpotlightSearchPanel userId={userId} />
      </div>
    </LinkOpenProvider>
  )
}
