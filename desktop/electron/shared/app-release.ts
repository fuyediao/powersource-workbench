/** Shipping channel for this desktop build. Flip to `stable` for official releases. */
export const DESKTOP_RELEASE_CHANNEL = 'beta' as const

export type DesktopReleaseChannel = 'beta' | 'stable'

export type ParsedDesktopRelease = {
  channel: DesktopReleaseChannel
  version: string
  rank: number
}

/**
 * Splits a release id into channel and dotted version.
 * Official ids (`v0.1.0`, `0.1.0`) outrank any beta, including `beta1.0.0`.
 * @param id - Folder or version string.
 * @returns Channel, dotted version, and rank (stable=1, beta=0).
 */
export function parseReleaseId(id: string): ParsedDesktopRelease {
  const version = dottedVersionFromText(id)
  const lower = id.trim().toLowerCase()
  if (lower.startsWith('beta') || lower.includes('-beta')) {
    return { channel: 'beta', version, rank: 0 }
  }
  return { channel: 'stable', version, rank: 1 }
}

/**
 * Builds the local release id from this build's channel and `app.getVersion()`.
 * @param channel - Shipping channel.
 * @param version - Dotted or tagged version from Electron.
 * @returns Folder-style id such as `beta0.1.0` or `v0.1.0`.
 */
export function formatLocalReleaseId(channel: DesktopReleaseChannel, version: string): string {
  const parsed = parseReleaseId(version)
  const dotted = parsed.version || version
  if (channel === 'beta' || parsed.channel === 'beta') {
    return `beta${dotted}`
  }
  return `v${dotted}`
}

/**
 * Ranks two release ids. Official/stable always beats beta; dotted versions
 * are compared only within the same channel.
 * @param a - Left release id.
 * @param b - Right release id.
 * @returns Positive when a > b, negative when a < b, otherwise 0.
 */
export function compareReleaseIds(a: string, b: string): number {
  const left = parseReleaseId(a)
  const right = parseReleaseId(b)
  if (left.rank !== right.rank) {
    return left.rank - right.rank
  }
  return compareDottedVersions(left.version, right.version)
}

/**
 * Compares dotted versions (major.minor.patch).
 * @param a - Left version.
 * @param b - Right version.
 * @returns Positive when a > b, negative when a < b, otherwise 0.
 */
export function compareDottedVersions(a: string, b: string): number {
  const left = parseDottedVersion(a)
  const right = parseDottedVersion(b)
  for (let i = 0; i < 3; i += 1) {
    const delta = left[i] - right[i]
    if (delta !== 0) {
      return delta
    }
  }
  return 0
}

/**
 * Extracts a dotted version from a string such as beta0.1.0 or v0.1.0.
 * @param value - Version or release id.
 * @returns Dotted version, or empty string.
 */
export function dottedVersionFromText(value: string): string {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(value)
  if (!match) {
    return ''
  }
  return `${match[1]}.${match[2]}.${match[3]}`
}

/**
 * Parses a dotted version from a string such as beta0.1.0.
 * @param value - Version or release id.
 * @returns [major, minor, patch].
 */
function parseDottedVersion(value: string): [number, number, number] {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(value)
  if (!match) {
    return [0, 0, 0]
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}
