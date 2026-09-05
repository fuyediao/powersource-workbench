import { app } from 'electron'
import {
  DESKTOP_RELEASE_CHANNEL,
  compareDottedVersions,
  compareReleaseIds,
  dottedVersionFromText,
  formatLocalReleaseId,
  parseReleaseId,
} from '../shared/app-release'
import type { AppUpdateCheckResult } from '../shared/ipc'

type DesktopReleaseManifest = {
  ok: boolean
  platform: string
  release: string
  channel: string
  version: string
  fileName: string
  fileSize: number
  downloadUrl: string
  minSupportedVersion: string
}

type DesktopPlatformSlug = 'macos-m' | 'macos-i' | 'windows'

/**
 * Resolves the public desktop-download origin (`https://download.{domain}`).
 * @returns Origin without a trailing slash.
 */
export function resolveDownloadOrigin(): string {
  const domain = process.env.VITE_DEPLOYMENT_DOMAIN?.trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  if (domain) {
    return `https://download.${domain}`
  }
  return 'https://download.powersource.app'
}

/**
 * Maps the running OS/arch to a desktop download slug.
 * @returns Platform slug, or null when this build has no feed.
 */
export function desktopPlatformSlug(): DesktopPlatformSlug | null {
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return 'macos-m'
  }
  if (process.platform === 'darwin' && (process.arch === 'x64' || process.arch === 'ia32')) {
    return 'macos-i'
  }
  if (process.platform === 'win32') {
    return 'windows'
  }
  return null
}

/**
 * Checks the hosted desktop feed for a newer installer.
 * Official/stable releases outrank any beta. An available update is a
 * non-blocking notification unless the running build is below the server's
 * `minSupportedVersion` floor, in which case a packaged build must force the
 * update (see {@link isBelowMinSupportedVersion}).
 * @returns Update-check result for Settings, launch, and the background scheduler.
 */
export async function checkForDesktopUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = formatLocalReleaseId(DESKTOP_RELEASE_CHANNEL, app.getVersion())
  const platform = desktopPlatformSlug()
  if (!platform) {
    return {
      status: 'unavailable',
      currentVersion,
      message: 'Update checks are not available on this platform.',
    }
  }

  const origin = resolveDownloadOrigin()
  const feedUrls = [
    `${origin}/${platform}/latest`,
    `${origin}/${platform}/beta`,
    `${origin}/${platform}/${currentVersion}`,
  ]
  try {
    let manifest: DesktopReleaseManifest | null = null
    for (const url of feedUrls) {
      manifest = await fetchReleaseManifest(url)
      if (manifest) {
        break
      }
    }
    if (!manifest) {
      return {
        status: 'error',
        currentVersion,
        message: 'No desktop build is published for this platform yet.',
      }
    }
    const latestVersion = (manifest.release || manifest.version).trim() || currentVersion
    const minSupportedVersion = manifest.minSupportedVersion.trim() || undefined
    if (compareReleaseIds(latestVersion, currentVersion) > 0) {
      return {
        status: 'available',
        currentVersion,
        latestVersion,
        downloadUrl: manifest.downloadUrl,
        fileName: manifest.fileName,
        forceUpdate: app.isPackaged && isBelowMinSupportedVersion(currentVersion, minSupportedVersion),
        minSupportedVersion,
      }
    }
    return {
      status: 'upToDate',
      currentVersion,
      latestVersion,
      downloadUrl: manifest.downloadUrl,
      minSupportedVersion,
    }
  } catch (error) {
    return {
      status: 'error',
      currentVersion,
      message: error instanceof Error ? error.message : 'Update check failed',
    }
  }
}

/**
 * Whether the running build sits below the server-declared update floor.
 * @param currentVersion - Local release id (e.g. `beta0.1.0`).
 * @param minSupportedVersion - Manifest floor (dotted, e.g. `0.1.5`), if any.
 * @returns True when `currentVersion` must be treated as a forced update.
 */
function isBelowMinSupportedVersion(currentVersion: string, minSupportedVersion?: string): boolean {
  if (!minSupportedVersion) {
    return false
  }
  const currentDotted = parseReleaseId(currentVersion).version
  const floorDotted = dottedVersionFromText(minSupportedVersion)
  if (!currentDotted || !floorDotted) {
    return false
  }
  return compareDottedVersions(currentDotted, floorDotted) < 0
}

/**
 * Fetches an installer manifest without downloading the binary.
 * Prefers JSON; otherwise uses a redirect Location or the feed URL itself.
 * @param url - Absolute feed URL.
 * @returns Manifest, or null on 404.
 */
async function fetchReleaseManifest(url: string): Promise<DesktopReleaseManifest | null> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 404) {
    return null
  }
  const redirectUrl = redirectLocation(response, url)
  if (redirectUrl) {
    await response.body?.cancel()
    return artifactManifest(url, redirectUrl)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Update feed returned HTTP ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('json')) {
    const body = (await response.json()) as Partial<DesktopReleaseManifest>
    if (!body.ok || typeof body.downloadUrl !== 'string') {
      throw new Error('Update feed returned an invalid manifest')
    }
    const release = typeof body.release === 'string' ? body.release : ''
    const version = typeof body.version === 'string' ? body.version : parseReleaseId(release).version
    return {
      ok: true,
      platform: typeof body.platform === 'string' ? body.platform : '',
      release,
      channel: typeof body.channel === 'string' ? body.channel : parseReleaseId(release || version).channel,
      version,
      fileName: typeof body.fileName === 'string' ? body.fileName : '',
      fileSize: typeof body.fileSize === 'number' ? body.fileSize : 0,
      downloadUrl: body.downloadUrl,
      minSupportedVersion: typeof body.minSupportedVersion === 'string' ? body.minSupportedVersion : '',
    }
  }
  await response.body?.cancel()
  return artifactManifest(url, url)
}

/**
 * Builds a synthetic manifest when the feed URL is the installer itself.
 * @param feedUrl - Requested feed URL.
 * @param downloadUrl - File URL to open.
 * @returns Manifest using the version embedded in the feed path.
 */
function artifactManifest(feedUrl: string, downloadUrl: string): DesktopReleaseManifest {
  const release = lastPathSegment(feedUrl)
  const parsed = parseReleaseId(release)
  return {
    ok: true,
    platform: '',
    release,
    channel: parsed.channel,
    version: parsed.version,
    fileName: '',
    fileSize: 0,
    downloadUrl,
    minSupportedVersion: '',
  }
}

/**
 * Reads a redirect Location header as an absolute URL.
 * @param response - Fetch response.
 * @param requestUrl - Original request URL.
 * @returns Absolute location, or null when the response is not a redirect.
 */
function redirectLocation(response: Response, requestUrl: string): string | null {
  if (response.status < 300 || response.status >= 400) {
    return null
  }
  const location = response.headers.get('location')
  if (!location) {
    return null
  }
  return new URL(location, requestUrl).toString()
}

/**
 * Returns the last non-empty path segment of a URL.
 * @param url - Absolute URL.
 * @returns Path segment, or empty string.
 */
function lastPathSegment(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? ''
  } catch {
    return ''
  }
}
