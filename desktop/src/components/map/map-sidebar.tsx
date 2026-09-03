/**
 * Left map sidebar — Vue Sidebar desktop parity (tabs, actions, filters, search).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PRIORITY_OPTIONS, getPriorityColor } from '@/constants/priority'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  CheckSquareIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  HeartIcon,
  MapIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'
import type { ShopLocation } from '@/types/chat'
import type { Favorite, FavoritePriority } from '@/types/favorite'
import { LocationDetailView } from '@/components/map/location-detail-view'
import { MapCrmLayerPanel } from '@/components/map/map-crm-layer-panel'
import { MapSidebarMenubar } from '@/components/map/map-sidebar-menubar'
import type { MapSidebarSource } from '@/hooks/use-map-scope'
import type { GroupRecord } from '@/services/groups-api'
import {
  exportFavoritesJson,
  patchMapMenuHandlers,
  setMapMenuView,
} from '@/utils/map/map-menu'

export type MapSidebarTab = 'chat' | 'shops'

const TAB_ORDER: Record<MapSidebarTab, number> = {
  chat: 0,
  shops: 1,
}

/** Locations list ↔ detail drill-down slide duration (ms). */
const LOCATION_DETAIL_SLIDE_MS = 300

/**
 * Horizontal slide class when switching Favorites ↔ Locations (matches shell tab pages).
 *
 * @param from - Previous tab
 * @param to - Next tab
 * @returns Animation class name, or empty on first paint / same tab
 */
function tabSlideClass(from: MapSidebarTab | null, to: MapSidebarTab): string {
  if (from === null || from === to) return ''
  return TAB_ORDER[to] > TAB_ORDER[from]
    ? 'animate-tab-page-forward'
    : 'animate-tab-page-back'
}

interface MapSidebarProps {
  activeTab: MapSidebarTab
  shops: ShopLocation[]
  selectedShops: string[]
  detailShopFromParent: ShopLocation | null
  isSidebarVisible: boolean
  sidebarWidth: number
  isAuthenticated: boolean
  favorites: Favorite[]
  selectedFavoriteId: string | null
  canGoBackward: boolean
  canGoForward: boolean
  mapSource: MapSidebarSource
  availableMapSources: MapSidebarSource[]
  onMapSourceChange: (source: MapSidebarSource) => void
  canSwitchGroups: boolean
  switchableGroups: GroupRecord[]
  selectedGroupId: string | null
  onGroupChange: (groupId: string | null) => void
  crmPins: ShopLocation[]
  crmPinsLoading: boolean
  crmPinsErrorKey: string | null
  crmSelectedKey: string | null
  onCrmPinSelect: (shop: ShopLocation) => void
  onCrmShowAll: (visiblePins: ShopLocation[]) => void
  onCrmRetry: () => void
  onCrmVisiblePinsChange: (pins: ShopLocation[]) => void
  isShopFavorited: (shop: ShopLocation) => boolean
  onActiveTabChange: (tab: MapSidebarTab) => void
  onShopSelect: (shopName: string) => void
  onShopFlyTo: (shopName: string) => void
  onClearDetailFromParent: () => void
  onWidthChange: (width: number) => void
  onToggleFavorite: (shop: ShopLocation) => void
  onEdit: (favorite: Favorite) => void
  onRemove: (favoriteId: string) => void
  onSelectFavorite: (shop: ShopLocation) => void
  onShowMultiple: (locations: ShopLocation[]) => void
  onClearAll: () => void
  onAddCustom: () => void
  onGoBackward: () => void
  onGoForward: () => void
}

/**
 * Converts a favorite row to a ShopLocation for map selection.
 *
 * @param favorite - Favorite record
 * @returns Shop location projection
 */
function favoriteToShop(favorite: Favorite): ShopLocation {
  return {
    name: favorite.shopName,
    latitude: favorite.latitude,
    longitude: favorite.longitude,
    address: favorite.address,
    country: favorite.country,
    stateProvince: favorite.stateProvince,
    city: favorite.city,
    addressLine1: favorite.addressLine1,
    addressLine2: favorite.addressLine2,
    postalCode: favorite.postalCode,
    openSunday: favorite.openSunday,
    hours: favorite.hours,
    website: favorite.website,
    priority: favorite.priority,
    tags: favorite.tags,
  }
}

/**
 * Resizable left sidebar for favorites and shop results (Vue Sidebar parity).
 * Stays mounted when collapsed so width can animate to/from zero.
 *
 * @param props - Sidebar state and callbacks
 * @returns Sidebar UI (width 0 when collapsed)
 */
export function MapSidebar(props: MapSidebarProps) {
  const { t } = useTranslation()
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(props.sidebarWidth)
  const prevTabRef = useRef<MapSidebarTab | null>(null)

  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectedPriorities, setSelectedPriorities] = useState<FavoritePriority[]>([])
  const [weekdaysOnly, setWeekdaysOnly] = useState(false)
  const [sundayOnly, setSundayOnly] = useState(false)
  const [filtersVisible, setFiltersVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isResizing, setIsResizing] = useState(false)

  const filteredFavorites = useMemo(() => {
    let favs = props.favorites
    if (selectedPriorities.length > 0) {
      const set = new Set(selectedPriorities)
      favs = favs.filter((f) => set.has(f.priority ?? 'normal'))
    }
    if (weekdaysOnly) favs = favs.filter((f) => f.openSunday === false)
    if (sundayOnly) favs = favs.filter((f) => f.openSunday === true)
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      favs = favs.filter((f) => {
        const hay = [
          f.shopName,
          f.address ?? '',
          f.note ?? '',
          ...(f.tags ?? []),
        ]
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }
    return favs
  }, [props.favorites, searchQuery, selectedPriorities, sundayOnly, weekdaysOnly])

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsResizing(true)
      dragStartX.current = e.clientX
      dragStartWidth.current = props.sidebarWidth
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)

      const onMove = (ev: globalThis.PointerEvent) => {
        const delta = ev.clientX - dragStartX.current
        props.onWidthChange(dragStartWidth.current + delta)
      }
      const onUp = (ev: globalThis.PointerEvent) => {
        setIsResizing(false)
        target.releasePointerCapture(ev.pointerId)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [props],
  )

  const togglePriority = (id: FavoritePriority) => {
    setSelectedPriorities((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  const toggleSelectMode = () => {
    setIsSelectionMode((v) => {
      if (v) setSelectedIds(new Set())
      return !v
    })
  }

  const allFilteredSelected =
    filteredFavorites.length > 0 && filteredFavorites.every((f) => selectedIds.has(f.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(filteredFavorites.map((f) => f.id)))
  }

  const selectedFavorites = filteredFavorites.filter((f) => selectedIds.has(f.id))
  const nativeApplicationMenu = Boolean(window.geocrm?.window?.usesNativeApplicationMenu)
  const onShowMultipleRef = useRef(props.onShowMultiple)
  const onRemoveRef = useRef(props.onRemove)
  const onMapSourceChangeRef = useRef(props.onMapSourceChange)
  const onGroupChangeRef = useRef(props.onGroupChange)
  const filteredFavoritesRef = useRef(filteredFavorites)
  const selectedFavoritesRef = useRef(selectedFavorites)
  const toggleSelectModeRef = useRef(toggleSelectMode)
  const toggleSelectAllRef = useRef(toggleSelectAll)
  onShowMultipleRef.current = props.onShowMultiple
  onRemoveRef.current = props.onRemove
  onMapSourceChangeRef.current = props.onMapSourceChange
  onGroupChangeRef.current = props.onGroupChange
  filteredFavoritesRef.current = filteredFavorites
  selectedFavoritesRef.current = selectedFavorites
  toggleSelectModeRef.current = toggleSelectMode
  toggleSelectAllRef.current = toggleSelectAll
  const isVisible = props.isSidebarVisible
  const tabSlide = tabSlideClass(prevTabRef.current, props.activeTab)
  if (prevTabRef.current !== props.activeTab) {
    prevTabRef.current = props.activeTab
  }

  const showLocationDetail = props.detailShopFromParent != null
  const locationDetailPresence = useDialogPresence(showLocationDetail, LOCATION_DETAIL_SLIDE_MS)
  const [locationDetailShop, setLocationDetailShop] = useState<ShopLocation | null>(null)

  useEffect(() => {
    if (props.detailShopFromParent) {
      setLocationDetailShop(props.detailShopFromParent)
    }
  }, [props.detailShopFromParent])

  useEffect(() => {
    if (!locationDetailPresence.mounted) {
      setLocationDetailShop(null)
    }
  }, [locationDetailPresence.mounted])

  const detailFavorite = useMemo(() => {
    const shop = locationDetailShop
    if (!shop) return null
    return (
      props.favorites.find(
        (f) =>
          f.shopName === shop.name &&
          f.latitude === shop.latitude &&
          f.longitude === shop.longitude,
      ) ?? null
    )
  }, [locationDetailShop, props.favorites])

  useEffect(() => {
    if (!nativeApplicationMenu) {
      return
    }
    patchMapMenuHandlers({
      showAll: () => {
        onShowMultipleRef.current(filteredFavoritesRef.current.map(favoriteToShop))
      },
      toggleSelect: () => toggleSelectModeRef.current(),
      selectAll: () => toggleSelectAllRef.current(),
      showSelected: () => {
        onShowMultipleRef.current(selectedFavoritesRef.current.map(favoriteToShop))
      },
      deleteSelected: () => {
        for (const fav of selectedFavoritesRef.current) void onRemoveRef.current(fav.id)
        setSelectedIds(new Set())
        setIsSelectionMode(false)
      },
      toggleFilterImportant: () => togglePriority('important'),
      toggleFilterNormal: () => togglePriority('normal'),
      toggleFilterUnimportant: () => togglePriority('unimportant'),
      toggleWeekdays: () => {
        setWeekdaysOnly((value) => !value)
        setSundayOnly(false)
      },
      toggleSunday: () => {
        setSundayOnly((value) => !value)
        setWeekdaysOnly(false)
      },
      setSource: (source) => {
        onMapSourceChangeRef.current(source)
      },
      selectGroup: (groupId) => {
        onGroupChangeRef.current(groupId)
      },
    })
  }, [nativeApplicationMenu])

  useEffect(() => {
    if (!nativeApplicationMenu) {
      return
    }
    setMapMenuView({
      filteredCount: filteredFavorites.length,
      selectionMode: isSelectionMode,
      selectedCount: selectedIds.size,
      allFilteredSelected,
      filterImportant: selectedPriorities.includes('important'),
      filterNormal: selectedPriorities.includes('normal'),
      filterUnimportant: selectedPriorities.includes('unimportant'),
      weekdaysOnly,
      sundayOnly,
      source: props.mapSource,
      availableSources: props.availableMapSources,
      groups: props.switchableGroups.map((group) => ({
        id: group.id,
        label: group.name,
      })),
      selectedGroupId: props.selectedGroupId,
      canSwitchGroups: props.canSwitchGroups,
    })
  }, [
    allFilteredSelected,
    filteredFavorites.length,
    isSelectionMode,
    nativeApplicationMenu,
    props.availableMapSources,
    props.canSwitchGroups,
    props.mapSource,
    props.selectedGroupId,
    props.switchableGroups,
    selectedIds.size,
    selectedPriorities,
    sundayOnly,
    weekdaysOnly,
  ])

  return (
    <aside
      className={[
        'relative z-20 flex h-full shrink-0 flex-col overflow-visible bg-white/70 shadow-xl backdrop-blur-xl dark:bg-zinc-950/55',
        isVisible
          ? 'border-r border-zinc-950/10 dark:border-white/10'
          : 'border-none',
        !isResizing ? 'transition-[width] duration-300 ease-in-out' : '',
      ].join(' ')}
      style={{
        width: isVisible ? props.sidebarWidth : 0,
        willChange: isResizing ? 'width' : undefined,
      }}
      aria-hidden={!isVisible}
    >
      <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <MapSidebarMenubar
        source={props.mapSource}
        availableSources={props.availableMapSources}
        onSourceChange={props.onMapSourceChange}
        canSwitchGroups={props.canSwitchGroups}
        switchableGroups={props.switchableGroups}
        selectedGroupId={props.selectedGroupId}
        onGroupChange={props.onGroupChange}
      />

      {props.mapSource === 'customer_map' || props.mapSource === 'competitor_map' ? (
        <MapCrmLayerPanel
          titleKey={
            props.mapSource === 'customer_map'
              ? 'map.menubar.sources.customerMap'
              : 'map.menubar.sources.competitorMap'
          }
          enableCustomerFilters={props.mapSource === 'customer_map'}
          pins={props.crmPins}
          isLoading={props.crmPinsLoading}
          errorKey={props.crmPinsErrorKey}
          selectedKey={props.crmSelectedKey}
          onSelect={props.onCrmPinSelect}
          onShowAll={props.onCrmShowAll}
          onRetry={props.onCrmRetry}
          onVisiblePinsChange={props.onCrmVisiblePinsChange}
        />
      ) : props.mapSource !== 'map' ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-sm font-medium text-ink">{t('map.menubar.crmPlaceholderTitle')}</p>
          <p className="text-xs text-muted">{t('map.menubar.crmPlaceholderBody')}</p>
        </div>
      ) : (
        <>
      {/* Tabs — Vue parity + sliding brand underline */}
      <div className="relative flex border-b border-zinc-950/10 bg-zinc-950/5 dark:border-white/10 dark:bg-zinc-950/40">
        <button
          type="button"
          onClick={() => props.onActiveTabChange('chat')}
          className={`relative flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            props.activeTab === 'chat' ? 'text-brand' : 'text-muted hover:text-ink'
          }`}
        >
          <HeartIcon className="size-4 text-brand" filled aria-hidden />
          {t('chat.tabs.myFavorites')}
          {props.favorites.length > 0 ? (
            <span className="rounded-full bg-zinc-950/10 px-1.5 text-xs text-muted dark:bg-white/10">
              {props.favorites.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => props.onActiveTabChange('shops')}
          className={`relative flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
            props.activeTab === 'shops' ? 'text-brand' : 'text-muted hover:text-ink'
          }`}
        >
          <MapIcon className="size-4" aria-hidden />
          {t('chat.tabs.locations')}
          {props.shops.length > 0 ? (
            <span className="rounded-full bg-zinc-950/10 px-1.5 text-xs text-muted dark:bg-white/10">
              {props.shops.length}
            </span>
          ) : null}
        </button>
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 h-0.5 bg-brand transition-[left] duration-300 ease-out"
          style={{
            left: props.activeTab === 'chat' ? '0%' : '50%',
            width: '50%',
          }}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          key={props.activeTab}
          className={`flex min-h-0 flex-1 flex-col ${tabSlide}`}
        >
        {props.activeTab === 'chat' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Quick actions — selection enter/exit uses grid-rows like filter chips.
                macOS uses the native Map menu instead. */}
            {!nativeApplicationMenu && (props.isAuthenticated || filteredFavorites.length > 0) && (
              <div className="flex shrink-0 flex-col border-b border-zinc-950/10 bg-zinc-950/5 px-3 py-2 dark:border-white/10 dark:bg-zinc-950/30">
                <div className="flex items-center gap-1.5">
                  {props.isAuthenticated ? (
                    <button
                      type="button"
                      onClick={props.onAddCustom}
                      className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-brand px-2 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90"
                    >
                      <PlusIcon className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{t('chat.favorites.add')}</span>
                    </button>
                  ) : null}
                  {props.isAuthenticated && props.favorites.length > 0 ? (
                    <button
                      type="button"
                      onClick={toggleSelectMode}
                      className={`flex shrink-0 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-white transition-colors duration-300 ${
                        isSelectionMode ? 'bg-brand hover:opacity-90' : 'bg-violet-600 hover:bg-violet-700'
                      }`}
                    >
                      <CheckSquareIcon className="size-3.5" aria-hidden />
                      <span>{isSelectionMode ? t('chat.favorites.done') : t('chat.favorites.select')}</span>
                    </button>
                  ) : null}
                  <div
                    className={`grid transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      !isSelectionMode && filteredFavorites.length > 0
                        ? 'grid-cols-[1fr] opacity-100'
                        : 'pointer-events-none grid-cols-[0fr] opacity-0'
                    }`}
                  >
                    <div className="min-w-0 overflow-hidden">
                      <button
                        type="button"
                        tabIndex={!isSelectionMode && filteredFavorites.length > 0 ? 0 : -1}
                        onClick={props.onClearAll}
                        title={t('chat.favorites.clearAllLocations')}
                        className="grid size-8 shrink-0 place-items-center rounded-md bg-zinc-950/10 text-muted hover:bg-zinc-950/15 hover:text-ink dark:bg-white/10"
                      >
                        <CloseIcon className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>

                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    !isSelectionMode && filteredFavorites.length > 0
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'pointer-events-none grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      className={`flex items-center gap-1.5 pt-1.5 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        !isSelectionMode && filteredFavorites.length > 0
                          ? 'translate-y-0'
                          : '-translate-y-1'
                      }`}
                    >
                      <button
                        type="button"
                        tabIndex={!isSelectionMode && filteredFavorites.length > 0 ? 0 : -1}
                        onClick={() => props.onShowMultiple(filteredFavorites.map(favoriteToShop))}
                        title={t('chat.favorites.showAllOnMap')}
                        className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-brand px-2 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90"
                      >
                        <MapIcon className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{t('chat.favorites.showAllOnMap')}</span>
                      </button>
                      <button
                        type="button"
                        tabIndex={!isSelectionMode && filteredFavorites.length > 0 ? 0 : -1}
                        onClick={() => exportFavoritesJson(props.favorites)}
                        disabled={props.favorites.length === 0}
                        title={t('chat.favorites.export')}
                        className="grid size-8 shrink-0 place-items-center rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:bg-zinc-500"
                      >
                        <DownloadIcon className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!nativeApplicationMenu ? (
            <div
              className={`grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isSelectionMode
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'pointer-events-none grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={`border-b border-zinc-950/10 bg-brand/10 px-3 py-2 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-white/10 ${
                    isSelectionMode ? 'translate-y-0' : '-translate-y-1'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      tabIndex={isSelectionMode ? 0 : -1}
                      onClick={toggleSelectAll}
                      className="flex items-center gap-1.5 text-xs text-muted hover:text-ink"
                    >
                      <CheckSquareIcon className="size-3.5" aria-hidden />
                      {allFilteredSelected
                        ? t('chat.favorites.deselectAll')
                        : t('chat.favorites.selectAll')}
                    </button>
                    <span className="text-xs text-muted">
                      {selectedIds.size} {t('chat.favorites.selected')}
                    </span>
                  </div>
                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                      selectedFavorites.length > 0
                        ? 'grid-rows-[1fr] opacity-100'
                        : 'pointer-events-none grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div
                        className={`flex gap-1.5 pt-2 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          selectedFavorites.length > 0 ? 'translate-y-0' : '-translate-y-1'
                        }`}
                      >
                        <button
                          type="button"
                          tabIndex={selectedFavorites.length > 0 ? 0 : -1}
                          onClick={() => props.onShowMultiple(selectedFavorites.map(favoriteToShop))}
                          className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-brand px-2 py-1.5 text-xs font-medium text-brand-fg hover:opacity-90"
                        >
                          <MapIcon className="size-3" aria-hidden />
                          <span className="truncate">{t('chat.favorites.showOnMap')}</span>
                        </button>
                        <button
                          type="button"
                          tabIndex={selectedFavorites.length > 0 ? 0 : -1}
                          onClick={() => {
                            for (const fav of selectedFavorites) void props.onRemove(fav.id)
                            setSelectedIds(new Set())
                            setIsSelectionMode(false)
                          }}
                          className="flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                        >
                          <TrashIcon className="size-3" aria-hidden />
                          <span className="truncate">{t('chat.favorites.delete')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            ) : null}

            {/* Filters — macOS uses the native Map menu instead. */}
            {!nativeApplicationMenu && props.favorites.length > 0 ? (
              <div className="shrink-0 border-b border-zinc-950/10 bg-zinc-950/5 px-4 py-1.5 dark:border-white/10 dark:bg-zinc-950/30">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold tracking-wide text-muted uppercase">
                    {t('chat.favorites.filterByPriority')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiltersVisible((v) => !v)}
                    title={
                      filtersVisible
                        ? t('chat.favorites.hideFilters')
                        : t('chat.favorites.showFilters')
                    }
                    aria-expanded={filtersVisible}
                    className="rounded-md p-1 text-muted transition-colors hover:bg-brand/10 hover:text-brand"
                  >
                    <ChevronDownIcon
                      className={`size-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        filtersVisible ? 'rotate-180' : 'rotate-0'
                      }`}
                      aria-hidden
                    />
                  </button>
                </div>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    filtersVisible
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'pointer-events-none grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      className={`flex flex-wrap gap-2 pt-2 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        filtersVisible ? 'translate-y-0' : '-translate-y-1'
                      }`}
                    >
                      {PRIORITY_OPTIONS.map((opt) => {
                        const active = selectedPriorities.includes(opt.id)
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            tabIndex={filtersVisible ? 0 : -1}
                            onClick={() => togglePriority(opt.id)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                              active ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''
                            }`}
                            style={{
                              backgroundColor: active ? opt.color : `${opt.color}80`,
                              color: '#fff',
                            }}
                          >
                            {t(opt.labelKey)}
                          </button>
                        )
                      })}
                      <button
                        type="button"
                        tabIndex={filtersVisible ? 0 : -1}
                        onClick={() => {
                          setWeekdaysOnly((v) => !v)
                          setSundayOnly(false)
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          weekdaysOnly
                            ? 'bg-sky-600 text-white ring-2 ring-white ring-offset-2 ring-offset-zinc-900'
                            : 'bg-sky-700/80 text-sky-100'
                        }`}
                      >
                        {t('chat.favorites.weekdaysOnly')}
                      </button>
                      <button
                        type="button"
                        tabIndex={filtersVisible ? 0 : -1}
                        onClick={() => {
                          setSundayOnly((v) => !v)
                          setWeekdaysOnly(false)
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          sundayOnly
                            ? 'bg-brand text-brand-fg ring-2 ring-white ring-offset-2 ring-offset-zinc-900'
                            : 'bg-violet-700/80 text-violet-100'
                        }`}
                      >
                        {t('chat.favorites.sundayOnly')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Search */}
            {props.isAuthenticated && props.favorites.length > 0 ? (
              <div className="shrink-0 border-b border-zinc-950/10 px-3 py-2 dark:border-white/10">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-muted" aria-hidden />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('chat.favorites.searchPlaceholder')}
                    className="w-full rounded-md border border-zinc-950/10 bg-white/50 py-1.5 pr-2.5 pl-8 text-xs text-ink outline-none placeholder:text-muted focus:border-brand dark:border-white/10 dark:bg-zinc-900/50"
                  />
                </div>
              </div>
            ) : null}

            <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
              {filteredFavorites.length === 0 ? (
                <li className="px-2 py-8 text-center text-sm text-muted">
                  <HeartIcon className="mx-auto mb-3 size-10 text-muted/40" filled aria-hidden />
                  <p>
                    {props.favorites.length === 0
                      ? t('chat.favorites.noFavoritesYet')
                      : t('chat.favorites.noFavoritesMatch')}
                  </p>
                  <p className="mt-1 text-xs">
                    {props.favorites.length === 0
                      ? t('chat.favorites.clickHeartToSave')
                      : t('chat.favorites.tryDifferentPriority')}
                  </p>
                </li>
              ) : (
                filteredFavorites.map((fav) => {
                  const selected = props.selectedFavoriteId === fav.id
                  const checked = selectedIds.has(fav.id)
                  const priorityActive = !(selected || checked)
                  return (
                    <li key={fav.id}>
                      <div
                        className={`group relative flex items-start gap-2 rounded-lg border border-l-4 p-2.5 transition-colors ${
                          checked
                            ? 'border-brand bg-brand/10'
                            : selected
                              ? 'border-brand bg-brand/10 ring-2 ring-brand/40'
                              : 'border-zinc-950/10 bg-zinc-950/5 hover:border-zinc-950/20 dark:border-white/10 dark:bg-zinc-900/40 dark:hover:border-white/20'
                        }`}
                        style={
                          priorityActive
                            ? { borderLeftColor: getPriorityColor(fav.priority) }
                            : undefined
                        }
                      >
                        <div
                          className={`grid shrink-0 transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            isSelectionMode
                              ? 'grid-cols-[1fr] opacity-100'
                              : 'pointer-events-none grid-cols-[0fr] opacity-0'
                          }`}
                        >
                          <div className="min-w-0 overflow-hidden">
                            <button
                              type="button"
                              tabIndex={isSelectionMode ? 0 : -1}
                              className="mt-0.5 grid size-5 place-items-center rounded border border-zinc-950/20 dark:border-white/20"
                              onClick={() => {
                                setSelectedIds((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(fav.id)) next.delete(fav.id)
                                  else next.add(fav.id)
                                  return next
                                })
                              }}
                              aria-pressed={checked}
                            >
                              {checked ? (
                                <CheckSquareIcon className="size-3.5 text-brand" aria-hidden />
                              ) : null}
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            if (isSelectionMode) {
                              setSelectedIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(fav.id)) next.delete(fav.id)
                                else next.add(fav.id)
                                return next
                              })
                              return
                            }
                            props.onSelectFavorite(favoriteToShop(fav))
                          }}
                        >
                          <p className="truncate text-sm font-bold text-brand">{fav.shopName}</p>
                          {fav.address ? (
                            <p className="truncate text-xs text-muted">{fav.address}</p>
                          ) : null}
                          {fav.note ? (
                            <p className="mt-1 line-clamp-2 rounded bg-zinc-950/5 p-1.5 text-xs text-muted italic dark:bg-white/5">
                              &quot;{fav.note}&quot;
                            </p>
                          ) : null}
                        </button>
                        <div
                          className={`grid shrink-0 transition-[grid-template-columns,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                            !isSelectionMode
                              ? 'grid-cols-[1fr] opacity-100'
                              : 'pointer-events-none grid-cols-[0fr] opacity-0'
                          }`}
                        >
                          <div className="flex min-w-0 overflow-hidden">
                            <button
                              type="button"
                              tabIndex={!isSelectionMode ? 0 : -1}
                              onClick={() => props.onEdit(fav)}
                              className="grid size-7 place-items-center rounded-lg text-muted hover:bg-brand/10 hover:text-brand"
                              aria-label={t('chat.favorites.modal.editFavorite')}
                            >
                              <PencilIcon className="size-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              tabIndex={!isSelectionMode ? 0 : -1}
                              onClick={() => void props.onRemove(fav.id)}
                              className="grid size-7 place-items-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-500"
                              aria-label={t('chat.favorites.delete')}
                            >
                              <TrashIcon className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        ) : null}

        {props.activeTab === 'shops' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className="flex h-full min-h-0 w-[200%] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                transform: showLocationDetail ? 'translateX(-50%)' : 'translateX(0%)',
              }}
            >
              <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col">
                <div className="flex items-center gap-2 border-b border-zinc-950/10 px-3 py-2 dark:border-white/10">
                  {!nativeApplicationMenu ? (
                    <button
                      type="button"
                      onClick={props.onGoBackward}
                      disabled={!props.canGoBackward}
                      className="grid size-9 place-items-center rounded-lg bg-zinc-950/5 text-muted hover:text-brand disabled:opacity-40 dark:bg-white/5"
                      aria-label={t('chat.panel.goBack')}
                    >
                      <ChevronLeftIcon className="size-4" aria-hidden />
                    </button>
                  ) : null}
                  <p className="flex-1 text-center text-xs font-bold tracking-wider text-muted uppercase">
                    {t('chat.locations.count', { count: props.shops.length })}
                  </p>
                  {!nativeApplicationMenu ? (
                    <button
                      type="button"
                      onClick={props.onGoForward}
                      disabled={!props.canGoForward}
                      className="grid size-9 place-items-center rounded-lg bg-zinc-950/5 text-muted hover:text-brand disabled:opacity-40 dark:bg-white/5"
                      aria-label={t('chat.panel.goForward')}
                    >
                      <ChevronRightIcon className="size-4" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-3">
                  {props.shops.length === 0 ? (
                    <li className="px-2 py-8 text-center text-sm text-muted">
                      {t('chat.locations.empty')}
                    </li>
                  ) : (
                    props.shops.map((shop) => {
                      const selected = props.selectedShops.includes(shop.name)
                      const favorited = props.isShopFavorited(shop)
                      return (
                        <li key={`${shop.name}-${shop.latitude}-${shop.longitude}`}>
                          <button
                            type="button"
                            onClick={() => props.onShopSelect(shop.name)}
                            className={`flex w-full items-start gap-2 rounded-xl border px-2.5 py-2 text-left ${
                              selected
                                ? 'border-brand bg-brand/10'
                                : 'border-transparent hover:border-zinc-950/10 hover:bg-white/50 dark:hover:border-white/10'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-bold text-brand">{shop.name}</p>
                              {shop.address ? (
                                <p className="truncate text-xs text-muted">{shop.address}</p>
                              ) : null}
                            </div>
                            {props.isAuthenticated ? (
                              <span
                                role="button"
                                tabIndex={favorited ? -1 : 0}
                                aria-disabled={favorited}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // Locations list: add-only to avoid accidental unfavorite (Vue favoriteOnlyAdd)
                                  if (favorited) return
                                  props.onToggleFavorite(shop)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    if (favorited) return
                                    props.onToggleFavorite(shop)
                                  }
                                }}
                                className={`grid size-7 place-items-center rounded-lg text-brand ${
                                  favorited ? 'cursor-default' : 'hover:bg-brand/10'
                                }`}
                              >
                                <HeartIcon className="size-3.5" filled={favorited} aria-hidden />
                              </span>
                            ) : null}
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
              <div className="flex h-full w-1/2 min-w-0 shrink-0 flex-col overflow-hidden">
                {locationDetailPresence.mounted && locationDetailShop ? (
                  <LocationDetailView
                    shop={locationDetailShop}
                    favorite={detailFavorite}
                    onBack={props.onClearDetailFromParent}
                    onShowOnMap={(shop) => props.onShopSelect(shop.name)}
                    onEdit={props.onEdit}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </div>
        </>
      )}
      </div>

      {isVisible ? (
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={onResizePointerDown}
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-brand/30"
        />
      ) : null}
    </aside>
  )
}
