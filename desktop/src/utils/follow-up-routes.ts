/**
 * Admin follow-ups path helpers (list / company / entity timeline).
 */

import type { FollowUpEntityType } from '@/types/follow-up'

const LIST_PATH = '/admin/follow-ups'

/** Entity ref used when opening a company-merged timeline. */
export interface FollowUpEntityRef {
  type: FollowUpEntityType
  id: string
}

/** Parsed drill route under `/admin/follow-ups`. */
export type FollowUpDrillRoute =
  | { kind: 'list' }
  | {
      kind: 'company'
      name: string
      entities: FollowUpEntityRef[]
    }
  | {
      kind: 'entity'
      type: FollowUpEntityType
      id: string
      name?: string
    }

/**
 * Strips query/hash from an admin shell path for nav matching.
 * @param path - Raw path (may include `?query`).
 * @returns Path without query or hash.
 */
export function stripAdminPathQuery(path: string): string {
  const noHash = path.split('#')[0] ?? path
  return noHash.split('?')[0] ?? noHash
}

/**
 * Whether a value is a known follow-up entity type.
 * @param value - Candidate string.
 * @returns True when customer | lead | opportunity | kol | competitor.
 */
function isFollowUpEntityType(value: string): value is FollowUpEntityType {
  return (
    value === 'customer' ||
    value === 'lead' ||
    value === 'opportunity' ||
    value === 'kol' ||
    value === 'competitor'
  )
}

/**
 * Parses `e` query: `type:id,type:id,...`.
 * @param raw - Raw `e` query value.
 * @returns Valid entity refs.
 */
export function parseFollowUpEntityList(raw: string | null): FollowUpEntityRef[] {
  if (!raw?.trim()) {
    return []
  }
  const out: FollowUpEntityRef[] = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    const colon = trimmed.indexOf(':')
    if (colon <= 0) {
      continue
    }
    const type = trimmed.slice(0, colon)
    const id = trimmed.slice(colon + 1).trim()
    if (!isFollowUpEntityType(type) || !id) {
      continue
    }
    out.push({ type, id })
  }
  return out
}

/**
 * Parses an admin follow-ups path into a drill route.
 * @param path - Shell path (may include query).
 * @returns Route, or null when not under follow-ups.
 */
export function parseFollowUpDrillPath(
  path: string | null,
): FollowUpDrillRoute | null {
  if (!path) {
    return null
  }
  const qIndex = path.indexOf('?')
  const pathname = (qIndex >= 0 ? path.slice(0, qIndex) : path)
    .replace(/\/+$/, '')
    .toLowerCase()
  const search = qIndex >= 0 ? path.slice(qIndex + 1) : ''
  const params = new URLSearchParams(search)

  if (pathname === LIST_PATH) {
    return { kind: 'list' }
  }
  if (pathname === `${LIST_PATH}/company`) {
    const name = params.get('name')?.trim() ?? ''
    const entities = parseFollowUpEntityList(params.get('e'))
    return { kind: 'company', name, entities }
  }

  const prefix = `${LIST_PATH}/`
  if (!pathname.startsWith(prefix)) {
    return null
  }
  const rest = pathname.slice(prefix.length)
  const [typeRaw, idRaw] = rest.split('/')
  if (!typeRaw || !idRaw || !isFollowUpEntityType(typeRaw)) {
    return null
  }
  const name = params.get('name')?.trim() || undefined
  return { kind: 'entity', type: typeRaw, id: idRaw, name }
}

/**
 * Builds the list path.
 * @returns `/admin/follow-ups`.
 */
export function followUpsListPath(): string {
  return LIST_PATH
}

/**
 * Builds an entity timeline path.
 * @param type - Entity type.
 * @param id - Entity uuid.
 * @param name - Optional display name query.
 * @returns Path string.
 */
export function followUpEntityPath(
  type: FollowUpEntityType,
  id: string,
  name?: string,
): string {
  const base = `${LIST_PATH}/${type}/${encodeURIComponent(id)}`
  if (name?.trim()) {
    return `${base}?name=${encodeURIComponent(name.trim())}`
  }
  return base
}

/**
 * Builds a company-merged timeline path.
 * @param name - Display company name.
 * @param entities - Merged entity refs.
 * @returns Path with query.
 */
export function followUpCompanyPath(
  name: string,
  entities: FollowUpEntityRef[],
): string {
  const e = entities.map((ref) => `${ref.type}:${ref.id}`).join(',')
  const params = new URLSearchParams()
  if (name.trim()) {
    params.set('name', name.trim())
  }
  if (e) {
    params.set('e', e)
  }
  const qs = params.toString()
  return qs ? `${LIST_PATH}/company?${qs}` : `${LIST_PATH}/company`
}

/**
 * Whether two drill routes refer to the same pane identity.
 * @param a - Previous route.
 * @param b - Next route.
 * @returns True when keys match.
 */
export function sameFollowUpDrillRoute(
  a: FollowUpDrillRoute | null,
  b: FollowUpDrillRoute | null,
): boolean {
  if (!a || !b) {
    return a === b
  }
  if (a.kind !== b.kind) {
    return false
  }
  if (a.kind === 'list' && b.kind === 'list') {
    return true
  }
  if (a.kind === 'entity' && b.kind === 'entity') {
    return a.type === b.type && a.id === b.id
  }
  if (a.kind === 'company' && b.kind === 'company') {
    const ae = a.entities
      .map((e) => `${e.type}:${e.id}`)
      .sort()
      .join(',')
    const be = b.entities
      .map((e) => `${e.type}:${e.id}`)
      .sort()
      .join(',')
    return a.name === b.name && ae === be
  }
  return false
}
