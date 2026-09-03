/**
 * Imperative bridge so non-React modules (Aura editor link clicks) can open
 * URLs with the same in-app / system-browser preference as {@link useLinkOpen}.
 */

import { openExternalUrl } from '@/utils/shared/api'

type OpenUrlHandler = (url: string) => void

let openUrlHandler: OpenUrlHandler | null = null

/**
 * Registers the active signed-in open-URL handler (called from LinkOpenProvider).
 *
 * @param handler - Opens http(s) per user preference, or null on unmount
 */
export function setAppOpenUrlHandler(handler: OpenUrlHandler | null): void {
  openUrlHandler = handler
}

/**
 * Opens an http(s), mailto, or tel URL using the signed-in preference when available.
 * `mailto:` / `tel:` always go through the OS handler (Mail, Phone Link, Phone, etc.).
 *
 * @param url - Absolute URL
 */
export function openAppUrl(url: string): void {
  const trimmed = url.trim()
  if (!trimmed) return

  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
    void openExternalUrl(trimmed)
    return
  }

  if (!trimmed.startsWith('https:') && !trimmed.startsWith('http:')) {
    return
  }

  if (openUrlHandler) {
    openUrlHandler(trimmed)
    return
  }

  void openExternalUrl(trimmed)
}
