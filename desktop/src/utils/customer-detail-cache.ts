/**
 * In-memory LRU cache for customer detail (session only).
 * Hydrates detail pane and tab panels; cleared on app restart.
 */

import type { CustomerDetailTabId } from '@/components/admin/customer-detail/detail-shared'
import type {
  CustomerAddress,
  CustomerChannel,
  CustomerContact,
  CustomerDetail,
  CustomerVisitLog,
  CustomerWorkItem,
} from '@/types/customer'
import type { CustomerDocument } from '@/services/customer-documents-api'
import type { ObmOrder, Order } from '@/types/orders'

const MAX_ENTRIES = 30

/** Tab payload keys stored under a customer entry. */
export type CustomerDetailTabCacheKey =
  | 'channels'
  | 'addresses'
  | 'contacts'
  | 'workItems'
  | 'visitLogs'
  | 'orders'
  | 'followUps'
  | 'activity'
  | 'mail'
  | 'documents'
  | 'obm'

/** Cached ERP + NEXDOT order lists for the Orders tab. */
export interface CustomerOrdersCachePayload {
  crm: Order[]
  obm: ObmOrder[]
}

/** Per-tab cached payloads (extend as panels wire in). */
export interface CustomerDetailTabBag {
  channels?: CustomerChannel[]
  addresses?: CustomerAddress[]
  contacts?: CustomerContact[]
  workItems?: CustomerWorkItem[]
  visitLogs?: CustomerVisitLog[]
  orders?: CustomerOrdersCachePayload
  followUps?: unknown
  activity?: unknown
  mail?: unknown
  documents?: CustomerDocument[]
  obm?: unknown
}

/** One cached customer detail session. */
export interface CustomerDetailCacheEntry {
  customer: CustomerDetail
  channels: CustomerChannel[]
  activeTab: CustomerDetailTabId
  aboutOpen: boolean
  tabs: CustomerDetailTabBag
  updatedAt: number
}

const store = new Map<string, CustomerDetailCacheEntry>()

/**
 * Touches an entry so LRU eviction prefers older keys.
 * @param customerId - Cache key.
 * @param entry - Entry to re-insert at the end.
 * @returns Nothing.
 */
function touch(customerId: string, entry: CustomerDetailCacheEntry): void {
  store.delete(customerId)
  store.set(customerId, entry)
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) {
      break
    }
    store.delete(oldest)
  }
}

/**
 * Reads a cached customer detail entry.
 * @param customerId - Customer id.
 * @returns Entry or null.
 */
export function getCustomerDetailCache(
  customerId: string,
): CustomerDetailCacheEntry | null {
  const entry = store.get(customerId)
  if (!entry) {
    return null
  }
  touch(customerId, entry)
  return entry
}

/**
 * Writes or replaces a full cache entry.
 * @param customerId - Customer id.
 * @param entry - Entry without updatedAt (set here).
 * @returns Nothing.
 */
export function setCustomerDetailCache(
  customerId: string,
  entry: Omit<CustomerDetailCacheEntry, 'updatedAt'>,
): void {
  touch(customerId, { ...entry, updatedAt: Date.now() })
}

/**
 * Merges partial fields into an existing entry (or no-ops if missing).
 * @param customerId - Customer id.
 * @param patch - Fields to merge.
 * @returns Updated entry or null.
 */
export function patchCustomerDetailCache(
  customerId: string,
  patch: Partial<
    Pick<
      CustomerDetailCacheEntry,
      'customer' | 'channels' | 'activeTab' | 'aboutOpen' | 'tabs'
    >
  >,
): CustomerDetailCacheEntry | null {
  const prev = store.get(customerId)
  if (!prev) {
    return null
  }
  const next: CustomerDetailCacheEntry = {
    ...prev,
    ...patch,
    tabs: patch.tabs ? { ...prev.tabs, ...patch.tabs } : prev.tabs,
    updatedAt: Date.now(),
  }
  touch(customerId, next)
  return next
}

/**
 * Stores one tab payload under a customer.
 * @param customerId - Customer id.
 * @param tabKey - Tab bag key.
 * @param data - Payload.
 * @returns Nothing.
 */
export function setCustomerDetailTabCache<K extends CustomerDetailTabCacheKey>(
  customerId: string,
  tabKey: K,
  data: NonNullable<CustomerDetailTabBag[K]>,
): void {
  const prev = store.get(customerId)
  if (!prev) {
    return
  }
  touch(customerId, {
    ...prev,
    tabs: { ...prev.tabs, [tabKey]: data },
    updatedAt: Date.now(),
  })
}

/**
 * Reads one tab payload.
 * @param customerId - Customer id.
 * @param tabKey - Tab bag key.
 * @returns Cached payload or undefined.
 */
export function getCustomerDetailTabCache<K extends CustomerDetailTabCacheKey>(
  customerId: string,
  tabKey: K,
): CustomerDetailTabBag[K] | undefined {
  const entry = store.get(customerId)
  if (!entry) {
    return undefined
  }
  touch(customerId, entry)
  return entry.tabs[tabKey]
}

/**
 * Drops a customer from the cache (delete / hard invalidate).
 * @param customerId - Customer id.
 * @returns Nothing.
 */
export function invalidateCustomerDetailCache(customerId: string): void {
  store.delete(customerId)
}
