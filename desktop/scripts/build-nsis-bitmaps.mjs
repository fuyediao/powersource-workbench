/**
 * Regenerates NSIS MUI bitmaps (`build/installerHeader.bmp`,
 * `build/installerSidebar.bmp`) from `public/app-icon.png`.
 * Windows-only: uses System.Drawing via PowerShell.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const scriptPath = path.join(electronRoot, 'scripts/build-nsis-bitmaps.ps1')

if (process.platform !== 'win32') {
  throw new Error('build-nsis-bitmaps requires Windows (System.Drawing).')
}

execFileSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
  { stdio: 'inherit', cwd: electronRoot },
)
