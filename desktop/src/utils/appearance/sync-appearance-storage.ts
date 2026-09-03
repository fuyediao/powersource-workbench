import {
  ACCENT_HUE_KEY,
  ACCENT_SHADE_KEY,
  applyAccent,
  applyClockAccent,
  CLOCK_ACCENT_HUE_KEY,
  CLOCK_ACCENT_SHADE_KEY,
  getStoredAccentHue,
  getStoredAccentShade,
  getStoredClockAccentHue,
  getStoredClockAccentShade,
} from '@/utils/appearance/accent'
import { applyTheme, getInitialTheme, THEME_KEY } from '@/hooks/use-theme'
import { applyIconRadius, getStoredIconRadius, ICON_RADIUS_KEY } from '@/utils/appearance/icon-radius'
import {
  applySearchRadius,
  getStoredSearchRadius,
  SEARCH_RADIUS_KEY,
} from '@/utils/appearance/search-radius'

/** localStorage keys that drive theme / accent / radius CSS across windows. */
export const APPEARANCE_STORAGE_KEYS = [
  THEME_KEY,
  ACCENT_HUE_KEY,
  ACCENT_SHADE_KEY,
  CLOCK_ACCENT_HUE_KEY,
  CLOCK_ACCENT_SHADE_KEY,
  ICON_RADIUS_KEY,
  SEARCH_RADIUS_KEY,
] as const

const APPEARANCE_BROADCAST = 'workbench-appearance'

/** Per-renderer id so BroadcastChannel sync ignores the posting window. */
const APPEARANCE_ORIGIN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * Whether a storage key belongs to shared appearance prefs.
 * @param key - Storage event key.
 * @returns True when Spotlight / other windows should re-apply appearance.
 */
export function isAppearanceStorageKey(key: string | null): boolean {
  return key != null && (APPEARANCE_STORAGE_KEYS as readonly string[]).includes(key)
}

/**
 * Applies theme, accents, and radii from localStorage onto this document.
 * Used at boot and when the main window updates prefs while Spotlight is open.
 * @returns Nothing.
 */
export function applyAppearanceFromLocalStorage(): void {
  applyTheme(getInitialTheme())
  applyAccent(getStoredAccentHue(), getStoredAccentShade())
  applyClockAccent(getStoredClockAccentHue(), getStoredClockAccentShade())
  applyIconRadius(getStoredIconRadius())
  applySearchRadius(getStoredSearchRadius())
}

/**
 * Notifies other renderers (Spotlight) that appearance localStorage changed.
 * Skips the posting window — BroadcastChannel delivers to the same context too,
 * and re-reading mid-update would clobber remapped black/white accents.
 * @returns Nothing.
 */
export function notifyAppearancePeers(): void {
  try {
    const channel = new BroadcastChannel(APPEARANCE_BROADCAST)
    channel.postMessage({ type: 'sync', originId: APPEARANCE_ORIGIN_ID })
    channel.close()
  } catch {
    // BroadcastChannel unavailable — storage events may still sync peers.
  }
}

/**
 * Subscribes to cross-window appearance updates (BroadcastChannel + storage).
 * @param onSync - Callback after localStorage is re-applied.
 * @returns Unsubscribe function.
 */
export function subscribeAppearancePeers(onSync: () => void): () => void {
  /**
   * Re-applies appearance then invokes the listener.
   * @returns Nothing.
   */
  function sync(): void {
    applyAppearanceFromLocalStorage()
    onSync()
  }

  /**
   * Handles localStorage changes from another window.
   * @param event - Storage event.
   * @returns Nothing.
   */
  function handleStorage(event: StorageEvent): void {
    if (event.storageArea !== localStorage || !isAppearanceStorageKey(event.key)) {
      return
    }
    sync()
  }

  window.addEventListener('storage', handleStorage)

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(APPEARANCE_BROADCAST)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data
      if (
        data !== null &&
        typeof data === 'object' &&
        'originId' in data &&
        (data as { originId?: unknown }).originId === APPEARANCE_ORIGIN_ID
      ) {
        return
      }
      sync()
    }
  } catch {
    channel = null
  }

  return () => {
    window.removeEventListener('storage', handleStorage)
    channel?.close()
  }
}
