import type { FavoritePriority } from '@/types/favorite'
import type { HarnessItem } from '@/types/harness'

/** Minimal grounding metadata chunk (server may attach extra fields). */
export type GroundingChunk = unknown

export interface Coordinates {
  latitude: number
  longitude: number
}

/** Map pin / shop location returned by map or Ask responses. */
export interface ShopLocation {
  /** Stable id when projecting CRM / competitor rows onto the map. */
  id?: string
  name: string
  latitude: number
  longitude: number
  openSunday?: boolean
  address?: string
  country?: string | null
  stateProvince?: string | null
  city?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  postalCode?: string | null
  hours?: string
  distance?: string
  description?: string
  website?: string
  tags?: string[]
  /** Optional when a favorite is projected onto the map. */
  priority?: FavoritePriority
  /** Explicit pin color (CRM layers); overrides priority color when set. */
  pinColor?: string
}

/**
 * Stable marker / selection key for a shop pin.
 * @param shop - Shop location.
 * @returns Id when present, otherwise name.
 */
export function shopMarkerKey(shop: ShopLocation): string {
  return shop.id ?? shop.name
}

/** One saved map viewport in the location hierarchy stack. */
export interface LocationView {
  center: Coordinates
  zoom: number
  shops: ShopLocation[]
  query?: string
}

/** Backward/forward stacks around the current map viewport. */
export interface LocationHierarchy {
  current: LocationView
  history: LocationView[]
  forward: LocationView[]
}

/** One message in an AI chat thread. */
export interface ChatMessage {
  id: string
  role: 'user' | 'model' | 'system'
  content: string
  timestamp: number
  thinkingTime?: number
  groundingMetadata?: {
    groundingChunks: GroundingChunk[]
    groundingSupports?: unknown[]
    webSearchQueries?: string[]
  }
  relatedShops?: ShopLocation[]
  /** Data URL of a captured page screenshot (Ask AI sidebar only; not persisted). */
  screenshotDataUrl?: string
}

/** Chat surface: Ask (Q&A) or Agent (tool-using). Histories are not shared. */
export type ChatAssistantKind = 'ask' | 'agent'

/**
 * Coerces a stored assistant kind. Unknown values map to Ask.
 * @param value - Raw value from storage or the database
 * @returns `ask` or `agent`
 */
export function parseChatAssistantKind(value: unknown): ChatAssistantKind {
  return value === 'agent' ? 'agent' : 'ask'
}

/** Persisted chat history row (Supabase `history` table). */
export interface HistoryRecord {
  id: string
  userId: string
  query: string
  messages: ChatMessage[]
  locations: ShopLocation[]
  searchLocation?: Coordinates
  groupId?: string | null
  createdByUserId?: string | null
  assistantKind: ChatAssistantKind
  /** Local Codex thread id for same-device Harness resume. */
  harnessThreadId?: string | null
  /** Full projected workflow transcript for Harness restore. */
  harnessItems?: HarnessItem[]
  createdAt: string
  updatedAt: string
}

/** Payload when creating or updating a history record. */
export interface HistoryInput {
  query: string
  messages: ChatMessage[]
  locations: ShopLocation[]
  searchLocation?: Coordinates
  assistantKind?: ChatAssistantKind
  harnessThreadId?: string | null
  harnessItems?: HarnessItem[]
}
