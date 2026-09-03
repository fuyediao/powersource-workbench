import { applyAppearanceFromLocalStorage } from '@/utils/appearance/sync-appearance-storage'

/**
 * Applies saved theme and accent/radius prefs before React mounts.
 * Reads localStorage so Spotlight and the main window match Settings immediately.
 * @returns Nothing.
 */
export function applyBootAppearance(): void {
  applyAppearanceFromLocalStorage()
}

/**
 * Enables CSS accent transitions after the first paint (avoids boot flicker).
 * @returns Nothing.
 */
export function enableAccentAnimationAfterPaint(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.classList.add('accent-animated')
    })
  })
}
