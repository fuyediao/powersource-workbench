/**
 * Migrates legacy Home Apps tile ids onto the current catalog.
 * Maps `function-ai-chat` → Ask and drops removed Agent / Harness tiles.
 * @param savedIds - Persisted order.
 * @returns Migrated ids (may still include unknown ids; catalog apply drops them).
 */
export function migrateHomeAppOrderIds(savedIds: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of savedIds) {
    if (id === 'function-agent' || id === 'function-harness') {
      continue
    }
    const nextId = id === 'function-ai-chat' ? 'function-ask' : id
    if (seen.has(nextId)) continue
    out.push(nextId)
    seen.add(nextId)
  }
  return out
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
    const ids = await window.workbench.homeAppOrder.get(userId)
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
  await window.workbench.homeAppOrder.set(userId, appIds)
}
