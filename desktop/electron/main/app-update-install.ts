import { app, shell, type WebContents } from 'electron'
import { spawn, execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { createWriteStream } from 'node:fs'
import {
  APP_UPDATE_PROGRESS_EVENT,
  type AppUpdateInstallProgress,
} from '../shared/ipc'
const execFileAsync = promisify(execFile)

const INSTALLER_EXT = /\.(dmg|exe|msi|zip|pkg)$/i

let installInFlight = false

/**
 * Downloads the hosted installer and applies it (Windows NSIS / macOS app bundle).
 * @param sender - Renderer to receive progress events.
 * @param downloadUrl - Manifest `downloadUrl`.
 * @param fileName - Suggested installer file name.
 * @returns Nothing. May quit the process after a successful install.
 */
export async function installDesktopUpdate(
  sender: WebContents,
  downloadUrl: string,
  fileName: string,
): Promise<void> {
  if (installInFlight) {
    return
  }
  if (!isAllowedUpdateUrl(downloadUrl)) {
    throw new Error('Update download URL is not allowed.')
  }
  installInFlight = true
  try {
    sendProgress(sender, { phase: 'downloading', percent: 0 })
    const dest = await downloadInstaller(sender, downloadUrl, fileName)
    sendProgress(sender, { phase: 'installing', percent: 100 })
    const applied = await applyInstaller(dest)
    sendProgress(sender, { phase: 'relaunching', percent: 100 })
    finishInstall(dest, applied)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update install failed'
    sendProgress(sender, { phase: 'error', percent: 0, message })
    throw error
  } finally {
    installInFlight = false
  }
}

/**
 * Whether `url` is a GeoCRM desktop-release host.
 * @param raw - Absolute URL.
 * @returns True when the installer may be downloaded.
 */
export function isAllowedUpdateUrl(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return false
  }
  if (parsed.protocol === 'http:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    return false
  }
  if (allowedUpdateHosts().has(parsed.hostname)) {
    return true
  }
  return parsed.pathname.includes('/storage/v1/object/public/desktop-releases/')
}

/**
 * Hosts that may serve desktop installer bytes (API feed or Supabase Storage).
 * @returns Hostname allowlist.
 */
function allowedUpdateHosts(): Set<string> {
  const hosts = new Set([
    'download.powersource.app',
    'supabase.powersource.app',
    'api.powersource.app',
  ])
  const domain = process.env.VITE_DEPLOYMENT_DOMAIN?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  if (domain) {
    hosts.add(`download.${domain}`)
    hosts.add(`supabase.${domain}`)
    hosts.add(`api.${domain}`)
  }
  return hosts
}

/**
 * Downloads the installer to a temp file and reports percent complete.
 * @param sender - Renderer for progress.
 * @param downloadUrl - HTTPS installer URL.
 * @param fileName - Suggested name.
 * @returns Absolute path to the downloaded file.
 */
async function downloadInstaller(
  sender: WebContents,
  downloadUrl: string,
  fileName: string,
): Promise<string> {
  const response = await fetch(downloadUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30 * 60 * 1000),
  })
  if (!response.ok) {
    throw new Error(`Installer download failed (HTTP ${response.status})`)
  }
  if (!response.body) {
    throw new Error('Installer download returned an empty body')
  }
  const total = Number(response.headers.get('content-length') || 0)
  const destDir = path.join(app.getPath('temp'), 'geocrm-updates')
  await fs.mkdir(destDir, { recursive: true })
  const dest = path.join(destDir, safeInstallerName(fileName, downloadUrl))
  const file = createWriteStream(dest)
  const reader = response.body.getReader()
  let received = 0
  let lastSent = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      received += value.byteLength
      await new Promise<void>((resolve, reject) => {
        file.write(value, (err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        })
      })
      const percent = total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0
      if (percent !== lastSent) {
        lastSent = percent
        sendProgress(sender, { phase: 'downloading', percent })
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      file.end((err: Error | null | undefined) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  }
  sendProgress(sender, { phase: 'downloading', percent: 100 })
  return dest
}

type AppliedInstaller = 'mac-replaced' | 'mac-opened' | 'windows-nsis' | 'windows-msi'

/**
 * Applies a downloaded installer for the current OS.
 * @param filePath - Local installer path.
 * @returns How the installer was applied.
 */
async function applyInstaller(filePath: string): Promise<AppliedInstaller> {
  const ext = path.extname(filePath).toLowerCase()
  if (process.platform === 'darwin' && ext === '.dmg') {
    return installMacDmg(filePath)
  }
  if (process.platform === 'win32' && ext === '.exe') {
    return 'windows-nsis'
  }
  if (process.platform === 'win32' && ext === '.msi') {
    return 'windows-msi'
  }
  throw new Error(`Unsupported installer type: ${ext || 'unknown'}`)
}

/**
 * Mounts a DMG and copies the .app onto this installation.
 * Falls back to opening the disk image in Finder when copy is not possible.
 * @param dmgPath - Downloaded disk image.
 * @returns Whether the bundle was replaced or opened for a manual copy.
 */
async function installMacDmg(dmgPath: string): Promise<'mac-replaced' | 'mac-opened'> {
  const destApp = path.resolve(process.execPath, '../../..')
  if (!destApp.endsWith('.app')) {
    throw new Error('Could not locate the PowerSource Workbench.app bundle to replace.')
  }
  const mount = path.join(os.tmpdir(), `geocrm-dmg-${process.pid}`)
  await fs.rm(mount, { recursive: true, force: true })
  let replaced = false
  try {
    await execFileAsync('hdiutil', ['attach', dmgPath, '-nobrowse', '-mountpoint', mount])
    try {
      const sourceApp = await findAppBundle(mount)
      await execFileAsync('ditto', [sourceApp, destApp])
      replaced = true
    } finally {
      await execFileAsync('hdiutil', ['detach', mount, '-quiet']).catch(() => undefined)
    }
  } catch {
    // Copy failed or the image could not be mounted; open the DMG instead.
  }
  if (replaced) {
    return 'mac-replaced'
  }
  const opened = await shell.openPath(dmgPath)
  if (opened) {
    throw new Error(opened)
  }
  return 'mac-opened'
}

/**
 * Finds the first .app bundle under a mounted disk image.
 * @param mount - Mount point.
 * @returns Absolute .app path.
 */
async function findAppBundle(mount: string): Promise<string> {
  const entries = await fs.readdir(mount, { withFileTypes: true })
  const match = entries.find((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
  if (!match) {
    throw new Error('The disk image does not contain a PowerSource Workbench.app bundle.')
  }
  return path.join(mount, match.name)
}

/**
 * Starts the Windows installer or relaunches after a macOS bundle replace.
 * @param filePath - Downloaded installer.
 * @param applied - How the installer was applied.
 * @returns Nothing. Quits this process.
 */
function finishInstall(filePath: string, applied: AppliedInstaller): void {
  if (applied === 'windows-nsis') {
    const child = spawn(filePath, ['/S'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    app.quit()
    return
  }
  if (applied === 'windows-msi') {
    const child = spawn('msiexec', ['/i', filePath, '/qn'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    app.quit()
    return
  }
  if (applied === 'mac-opened') {
    app.quit()
    return
  }
  app.relaunch()
  app.quit()
}

/**
 * Restricts installer names to a basename with a known extension.
 * @param fileName - Manifest file name.
 * @param downloadUrl - Fallback URL path.
 * @returns Safe file name.
 */
function safeInstallerName(fileName: string, downloadUrl: string): string {
  const raw = path.basename(fileName.trim() || lastPathSegment(downloadUrl) || 'PowerSource-Workbench-update')
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_')
  if (INSTALLER_EXT.test(cleaned)) {
    return cleaned
  }
  if (process.platform === 'darwin') {
    return `${cleaned || 'PowerSource-Workbench-update'}.dmg`
  }
  if (process.platform === 'win32') {
    return `${cleaned || 'PowerSource-Workbench-update'}.exe`
  }
  return `${cleaned || 'PowerSource-Workbench-update'}.zip`
}

/**
 * Last non-empty path segment of a URL.
 * @param url - Absolute URL.
 * @returns Path segment.
 */
function lastPathSegment(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    return decodeURIComponent(parts[parts.length - 1] ?? '')
  } catch {
    return ''
  }
}

/**
 * Pushes install progress to the renderer.
 * @param sender - Target webContents.
 * @param payload - Progress payload.
 * @returns Nothing.
 */
function sendProgress(sender: WebContents, payload: AppUpdateInstallProgress): void {
  if (sender.isDestroyed()) {
    return
  }
  sender.send(APP_UPDATE_PROGRESS_EVENT, payload)
}
