import {
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import type { WidgetToolsSection } from '@/components/home/widgets/WidgetToolsPanel'
import { useCurrency } from '@/hooks/use-currency'
import { useMarkets, type MarketAsset, type MarketQuote } from '@/hooks/use-markets'
import { useTodos } from '@/hooks/use-todos'
import { useWeather, type WeatherPermission } from '@/hooks/use-weather'
import { useWeatherUnit, type WeatherUnit } from '@/hooks/use-weather-unit'
import { openGeoCrmSettings } from '@/utils/settings/settings-section-request'
import type { CurrencyCode, CurrencyConvertDto, PlaceSearchHitDto, WeatherDto } from '@/utils/shared/api'
import type { TodoItemDto, WeatherLocationSource } from '@/utils/home/library-api'

export type { WidgetToolsSection }

interface WidgetToolsContextValue {
  openTools: (section?: WidgetToolsSection) => void
  weatherUnit: WeatherUnit
  fahrenheit: boolean
  setWeatherUnit: (unit: WeatherUnit) => void
  weather: WeatherDto | null
  weatherPlace: string | null
  weatherHasLocation: boolean
  weatherSource: WeatherLocationSource | null
  weatherPermission: WeatherPermission
  weatherLoading: boolean
  weatherRequesting: boolean
  weatherReady: boolean
  requestWeatherLocation: () => void
  selectWeatherPlace: (hit: PlaceSearchHitDto) => void
  clearWeatherLocation: () => void
  amount: number
  from: CurrencyCode
  to: CurrencyCode
  conversion: CurrencyConvertDto | null
  currencyLoading: boolean
  setAmount: (amount: number) => void
  setFrom: (code: CurrencyCode) => void
  setTo: (code: CurrencyCode) => void
  swapCurrencies: () => void
  resetCurrencyPair: () => void
  quotes: MarketQuote[]
  assets: MarketAsset[]
  marketsLoading: boolean
  setAssets: (assets: MarketAsset[]) => void
  todos: TodoItemDto[]
  todosLoading: boolean
  addTodo: (text: string) => Promise<void>
  toggleTodo: (id: string, done: boolean) => Promise<void>
  removeTodo: (id: string) => Promise<void>
}

const WidgetToolsContext = createContext<WidgetToolsContextValue | null>(null)

interface WidgetToolsProviderProps {
  userId: string
  children: ReactNode
}

/**
 * Shares aside-widget tools state for Home cards and Settings Widgets section.
 * @param props - Signed-in user id and children.
 * @returns Provider wrapping children.
 */
export function WidgetToolsProvider({ userId, children }: WidgetToolsProviderProps) {
  const { unit, fahrenheit, setUnit } = useWeatherUnit()
  const weather = useWeather(userId)
  const currency = useCurrency(userId)
  const markets = useMarkets(userId)
  const todos = useTodos(userId)

  /**
   * Opens Settings → Widgets, optionally focusing a tools sub-section.
   * @param nextSection - Sub-section to show; defaults to order.
   * @returns Nothing.
   */
  function openTools(nextSection?: WidgetToolsSection): void {
    openGeoCrmSettings('widgets', nextSection ?? 'order')
  }

  const value: WidgetToolsContextValue = {
    openTools,
    weatherUnit: unit,
    fahrenheit,
    setWeatherUnit: setUnit,
    weather: weather.weather,
    weatherPlace: weather.place,
    weatherHasLocation: weather.hasLocation,
    weatherSource: weather.source,
    weatherPermission: weather.permission,
    weatherLoading: weather.loading,
    weatherRequesting: weather.requesting,
    weatherReady: weather.ready,
    requestWeatherLocation: weather.requestLocation,
    selectWeatherPlace: weather.selectPlace,
    clearWeatherLocation: weather.clearLocation,
    amount: currency.amount,
    from: currency.from,
    to: currency.to,
    conversion: currency.conversion,
    currencyLoading: currency.loading,
    setAmount: currency.setAmount,
    setFrom: currency.setFrom,
    setTo: currency.setTo,
    swapCurrencies: currency.swap,
    resetCurrencyPair: currency.resetPair,
    quotes: markets.quotes,
    assets: markets.assets,
    marketsLoading: markets.loading,
    setAssets: markets.setAssets,
    todos: todos.items,
    todosLoading: todos.loading,
    addTodo: todos.addTodo,
    toggleTodo: todos.toggleTodo,
    removeTodo: todos.removeTodo,
  }

  return (
    <WidgetToolsContext.Provider value={value}>
      {children}
    </WidgetToolsContext.Provider>
  )
}

/**
 * Accesses shared aside-widget tools (open Settings + live state).
 * @returns Tools context value.
 */
export function useWidgetTools(): WidgetToolsContextValue {
  const value = useContext(WidgetToolsContext)
  if (!value) {
    throw new Error('useWidgetTools must be used within WidgetToolsProvider')
  }
  return value
}
