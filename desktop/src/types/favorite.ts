/** Fixed priority for map favorites (marker color). */
export type FavoritePriority = 'important' | 'normal' | 'unimportant'

/** Saved map favorite row (Supabase `favorites`). */
export interface Favorite {
  id: string
  userId: string
  shopName: string
  latitude: number
  longitude: number
  address?: string
  country?: string | null
  stateProvince?: string | null
  city?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  postalCode?: string | null
  openSunday: boolean
  hours?: string
  website?: string
  note?: string
  imageUrls?: string[]
  tags: string[]
  priority?: FavoritePriority
  groupId?: string | null
  createdByUserId?: string | null
  createdAt: string
  updatedAt: string
  lastModifiedByUserId?: string | null
  lastModifiedByEmail?: string | null
  lastModifiedAt?: string | null
}

/** Payload when creating or updating a favorite. */
export interface FavoriteInput {
  shopName: string
  latitude: number
  longitude: number
  address?: string
  country?: string | null
  stateProvince?: string | null
  city?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  postalCode?: string | null
  openSunday: boolean
  hours?: string
  website?: string
  note?: string
  imageUrls?: string[]
  tags?: string[]
  priority?: FavoritePriority
}

/** Map right-click coordinates pending custom-location create. */
export interface PendingCoordinates {
  latitude: number
  longitude: number
}
