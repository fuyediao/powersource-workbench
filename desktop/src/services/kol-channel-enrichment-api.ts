/**
 * Calls workbench-api `/kol/*` routes to enrich KOL channel rows (YouTube + Apify).
 */

import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { supabase } from '@/lib/supabase'

/**
 * True when the app can reach workbench-api (`VITE_DEPLOYMENT_DOMAIN` set).
 * @returns Whether an API origin is configured.
 */
export function isWorkbenchApiConfigured(): boolean {
  return Boolean(resolveApiBaseUrl())
}

/** Resolved YouTube / Apify channel stats from workbench-api. */
export interface YoutubeChannelMetaResponse {
  handle: string | null
  followers: number | null
  contentCount: number | null
  warnings?: string[]
}

/**
 * Error thrown when Apify-backed social enrichment fails.
 */
export class KolApifyEnrichmentError extends Error {
  /**
   * @param message - Server error or detail text.
   * @param status - HTTP status from workbench-api.
   */
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'KolApifyEnrichmentError'
  }
}

/**
 * Error thrown when YouTube enrichment fails.
 */
export class KolYoutubeEnrichmentError extends Error {
  /**
   * @param message - Server error or detail text.
   * @param status - HTTP status from workbench-api.
   */
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'KolYoutubeEnrichmentError'
  }
}

/**
 * Current Supabase access token for workbench-api auth.
 * @returns Bearer token or null.
 */
async function getAccessToken(): Promise<string | null> {
  if (!supabase) {
    return null
  }
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Parses a JSON error body into a joined message.
 * @param body - Parsed response object.
 * @param status - HTTP status (fallback message).
 * @returns Non-empty error string.
 */
function errorMessageFromBody(
  body: { error?: string; detail?: string },
  status: number,
): string {
  const parts = [body.error, body.detail].filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  )
  return parts.length > 0 ? parts.join(' — ') : `Request failed: ${status}`
}

/**
 * Fetch YouTube channel metadata before inserting a `kol_channels` row.
 * @param params - Parent KOL id and channel page URL.
 * @returns Normalized stats from YouTube Data API v3.
 * @throws KolYoutubeEnrichmentError when the request fails.
 */
export async function fetchYoutubeChannelMeta(params: {
  kolId: string
  channelUrl: string
}): Promise<YoutubeChannelMetaResponse> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new KolYoutubeEnrichmentError('Workbench API URL is not configured', 503)
  }
  const token = await getAccessToken()
  if (!token) {
    throw new KolYoutubeEnrichmentError('Not authenticated', 401)
  }

  const url = `${base}/kol/youtube/channel-meta`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kolId: params.kolId.trim(),
        channelUrl: params.channelUrl.trim(),
      }),
      mode: 'cors',
    })
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Network error'
    throw new KolYoutubeEnrichmentError(reason, 0)
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    detail?: string
    handle?: unknown
    followers?: unknown
    contentCount?: unknown
    warnings?: unknown
  }

  if (!res.ok) {
    throw new KolYoutubeEnrichmentError(errorMessageFromBody(body, res.status), res.status)
  }

  return {
    handle: typeof body.handle === 'string' ? body.handle : null,
    followers: typeof body.followers === 'number' ? body.followers : null,
    contentCount: typeof body.contentCount === 'number' ? body.contentCount : null,
    warnings: Array.isArray(body.warnings)
      ? body.warnings.filter((w): w is string => typeof w === 'string')
      : undefined,
  }
}

/** Response shape matches {@link YoutubeChannelMetaResponse}. */
export type ApifySocialProfileMetaResponse = YoutubeChannelMetaResponse

/**
 * Fetch public profile stats (handle, followers, post/video count) via workbench-api + Apify.
 * @param params - Parent KOL id, platform key, profile URL.
 * @returns Normalized stats.
 * @throws KolApifyEnrichmentError when the request fails.
 */
export async function fetchApifySocialProfileMeta(params: {
  kolId: string
  platformKey: string
  channelUrl: string
}): Promise<ApifySocialProfileMetaResponse> {
  const base = resolveApiBaseUrl()
  if (!base) {
    throw new KolApifyEnrichmentError('Workbench API URL is not configured', 503)
  }
  const token = await getAccessToken()
  if (!token) {
    throw new KolApifyEnrichmentError('Not authenticated', 401)
  }

  const url = `${base}/kol/social/apify-profile-meta`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        kolId: params.kolId.trim(),
        platformKey: params.platformKey.trim(),
        channelUrl: params.channelUrl.trim(),
      }),
      mode: 'cors',
    })
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'Network error'
    throw new KolApifyEnrichmentError(reason, 0)
  }

  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    detail?: string
    handle?: unknown
    followers?: unknown
    contentCount?: unknown
    warnings?: unknown
  }

  if (!res.ok) {
    throw new KolApifyEnrichmentError(errorMessageFromBody(body, res.status), res.status)
  }

  return {
    handle: typeof body.handle === 'string' ? body.handle : null,
    followers: typeof body.followers === 'number' ? body.followers : null,
    contentCount: typeof body.contentCount === 'number' ? body.contentCount : null,
    warnings: Array.isArray(body.warnings)
      ? body.warnings.filter((w): w is string => typeof w === 'string')
      : undefined,
  }
}
