import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'

import { clashDataDir, ensureClashDirs, loadVergeStore, patchVergeStore } from './store'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip') as typeof import('adm-zip')

/** WebDAV remote directory name for Workbench Clash backups. */
const WEBDAV_BACKUP_DIR = 'workbench-clash-backup'

/** Local backup file row (`list_local_backup`). */
export type LocalBackupFile = {
  filename: string
  path: string
  last_modified: string
  content_length: number
}

/** WebDAV backup file row (`list_webdav_backup`). */
export type WebDavBackupFile = {
  filename: string
  href: string
  last_modified: string
  content_length: number
  content_type: string
  tag: string
}

/** Absolute path of the local backups directory (created on demand). */
function localBackupDir(): string {
  const dir = path.join(clashDataDir(), 'backups')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Backup-file platform label matching Clash Verge's `env::consts::OS` naming. */
function platformLabel(): string {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}

/**
 * Builds a backup zip in memory: `profiles/*`, `profiles.json`, `verge.json` (minus WebDAV
 * creds), and `dns_config.yaml` when present. Mirrors Clash Verge's `core::backup::create_backup`.
 * @returns Generated filename and zip buffer.
 */
function buildBackupZip(): { filename: string; buffer: Buffer } {
  const { root, profiles, indexFile } = ensureClashDirs()
  const zip = new AdmZip()

  for (const entry of fs.readdirSync(profiles)) {
    const abs = path.join(profiles, entry)
    if (fs.statSync(abs).isFile()) {
      zip.addLocalFile(abs, 'profiles')
    }
  }
  if (fs.existsSync(indexFile)) {
    zip.addLocalFile(indexFile, '')
  }

  const verge = { ...loadVergeStore() } as Record<string, unknown>
  delete verge.webdav_url
  delete verge.webdav_username
  delete verge.webdav_password
  zip.addFile('verge.json', Buffer.from(`${JSON.stringify(verge, null, 2)}\n`, 'utf8'))

  const dnsPath = path.join(root, 'dns_config.yaml')
  if (fs.existsSync(dnsPath)) {
    zip.addLocalFile(dnsPath, '')
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .replace(/-\d+Z$/, '')
  const filename = `${platformLabel()}-backup-${timestamp}.zip`
  return { filename, buffer: zip.toBuffer() }
}

/**
 * Restores a backup zip buffer over `userData/clash/` (profiles/, profiles.json, verge.json,
 * dns_config.yaml), preserving the caller's current WebDAV credentials (backups never contain
 * them). Matches Clash Verge's `finalize_restored_verge_config`.
 * @param buffer - Backup zip contents.
 */
function restoreBackupZip(buffer: Buffer): void {
  const { root } = ensureClashDirs()
  const currentVerge = loadVergeStore()
  const webdav = {
    webdav_url: currentVerge.webdav_url,
    webdav_username: currentVerge.webdav_username,
    webdav_password: currentVerge.webdav_password,
  }
  const zip = new AdmZip(buffer)
  zip.extractAllTo(root, true)
  patchVergeStore(webdav)
}

/**
 * Creates a local backup zip under `userData/clash/backups/` (`create_local_backup`).
 * @returns Written filename.
 */
export function createLocalBackup(): string {
  const { filename, buffer } = buildBackupZip()
  fs.writeFileSync(path.join(localBackupDir(), filename), buffer)
  return filename
}

/**
 * Lists local backups, most recent filename first (`list_local_backup`).
 * @returns Backup rows.
 */
export function listLocalBackup(): LocalBackupFile[] {
  const dir = localBackupDir()
  const rows: LocalBackupFile[] = []
  for (const filename of fs.readdirSync(dir)) {
    const abs = path.join(dir, filename)
    const stat = fs.statSync(abs)
    if (!stat.isFile()) {
      continue
    }
    rows.push({
      filename,
      path: abs,
      last_modified: stat.mtime.toISOString(),
      content_length: stat.size,
    })
  }
  return rows.sort((a, b) => b.filename.localeCompare(a.filename))
}

/**
 * Deletes a local backup file (`delete_local_backup`). Missing files are a no-op.
 * @param filename - Backup file name.
 */
export function deleteLocalBackup(filename: string): void {
  const target = path.join(localBackupDir(), filename)
  if (fs.existsSync(target)) {
    fs.unlinkSync(target)
  }
}

/**
 * Restores a local backup file over the current Clash data directory (`restore_local_backup`).
 * @param filename - Backup file name.
 */
export function restoreLocalBackup(filename: string): void {
  const target = path.join(localBackupDir(), filename)
  if (!fs.existsSync(target)) {
    throw new Error(`Backup file not found: ${filename}`)
  }
  restoreBackupZip(fs.readFileSync(target))
}

/**
 * Copies an external `.zip` into the local backups directory (`import_local_backup`).
 * @param source - Absolute path to the source zip (from a file picker).
 * @returns Imported filename.
 */
export function importLocalBackup(source: string): string {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`Backup file not found: ${source}`)
  }
  if (path.extname(source).toLowerCase() !== '.zip') {
    throw new Error('Only .zip backup files are supported')
  }
  const filename = path.basename(source)
  const target = path.join(localBackupDir(), filename)
  if (target === source) {
    return filename
  }
  if (fs.existsSync(target)) {
    throw new Error(`Backup file already exists: ${filename}`)
  }
  fs.copyFileSync(source, target)
  return filename
}

/**
 * Copies a local backup file to a user-selected destination (`export_local_backup`).
 * @param filename - Backup file name.
 * @param destination - Absolute destination path (from a save dialog).
 */
export function exportLocalBackup(filename: string, destination: string): void {
  const source = path.join(localBackupDir(), filename)
  if (!fs.existsSync(source)) {
    throw new Error(`Backup file not found: ${filename}`)
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

/** Resolved WebDAV connection settings. */
type WebDavConfig = { baseUrl: string; username: string; password: string }

/**
 * Reads WebDAV settings from the Verge store.
 * @returns Config, or null when not configured.
 */
function webdavConfig(): WebDavConfig | null {
  const verge = loadVergeStore()
  if (!verge.webdav_url || !verge.webdav_username || !verge.webdav_password) {
    return null
  }
  return {
    baseUrl: verge.webdav_url.replace(/\/+$/, ''),
    username: verge.webdav_username,
    password: verge.webdav_password,
  }
}

/**
 * Persists WebDAV settings (`save_webdav_config`).
 * @param url - Server base URL.
 * @param username - Basic-auth username.
 * @param password - Basic-auth password.
 */
export function saveWebdavConfig(url: string, username: string, password: string): void {
  patchVergeStore({ webdav_url: url, webdav_username: username, webdav_password: password })
}

/**
 * Issues an authenticated WebDAV request against `${baseUrl}/${WEBDAV_BACKUP_DIR}/...`.
 * @param config - WebDAV connection settings.
 * @param method - HTTP verb (`PROPFIND`, `MKCOL`, `PUT`, `GET`, `DELETE`).
 * @param relPath - Path under the backup directory (empty for the directory itself).
 * @param init - Optional body/headers.
 * @returns Fetch response.
 */
async function webdavRequest(
  config: WebDavConfig,
  method: string,
  relPath: string,
  init?: { body?: Buffer; headers?: Record<string, string> },
): Promise<Response> {
  const url = `${config.baseUrl}/${WEBDAV_BACKUP_DIR}${relPath ? `/${relPath}` : '/'}`
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64')
  return fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': 'workbench-electron/clash WebDAV-Client',
      ...init?.headers,
    },
    body: init?.body ? new Uint8Array(init.body) : undefined,
  })
}

/**
 * Ensures the remote backup directory exists (`MKCOL`, tolerating "already exists").
 * @param config - WebDAV connection settings.
 */
async function ensureWebdavDir(config: WebDavConfig): Promise<void> {
  const res = await webdavRequest(config, 'MKCOL', '')
  if (res.ok || res.status === 405 || res.status === 409) {
    return
  }
  throw new Error(`Failed to create WebDAV backup directory (HTTP ${res.status})`)
}

/**
 * Requires a configured WebDAV client, throwing the same message Clash Verge shows.
 * @returns Config.
 */
function requireWebdavConfig(): WebDavConfig {
  const config = webdavConfig()
  if (!config) {
    throw new Error('Unable to create web dav client, please make sure the webdav config is correct')
  }
  return config
}

/**
 * Creates a backup and uploads it to WebDAV (`create_webdav_backup`).
 */
export async function createWebdavBackup(): Promise<void> {
  const config = requireWebdavConfig()
  await ensureWebdavDir(config)
  const { filename, buffer } = buildBackupZip()
  const res = await webdavRequest(config, 'PUT', encodeURIComponent(filename), { body: buffer })
  if (!res.ok) {
    throw new Error(`Failed to upload to WebDAV (HTTP ${res.status})`)
  }
}

/** Minimal PROPFIND multistatus response shape once namespace prefixes are stripped. */
type PropfindResponse = {
  href?: string
  propstat?: { prop?: Record<string, unknown> } | Array<{ prop?: Record<string, unknown> }>
}

/**
 * Lists WebDAV backups via `PROPFIND` (Depth 1) against the backup directory
 * (`list_webdav_backup`).
 * @returns Backup rows.
 */
export async function listWebdavBackup(): Promise<WebDavBackupFile[]> {
  const config = requireWebdavConfig()
  await ensureWebdavDir(config)
  const res = await webdavRequest(config, 'PROPFIND', '', {
    headers: { Depth: '1', 'Content-Type': 'application/xml' },
    body: Buffer.from(
      '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><getlastmodified/><getcontentlength/><getcontenttype/><getetag/></prop></propfind>',
      'utf8',
    ),
  })
  if (!res.ok && res.status !== 207) {
    throw new Error(`Failed to list WebDAV backup files (HTTP ${res.status})`)
  }
  const xml = await res.text()
  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false }).parse(xml) as {
    multistatus?: { response?: PropfindResponse | PropfindResponse[] }
  }
  const responses = parsed.multistatus?.response
  const list = Array.isArray(responses) ? responses : responses ? [responses] : []

  const files: WebDavBackupFile[] = []
  for (const entry of list) {
    const href = typeof entry.href === 'string' ? entry.href : ''
    if (!href || href.endsWith('/')) {
      continue
    }
    const propstat = Array.isArray(entry.propstat) ? entry.propstat[0] : entry.propstat
    const prop = propstat?.prop ?? {}
    const filename = decodeURIComponent(href.split('/').filter(Boolean).pop() ?? '')
    files.push({
      filename,
      href,
      last_modified: String(prop['getlastmodified'] ?? ''),
      content_length: Number(prop['getcontentlength'] ?? 0) || 0,
      content_type: String(prop['getcontenttype'] ?? ''),
      tag: String(prop['getetag'] ?? ''),
    })
  }
  return files
}

/**
 * Deletes a WebDAV backup file (`delete_webdav_backup`).
 * @param filename - Backup file name.
 */
export async function deleteWebdavBackup(filename: string): Promise<void> {
  const config = requireWebdavConfig()
  const res = await webdavRequest(config, 'DELETE', encodeURIComponent(filename))
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete WebDAV backup file (HTTP ${res.status})`)
  }
}

/**
 * Downloads and restores a WebDAV backup over the current Clash data directory
 * (`restore_webdav_backup`).
 * @param filename - Backup file name.
 */
export async function restoreWebdavBackup(filename: string): Promise<void> {
  const config = requireWebdavConfig()
  const res = await webdavRequest(config, 'GET', encodeURIComponent(filename))
  if (!res.ok) {
    throw new Error(`Failed to download WebDAV backup file (HTTP ${res.status})`)
  }
  restoreBackupZip(Buffer.from(await res.arrayBuffer()))
}
