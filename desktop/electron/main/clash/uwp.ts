import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Exempts every installed UWP app (AppContainer) from Windows' loopback isolation so
 * Store apps can reach the local mixed-port proxy, matching Clash Verge's bundled
 * `enableLoopback.exe` (`invoke_uwp_tool`). No-op on macOS/Linux, matching the Rust stub.
 * Requires elevation: spawns PowerShell via UAC (`Start-Process -Verb RunAs`).
 */
export async function invokeUwpTool(): Promise<void> {
  if (process.platform !== 'win32') {
    return
  }
  const script = [
    '$ErrorActionPreference = "Continue"',
    'Get-AppxPackage | ForEach-Object {',
    '  $pfn = $_.PackageFamilyName',
    '  if ($pfn) { & CheckNetIsolation.exe LoopbackExempt -a -n="$pfn" 2>$null }',
    '}',
  ].join('\r\n')
  const scriptPath = path.join(os.tmpdir(), `workbench-uwp-loopback-${Date.now()}.ps1`)
  fs.writeFileSync(scriptPath, script, 'utf8')
  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Start-Process powershell.exe -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${scriptPath}' -Verb RunAs -Wait`,
    ])
  } finally {
    try {
      fs.unlinkSync(scriptPath)
    } catch {
      // Best-effort cleanup.
    }
  }
}
