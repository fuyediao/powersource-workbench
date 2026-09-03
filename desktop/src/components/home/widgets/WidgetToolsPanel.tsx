import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LocationIcon,
  ResetIcon,
  SearchIcon,
} from '@/icons/AllIcons'
import type { MarketAsset } from '@/hooks/use-markets'
import type { WeatherPermission } from '@/hooks/use-weather'
import type { WeatherUnit } from '@/hooks/use-weather-unit'
import {
  isDefaultAsideWidgetRails,
  type AsideWidgetRails,
} from '@/constants/aside-widgets'
import { AsideWidgetOrderList } from '@/components/home/widgets/aside-widget-order-list'
import {
  ToolsPairSearchFields,
  type ToolsPairSide,
} from '@/components/home/widgets/ToolsPairSearchFields'
import { ToolsSearchBody, type ToolsSearchMode } from '@/components/home/widgets/ToolsSearchBody'
import { ToolsSearchHitButton } from '@/components/home/widgets/ToolsSearchHitButton'
import {
  TodoComposeField,
  TodoListItems,
} from '@/components/home/widgets/todo-shared'
import {
  fetchCurrencyCatalog,
  filterCurrencyCatalog,
  searchMarketAssets,
  searchPlaces,
  type CurrencyCatalogEntry,
  type CurrencyCode,
  type MarketSearchHitDto,
  type PlaceSearchHitDto,
} from '@/utils/shared/api'
import type { TodoItemDto } from '@/utils/home/library-api'

export type WidgetToolsSection = 'order' | 'weather' | 'currency' | 'markets' | 'todo'

interface WidgetToolsPanelProps {
  /** Optional block to scroll into view (homepage gear deep-link). */
  scrollToSection?: WidgetToolsSection | null
  asideRails: AsideWidgetRails
  onSetAsideRails: (rails: AsideWidgetRails) => void
  onRestoreAsideOrder: () => void
  weatherUnit: WeatherUnit
  onSetWeatherUnit: (unit: WeatherUnit) => void
  weatherPlace: string | null
  weatherHasLocation: boolean
  weatherRequesting: boolean
  weatherPermission: WeatherPermission
  onRequestWeatherLocation: () => void
  onSelectWeatherPlace: (hit: PlaceSearchHitDto) => void
  onClearWeatherLocation: () => void
  from: CurrencyCode
  to: CurrencyCode
  onSetFrom: (code: CurrencyCode) => void
  onSetTo: (code: CurrencyCode) => void
  onSwapCurrencies: () => void
  onRestoreCurrencyPair: () => void
  assets: MarketAsset[]
  onSetAssets: (assets: MarketAsset[]) => void
  onRestoreMarkets: () => void
  todos: TodoItemDto[]
  onAddTodo: (text: string) => Promise<void>
  onToggleTodo: (id: string, done: boolean) => Promise<void>
  onRemoveTodo: (id: string) => Promise<void>
}

interface SearchHighlightBox {
  x: number
  y: number
  width: number
  height: number
  ready: boolean
}

interface AssetThumbProps {
  symbol: string
  thumb: string | null
}

/**
 * Renders an asset logo with a letter fallback when the image is missing.
 * @param props - Symbol and optional thumb URL.
 * @returns Thumb element.
 */
function AssetThumb({ symbol, thumb }: AssetThumbProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [thumb])

  if (!thumb || failed) {
    return (
      <span className="grid size-8 place-items-center rounded-full bg-zinc-950/5 text-xs font-bold text-muted dark:bg-white/10">
        {symbol.slice(0, 1)}
      </span>
    )
  }

  return (
    <img
      src={thumb}
      alt=""
      className="size-8 rounded-full bg-white object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Stacked Settings panel for widget order, weather, currency, markets, and todos.
 * @param props - Optional scroll target and tool callbacks.
 * @returns Widget tools panel.
 */
export function WidgetToolsPanel({
  scrollToSection = null,
  asideRails,
  onSetAsideRails,
  onRestoreAsideOrder,
  weatherUnit,
  onSetWeatherUnit,
  weatherPlace,
  weatherHasLocation,
  weatherRequesting,
  weatherPermission,
  onRequestWeatherLocation,
  onSelectWeatherPlace,
  onClearWeatherLocation,
  from,
  to,
  onSetFrom,
  onSetTo,
  onSwapCurrencies,
  onRestoreCurrencyPair,
  assets,
  onSetAssets,
  onRestoreMarkets,
  todos,
  onAddTodo,
  onToggleTodo,
  onRemoveTodo,
}: WidgetToolsPanelProps) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MarketSearchHitDto[]>([])
  const [searching, setSearching] = useState(false)
  const [currencyQuery, setCurrencyQuery] = useState('')
  const [currencyPickSide, setCurrencyPickSide] = useState<ToolsPairSide>('a')
  const [currencySearching, setCurrencySearching] = useState(false)
  const [currencyCatalog, setCurrencyCatalog] = useState<CurrencyCatalogEntry[]>([])
  const [currencyCatalogLoading, setCurrencyCatalogLoading] = useState(false)
  const [marketPickSide, setMarketPickSide] = useState<ToolsPairSide>('a')
  const [marketSearching, setMarketSearching] = useState(false)
  const [placeQuery, setPlaceQuery] = useState('')
  const [placeResults, setPlaceResults] = useState<PlaceSearchHitDto[]>([])
  const [placeSearching, setPlaceSearching] = useState(false)
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeFieldFocused, setPlaceFieldFocused] = useState(false)
  const [placeHighlight, setPlaceHighlight] = useState<SearchHighlightBox>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    ready: false,
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const placeRowRef = useRef<HTMLDivElement>(null)
  const placeLabelRef = useRef<HTMLLabelElement>(null)
  const showPlaceHighlight = placeFieldFocused || placeSearching






  useLayoutEffect(() => {
    const row = placeRowRef.current
    const label = placeLabelRef.current
    if (!row || !label) {
      return
    }
    const rowRect = row.getBoundingClientRect()
    const labelRect = label.getBoundingClientRect()
    setPlaceHighlight({
      x: labelRect.left - rowRect.left,
      y: labelRect.top - rowRect.top,
      width: labelRect.width,
      height: labelRect.height,
      ready: showPlaceHighlight,
    })
  }, [
    showPlaceHighlight,
    placeQuery,
    weatherPlace,
  ])

  useEffect(() => {
    const row = placeRowRef.current
    if (!row) {
      return
    }
    const observer = new ResizeObserver(() => {
      const label = placeLabelRef.current
      if (!label) {
        return
      }
      const rowRect = row.getBoundingClientRect()
      const labelRect = label.getBoundingClientRect()
      setPlaceHighlight({
        x: labelRect.left - rowRect.left,
        y: labelRect.top - rowRect.top,
        width: labelRect.width,
        height: labelRect.height,
        ready: showPlaceHighlight,
      })
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [showPlaceHighlight])

  useEffect(() => {
    let active = true
    setCurrencyCatalogLoading(true)
    void fetchCurrencyCatalog()
      .then((catalog) => {
        if (active) {
          setCurrencyCatalog(catalog)
        }
      })
      .catch(() => {
        if (active) {
          setCurrencyCatalog([])
        }
      })
      .finally(() => {
        if (active) {
          setCurrencyCatalogLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!marketSearching) {
      setResults([])
      setSearching(false)
      return
    }
    const normalized = query.trim()
    if (!normalized) {
      setResults([])
      setSearching(false)
      return
    }

    let active = true
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchMarketAssets(normalized)
        .then((next) => {
          if (active) {
            setResults(next)
          }
        })
        .catch(() => {
          if (active) {
            setResults([])
          }
        })
        .finally(() => {
          if (active) {
            setSearching(false)
          }
        })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query, marketSearching])

  useEffect(() => {
    if (!placeSearching) {
      setPlaceResults([])
      setPlaceLoading(false)
      return
    }
    const normalized = placeQuery.trim()
    if (!normalized) {
      setPlaceResults([])
      setPlaceLoading(false)
      return
    }

    let active = true
    setPlaceLoading(true)
    const timer = window.setTimeout(() => {
      void searchPlaces(normalized, i18n.language)
        .then((next) => {
          if (active) {
            setPlaceResults(next)
          }
        })
        .catch(() => {
          if (active) {
            setPlaceResults([])
          }
        })
        .finally(() => {
          if (active) {
            setPlaceLoading(false)
          }
        })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [placeQuery, placeSearching, i18n.language])

  const currencyResults = filterCurrencyCatalog(
    currencyCatalog,
    currencySearching ? currencyQuery : '',
  )
  const currencyHasQuery = currencySearching && currencyQuery.trim().length > 0
  const currencyMode: ToolsSearchMode = currencyCatalogLoading
    ? 'loading'
    : currencyCatalog.length === 0
      ? 'unavailable'
      : !currencyHasQuery
        ? 'hint'
        : currencyResults.length === 0
          ? 'no-results'
          : 'results'
  const currencyResultsKey = currencyResults.map((hit) => hit.code).join('|')

  const marketHasQuery = marketSearching && query.trim().length > 0
  const marketMode: ToolsSearchMode = searching
    ? 'loading'
    : !marketHasQuery
      ? 'hint'
      : results.length === 0
        ? 'no-results'
        : 'results'
  const marketResultsKey = results.map((hit) => hit.id).join('|')

  const placeHasQuery = placeSearching && placeQuery.trim().length > 0
  const placeMode: ToolsSearchMode = placeLoading
    ? 'loading'
    : !placeHasQuery
      ? 'hint'
      : placeResults.length === 0
        ? 'no-results'
        : 'results'
  const placeResultsKey = placeResults.map((hit) => hit.id).join('|')

  /**
   * Applies a catalog hit to the active From / To side.
   * @param code - Selected currency code.
   * @returns Nothing.
   */
  function selectCurrency(code: CurrencyCode): void {
    if (currencyPickSide === 'a') {
      onSetFrom(code)
    } else {
      onSetTo(code)
    }
    setCurrencyQuery('')
    setCurrencySearching(false)
  }

  /**
   * Assigns a search hit to the active market slot (max two assets).
   * @param asset - Asset to place in the active slot.
   * @returns Nothing.
   */
  function assignMarketSlot(asset: MarketAsset): void {
    if (marketPickSide === 'a') {
      const second = assets[1]?.id === asset.id ? undefined : assets[1]
      onSetAssets(second ? [asset, second] : [asset])
    } else {
      const first = assets[0]?.id === asset.id ? undefined : assets[0]
      onSetAssets(first ? [first, asset] : [asset])
    }
    setQuery('')
    setMarketSearching(false)
  }

  /**
   * Applies a city search hit and clears the search field.
   * @param hit - Geocoding hit.
   * @returns Nothing.
   */
  function selectPlace(hit: PlaceSearchHitDto): void {
    onSelectWeatherPlace(hit)
    setPlaceQuery('')
    setPlaceSearching(false)
    setPlaceResults([])
  }

  /**
   * Swaps the two market asset slots when both are set.
   * @returns Nothing.
   */
  function swapMarketSlots(): void {
    if (assets.length < 2) {
      return
    }
    onSetAssets([assets[1], assets[0]])
    setMarketPickSide((side) => (side === 'a' ? 'b' : 'a'))
    setQuery('')
    setMarketSearching(false)
  }

  /**
   * Focuses a currency pair side without starting a search yet.
   * @param side - Pair side.
   * @returns Nothing.
   */
  function focusCurrencySide(side: ToolsPairSide): void {
    setCurrencyPickSide(side)
    setCurrencyQuery('')
    setCurrencySearching(false)
  }

  /**
   * Updates the currency search query for a side.
   * @param side - Pair side.
   * @param value - Query text.
   * @returns Nothing.
   */
  function changeCurrencyQuery(side: ToolsPairSide, value: string): void {
    setCurrencyPickSide(side)
    setCurrencySearching(true)
    setCurrencyQuery(value)
  }

  /**
   * Focuses a market pair side without starting a search yet.
   * @param side - Pair side.
   * @returns Nothing.
   */
  function focusMarketSide(side: ToolsPairSide): void {
    setMarketPickSide(side)
    setQuery('')
    setMarketSearching(false)
  }

  /**
   * Updates the market search query for a side.
   * @param side - Pair side.
   * @param value - Query text.
   * @returns Nothing.
   */
  function changeMarketQuery(side: ToolsPairSide, value: string): void {
    setMarketPickSide(side)
    setMarketSearching(true)
    setQuery(value)
  }

  useEffect(() => {
    if (!scrollToSection || !rootRef.current) {
      return
    }
    const node = rootRef.current.querySelector(
      `[data-widget-tools-section="${scrollToSection}"]`,
    )
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [scrollToSection])

  return (
    <div ref={rootRef} className="space-y-8 p-1">
              <div
                data-widget-tools-section="order"
                className="flex min-h-0 flex-col"
              >
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand">
                      {t('widgetTools.order')}
                    </p>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-xl text-brand transition hover:bg-brand/10 disabled:opacity-40"
                      disabled={isDefaultAsideWidgetRails(asideRails)}
                      onClick={onRestoreAsideOrder}
                    >
                      <ResetIcon className="size-4" />
                    </button>
                  </div>
                  <p className="mb-3 shrink-0 text-xs text-muted">
                    {t('widgetTools.orderHint')}
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <AsideWidgetOrderList rails={asideRails} onChange={onSetAsideRails} />
                  </div>
                </div>

              <div
                data-widget-tools-section="weather"
                className="flex min-h-0 flex-col"
              >
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand">{t('weather.title')}</p>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-xl text-brand transition hover:bg-brand/10 disabled:opacity-40"
                      disabled={!weatherHasLocation}
                      onClick={() => {
                        onClearWeatherLocation()
                        setPlaceQuery('')
                        setPlaceSearching(false)
                        setPlaceResults([])
                      }}
                    >
                      <ResetIcon className="size-4" />
                    </button>
                  </div>
                  <div className="relative mb-3 shrink-0 grid grid-cols-2 gap-1 rounded-2xl bg-zinc-950/5 p-1 dark:bg-white/5">
                    <div
                      className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-brand shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        weatherUnit === 'fahrenheit' ? 'translate-x-full' : ''
                      }`}
                    />
                    <button
                      type="button"
                      className={`relative z-10 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300 ${
                        weatherUnit === 'celsius' ? 'text-brand-fg' : 'text-brand'
                      }`}
                      onClick={() => onSetWeatherUnit('celsius')}
                    >
                      °C
                    </button>
                    <button
                      type="button"
                      className={`relative z-10 rounded-xl py-2.5 text-sm font-semibold transition-colors duration-300 ${
                        weatherUnit === 'fahrenheit' ? 'text-brand-fg' : 'text-brand'
                      }`}
                      onClick={() => onSetWeatherUnit('fahrenheit')}
                    >
                      °F
                    </button>
                  </div>
                  <button
                    type="button"
                    className="mb-3 inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-brand/10 px-3 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/15 disabled:opacity-60"
                    disabled={weatherRequesting || weatherPermission === 'unsupported'}
                    onClick={() => {
                      onRequestWeatherLocation()
                      setPlaceQuery('')
                      setPlaceSearching(false)
                      setPlaceResults([])
                    }}
                  >
                    <LocationIcon className="size-4" />
                    {weatherRequesting
                      ? t('weather.requesting')
                      : t('weather.useLocation')}
                  </button>
                  <div
                    ref={placeRowRef}
                    className="relative mb-3 shrink-0 p-0.5"
                    onFocusCapture={() => setPlaceFieldFocused(true)}
                    onBlurCapture={(event) => {
                      const next = event.relatedTarget
                      if (
                        next instanceof Node &&
                        event.currentTarget.contains(next)
                      ) {
                        return
                      }
                      setPlaceFieldFocused(false)
                      if (!placeQuery.trim()) {
                        setPlaceSearching(false)
                      }
                    }}
                  >
                    <div
                      className="pointer-events-none absolute top-0 left-0 z-0 rounded-2xl border-2 border-brand/40 shadow-[0_0_0_2px] shadow-brand/20 transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        width: placeHighlight.width,
                        height: placeHighlight.height,
                        opacity: placeHighlight.ready ? 1 : 0,
                        transform: `translate(${placeHighlight.x}px, ${placeHighlight.y}px) scale(${
                          placeHighlight.ready ? 1 : 0.92
                        })`,
                      }}
                    />
                    <label
                      ref={placeLabelRef}
                      className="relative z-10 flex w-full items-center gap-2 rounded-2xl border border-zinc-950/10 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
                    >
                      <SearchIcon className="size-4 shrink-0 text-brand" />
                      <input
                        type="text"
                        value={placeSearching ? placeQuery : weatherPlace ?? ''}
                        placeholder={t('weather.cityPlaceholder')}
                        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-brand outline-none placeholder:text-zinc-400"
                        onFocus={() => {
                          setPlaceSearching(true)
                          setPlaceQuery('')
                        }}
                        onChange={(event) => {
                          setPlaceSearching(true)
                          setPlaceQuery(event.target.value)
                        }}
                      />
                    </label>
                  </div>
                  <ToolsSearchBody
                    mode={placeMode}
                    resultsKey={placeResultsKey}
                    loading={
                      <p className="px-1 text-center text-xs text-muted">{t('status.loading')}</p>
                    }
                    hint={
                      <p className="px-1 text-center text-xs text-muted">
                        {t('markets.searchHint')}
                      </p>
                    }
                    noResults={
                      <p className="px-1 text-center text-xs text-muted">
                        {t('weather.cityNoResults')}
                      </p>
                    }
                    results={
                      <ul className="flex flex-col gap-1">
                        {placeResults.map((hit) => {
                          const label = hit.detail ? `${hit.name}, ${hit.detail}` : hit.name
                          const active = weatherPlace === label
                          return (
                            <li key={hit.id}>
                              <ToolsSearchHitButton
                                active={active}
                                title={hit.name}
                                subtitle={hit.detail || hit.name}
                                kindLabel={t('weather.cityKind')}
                                selectLabel={t('common.select')}
                                selectedLabel={t('common.selected')}
                                thumb={
                                  <span className="grid size-8 place-items-center rounded-full bg-zinc-950/5 text-muted dark:bg-white/10">
                                    <LocationIcon className="size-4" />
                                  </span>
                                }
                                onSelect={() => selectPlace(hit)}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    }
                  />
                </div>

              <div
                data-widget-tools-section="currency"
                className="flex min-h-0 flex-col"
              >
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand">{t('currency.title')}</p>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-xl text-brand transition hover:bg-brand/10"
                      onClick={() => {
                        onRestoreCurrencyPair()
                        setCurrencyQuery('')
                        setCurrencySearching(false)
                        setCurrencyPickSide('a')
                      }}
                    >
                      <ResetIcon className="size-4" />
                    </button>
                  </div>
                  <ToolsPairSearchFields
                    activeSide={currencyPickSide}
                    searching={currencySearching}
                    query={currencyQuery}
                    displayA={from}
                    displayB={to}
                    placeholder={t('markets.slotPlaceholder')}
                    onFocusSide={focusCurrencySide}
                    onQueryChange={changeCurrencyQuery}
                    onSwap={onSwapCurrencies}
                  />
                  <ToolsSearchBody
                    mode={currencyMode}
                    resultsKey={currencyResultsKey}
                    loading={
                      <p className="px-1 text-center text-xs text-muted">{t('status.loading')}</p>
                    }
                    hint={
                      <p className="px-1 text-center text-xs text-muted">
                        {t('markets.searchHint')}
                      </p>
                    }
                    noResults={
                      <p className="px-1 text-center text-xs text-muted">
                        {t('currency.noResults')}
                      </p>
                    }
                    unavailable={
                      <p className="px-1 text-center text-xs text-muted">
                        {t('currency.catalogUnavailable')}
                      </p>
                    }
                    results={
                      <ul className="flex flex-col gap-1">
                        {currencyResults.map((hit) => {
                          const active =
                            currencyPickSide === 'a' ? hit.code === from : hit.code === to
                          return (
                            <li key={hit.code}>
                              <ToolsSearchHitButton
                                active={active}
                                title={hit.code}
                                subtitle={hit.name}
                                kindLabel={
                                  hit.kind === 'fiat'
                                    ? t('currency.kindFiat')
                                    : t('common.crypto')
                                }
                                selectLabel={t('common.select')}
                                selectedLabel={t('common.selected')}
                                thumb={
                                  <span className="grid size-8 place-items-center rounded-full bg-zinc-950/5 text-[10px] font-bold text-muted dark:bg-white/10">
                                    {hit.code.slice(0, 2)}
                                  </span>
                                }
                                onSelect={() => selectCurrency(hit.code)}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    }
                  />
                </div>

              <div
                data-widget-tools-section="markets"
                className="flex min-h-0 flex-col"
              >
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand">{t('markets.title')}</p>
                    <button
                      type="button"
                      className="grid size-8 place-items-center rounded-xl text-brand transition hover:bg-brand/10"
                      onClick={() => {
                        onRestoreMarkets()
                        setQuery('')
                        setMarketSearching(false)
                        setMarketPickSide('a')
                        setResults([])
                      }}
                    >
                      <ResetIcon className="size-4" />
                    </button>
                  </div>
                  <ToolsPairSearchFields
                    activeSide={marketPickSide}
                    searching={marketSearching}
                    query={query}
                    displayA={assets[0]?.symbol ?? ''}
                    displayB={assets[1]?.symbol ?? ''}
                    placeholder={t('markets.slotPlaceholder')}
                    onFocusSide={focusMarketSide}
                    onQueryChange={changeMarketQuery}
                    onSwap={swapMarketSlots}
                  />
                  <ToolsSearchBody
                    mode={marketMode}
                    resultsKey={marketResultsKey}
                    loading={
                      <p className="px-1 text-center text-xs text-muted">{t('status.loading')}</p>
                    }
                    hint={
                      <p className="px-1 text-center text-xs text-muted">
                        {t('markets.searchHint')}
                      </p>
                    }
                    noResults={
                      <p className="px-1 text-center text-xs text-muted">
                        {t('markets.noResults')}
                      </p>
                    }
                    results={
                      <ul className="flex flex-col gap-1">
                        {results.map((hit) => {
                          const active =
                            marketPickSide === 'a'
                              ? assets[0]?.id === hit.id
                              : assets[1]?.id === hit.id
                          return (
                            <li key={hit.id}>
                              <ToolsSearchHitButton
                                active={active}
                                title={hit.symbol}
                                subtitle={hit.name}
                                kindLabel={
                                  hit.kind === 'stock'
                                    ? t('markets.kindStock')
                                    : t('common.crypto')
                                }
                                selectLabel={t('common.select')}
                                selectedLabel={t('common.selected')}
                                thumb={<AssetThumb symbol={hit.symbol} thumb={hit.thumb} />}
                                onSelect={() =>
                                  assignMarketSlot({
                                    id: hit.id,
                                    symbol: hit.symbol,
                                    name: hit.name,
                                    kind: hit.kind,
                                  })
                                }
                              />
                            </li>
                          )
                        })}
                      </ul>
                    }
                  />
                </div>

              <div
                data-widget-tools-section="todo"
                className="flex min-h-0 flex-col"
              >
                  <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand">{t('todo.title')}</p>
                  </div>
                  <TodoComposeField
                    placeholder={t('todo.placeholder')}
                    className={todos.length > 0 ? 'mb-3 shrink-0' : 'shrink-0'}
                    onSubmitText={onAddTodo}
                  />
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <TodoListItems
                      items={todos}
                      onToggle={(id, done) => void onToggleTodo(id, done)}
                      onRemove={(id) => void onRemoveTodo(id)}
                    />
                  </div>
                </div>
    </div>
  )
}
