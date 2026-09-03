import { openExternalUrl } from '@/utils/shared/api'

export type AppUpdateCheckStatus = 'upToDate' | 'available' | 'unavailable' | 'error'

export interface AppUpdateCheckResult {
  status: AppUpdateCheckStatus
  currentVersion: string
  latestVersion?: string
  downloadUrl?: string
  fileName?: string
  forceUpdate?: boolean
  message?: string
  /** Server-declared floor (dotted version) below which the build must update. */
  minSupportedVersion?: string
}

export type AppUpdateInstallPhase = 'downloading' | 'installing' | 'relaunching' | 'error'

export interface AppUpdateInstallProgress {
  phase: AppUpdateInstallPhase
  percent: number
  message?: string
}

/**
 * Asks the main process to check for a newer desktop build.
 * @returns Update-check result; falls back when the Electron bridge is missing.
 */
export async function checkAppForUpdates(): Promise<AppUpdateCheckResult> {
  const bridge = window.workbench?.app
  if (!bridge?.checkForUpdates) {
    return {
      status: 'unavailable',
      currentVersion: '—',
      message: 'Desktop bridge unavailable',
    }
  }
  try {
    return await bridge.checkForUpdates()
  } catch (error) {
    return {
      status: 'error',
      currentVersion: '',
      message: error instanceof Error ? error.message : 'Update check failed',
    }
  }
}

/**
 * Downloads and installs the hosted desktop build, then relaunches or quits.
 * @param downloadUrl - Manifest download URL.
 * @param fileName - Suggested installer file name.
 * @returns Nothing.
 */
export async function installAppUpdate(downloadUrl: string, fileName?: string): Promise<void> {
  const trimmed = downloadUrl.trim()
  if (!trimmed) {
    throw new Error('Missing installer URL')
  }
  if (!window.workbench?.app?.installUpdate) {
    await openExternalUrl(trimmed)
    return
  }
  await window.workbench.app.installUpdate(trimmed, fileName)
}

/**
 * Subscribes to installer progress from the main process.
 * @param listener - Progress callback.
 * @returns Unsubscribe function.
 */
export function subscribeAppUpdateInstallProgress(
  listener: (progress: AppUpdateInstallProgress) => void,
): () => void {
  return window.workbench?.app?.onInstallProgress?.(listener) ?? (() => undefined)
}

/**
 * Subscribes to the main-process background update scheduler (periodic +
 * OS-resume checks), so a forced result can trigger the blocking gate
 * without waiting for the next app launch.
 * @param listener - Check-result callback.
 * @returns Unsubscribe function.
 */
export function subscribeAppUpdateAvailable(
  listener: (result: AppUpdateCheckResult) => void,
): () => void {
  return window.workbench?.app?.onUpdateAvailable?.(listener) ?? (() => undefined)
}
