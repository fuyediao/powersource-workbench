import fs from 'node:fs'

import { loadProfilesIndex, profilePath, saveProfilesIndex } from './store'
import type { ClashProfileItem } from './types'

/** Per-uid setTimeout/setInterval handles for scheduled remote profile refreshes. */
const timers = new Map<string, NodeJS.Timeout>()

/** Callback the host wires in so a completed refresh can re-apply the current profile. */
let onProfileUpdated: (uid: string) => void = () => {}

/**
 * Registers the callback invoked after a scheduled profile refresh completes.
 * @param handler - Called with the refreshed profile uid.
 */
export function setProfileTimerListener(handler: (uid: string) => void): void {
  onProfileUpdated = handler
}

/**
 * Downloads a remote profile's latest body and writes it over the existing file.
 * @param item - Remote profile row.
 */
async function refreshRemoteProfile(item: ClashProfileItem): Promise<void> {
  if (!item.url) {
    return
  }
  const response = await fetch(item.url, { headers: { 'User-Agent': 'clash-verge/GeoCRM' } })
  if (!response.ok) {
    throw new Error(`Update failed (${response.status})`)
  }
  fs.writeFileSync(profilePath(item.file), await response.text(), 'utf8')
  const index = loadProfilesIndex()
  const target = index.items.find((row) => row.uid === item.uid)
  if (target) {
    target.updated = Date.now()
    saveProfilesIndex(index)
  }
}

/**
 * Runs one scheduled refresh, notifying the host so it can reload Mihomo when this is the
 * active profile.
 * @param uid - Profile uid.
 */
async function runScheduledRefresh(uid: string): Promise<void> {
  const item = loadProfilesIndex().items.find((row) => row.uid === uid)
  if (!item) {
    return
  }
  try {
    await refreshRemoteProfile(item)
    onProfileUpdated(uid)
  } catch {
    // Leave the existing profile file in place; the next scheduled tick retries.
  }
}

/**
 * Milliseconds until a remote profile's next scheduled refresh (`update_interval` is minutes).
 * @param item - Remote profile row.
 * @returns Delay in ms, or null when auto-update is off / not configured.
 */
function nextDelayMs(item: ClashProfileItem): number | null {
  const option = item.option
  if (!option || option.allow_auto_update === false) {
    return null
  }
  const interval = option.update_interval
  if (!interval || interval <= 0) {
    return null
  }
  const intervalMs = interval * 60 * 1000
  const elapsed = Date.now() - item.updated
  return Math.max(intervalMs - elapsed, 0)
}

/**
 * Rebuilds every scheduled refresh timer from the current profiles index. Safe to call after
 * any profile create/update/delete/reorder.
 */
export function refreshProfileTimers(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer)
  }
  timers.clear()

  for (const item of loadProfilesIndex().items) {
    if (item.type !== 'remote') {
      continue
    }
    const delay = nextDelayMs(item)
    if (delay === null) {
      continue
    }
    const timer = setTimeout(() => {
      void runScheduledRefresh(item.uid).finally(() => refreshProfileTimers())
    }, delay)
    timers.set(item.uid, timer)
  }
}

/**
 * Stops every scheduled refresh timer (app quit).
 */
export function stopProfileTimers(): void {
  for (const timer of timers.values()) {
    clearTimeout(timer)
  }
  timers.clear()
}

/**
 * Milliseconds-since-epoch of a profile's next scheduled refresh (`get_next_update_time`).
 * @param uid - Profile uid.
 * @returns Epoch ms, or null when not scheduled.
 */
export function getNextUpdateTime(uid: string): number | null {
  const item = loadProfilesIndex().items.find((row) => row.uid === uid)
  if (!item) {
    return null
  }
  const delay = nextDelayMs(item)
  return delay === null ? null : Date.now() + delay
}
