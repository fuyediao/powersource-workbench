import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  INSTALL_LANGUAGE_FILE,
  parseInstallLanguage,
  type InstallAppLanguage,
} from '../shared/install-language'

/**
 * Reads the Settings language chosen in the Windows installer.
 * Prefers userData (survives extract-on-upgrade) then the file next to the exe.
 * @returns Supported locale, or null when the installer did not write one.
 */
export function readInstallLanguage(): InstallAppLanguage | null {
  const candidates = [
    path.join(app.getPath('userData'), INSTALL_LANGUAGE_FILE),
    path.join(path.dirname(process.execPath), INSTALL_LANGUAGE_FILE),
  ]
  for (const file of candidates) {
    try {
      const parsed = parseInstallLanguage(fs.readFileSync(file))
      if (parsed) {
        return parsed
      }
    } catch {
      // Missing or unreadable; try the next location.
    }
  }
  return null
}
