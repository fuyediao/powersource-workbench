/**
 * One-shot migration for the retired Univer-era local workspace
 * (`office-workspace.sqlite`): uploads every row as a personal `office_files`
 * Supabase row, then deletes the local database. Best-effort — a failed
 * upload is skipped (logged) rather than blocking the rest of the migration
 * or the app's sign-in flow. Web builds and installs without the legacy
 * database are no-ops (`window.geocrm?.officeWorkspaceLegacy` is undefined,
 * or `export()` resolves to an empty array).
 */

import { officeSaveFileName, serializeOfficeFile } from '@/office/office-exchange'
import { createOfficeFile } from '@/services/office-files-api'

const MIGRATED_FLAG_KEY = 'geocrm-office-workspace-legacy-migrated-v1'

/**
 * Uploads the retired local Office workspace (if any) to Supabase for the
 * signed-in user, once per installation, then retires the local database.
 * @param ownerUserId - Signed-in user id (personal scope for migrated rows).
 * @returns Nothing.
 */
export async function migrateLegacyOfficeWorkspace(ownerUserId: string): Promise<void> {
  if (localStorage.getItem(MIGRATED_FLAG_KEY) === 'true') {
    return
  }
  const bridge = window.geocrm?.officeWorkspaceLegacy
  if (!bridge) {
    return
  }

  let rows: LegacyOfficeWorkspaceFile[] = []
  try {
    rows = await bridge.export()
  } catch (error) {
    console.error('[office-workspace-legacy-migration] export:', error)
    return
  }

  for (const row of rows) {
    try {
      const bytes = new Uint8Array(await (await serializeOfficeFile(row.kind, row.snapshot)).arrayBuffer())
      const name = officeSaveFileName(row.name, row.kind)
      await createOfficeFile(row.kind, name, { ownerUserId }, bytes)
    } catch (error) {
      console.error(`[office-workspace-legacy-migration] upload ${row.id}:`, error)
    }
  }

  try {
    await bridge.retire()
  } catch (error) {
    console.error('[office-workspace-legacy-migration] retire:', error)
  }
  localStorage.setItem(MIGRATED_FLAG_KEY, 'true')
}
