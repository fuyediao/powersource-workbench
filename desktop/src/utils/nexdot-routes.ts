/**
 * Parses `/nexdot/users/:id`.
 *
 * @param path - Pathname or null
 * @returns Decoded user id, or null when the path does not match
 */
export function parseNexdotUserDetailPath(path: string | null): string | null {
  if (!path) return null
  const match = /^\/nexdot\/users\/([^/]+)\/?$/.exec(path)
  const id = match?.[1]?.trim()
  return id && id.length > 0 ? decodeURIComponent(id) : null
}
