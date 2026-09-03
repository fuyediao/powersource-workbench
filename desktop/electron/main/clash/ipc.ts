import { ipcMain } from 'electron'

import { CLASH_IPC_CHANNEL } from '../../shared/clash'
import { handleClashCommand } from './commands'
import { applyRuntimeToCore } from './runtime-state'
import { isServiceInstalled, isServiceRunning } from './service'
import { isSidecarRunning, writeRuntimeConfig } from './sidecar'
import { ensureClashDirs } from './store'

/**
 * Ensures Mihomo (sidecar or the privileged service) is running with the current profile
 * when the Clash pane opens.
 */
async function ensureSidecarOnShow(): Promise<void> {
  ensureClashDirs()
  const serviceRunning = (await isServiceInstalled()) && (await isServiceRunning())
  if (isSidecarRunning() || serviceRunning) {
    return
  }
  await writeRuntimeConfig()
  await applyRuntimeToCore()
}

/**
 * Registers `workbench:clash` IPC (sidecar lifecycle + Tauri-style invoke).
 */
export function registerClashIpc(): void {
  ipcMain.removeHandler(CLASH_IPC_CHANNEL)
  ipcMain.handle(CLASH_IPC_CHANNEL, async (_event, method: string, ...args: unknown[]) => {
    switch (method) {
      case 'ensureSidecar':
      case 'show':
        await ensureSidecarOnShow()
        return
      case 'hide':
      case 'setBounds':
      case 'setAppearance':
        return
      case 'invoke': {
        const cmd = String(args[0] ?? '')
        const payload = (args[1] ?? {}) as Record<string, unknown>
        return handleClashCommand(cmd, payload)
      }
      default:
        throw new Error(`Unknown clash IPC method: ${method}`)
    }
  })
}
