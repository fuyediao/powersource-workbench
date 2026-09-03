import { BrowserWindow } from 'electron'

import { registerClashIpc } from './ipc'
import { stopSidecar } from './sidecar'
import { configureClashHost } from './host'

/**
 * Wires the Clash host (Mihomo sidecar + invoke IPC). UI lives in the renderer.
 * @param options - Main window getter (event emit target).
 */
export function setupClashHost(options: {
  getMainWindow: () => BrowserWindow | null
}): void {
  configureClashHost(options)
  registerClashIpc()
}

/**
 * Tears down the Mihomo sidecar (window close / quit).
 */
export function teardownClashHost(): void {
  stopSidecar()
}
