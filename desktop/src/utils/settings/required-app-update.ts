import type { AppUpdateCheckResult } from '@/utils/settings/app-updates'

const REQUIRE_EVENT = 'geocrm:require-app-update'

let pending: AppUpdateCheckResult | null = null

/**
 * Shows the blocking required-update overlay (packaged builds only).
 * @param result - Check result that includes a download URL.
 * @returns Nothing.
 */
export function requireAppUpdate(result: AppUpdateCheckResult): void {
  if (result.status !== 'available' || !result.downloadUrl) {
    return
  }
  pending = result
  window.dispatchEvent(new CustomEvent(REQUIRE_EVENT, { detail: result }))
}

/**
 * Subscribes to required-update overlays.
 * @param listener - Called with the pending result (or null).
 * @returns Unsubscribe function.
 */
export function subscribeRequiredAppUpdate(
  listener: (result: AppUpdateCheckResult | null) => void,
): () => void {
  listener(pending)
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<AppUpdateCheckResult>).detail
    listener(detail)
  }
  window.addEventListener(REQUIRE_EVENT, handler)
  return () => {
    window.removeEventListener(REQUIRE_EVENT, handler)
  }
}
