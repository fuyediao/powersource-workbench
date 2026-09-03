import { mihomoRequest } from './mihomo-api'
import { isProcessElevated, isServiceInstalled, isServiceRunning, preferSidecar } from './service'
import { isSidecarRunning, restartSidecar, stopSidecar } from './sidecar'
import { ensureClashDirs, loadVergeStore } from './store'
import type { ClashRunState } from './types'

/**
 * Applies the freshly written `runtime.yaml` to whichever Mihomo instance should be running:
 * the privileged daemon (hot-reloaded over the shared controller socket) when installed and
 * running, otherwise the unprivileged sidecar (restarted as a child process).
 * @returns Error message, or null on success.
 */
export async function applyRuntimeToCore(): Promise<string | null> {
  const serviceInstalled = await isServiceInstalled()
  const serviceRunning = serviceInstalled && (await isServiceRunning())

  if (serviceRunning) {
    stopSidecar()
    const { runtimeFile } = ensureClashDirs()
    const result = await mihomoRequest('/configs?force=true', {
      method: 'PUT',
      body: JSON.stringify({ path: runtimeFile }),
    })
    return result.ok ? null : `Failed to reload the privileged service (HTTP ${result.status})`
  }
  return restartSidecar()
}

/**
 * Builds the run-state snapshot the Clash UI polls (`get_runtime_state`), matching the shape
 * `RunState` derives are computed from — not recomputed client-side.
 * @returns Run-state snapshot.
 */
export async function computeRunState(): Promise<ClashRunState> {
  const serviceInstalled = await isServiceInstalled()
  const serviceRunning = serviceInstalled && (await isServiceRunning())
  const sidecarRunning = isSidecarRunning()
  const verge = loadVergeStore()
  const wantsTun = Boolean(verge.enable_tun_mode)
  const needsAttention = wantsTun && !serviceRunning && !preferSidecar()
  const isAdmin = await isProcessElevated()

  return {
    mode: serviceRunning ? 'Service' : sidecarRunning ? 'Sidecar' : 'NotRunning',
    service: !serviceInstalled ? 'notInstalled' : serviceRunning ? 'ready' : 'unavailable',
    serviceUnavailableReason:
      serviceInstalled && !serviceRunning
        ? 'The privileged service is installed but is not running.'
        : null,
    pendingAction: needsAttention ? 'install' : null,
    sidecarAllowed: true,
    isAdmin,
    opInFlight: false,
    serviceUsable: serviceRunning,
    tunCapable: serviceRunning || isAdmin,
    serviceNeedsAttention: needsAttention,
  }
}
