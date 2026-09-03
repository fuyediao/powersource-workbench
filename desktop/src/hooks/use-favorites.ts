/**
 * React hook for map favorites (Supabase `favorites` table).
 */

import { useCallback, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import type { Favorite, FavoriteInput, FavoritePriority } from '@/types/favorite'
import type { Json } from '@/types/database'

/**
 * Resolves the active group id for a user.
 *
 * @param userId - Auth user id
 * @returns Group id or null
 */
async function getGroupIdForUser(userId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return data?.group_id ?? null
}

/**
 * Flexible match: name overlap or near coordinates (~111 m).
 *
 * @param favorite - Favorite row
 * @param shopName - Shop name
 * @param lat - Latitude
 * @param lng - Longitude
 * @returns Whether the favorite matches the shop
 */
function matchesFavorite(
  favorite: Favorite,
  shopName: string,
  lat: number,
  lng: number,
): boolean {
  const normalizedFavName = favorite.shopName.trim().toLowerCase().replace(/\s+/g, ' ')
  const normalizedShopName = shopName.trim().toLowerCase().replace(/\s+/g, ' ')
  const nameMatch =
    normalizedFavName === normalizedShopName ||
    normalizedFavName.includes(normalizedShopName) ||
    normalizedShopName.includes(normalizedFavName)
  const coordMatch =
    Math.abs(favorite.latitude - lat) < 0.001 &&
    Math.abs(favorite.longitude - lng) < 0.001
  return nameMatch || coordMatch
}

/**
 * Maps a Supabase favorites row to Favorite.
 *
 * @param row - Database row
 * @returns Typed favorite
 */
function mapRowToFavorite(row: {
  id: string
  user_id: string
  shop_name: string
  latitude: number
  longitude: number
  address: string | null
  country: string | null
  state_province: string | null
  city: string | null
  address_line1: string | null
  address_line2: string | null
  postal_code: string | null
  open_sunday: boolean | null
  hours: string | null
  website: string | null
  note: string | null
  image_urls: Json | null
  tags: Json | null
  priority: string | null
  group_id: string | null
  created_by_user_id: string | null
  created_at: string
  updated_at: string
  last_modified_by_user_id: string | null
  last_modified_by_email: string | null
  last_modified_at: string | null
}): Favorite {
  const rawPriority = row.priority ?? undefined
  const priority: FavoritePriority | undefined =
    rawPriority === 'important' || rawPriority === 'unimportant' || rawPriority === 'normal'
      ? rawPriority
      : 'normal'
  let imageUrls: string[] = []
  let tags: string[] = []
  if (Array.isArray(row.image_urls)) {
    imageUrls = row.image_urls.filter((u): u is string => typeof u === 'string')
  }
  if (Array.isArray(row.tags)) {
    tags = row.tags.filter((t): t is string => typeof t === 'string')
  }
  return {
    id: row.id,
    userId: row.user_id,
    shopName: row.shop_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    address: row.address ?? undefined,
    country: row.country,
    stateProvince: row.state_province,
    city: row.city,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    postalCode: row.postal_code,
    openSunday: Boolean(row.open_sunday),
    hours: row.hours ?? undefined,
    website: row.website ?? undefined,
    note: row.note ?? undefined,
    imageUrls,
    tags,
    priority,
    groupId: row.group_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastModifiedByUserId: row.last_modified_by_user_id,
    lastModifiedByEmail: row.last_modified_by_email,
    lastModifiedAt: row.last_modified_at,
  }
}

export interface UseFavoritesReturn {
  favorites: Favorite[]
  favoritesCount: number
  isLoading: boolean
  error: string | null
  loadFavorites: (userId: string) => Promise<void>
  addFavorite: (userId: string, input: FavoriteInput) => Promise<Favorite | null>
  removeFavorite: (favoriteId: string) => Promise<boolean>
  updateFavorite: (
    favoriteId: string,
    updates: Partial<FavoriteInput>,
    meta?: { userId?: string; email?: string | null },
  ) => Promise<Favorite | null>
  isFavorited: (shopName: string, lat: number, lng: number) => boolean
  getFavoriteByShop: (shopName: string, lat: number, lng: number) => Favorite | undefined
  clearFavorites: () => void
}

/**
 * Loads and mutates map favorites for the signed-in user (group + personal merge).
 *
 * @returns Favorites state and CRUD helpers
 */
export function useFavorites(): UseFavoritesReturn {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const favoritesCount = useMemo(() => favorites.length, [favorites.length])

  const loadFavorites = useCallback(async (userId: string) => {
    if (!isSupabaseConfigured || !supabase) return
    setIsLoading(true)
    setError(null)
    try {
      const groupId = await getGroupIdForUser(userId)
      if (groupId) {
        const [groupRes, personalRes] = await Promise.all([
          supabase
            .from('favorites')
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: false }),
          supabase
            .from('favorites')
            .select('*')
            .is('group_id', null)
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
        ])
        if (groupRes.error) throw groupRes.error
        if (personalRes.error) throw personalRes.error
        const byId = new Map<string, Favorite>()
        for (const row of personalRes.data ?? []) {
          byId.set(row.id, mapRowToFavorite(row))
        }
        for (const row of groupRes.data ?? []) {
          byId.set(row.id, mapRowToFavorite(row))
        }
        setFavorites(
          Array.from(byId.values()).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          ),
        )
      } else {
        const { data, error: fetchError } = await supabase
          .from('favorites')
          .select('*')
          .is('group_id', null)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        if (fetchError) throw fetchError
        setFavorites((data ?? []).map(mapRowToFavorite))
      }
    } catch (err) {
      console.error('Load favorites error:', err)
      setError('Failed to load favorites')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const addFavorite = useCallback(
    async (userId: string, input: FavoriteInput): Promise<Favorite | null> => {
      if (!isSupabaseConfigured || !supabase) {
        setError('Supabase is not configured')
        return null
      }
      const existing = favorites.find((f) =>
        matchesFavorite(f, input.shopName, input.latitude, input.longitude),
      )
      if (existing) return existing
      setError(null)
      try {
        const groupId = await getGroupIdForUser(userId)
        const { data, error: insertError } = await supabase
          .from('favorites')
          .insert({
            user_id: userId,
            shop_name: input.shopName,
            latitude: input.latitude,
            longitude: input.longitude,
            address: input.address ?? null,
            country: input.country ?? null,
            state_province: input.stateProvince ?? null,
            city: input.city ?? null,
            address_line1: input.addressLine1 ?? null,
            address_line2: input.addressLine2 ?? null,
            postal_code: input.postalCode ?? null,
            open_sunday: input.openSunday,
            hours: input.hours ?? null,
            website: input.website ?? null,
            note: input.note ?? '',
            image_urls: (input.imageUrls ?? []) as unknown as Json,
            tags: (input.tags ?? []) as unknown as Json,
            priority: input.priority ?? 'normal',
            created_by_user_id: userId,
            group_id: groupId ?? null,
          })
          .select()
          .single()
        if (insertError) throw insertError
        const created = mapRowToFavorite(data)
        setFavorites((prev) => [created, ...prev])
        return created
      } catch (err) {
        console.error('Add favorite error:', err)
        setError('Failed to add favorite')
        return null
      }
    },
    [favorites],
  )

  const removeFavorite = useCallback(async (favoriteId: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false
    setError(null)
    try {
      const { error: deleteError } = await supabase.from('favorites').delete().eq('id', favoriteId)
      if (deleteError) throw deleteError
      setFavorites((prev) => prev.filter((f) => f.id !== favoriteId))
      return true
    } catch (err) {
      console.error('Remove favorite error:', err)
      setError('Failed to remove favorite')
      return false
    }
  }, [])

  const updateFavorite = useCallback(
    async (
      favoriteId: string,
      updates: Partial<FavoriteInput>,
      meta?: { userId?: string; email?: string | null },
    ): Promise<Favorite | null> => {
      if (!isSupabaseConfigured || !supabase) return null
      setError(null)
      try {
        const now = new Date().toISOString()
        const updateData: {
          updated_at: string
          last_modified_by_user_id: string | null
          last_modified_by_email: string | null
          last_modified_at: string | null
          shop_name?: string
          address?: string | null
          country?: string | null
          state_province?: string | null
          city?: string | null
          address_line1?: string | null
          address_line2?: string | null
          postal_code?: string | null
          latitude?: number
          longitude?: number
          hours?: string | null
          website?: string | null
          open_sunday?: boolean
          note?: string | null
          image_urls?: Json
          tags?: Json
          priority?: string
        } = {
          updated_at: now,
          last_modified_by_user_id: meta?.userId ?? null,
          last_modified_by_email: meta?.email ?? null,
          last_modified_at: now,
        }
        if (updates.shopName !== undefined) updateData.shop_name = updates.shopName
        if (updates.address !== undefined) updateData.address = updates.address ?? null
        if (updates.country !== undefined) updateData.country = updates.country ?? null
        if (updates.stateProvince !== undefined) {
          updateData.state_province = updates.stateProvince ?? null
        }
        if (updates.city !== undefined) updateData.city = updates.city ?? null
        if (updates.addressLine1 !== undefined) {
          updateData.address_line1 = updates.addressLine1 ?? null
        }
        if (updates.addressLine2 !== undefined) {
          updateData.address_line2 = updates.addressLine2 ?? null
        }
        if (updates.postalCode !== undefined) updateData.postal_code = updates.postalCode ?? null
        if (updates.latitude !== undefined) updateData.latitude = updates.latitude
        if (updates.longitude !== undefined) updateData.longitude = updates.longitude
        if (updates.hours !== undefined) updateData.hours = updates.hours ?? null
        if (updates.website !== undefined) updateData.website = updates.website ?? null
        if (updates.openSunday !== undefined) updateData.open_sunday = updates.openSunday
        if (updates.note !== undefined) updateData.note = updates.note ?? null
        if (updates.imageUrls !== undefined) {
          updateData.image_urls = updates.imageUrls as unknown as Json
        }
        if (updates.tags !== undefined) updateData.tags = updates.tags as unknown as Json
        if (updates.priority !== undefined) updateData.priority = updates.priority

        const { data, error: updateError } = await supabase
          .from('favorites')
          .update(updateData)
          .eq('id', favoriteId)
          .select()
          .single()
        if (updateError) throw updateError
        const updated = mapRowToFavorite(data)
        setFavorites((prev) => prev.map((f) => (f.id === favoriteId ? updated : f)))
        return updated
      } catch (err) {
        console.error('Update favorite error:', err)
        setError('Failed to update favorite')
        return null
      }
    },
    [],
  )

  const isFavorited = useCallback(
    (shopName: string, lat: number, lng: number): boolean =>
      favorites.some((f) => matchesFavorite(f, shopName, lat, lng)),
    [favorites],
  )

  const getFavoriteByShop = useCallback(
    (shopName: string, lat: number, lng: number): Favorite | undefined =>
      favorites.find((f) => matchesFavorite(f, shopName, lat, lng)),
    [favorites],
  )

  const clearFavorites = useCallback(() => {
    setFavorites([])
  }, [])

  return {
    favorites,
    favoritesCount,
    isLoading,
    error,
    loadFavorites,
    addFavorite,
    removeFavorite,
    updateFavorite,
    isFavorited,
    getFavoriteByShop,
    clearFavorites,
  }
}
