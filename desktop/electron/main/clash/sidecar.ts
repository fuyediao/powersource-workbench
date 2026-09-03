import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

import { runEnhance } from './enhance'
import { waitForMihomo } from './mihomo-api'
import { closeAllMihomoWs } from './mihomo-ws'
import { controllerSocketPath, ensureClashDirs } from './store'

let child: ChildProcess | null = null
let startedAt = 0

/**
 * Resolves the in-tree Go Mihomo binary (`src/lib/mihomo/bin`).
 * @returns Absolute path, or null when missing.
 */
export function resolveMihomoBinary(): string | null {
  const name = process.platform === 'win32' ? 'mihomo.exe' : 'mihomo'
  const roots = [
    path.join(process.env.APP_ROOT ?? app.getAppPath(), 'src/lib/mihomo/bin'),
    path.join(app.getAppPath(), 'src/lib/mihomo/bin'),
    path.join(process.resourcesPath, 'clash-sidecar'),
  ]
  for (const root of roots) {
    const candidate = path.join(root, name)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Whether the sidecar process is alive.
 * @returns True when running.
 */
export function isSidecarRunning(): boolean {
  return Boolean(child && child.exitCode === null)
}

/**
 * Milliseconds since the sidecar started, or 0.
 * @returns Uptime ms.
 */
export function sidecarUptimeMs(): number {
  if (!isSidecarRunning() || startedAt === 0) {
    return 0
  }
  return Date.now() - startedAt
}

/**
 * Removes a leftover unix socket so Mihomo can bind again.
 */
function unlinkControllerSocket(): void {
  if (process.platform === 'win32') {
    return
  }
  const sock = controllerSocketPath()
  try {
    if (fs.existsSync(sock)) {
      fs.unlinkSync(sock)
    }
  } catch {
    // Stale socket from a previous run.
  }
}

/**
 * Runs the full profile enhance pipeline and writes the resulting `runtime.yaml`.
 * Delegates to {@link runEnhance} (merge/script chains, TUN/DNS overlays, GeoCRM
 * controller injection over a unix socket / named pipe — never TCP 19091).
 * @returns Validation outcome (see {@link runEnhance}).
 */
export function writeRuntimeConfig(): Promise<{ status: string }> {
  return runEnhance()
}

/**
 * Stops the Mihomo sidecar if it is running.
 */
export function stopSidecar(): void {
  closeAllMihomoWs()
  if (!child) {
    unlinkControllerSocket()
    return
  }
  const proc = child
  child = null
  startedAt = 0
  try {
    proc.kill('SIGTERM')
  } catch {
    // Already exited.
  }
  unlinkControllerSocket()
}

/**
 * Starts or restarts Mihomo with the current runtime.yaml.
 * @returns Error message, or null on success / skipped (no binary).
 */
export async function restartSidecar(): Promise<string | null> {
  stopSidecar()
  const binary = resolveMihomoBinary()
  if (!binary) {
    return 'Mihomo sidecar binary is missing. Run npm run clash:prebuild (needs Go).'
  }
  const { runtimeFile, logs } = ensureClashDirs()
  if (!fs.existsSync(runtimeFile)) {
    await writeRuntimeConfig()
  }
  try {
    fs.chmodSync(binary, 0o755)
  } catch {
    // Windows or already executable.
  }
  const logStream = fs.createWriteStream(path.join(logs, 'mihomo.log'), { flags: 'a' })
  const proc = spawn(binary, ['-f', runtimeFile, '-d', path.dirname(runtimeFile)], {
    cwd: path.dirname(runtimeFile),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  proc.stdout?.pipe(logStream)
  proc.stderr?.pipe(logStream)
  proc.on('exit', () => {
    if (child === proc) {
      child = null
      startedAt = 0
    }
    closeAllMihomoWs()
  })
  child = proc
  startedAt = Date.now()
  const ready = await waitForMihomo()
  if (proc.exitCode != null && proc.exitCode !== 0) {
    child = null
    startedAt = 0
    return `Mihomo exited with code ${proc.exitCode}`
  }
  if (!ready) {
    return 'Mihomo controller socket did not become ready.'
  }
  return null
}

/**
 * Reads recent Mihomo log lines.
 * @returns Log lines.
 */
export function readSidecarLogs(): string[] {
  const logFile = path.join(ensureClashDirs().logs, 'mihomo.log')
  if (!fs.existsSync(logFile)) {
    return []
  }
  const text = fs.readFileSync(logFile, 'utf8')
  return text.split(/\r?\n/).filter(Boolean).slice(-400)
}
