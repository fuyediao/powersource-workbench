/**
 * Sidebar list for Map CRM layers (customer / competitor pins).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MapCrmFilterToolbar } from '@/components/map/map-crm-filter-toolbar'
import { useVirtualWindow } from '@/hooks/use-virtual-window'
import { SearchIcon } from '@/icons/AllIcons'
import {
  ALL_CUSTOMER_LEVEL_FILTER_KEYS,
  CUSTOMER_LEVEL_VALUES,
  customerLevelFilterKey,
  type CustomerLevelFilterKey,
} from '@/constants/customer-levels'
import {
  companyStateMatchesUsCode,
  isUnitedStatesCountryFilter,
} from '@/constants/us-east-west-regions'
import type { ShopLocation } from '@/types/chat'
import { shopMarkerKey } from '@/types/chat'

const FILTER_CACHE_KEY = 'geocrm.electron.customerMap.filters'

/** Fixed slot height for virtualized pin cards (3 text lines + gap). */
const PIN_ROW_HEIGHT_PX = 88
/** Vertical padding inside the virtual list scroller (top + bottom). */
const PIN_LIST_PAD_Y_PX = 12
const PIN_LIST_PAD_BOTTOM_EXTRA_PX = 16

interface CustomerMapFiltersCache {
  country?: string
  usState?: string
  levels?: string[]
}

interface MapCrmLayerPanelProps {
  titleKey: string
  /** When true, show country / US state / level filters (customer map). */
  enableCustomerFilters?: boolean
  pins: ShopLocation[]
  isLoading: boolean
  errorKey: string | null
  selectedKey: string | null
  onSelect: (shop: ShopLocation) => void
  onShowAll: (visiblePins: ShopLocation[]) => void
  onRetry: () => void
  /** Notifies parent of pins that should appear on the map. */
  onVisiblePinsChange?: (pins: ShopLocation[]) => void
}

/**
 * Reads persisted customer map filters from localStorage.
 * @returns Cached filters or null.
 */
function readFilterCache(): CustomerMapFiltersCache | null {
  try {
    const raw = localStorage.getItem(FILTER_CACHE_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as CustomerMapFiltersCache
  } catch {
    return null
  }
}

/**
 * Writes customer map filters to localStorage.
 * @param cache - Filter payload.
 */
function writeFilterCache(cache: CustomerMapFiltersCache): void {
  try {
    localStorage.setItem(FILTER_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore quota / private mode.
  }
}

/**
 * Sanitizes cached level keys.
 * @param levels - Raw cached levels.
 * @returns Valid level filter set.
 */
function sanitizeLevels(levels: string[] | undefined): Set<CustomerLevelFilterKey> {
  if (!Array.isArray(levels) || levels.length === 0) {
    return new Set(ALL_CUSTOMER_LEVEL_FILTER_KEYS)
  }
  const next = new Set<CustomerLevelFilterKey>()
  for (const item of levels) {
    if (item === 'none' || (CUSTOMER_LEVEL_VALUES as readonly string[]).includes(item)) {
      next.add(item as CustomerLevelFilterKey)
    }
  }
  return next.size > 0 ? next : new Set(ALL_CUSTOMER_LEVEL_FILTER_KEYS)
}

/**
 * Searchable CRM pin list for the Map sidebar (optional customer filters).
 * @param props - Pins and selection handlers.
 * @returns Panel UI.
 */
export function MapCrmLayerPanel({
  titleKey,
  enableCustomerFilters = false,
  pins,
  isLoading,
  errorKey,
  selectedKey,
  onSelect,
  onShowAll,
  onRetry,
  onVisiblePinsChange,
}: MapCrmLayerPanelProps): ReactNode {
  const { t } = useTranslation()
  const cached = useMemo(() => (enableCustomerFilters ? readFilterCache() : null), [enableCustomerFilters])
  const [query, setQuery] = useState('')
  const [countryFilter, setCountryFilter] = useState(cached?.country ?? '')
  const [usStateFilter, setUsStateFilter] = useState(
    isUnitedStatesCountryFilter(cached?.country ?? '') ? (cached?.usState ?? '') : '',
  )
  const [selectedLevels, setSelectedLevels] = useState<Set<CustomerLevelFilterKey>>(() =>
    sanitizeLevels(cached?.levels),
  )
  const listScrollRef = useRef<HTMLDivElement>(null)

  const showUsStateFilter = isUnitedStatesCountryFilter(countryFilter)

  const filtered = useMemo(() => {
    let list = pins
    if (enableCustomerFilters) {
      list = list.filter((pin) => {
        const levelKey = customerLevelFilterKey(pin.tags?.[0] ?? null)
        if (!selectedLevels.has(levelKey)) {
          return false
        }
        const country = (pin.country ?? '').trim()
        if (countryFilter === '__empty__') {
          if (country) {
            return false
          }
        } else if (countryFilter) {
          if (country !== countryFilter.trim()) {
            return false
          }
        }
        if (showUsStateFilter && usStateFilter) {
          const state = (pin.stateProvince ?? '').trim()
          if (!companyStateMatchesUsCode(state, usStateFilter)) {
            return false
          }
        }
        return true
      })
    }
    const q = query.trim().toLowerCase()
    if (!q) {
      return list
    }
    return list.filter((pin) => {
      const hay = [pin.name, pin.address ?? '', ...(pin.tags ?? [])].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [
    countryFilter,
    enableCustomerFilters,
    pins,
    query,
    selectedLevels,
    showUsStateFilter,
    usStateFilter,
  ])

  const pinWindow = useVirtualWindow(filtered.length, PIN_ROW_HEIGHT_PX, listScrollRef)
  const visiblePins = useMemo(
    () => filtered.slice(pinWindow.startIndex, pinWindow.endIndex),
    [filtered, pinWindow.endIndex, pinWindow.startIndex],
  )

  useEffect(() => {
    onVisiblePinsChange?.(filtered)
  }, [filtered, onVisiblePinsChange])

  useEffect(() => {
    if (!enableCustomerFilters) {
      return
    }
    writeFilterCache({
      country: countryFilter,
      usState: usStateFilter,
      levels: [...selectedLevels],
    })
  }, [countryFilter, enableCustomerFilters, selectedLevels, usStateFilter])

  // Scroll the virtual list so a map-selected (or list-selected) pin is visible.
  useLayoutEffect(() => {
    if (!selectedKey) {
      return
    }
    const el = listScrollRef.current
    if (!el) {
      return
    }
    const index = filtered.findIndex((pin) => shopMarkerKey(pin) === selectedKey)
    if (index < 0) {
      return
    }
    const rowTop = PIN_LIST_PAD_Y_PX + index * PIN_ROW_HEIGHT_PX
    const rowBottom = rowTop + PIN_ROW_HEIGHT_PX
    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight
    if (rowTop >= viewTop + 8 && rowBottom <= viewBottom - 8) {
      return
    }
    const next = Math.max(0, rowTop - Math.max(24, (el.clientHeight - PIN_ROW_HEIGHT_PX) / 3))
    el.scrollTo({ top: next, behavior: 'smooth' })
  }, [filtered, selectedKey])

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-col gap-2 border-b border-zinc-950/10 px-3 py-2 dark:border-white/10">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-ink">{t(titleKey)}</h2>
          <span className="shrink-0 text-xs text-muted">
            {t('map.menubar.pinCount', { count: filtered.length })}
          </span>
        </div>

        {enableCustomerFilters ? (
          <MapCrmFilterToolbar
            countryFilter={countryFilter}
            usStateFilter={usStateFilter}
            selectedLevels={selectedLevels}
            onCountryChange={setCountryFilter}
            onUsStateChange={setUsStateFilter}
            onLevelsChange={setSelectedLevels}
          />
        ) : null}

        <button
          type="button"
          disabled={filtered.length === 0}
          onClick={() => onShowAll(filtered)}
          className="rounded-md bg-brand px-2 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('map.menubar.showAllOnMap')}
        </button>
        <label className="relative block">
          <span className="sr-only">{t('map.menubar.searchPins')}</span>
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('map.menubar.searchPinsPlaceholder')}
            className="w-full rounded-md border border-zinc-950/10 bg-white py-1.5 pr-2 pl-8 text-xs text-ink outline-none placeholder:text-muted focus:border-brand dark:border-white/10 dark:bg-zinc-950/40"
          />
        </label>
      </div>

      <div
        ref={listScrollRef}
        onScroll={pinWindow.onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {isLoading ? (
          <p className="px-4 py-8 text-center text-xs text-muted">{t('map.menubar.loadingPins')}</p>
        ) : null}
        {!isLoading && errorKey ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <p className="text-xs text-red-500">{t(errorKey)}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-zinc-950/10 px-3 py-1.5 text-xs font-medium text-ink hover:bg-zinc-950/15 dark:bg-white/10"
            >
              {t('map.menubar.retry')}
            </button>
          </div>
        ) : null}
        {!isLoading && !errorKey && filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted">{t('map.menubar.emptyPins')}</p>
        ) : null}
        {!isLoading && !errorKey && filtered.length > 0 ? (
          <div
            className="relative px-2"
            style={{
              height:
                pinWindow.totalHeight +
                PIN_LIST_PAD_Y_PX +
                PIN_LIST_PAD_Y_PX +
                PIN_LIST_PAD_BOTTOM_EXTRA_PX,
            }}
          >
            <ul
              className="absolute inset-x-2"
              style={{
                top: PIN_LIST_PAD_Y_PX,
                transform: `translateY(${pinWindow.offsetY}px)`,
              }}
            >
              {visiblePins.map((pin) => {
                const key = shopMarkerKey(pin)
                const selected = key === selectedKey
                return (
                  <li
                    key={key}
                    className="box-border"
                    style={{ height: PIN_ROW_HEIGHT_PX, paddingBottom: 4 }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(pin)}
                      className={`box-border flex h-full w-full flex-col justify-center overflow-hidden rounded-lg border border-l-4 p-2.5 text-left transition-colors ${
                        selected
                          ? 'border-brand bg-brand/15 ring-2 ring-inset ring-brand/50'
                          : 'border-zinc-950/10 bg-zinc-950/5 hover:border-zinc-950/20 dark:border-white/10 dark:bg-zinc-900/40 dark:hover:border-white/20'
                      }`}
                      style={
                        !selected
                          ? { borderLeftColor: pin.pinColor ?? '#6b7280' }
                          : undefined
                      }
                    >
                      <span className="block truncate text-sm font-bold text-brand">{pin.name}</span>
                      {pin.address ? (
                        <span className="mt-0.5 block truncate text-xs text-muted">{pin.address}</span>
                      ) : null}
                      {pin.tags && pin.tags.length > 0 ? (
                        <span className="mt-1 block truncate text-[10px] font-medium tracking-wide text-muted uppercase">
                          {pin.tags.join(' · ')}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
