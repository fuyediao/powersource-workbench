/**
 * Normalize a KOL channel URL and optionally enrich handle / followers / contentCount.
 * Returns i18n keys so the UI can call `t()` — this module does not translate.
 */

import { isKolApifyEnrichablePlatform } from '@/constants/kol-constants'
import {
  fetchApifySocialProfileMeta,
  fetchYoutubeChannelMeta,
  isGeocrmApiConfigured,
  KolApifyEnrichmentError,
  KolYoutubeEnrichmentError,
} from '@/services/kol-channel-enrichment-api'
import type { KolChannelInput } from '@/types/kol'
import { toAbsoluteChannelPageUrl } from '@/utils/channel-page-url'

/** Result of applying URL normalization and optional remote enrichment. */
export type KolChannelEnrichResult =
  | { ok: true; enriched: KolChannelInput }
  | { ok: false; errorKey: string; errorMessage?: string }

/**
 * Map Apify enrichment failure to an `admin.kolDetail.*` i18n key.
 * @param err - Thrown value from {@link fetchApifySocialProfileMeta}.
 * @returns i18n key.
 */
function mapApifyEnrichmentErrorKey(err: unknown): string {
  if (err instanceof KolApifyEnrichmentError) {
    if (err.status === 0) {
      return 'admin.kolDetail.errorApifyNetwork'
    }
    switch (err.status) {
      case 503:
        if (err.message.includes('GeoCRM API URL')) {
          return 'admin.kolDetail.errorGeocrmNotConfigured'
        }
        return 'admin.kolDetail.errorApifyNotConfigured'
      case 401:
        return 'admin.kolDetail.errorApifyUnauthorized'
      case 403:
        return 'admin.kolDetail.errorApifyForbidden'
      case 404:
        return 'admin.kolDetail.errorApifyNotFound'
      case 400:
        return 'admin.kolDetail.errorApifyBadRequest'
      case 402:
        return 'admin.kolDetail.errorApifyBilling'
      case 408:
        return 'admin.kolDetail.errorApifyTimeout'
      case 502:
        return 'admin.kolDetail.errorApifyUpstream'
      default:
        return 'admin.kolDetail.errorApifyUpstream'
    }
  }
  return 'admin.kolDetail.errorApifyUpstream'
}

/**
 * Map YouTube enrichment failure to an `admin.kolDetail.*` i18n key.
 * @param err - Thrown value from {@link fetchYoutubeChannelMeta}.
 * @returns i18n key.
 */
function mapYoutubeEnrichmentErrorKey(err: unknown): string {
  if (err instanceof KolYoutubeEnrichmentError) {
    if (err.status === 0) {
      return 'admin.kolDetail.errorYoutubeNetwork'
    }
    switch (err.status) {
      case 503:
        if (err.message.includes('GeoCRM API URL')) {
          return 'admin.kolDetail.errorGeocrmNotConfigured'
        }
        return 'admin.kolDetail.errorYoutubeServerNotConfigured'
      case 401:
        return 'admin.kolDetail.errorYoutubeUnauthorized'
      case 403:
        return 'admin.kolDetail.errorYoutubeForbidden'
      case 404:
        return 'admin.kolDetail.errorYoutubeNotFound'
      case 400:
        return 'admin.kolDetail.errorYoutubeBadRequest'
      case 502:
        return 'admin.kolDetail.errorYoutubeUpstream'
      default:
        return 'admin.kolDetail.errorYoutubeUpstream'
    }
  }
  return 'admin.kolDetail.errorYoutubeUpstream'
}

/**
 * Normalize URL and, for YouTube or Apify-backed platforms, resolve handle / followers / contentCount.
 * For `other`, only normalizes the URL and keeps all fields as provided (no remote API).
 * @param kolId - KOL UUID (for geocrm-api auth context).
 * @param input - Draft channel fields.
 * @returns Enriched input or an i18n error key.
 */
export async function enrichKolChannelFields(
  kolId: string,
  input: KolChannelInput,
): Promise<KolChannelEnrichResult> {
  const normalizedUrl = toAbsoluteChannelPageUrl(input.channelUrl)
  let enriched: KolChannelInput = { ...input, channelUrl: normalizedUrl }

  if (input.platformKey === 'other') {
    return { ok: true, enriched }
  }

  if (isKolApifyEnrichablePlatform(input.platformKey)) {
    if (!isGeocrmApiConfigured()) {
      return { ok: false, errorKey: 'admin.kolDetail.errorGeocrmNotConfigured' }
    }
    try {
      const meta = await fetchApifySocialProfileMeta({
        kolId,
        platformKey: input.platformKey,
        channelUrl: normalizedUrl,
      })
      enriched = {
        ...enriched,
        handle: meta.handle ?? null,
        followers: meta.followers ?? null,
        contentCount: meta.contentCount ?? null,
      }
      return { ok: true, enriched }
    } catch (enrichErr) {
      return {
        ok: false,
        errorKey: mapApifyEnrichmentErrorKey(enrichErr),
        errorMessage: enrichErr instanceof Error ? enrichErr.message : undefined,
      }
    }
  }

  if (input.platformKey === 'youtube') {
    if (!isGeocrmApiConfigured()) {
      return { ok: false, errorKey: 'admin.kolDetail.errorGeocrmNotConfigured' }
    }
    try {
      const meta = await fetchYoutubeChannelMeta({
        kolId,
        channelUrl: normalizedUrl,
      })
      enriched = {
        ...enriched,
        handle: meta.handle ?? null,
        followers: meta.followers ?? null,
        contentCount: meta.contentCount ?? null,
      }
      return { ok: true, enriched }
    } catch (enrichErr) {
      return {
        ok: false,
        errorKey: mapYoutubeEnrichmentErrorKey(enrichErr),
        errorMessage: enrichErr instanceof Error ? enrichErr.message : undefined,
      }
    }
  }

  return { ok: true, enriched }
}
