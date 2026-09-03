import { PLATFORM } from '../../shared/platform'
import { darwinShell } from './darwin/shell'
import { linuxShell } from './linux/shell'
import type { PlatformShell } from './types'
import { windowsShell } from './windows/shell'

/**
 * Resolves the platform shell for the current OS.
 * @returns Windows, macOS, or Linux shell implementation.
 */
export function getPlatformShell(): PlatformShell {
  switch (PLATFORM) {
    case 'win32':
      return windowsShell
    case 'darwin':
      return darwinShell
    default:
      return linuxShell
  }
}

export type { PlatformShell } from './types'
export { showBrowserWindow } from './show-window'
