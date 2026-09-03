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
  SettingsIcon,
  YahooIcon,
} from '@/icons/AllIcons'
import { requestAskAiSearch } from '@/utils/ask-ai/ask-ai-search-request'
import { searchEngineLabel } from '@/utils/home/search-engine-label'
import { FocusRingFrame } from '@/components/ui/focus-ring-frame'
import {
  workbenchSearchTargetLabelKey,
  parseWorkbenchSearchTarget,
  type WorkbenchSearchTarget,
} from '@/constants/feature-tabs'
import { getAvailableSearchEngines, useSearch, type SearchEngine } from '@/hooks/use-search'
import { animateHeight } from '@/utils/home/animate-height'

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

interface SearchBarProps {
  userId: string | null
  /** When set with onOpenSettings, shows a settings control beside the search field. */
  showSettingsButton?: boolean
  onOpenSettings?: () => void
  /** Opens a known `workbench://` page from the search box. */
  onOpenWorkbenchTarget?: (target: WorkbenchSearchTarget) => void
  /** Input element id. @default atlas-search */
  inputId?: string
  /** Extra classes on the outer layout wrapper. */
  className?: string
}

/**
 * Renders the main search input with suggestions and history.
 * @param props - Signed-in user id, optional settings / deep-link handlers, input id, and layout class.
 * @returns Search form.
 */
export function SearchBar({
  userId,
  showSettingsButton = false,
  onOpenSettings,
  onOpenWorkbenchTarget,
  inputId = 'atlas-search',
  className = '',
}: SearchBarProps) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [settingsButtonSize, setSettingsButtonSize] = useState<number | null>(null)
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
    onOpenWorkbenchTarget,
    onAskSearch: requestAskAiSearch,
  })
  const engines = ALL_ENGINES.filter((item) => getAvailableSearchEngines().includes(item.id))
  const showEngineSwitcher = engines.length > 1
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [panelMounted, setPanelMounted] = useState(false)
  const [panelLeaving, setPanelLeaving] = useState(false)
  const frozenItemsRef = useRef<PanelItem[]>([])
  const panelShellRef = useRef<HTMLDivElement>(null)
  const panelContentRef = useRef<HTMLDivElement>(null)
  const readyToAnimateHeightRef = useRef(false)
  const prevListPhaseRef = useRef('')
  const isComposingRef = useRef(false)
  const [listMotionKey, setListMotionKey] = useState(0)

  const trimmed = query.trim()
  const matchedHistory = trimmed
    ? history
        .filter((item) => item.query.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 3)
    : history.slice(0, 8)
  const suggestLimit = Math.max(0, 8 - matchedHistory.length)
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
  const panelItems: PanelItem[] = trimmed
    ? [
        { kind: 'direct', query: trimmed },
        ...historyItems,
        ...matchedSuggestions.map((item) => ({ kind: 'suggest' as const, query: item })),
      ]
    : historyItems

  useEffect(() => {
    setActiveIndex(0)
  }, [trimmed, suggestions, history, open])

  useEffect(() => {
    /**
     * Closes the panel when clicking outside the search control.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  useLayoutEffect(() => {
    if (!showSettingsButton) {
      setSettingsButtonSize(null)
      return
    }
    const form = formRef.current
    if (!form) {
      return
    }

    /**
     * Matches the settings button to the search glass shell (square).
     * @returns Nothing.
     */
    function syncSize(): void {
      const shell = formRef.current?.parentElement
      if (shell) {
        setSettingsButtonSize(shell.offsetHeight)
      }
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    const shell = form.parentElement
    if (shell) {
      observer.observe(shell)
    }
    observer.observe(form)
    return () => observer.disconnect()
  }, [showSettingsButton])

  /**
   * Label for the first suggestion row (open page vs engine search).
   * @param text - Direct query.
   * @returns Localized row text.
   */
  function directRowLabel(text: string): string {
    const target = parseWorkbenchSearchTarget(text)
    if (target) {
      return t('search.openPage', { name: t(workbenchSearchTargetLabelKey(target)) })
    }
    return t('search.directSearch', { query: text, engine: searchEngineLabel(t, engine) })
  }

  /**
   * Runs a search for the chosen panel item.
   * @param item - Selected panel item.
   * @returns Nothing.
   */
  function runItem(item: PanelItem): void {
    setQuery(item.query)
    // History / suggest / direct all use the engine currently selected in the bar.
    submitSearch(item.query)
    setOpen(false)
  }

  /**
   * Handles keyboard navigation inside the search input.
   * @param event - Keyboard event.
   * @returns Nothing.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Let the IME consume Enter / arrows while composing candidates.
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (!open || panelItems.length === 0) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % panelItems.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + panelItems.length) % panelItems.length)
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0 && panelItems[activeIndex]) {
      event.preventDefault()
      runItem(panelItems[activeIndex])
    }
  }

  const showPanel = open && panelItems.length > 0
  if (showPanel) {
    frozenItemsRef.current = panelItems
  }
  const renderedItems = showPanel ? panelItems : frozenItemsRef.current
  const contentKey = renderedItems
    .map((item) =>
      item.kind === 'history' ? `h:${item.id}` : `${item.kind}:${item.query}`,
    )
    .join('|')
  const listPhase = !trimmed
    ? 'history'
    : renderedItems.some((item) => item.kind === 'suggest')
      ? 'query-suggest'
      : 'query'

  useEffect(() => {
    if (showPanel) {
      setPanelMounted(true)
      setPanelLeaving(false)
      return
    }
    if (!panelMounted) {
      return
    }
    setPanelLeaving(true)
    const timer = window.setTimeout(() => {
      setPanelMounted(false)
      setPanelLeaving(false)
      readyToAnimateHeightRef.current = false
      prevListPhaseRef.current = ''
    }, 380)
    return () => window.clearTimeout(timer)
  }, [showPanel, panelMounted])

  useLayoutEffect(() => {
    if (!panelMounted || panelLeaving) {
      return
    }
    const shell = panelShellRef.current
    const content = panelContentRef.current
    if (!shell || !content) {
      return
    }

    const shouldAnimate = readyToAnimateHeightRef.current
    readyToAnimateHeightRef.current = true
    animateHeight(shell, content.scrollHeight, shouldAnimate)

    if (prevListPhaseRef.current && prevListPhaseRef.current !== listPhase) {
      setListMotionKey((key) => key + 1)
    }
    prevListPhaseRef.current = listPhase
  }, [panelMounted, panelLeaving, contentKey, listPhase])

  return (
    <div
      className={`relative mx-auto flex w-full max-w-3xl items-center gap-2 ${
        panelMounted ? 'z-50' : ''
      } ${className}`.trim()}
    >
      <div ref={rootRef} className="relative min-w-0 flex-1">
      <FocusRingFrame
        className="w-full"
        shellClassName="theme-radius glass-panel shadow-xl shadow-zinc-950/5"
        ringClassName="theme-radius"
      >
      <form
        ref={formRef}
        autoComplete="off"
        className="flex w-full items-center p-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (isComposingRef.current) {
            return
          }
          if (showPanel && panelItems[activeIndex]) {
            runItem(panelItems[activeIndex])
            return
          }
          submitSearch()
          setOpen(false)
        }}
      >
        <SearchIcon className="ml-3 size-5 shrink-0 text-brand" />
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            name="atlas-search-query"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            className="w-full bg-transparent px-3 py-3 text-base text-ink outline-none"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false
            }}
            onKeyDown={handleKeyDown}
          />
          {query.trim() ? null : (
            <div
              className="pointer-events-none absolute inset-y-0 left-3 right-0 overflow-hidden text-base text-zinc-500 dark:text-zinc-300"
            >
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
          <div className="relative hidden items-center gap-1 sm:flex">
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
                    selected
                      ? 'opacity-100'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <Icon className="size-5" />
                </button>
              )
            })}
          </div>
        ) : null}
      </form>
      </FocusRingFrame>

      {panelMounted && renderedItems.length > 0 ? (
        <div
          className={`search-suggest-panel absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-3xl p-2 shadow-2xl shadow-zinc-950/20 ${
            panelLeaving ? 'search-panel-out' : 'search-panel-in'
          }`}
        >
          <div ref={panelShellRef} className="overflow-hidden will-change-[height]">
            <div ref={panelContentRef}>
              <ul
                key={listMotionKey}
                className={`flex flex-col gap-1 ${listMotionKey > 0 ? 'search-panel-list-swap' : ''}`}
              >
                {renderedItems.map((item, index) => {
                  const active = !panelLeaving && index === activeIndex
                  if (item.kind === 'history') {
                    return (
                      <li key={`history-${item.id}`}>
                        <div
                          className={`flex items-center gap-2 rounded-full px-3 py-2.5 transition ${
                            active
                              ? 'bg-brand/10'
                              : 'hover:bg-brand/5'
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
                            className="grid size-7 shrink-0 place-items-center rounded-full text-brand transition hover:bg-brand/10 hover:text-brand"
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
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                          active
                            ? 'bg-brand/10 ring-1 ring-inset ring-brand/40'
                            : 'hover:bg-brand/5'
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
          </div>
        </div>
      ) : null}
      </div>
      {showSettingsButton && onOpenSettings ? (
        <button
          type="button"
          className="theme-radius glass-panel group relative grid shrink-0 place-items-center overflow-hidden text-brand shadow-xl shadow-zinc-950/5 transition-colors hover:text-brand"
          style={
            settingsButtonSize != null
              ? { width: settingsButtonSize, height: settingsButtonSize }
              : { width: '4.125rem', height: '4.125rem' }
          }
          onClick={onOpenSettings}
        >
          <span
            className="theme-radius pointer-events-none absolute inset-2.5 bg-transparent transition-colors group-hover:bg-brand/10 dark:group-hover:bg-brand/15"
          />
          <SettingsIcon className="relative z-10 size-6" />
        </button>
      ) : null}
    </div>
  )
}
