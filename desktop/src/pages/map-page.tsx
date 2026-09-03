/**
 * Electron Map page — Vue MapView desktop parity (sidebar + Leaflet map).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { CreateCustomLocationModal } from '@/components/map/create-custom-location-modal'
import { FavoriteEditModal } from '@/components/map/favorite-edit-modal'
import { MapPanel, type MapPanelHandle } from '@/components/map/map-panel'
import { MapSidebar, type MapSidebarTab } from '@/components/map/map-sidebar'
import { useFavorites } from '@/hooks/use-favorites'
import { useLocationHierarchy } from '@/hooks/use-location-hierarchy'
import { useMapCrmPins } from '@/hooks/use-map-crm-pins'
import { useMapLocation } from '@/hooks/use-map-location'
import { useMapScope } from '@/hooks/use-map-scope'
import { useSidebarWidth } from '@/hooks/use-sidebar-width'
import type { ShopLocation } from '@/types/chat'
import { shopMarkerKey } from '@/types/chat'
import type { Favorite, FavoriteInput, PendingCoordinates } from '@/types/favorite'
import {
  exportFavoritesJson,
  patchMapMenuHandlers,
  setMapMenuView,
  unregisterMapMenuHost,
} from '@/utils/map/map-menu'

const SHOPS_STORAGE_KEY = 'mapView_shops'

interface MapPageProps {
  userId: string
  user: User
}

/**
 * Saves shops to sessionStorage.
 *
 * @param shopsToSave - Shops to persist
 */
function saveShopsToStorage(shopsToSave: ShopLocation[]): void {
  try {
    if (shopsToSave.length > 0) {
      sessionStorage.setItem(SHOPS_STORAGE_KEY, JSON.stringify(shopsToSave))
    } else {
      sessionStorage.removeItem(SHOPS_STORAGE_KEY)
    }
  } catch (error) {
    console.warn('Error saving shops to sessionStorage:', error)
  }
}

/**
 * Loads shops from sessionStorage.
 *
 * @returns Parsed shops or null
 */
function loadShopsFromStorage(): ShopLocation[] | null {
  try {
    const saved = sessionStorage.getItem(SHOPS_STORAGE_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved) as ShopLocation[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch {
    return null
  }
}

/**
 * Desktop MapView experience: left sidebar (favorites / locations) + Leaflet map.
 *
 * @param props - Signed-in user
 * @returns Map page UI
 */
export function MapPage({ userId, user }: MapPageProps) {
  const mapPanelRef = useRef<MapPanelHandle | null>(null)
  const mapScope = useMapScope(userId)
  const crmGroupId = mapScope.canSwitchGroups
    ? mapScope.selectedGroupId
    : (mapScope.membershipGroup?.id ?? null)
  const crmPinsState = useMapCrmPins(mapScope.source, crmGroupId)
  const isExploreMap = mapScope.source === 'map'
  const isCrmLayer =
    mapScope.source === 'customer_map' || mapScope.source === 'competitor_map'

  const [shops, setShops] = useState<ShopLocation[]>([])
  const [activeTab, setActiveTab] = useState<MapSidebarTab>('chat')
  const [selectedShops, setSelectedShops] = useState<string[]>([])
  const [crmSelectedKey, setCrmSelectedKey] = useState<string | null>(null)
  const [crmVisiblePins, setCrmVisiblePins] = useState<ShopLocation[]>([])
  const [detailShopFromParent, setDetailShopFromParent] = useState<ShopLocation | null>(null)
  const [isSidebarVisible, setIsSidebarVisible] = useState(true)
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(null)
  const [editingFavorite, setEditingFavorite] = useState<Favorite | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [pendingCoordinates, setPendingCoordinates] = useState<PendingCoordinates | undefined>()

  const { location, locationError, handleLocate, handleMapLocationUpdate } = useMapLocation()
  const { sidebarWidth, updateWidth } = useSidebarWidth()
  const {
    favorites,
    loadFavorites,
    addFavorite,
    removeFavorite,
    updateFavorite,
    isFavorited,
    getFavoriteByShop,
  } = useFavorites()
  const {
    canGoBackward,
    canGoForward,
    setCurrentView,
    goBackward,
    goForward,
  } = useLocationHierarchy()

  useEffect(() => {
    return () => unregisterMapMenuHost()
  }, [])

  useEffect(() => {
    if (!location) void handleLocate()
    const savedShops = loadShopsFromStorage()
    if (savedShops) {
      setShops(savedShops)
      setActiveTab('shops')
    }
    void loadFavorites(userId)
    // Mount bootstrap only
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional once on mount
  }, [userId])

  const flyMapToShop = useCallback((shop: ShopLocation | undefined) => {
    if (!shop || !mapPanelRef.current) return
    const lat = Number(shop.latitude)
    const lng = Number(shop.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    mapPanelRef.current.setMapView({ latitude: lat, longitude: lng }, 15)
  }, [])

  const pushHierarchyFromMap = useCallback(
    (nextShops: ShopLocation[], query: string) => {
      window.setTimeout(() => {
        const view = mapPanelRef.current?.getCurrentView()
        if (view) setCurrentView(view.center, view.zoom, nextShops, query)
      }, 500)
    },
    [setCurrentView],
  )

  const handleShopSelect = useCallback(
    (shopKey: string) => {
      if (isCrmLayer) {
        const shop = crmPinsState.pins.find((row) => shopMarkerKey(row) === shopKey)
        setCrmSelectedKey(shopKey)
        setSelectedShops([shopKey])
        setIsSidebarVisible(true)
        if (shop) {
          flyMapToShop(shop)
        }
        return
      }
      setSelectedFavoriteId(null)
      setSelectedShops([shopKey])
      setIsSidebarVisible(true)
      setActiveTab('shops')
      const shop = shops.find((s) => shopMarkerKey(s) === shopKey || s.name === shopKey)
      if (shop) {
        setDetailShopFromParent(shop)
        flyMapToShop(shop)
      }
    },
    [crmPinsState.pins, flyMapToShop, isCrmLayer, shops],
  )

  const handleShopFlyTo = useCallback(
    (shopKey: string) => {
      setSelectedFavoriteId(null)
      setSelectedShops([shopKey])
      setDetailShopFromParent(null)
      setIsSidebarVisible(true)
      setActiveTab('shops')
      flyMapToShop(
        shops.find((s) => shopMarkerKey(s) === shopKey || s.name === shopKey),
      )
    },
    [flyMapToShop, shops],
  )

  const handleCrmPinSelect = useCallback(
    (shop: ShopLocation) => {
      const key = shopMarkerKey(shop)
      setCrmSelectedKey(key)
      setSelectedShops([key])
      setIsSidebarVisible(true)
      flyMapToShop(shop)
    },
    [flyMapToShop],
  )

  const handleCrmShowAll = useCallback((visiblePins: ShopLocation[]) => {
    setCrmSelectedKey(null)
    setSelectedShops(visiblePins.map(shopMarkerKey))
    setIsSidebarVisible(true)
  }, [])

  const handleCrmVisiblePinsChange = useCallback((pins: ShopLocation[]) => {
    setCrmVisiblePins(pins)
  }, [])

  useEffect(() => {
    if (!isCrmLayer) {
      setCrmSelectedKey(null)
      setCrmVisiblePins([])
    }
  }, [isCrmLayer, mapScope.source])

  const handleToggleFavorite = useCallback(
    async (shop: ShopLocation) => {
      const existing = getFavoriteByShop(shop.name, shop.latitude, shop.longitude)
      if (existing) {
        await removeFavorite(existing.id)
        return
      }
      const input: FavoriteInput = {
        shopName: shop.name,
        latitude: shop.latitude,
        longitude: shop.longitude,
        address: shop.address,
        country: shop.country ?? null,
        stateProvince: shop.stateProvince ?? null,
        city: shop.city ?? null,
        addressLine1: shop.addressLine1 ?? null,
        addressLine2: shop.addressLine2 ?? null,
        postalCode: shop.postalCode ?? null,
        openSunday: Boolean(shop.openSunday),
        hours: shop.hours,
        website: shop.website,
        priority: 'normal',
      }
      await addFavorite(userId, input)
    },
    [addFavorite, getFavoriteByShop, removeFavorite, userId],
  )

  const isShopFavorited = useCallback(
    (shop: ShopLocation) => isFavorited(shop.name, shop.latitude, shop.longitude),
    [isFavorited],
  )

  const handleSelectFavorite = useCallback(
    (shop: ShopLocation) => {
      const favorite = getFavoriteByShop(shop.name, shop.latitude, shop.longitude)
      if (favorite && selectedFavoriteId === favorite.id) {
        setSelectedFavoriteId(null)
        setSelectedShops([])
        setShops([])
        saveShopsToStorage([])
        return
      }
      if (favorite) setSelectedFavoriteId(favorite.id)
      setShops([shop])
      saveShopsToStorage([shop])
      setSelectedShops([shop.name])
      setActiveTab('shops')
      pushHierarchyFromMap([shop], `Favorite: ${shop.name}`)
      flyMapToShop(shop)
    },
    [flyMapToShop, getFavoriteByShop, pushHierarchyFromMap, selectedFavoriteId],
  )

  const handleShowMultipleFavorites = useCallback(
    (locations: ShopLocation[]) => {
      setSelectedFavoriteId(null)
      setShops(locations)
      saveShopsToStorage(locations)
      setSelectedShops(locations.map((loc) => loc.name))
      setActiveTab('shops')
      pushHierarchyFromMap(locations, 'Favorites')
    },
    [pushHierarchyFromMap],
  )

  const handleClearAll = useCallback(() => {
    setSelectedFavoriteId(null)
    setShops([])
    setSelectedShops([])
    saveShopsToStorage([])
    if (activeTab === 'shops') setActiveTab('chat')
  }, [activeTab])

  const handleGoBackward = useCallback(() => {
    const previousView = goBackward()
    if (!previousView || !mapPanelRef.current) return
    setShops(previousView.shops)
    saveShopsToStorage(previousView.shops)
    setSelectedShops([])
    setActiveTab('shops')
    mapPanelRef.current.setMapView(previousView.center, previousView.zoom)
  }, [goBackward])

  const handleGoForward = useCallback(() => {
    const nextView = goForward()
    if (!nextView || !mapPanelRef.current) return
    setShops(nextView.shops)
    saveShopsToStorage(nextView.shops)
    setSelectedShops([])
    setActiveTab('shops')
    mapPanelRef.current.setMapView(nextView.center, nextView.zoom)
  }, [goForward])

  useEffect(() => {
    patchMapMenuHandlers({
      toggleSidebar: () => setIsSidebarVisible((visible) => !visible),
      setTab: setActiveTab,
      locate: () => {
        void handleLocate()
      },
      goBackward: handleGoBackward,
      goForward: handleGoForward,
      addCustom: () => {
        setPendingCoordinates(undefined)
        setIsCreateModalOpen(true)
      },
      exportFavorites: () => exportFavoritesJson(favorites),
      clearAll: handleClearAll,
    })
  }, [favorites, handleClearAll, handleGoBackward, handleGoForward, handleLocate])

  useEffect(() => {
    setMapMenuView({
      sidebarVisible: isSidebarVisible,
      tab: activeTab,
      canGoBackward,
      canGoForward,
      favoriteCount: favorites.length,
      shopCount: shops.length,
    })
  }, [activeTab, canGoBackward, canGoForward, favorites.length, isSidebarVisible, shops.length])

  return (
    <div className="map-page feature-page relative flex h-full max-h-full min-h-0 w-full overflow-hidden text-ink">
      <MapSidebar
        activeTab={activeTab}
        shops={shops}
        selectedShops={selectedShops}
        detailShopFromParent={detailShopFromParent}
        isSidebarVisible={isSidebarVisible}
        sidebarWidth={sidebarWidth}
        isAuthenticated
        favorites={favorites}
        selectedFavoriteId={selectedFavoriteId}
        canGoBackward={canGoBackward}
        canGoForward={canGoForward}
        mapSource={mapScope.source}
        availableMapSources={mapScope.availableSources}
        onMapSourceChange={mapScope.setSource}
        canSwitchGroups={mapScope.canSwitchGroups}
        switchableGroups={mapScope.switchableGroups}
        selectedGroupId={mapScope.selectedGroupId}
        onGroupChange={mapScope.setSelectedGroupId}
        crmPins={crmPinsState.pins}
        crmPinsLoading={crmPinsState.isLoading}
        crmPinsErrorKey={crmPinsState.errorKey}
        crmSelectedKey={crmSelectedKey}
        onCrmPinSelect={handleCrmPinSelect}
        onCrmShowAll={handleCrmShowAll}
        onCrmRetry={() => {
          void crmPinsState.refresh()
        }}
        onCrmVisiblePinsChange={handleCrmVisiblePinsChange}
        isShopFavorited={isShopFavorited}
        onActiveTabChange={setActiveTab}
        onShopSelect={handleShopSelect}
        onShopFlyTo={handleShopFlyTo}
        onClearDetailFromParent={() => setDetailShopFromParent(null)}
        onWidthChange={updateWidth}
        onToggleFavorite={(shop) => void handleToggleFavorite(shop)}
        onEdit={(favorite) => {
          setEditingFavorite(favorite)
          setIsEditModalOpen(true)
        }}
        onRemove={(id) => void removeFavorite(id)}
        onSelectFavorite={handleSelectFavorite}
        onShowMultiple={handleShowMultipleFavorites}
        onClearAll={handleClearAll}
        onAddCustom={() => {
          setPendingCoordinates(undefined)
          setIsCreateModalOpen(true)
        }}
        onGoBackward={handleGoBackward}
        onGoForward={handleGoForward}
      />

      <MapPanel
        ref={mapPanelRef}
        shops={isExploreMap ? shops : isCrmLayer ? crmVisiblePins : []}
        userLocation={location}
        selectedShops={isCrmLayer ? (crmSelectedKey ? [crmSelectedKey] : selectedShops) : selectedShops}
        isAuthenticated
        isSidebarVisible={isSidebarVisible}
        onToggleSidebar={() => setIsSidebarVisible((visible) => !visible)}
        onMarkerClick={handleShopSelect}
        onLocationUpdate={handleMapLocationUpdate}
        onLocateRequest={(options) => handleLocate(options)}
        locationError={locationError}
        onAddLocation={(coords) => {
          if (!isExploreMap) {
            return
          }
          setPendingCoordinates(coords)
          setIsCreateModalOpen(true)
        }}
        onClearSelection={() => {
          setSelectedShops([])
          setSelectedFavoriteId(null)
          setCrmSelectedKey(null)
        }}
      />

      <FavoriteEditModal
        isOpen={isEditModalOpen}
        favorite={editingFavorite}
        onClose={() => {
          setIsEditModalOpen(false)
          setEditingFavorite(null)
        }}
        onSave={(favoriteId, updates) => {
          void updateFavorite(favoriteId, updates, {
            userId,
            email: user.email ?? null,
          }).then(() => {
            setIsEditModalOpen(false)
            setEditingFavorite(null)
          })
        }}
      />

      <CreateCustomLocationModal
        isOpen={isCreateModalOpen}
        pendingCoordinates={pendingCoordinates}
        userLocation={location}
        onClose={() => {
          setIsCreateModalOpen(false)
          setPendingCoordinates(undefined)
        }}
        onSave={(input) => {
          void addFavorite(userId, input).then(() => {
            setIsCreateModalOpen(false)
            setPendingCoordinates(undefined)
          })
        }}
      />
    </div>
  )
}
