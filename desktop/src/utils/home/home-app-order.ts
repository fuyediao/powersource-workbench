/**
 * Migrates legacy Home Apps tile ids onto the current catalog.
 * Maps `function-ai-chat` → Ask and `function-agent` → Harness, then places
 * Harness immediately after Ask when the saved order still uses the old
 * default (Harness next to Clash or Settings).
 * @param savedIds - Persisted order.
 * @returns Migrated ids (may still include unknown ids; catalog apply drops them).
 */
export function migrateHomeAppOrderIds(savedIds: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of savedIds) {
    const nextId =
      id === 'function-ai-chat'
        ? 'function-ask'
        : id === 'function-agent'
          ? 'function-harness'
          : id
    if (seen.has(nextId)) continue
    out.push(nextId)
    seen.add(nextId)
  }
  return relocateHarnessBesideAsk(out)
}

const ASK_APP_ID = 'function-ask'
const HARNESS_APP_ID = 'function-harness'
const CLASH_APP_ID = 'function-clash'
const SETTINGS_APP_ID = 'function-settings'

/**
 * Moves Harness to immediately after Ask when the saved order still matches
 * the previous catalog (Harness beside Clash or Settings). Custom placements
 * are left unchanged.
 * @param ids - Deduplicated tile ids.
 * @returns Ids with Harness relocated when the old default is detected.
 */
function relocateHarnessBesideAsk(ids: string[]): string[] {
  const harnessAt = ids.indexOf(HARNESS_APP_ID)
  if (harnessAt < 0) {
    return ids
  }
  const askAt = ids.indexOf(ASK_APP_ID)
  if (askAt >= 0 && harnessAt === askAt + 1) {
    return ids
  }
  const before = harnessAt > 0 ? ids[harnessAt - 1] : null
  const after = harnessAt < ids.length - 1 ? ids[harnessAt + 1] : null
  const looksLikeOldDefault = before === CLASH_APP_ID || after === SETTINGS_APP_ID
  if (!looksLikeOldDefault) {
    return ids
  }
  const without = ids.filter((id) => id !== HARNESS_APP_ID)
  const insertAfter = without.indexOf(ASK_APP_ID)
  if (insertAfter < 0) {
    return [HARNESS_APP_ID, ...without]
  }
  return [...without.slice(0, insertAfter + 1), HARNESS_APP_ID, ...without.slice(insertAfter + 1)]
}

/**
 * Applies a saved Home Apps id list onto the built-in feature catalog.
 * Unknown ids are dropped; new catalog tiles append in catalog order.
 * @param apps - Built-in feature tiles.
 * @param savedIds - Persisted order.
 * @returns Catalog tiles in saved order.
 */
export function applySavedHomeAppOrder<T extends { id: string }>(
  apps: readonly T[],
  savedIds: readonly string[],
): T[] {
  const byId = new Map(apps.map((app) => [app.id, app]))
  const used = new Set<string>()
  const ordered: T[] = []
  for (const id of migrateHomeAppOrderIds(savedIds)) {
    const app = byId.get(id)
    if (!app || used.has(id)) {
      continue
    }
    ordered.push(app)
    used.add(id)
  }
  for (const app of apps) {
    if (!used.has(app.id)) {
      ordered.push(app)
    }
  }
  return ordered
}

/**
 * Reads the local Home Apps order from SQLite via IPC.
 * @param userId - Auth user id.
 * @returns Saved app ids, or an empty list.
 */
export async function loadHomeAppOrder(userId: string): Promise<string[]> {
  try {
    const ids = await window.geocrm.homeAppOrder.get(userId)
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

/**
 * Writes the local Home Apps order to SQLite via IPC.
 * @param userId - Auth user id.
 * @param appIds - Ordered feature tile ids.
 * @returns Nothing.
 */
export async function saveHomeAppOrder(userId: string, appIds: string[]): Promise<void> {
  await window.geocrm.homeAppOrder.set(userId, appIds)
}
