/**
 * Google Calendar link / sync against geocrm-api `/calendar/google/*`.
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/** Linked Google Calendar account (null when disconnected / missing). */
export interface CalendarGoogleAccount {
  id: string
  email: string
  displayName: string | null
  avatarUrl: string | null
  googleCalendarId: string
  status: string
  errorMessage: string | null
  lastSyncAt: string | null
  createdAt: string
  updatedAt: string
  oauthScope: string | null
  canWrite: boolean
  selectedGoogleCalendarIds: string[]
}

/** Google calendarList entry for selection UI. */
export interface GoogleCalendarListItem {
  id: string
  summary: string
  primary: boolean
  backgroundColor: string | null
  accessRole: string
  selected: boolean
}

/** Result of a bidirectional sync. */
export interface CalendarGoogleSyncResult {
  ok: boolean
  upserted: number
  pushed?: number
  deleted: number
  timeMin: string
  timeMax: string
}

/**
 * Returns the current Supabase access token (refreshing when needed).
 * @returns Bearer token or null.
 */
async function getToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) {
    return data.session.access_token
  }
  const { data: refreshed } = await supabase.auth.refreshSession()
  return refreshed.session?.access_token ?? null
}

/**
 * Authenticated fetch against `/calendar/*`.
 * @param path - Path under the API origin (must start with `/calendar`).
 * @param init - Fetch init.
 * @returns Parsed JSON.
 */
async function calendarFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new Error('VITE_DEPLOYMENT_DOMAIN is not configured')
  }
  const token = await getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const timeoutMs = path.includes('/sync') ? 180_000 : 45_000
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Calendar API timeout after ${timeoutMs / 1000}s`)
    }
    throw err
  } finally {
    window.clearTimeout(timer)
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message =
      typeof body.error === 'string'
        ? body.error
        : typeof body.detail === 'string'
          ? body.detail
          : `Calendar API error (${res.status})`
    throw new Error(message)
  }
  return body as T
}

/**
 * Starts Google Calendar OAuth; open the returned URL in the system browser.
 * @param loginHint - Optional Google account hint.
 * @param returnOrigin - Allowed public web origin for the callback redirect.
 * @returns Google authorization URL.
 */
export async function startGoogleCalendarOAuth(
  loginHint?: string,
  returnOrigin?: string,
): Promise<string> {
  const payload: { loginHint?: string; returnOrigin?: string } = {}
  if (loginHint) {
    payload.loginHint = loginHint
  }
  if (returnOrigin) {
    payload.returnOrigin = returnOrigin
  }
  const data = await calendarFetch<{ url?: string }>('/calendar/google/link', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (typeof data.url !== 'string' || data.url.length === 0) {
    throw new Error('Failed to start Google Calendar OAuth')
  }
  return data.url
}

/**
 * Maps an account API row to {@link CalendarGoogleAccount}.
 * @param row - API account object.
 * @returns Normalized account.
 */
function mapAccount(row: Record<string, unknown>): CalendarGoogleAccount {
  const selectedRaw = row.selectedGoogleCalendarIds
  const selected = Array.isArray(selectedRaw)
    ? selectedRaw.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  return {
    id: String(row.id ?? ''),
    email: String(row.email ?? ''),
    displayName: typeof row.displayName === 'string' ? row.displayName : null,
    avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : null,
    googleCalendarId: String(row.googleCalendarId ?? 'primary'),
    status: String(row.status ?? ''),
    errorMessage: typeof row.errorMessage === 'string' ? row.errorMessage : null,
    lastSyncAt: typeof row.lastSyncAt === 'string' ? row.lastSyncAt : null,
    createdAt: String(row.createdAt ?? ''),
    updatedAt: String(row.updatedAt ?? ''),
    oauthScope: typeof row.oauthScope === 'string' ? row.oauthScope : null,
    canWrite: row.canWrite === true,
    selectedGoogleCalendarIds: selected,
  }
}

/**
 * Loads the linked Google Calendar account for the current user.
 * @returns Account or null when not linked.
 */
export async function getGoogleCalendarAccount(): Promise<CalendarGoogleAccount | null> {
  const data = await calendarFetch<{ account: Record<string, unknown> | null }>(
    '/calendar/google/account',
  )
  if (!data.account) {
    return null
  }
  return mapAccount(data.account)
}

/**
 * Disconnects Google Calendar (keeps previously imported events).
 * @returns Nothing.
 */
export async function disconnectGoogleCalendar(): Promise<void> {
  await calendarFetch<{ ok: boolean }>('/calendar/google/account', { method: 'DELETE' })
}

/**
 * Lists Google calendars available for selection.
 * @returns Calendar list entries.
 */
export async function listGoogleCalendars(): Promise<GoogleCalendarListItem[]> {
  const data = await calendarFetch<{ calendars?: Array<Record<string, unknown>> }>(
    '/calendar/google/calendars',
  )
  return (data.calendars ?? []).map((row) => ({
    id: String(row.id ?? ''),
    summary: String(row.summary ?? row.id ?? ''),
    primary: row.primary === true,
    backgroundColor: typeof row.backgroundColor === 'string' ? row.backgroundColor : null,
    accessRole: String(row.accessRole ?? ''),
    selected: row.selected === true,
  }))
}

/**
 * Updates which Google calendars are included in sync.
 * @param calendarIds - Selected Google calendar ids.
 * @returns Nothing.
 */
export async function setGoogleCalendarSelection(calendarIds: string[]): Promise<void> {
  await calendarFetch<{ ok: boolean }>('/calendar/google/selection', {
    method: 'PUT',
    body: JSON.stringify({ calendarIds }),
  })
}

/**
 * Runs bidirectional sync for selected Google calendars.
 * @param range - Optional ISO time window (defaults on the server).
 * @returns Sync counters.
 */
export async function syncGoogleCalendar(range?: {
  timeMin?: string
  timeMax?: string
}): Promise<CalendarGoogleSyncResult> {
  return calendarFetch<CalendarGoogleSyncResult>('/calendar/google/sync', {
    method: 'POST',
    body: JSON.stringify(range ?? {}),
  })
}

/**
 * Pushes one local event to Google (insert or patch).
 * @param eventId - Local calendar_events uuid.
 * @returns Nothing.
 */
export async function pushCalendarEventToGoogle(eventId: string): Promise<void> {
  await calendarFetch<{ ok: boolean }>(`/calendar/google/events/${eventId}/push`, {
    method: 'POST',
    body: '{}',
  })
}

/**
 * Deletes a Google-synced event on Google and locally via the API.
 * @param eventId - Local calendar_events uuid.
 * @returns Nothing.
 */
export async function deleteGoogleCalendarEventRemote(eventId: string): Promise<void> {
  await calendarFetch<{ ok: boolean }>(`/calendar/google/events/${eventId}`, {
    method: 'DELETE',
  })
}

/**
 * Returns whether the account needs a reconnect for write scope.
 * @param account - Linked account or null.
 * @returns True when reconnect is required.
 */
export function googleAccountNeedsReauth(account: CalendarGoogleAccount | null): boolean {
  if (!account) {
    return false
  }
  return account.status === 'reauth_required' || !account.canWrite
}
