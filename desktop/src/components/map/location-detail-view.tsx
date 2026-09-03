/**
 * Location detail panel for map Locations tab (Vue LocationDetailView parity).
 */

import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import type { Map as LeafletMap, Marker } from 'leaflet'
import {
  ChevronLeftIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  MapPinIcon,
  NavigationIcon,
  PencilIcon,
} from '@/icons/AllIcons'
import type { ShopLocation } from '@/types/chat'
import type { Favorite } from '@/types/favorite'
import { openExternalUrl } from '@/utils/shared/api'
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsSearchUrl,
} from '@/utils/map/google-maps-urls'
import { createLeafletOsmTileLayer } from '@/utils/map/leaflet-osm-world'

const INTL_LOCALE_MAP: Record<string, string> = {
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  en: 'en-US',
  'en-US': 'en-US',
}

interface LocationDetailViewProps {
  shop: ShopLocation
  favorite?: Favorite | null
  onBack: () => void
  onShowOnMap: (shop: ShopLocation) => void
  onEdit?: (favorite: Favorite) => void
}

/**
 * Formats an ISO date with the active i18n locale.
 *
 * @param dateString - ISO timestamp
 * @param language - i18next language code
 * @returns Localized date/time string
 */
function formatDetailDate(dateString: string, language: string): string {
  try {
    const intlLocale = INTL_LOCALE_MAP[language] ?? language
    return new Intl.DateTimeFormat(intlLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

/**
 * Read-only location detail with mini map, hours, website, and map actions.
 *
 * @param props - Shop, optional matched favorite, and callbacks
 * @returns Detail panel UI
 */
export function LocationDetailView(props: LocationDetailViewProps) {
  const { t, i18n } = useTranslation()
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)

  const descriptionText =
    props.favorite?.note?.trim() || props.shop.description?.trim() || ''

  const lastModifiedDisplay = useMemo(() => {
    const at = props.favorite?.lastModifiedAt
    if (!at) return null
    return formatDetailDate(at, i18n.language)
  }, [i18n.language, props.favorite?.lastModifiedAt])

  const googleMapsPlaceSearchUrl = useMemo(
    () =>
      buildGoogleMapsSearchUrl(
        props.shop.name,
        props.shop.address,
        props.shop.latitude,
        props.shop.longitude,
      ),
    [props.shop],
  )

  const googleMapsDirectionsUrl = useMemo(
    () =>
      buildGoogleMapsDirectionsUrl(
        props.shop.name,
        props.shop.address,
        props.shop.latitude,
        props.shop.longitude,
      ),
    [props.shop],
  )

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) return

    const map = L.map(container, {
      zoomControl: true,
      scrollWheelZoom: true,
      preferCanvas: true,
    }).setView([props.shop.latitude, props.shop.longitude], 14)

    createLeafletOsmTileLayer({
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      updateWhenZooming: false,
      updateWhenIdle: true,
    }).addTo(map)

    const marker = L.marker([props.shop.latitude, props.shop.longitude], {
      draggable: false,
    }).addTo(map)

    mapRef.current = map
    markerRef.current = marker

    const invalidate = window.setTimeout(() => {
      map.invalidateSize()
    }, 100)

    return () => {
      window.clearTimeout(invalidate)
      marker.remove()
      map.remove()
      markerRef.current = null
      mapRef.current = null
    }
  }, [props.shop.latitude, props.shop.longitude, props.shop.name])

  /**
   * Opens a URL in the system / external browser.
   *
   * @param url - Target HTTPS URL
   */
  const openUrl = (url: string) => {
    if (!url) return
    void openExternalUrl(url)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-950/10 px-2 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={props.onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          {t('map.locationDetail.backToList')}
        </button>
        {props.favorite && props.onEdit ? (
          <button
            type="button"
            onClick={() => props.onEdit?.(props.favorite!)}
            className="flex items-center gap-1.5 rounded-lg bg-brand/15 px-3 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand/25"
          >
            <PencilIcon className="size-3.5" aria-hidden />
            {t('common.edit')}
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div>
          <label className="mb-0.5 block text-xs font-medium text-muted">
            {t('chat.favorites.modal.locationName')}
          </label>
          <p className="font-semibold text-brand">{props.shop.name}</p>
        </div>

        {props.shop.address ? (
          <div>
            <label className="mb-0.5 flex items-center gap-1 text-xs font-medium text-muted">
              <MapPinIcon className="size-3" aria-hidden />
              {t('chat.favorites.modal.address')}
            </label>
            <p className="text-sm text-ink/80">{props.shop.address}</p>
          </div>
        ) : null}

        <div>
          <label className="mb-0.5 block text-xs font-medium text-muted">
            {t('chat.favorites.modal.description')}
          </label>
          <p className="text-sm whitespace-pre-wrap text-ink/80">
            {descriptionText || t('map.locationDetail.descriptionNotProvided')}
          </p>
          {props.favorite?.imageUrls && props.favorite.imageUrls.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {props.favorite.imageUrls.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => openUrl(url)}
                  className="block size-24 shrink-0 overflow-hidden rounded-lg border border-zinc-950/10 bg-zinc-950/5 focus:ring-2 focus:ring-brand dark:border-white/10 dark:bg-white/5"
                >
                  <img
                    src={url}
                    alt={`${t('chat.favorites.modal.description')} ${index + 1}`}
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {props.favorite ? (
          <div className="border-t border-zinc-950/10 pt-3 dark:border-white/10">
            <label className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted">
              <FileTextIcon className="size-3 shrink-0" aria-hidden />
              {t('chat.favorites.logTitle')}
              <span className="inline-flex items-center rounded border border-zinc-950/10 bg-zinc-950/5 px-1.5 py-0.5 text-[10px] leading-none font-medium text-muted dark:border-white/10 dark:bg-white/5">
                {t('chat.favorites.logNotBound')}
              </span>
            </label>
            <ul className="mb-2 space-y-1.5">
              <li className="py-1.5 text-xs text-muted">{t('chat.favorites.logEmpty')}</li>
            </ul>
            <button
              type="button"
              disabled
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-fg opacity-50"
            >
              {t('chat.favorites.logAdd')}
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-0.5 block text-xs font-medium text-muted">
              {t('chat.favorites.modal.latitude')}
            </label>
            <p className="font-mono text-sm text-ink/80">{props.shop.latitude}</p>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium text-muted">
              {t('chat.favorites.modal.longitude')}
            </label>
            <p className="font-mono text-sm text-ink/80">{props.shop.longitude}</p>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">
            {t('chat.favorites.modal.clickOnMap')}
          </label>
          <div
            ref={mapContainerRef}
            className="h-40 w-full overflow-hidden rounded-lg border border-zinc-950/10 bg-zinc-950/5 dark:border-white/10 dark:bg-zinc-900/50"
          />
          <p className="mt-0.5 text-xs text-muted">{t('map.locationDetail.mapHint')}</p>
        </div>

        <div>
          <label className="mb-0.5 flex items-center gap-1 text-xs font-medium text-muted">
            <ClockIcon className="size-3" aria-hidden />
            {t('chat.favorites.modal.hours')}
          </label>
          {props.shop.hours ? (
            <p className="text-sm text-ink/80">{props.shop.hours}</p>
          ) : (
            <p className="text-sm text-muted">{t('map.locationDetail.hoursNotAvailable')}</p>
          )}
          {googleMapsPlaceSearchUrl ? (
            <button
              type="button"
              onClick={() => openUrl(googleMapsPlaceSearchUrl)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand transition-colors hover:opacity-80"
            >
              <ExternalLinkIcon className="size-3" aria-hidden />
              {t('map.locationDetail.checkHoursOnGoogleMaps')}
            </button>
          ) : null}
        </div>

        {props.shop.website ? (
          <div>
            <label className="mb-0.5 flex items-center gap-1 text-xs font-medium text-muted">
              <GlobeIcon className="size-3" aria-hidden />
              {t('chat.favorites.modal.website')}
            </label>
            <button
              type="button"
              onClick={() => openUrl(props.shop.website!)}
              className="flex items-center gap-1 text-sm break-all text-brand transition-colors hover:opacity-80"
            >
              {props.shop.website}
              <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
            </button>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
              props.shop.openSunday
                ? 'bg-brand/15 text-brand'
                : 'bg-zinc-950/10 text-muted dark:bg-white/10'
            }`}
          >
            {props.shop.openSunday
              ? t('chat.location.openSun')
              : t('chat.location.closedSunday')}
          </span>
        </div>

        {props.favorite &&
        (props.favorite.lastModifiedByEmail || props.favorite.lastModifiedAt) ? (
          <div className="border-t border-zinc-950/10 pt-1 dark:border-white/10">
            <p className="text-xs text-muted">
              {t('chat.favorites.modal.lastModifiedBy', {
                email: props.favorite.lastModifiedByEmail || '—',
                date: lastModifiedDisplay || '—',
              })}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2 border-t border-zinc-950/10 bg-zinc-950/5 p-3 dark:border-white/10 dark:bg-zinc-950/30">
        <button
          type="button"
          onClick={() => props.onShowOnMap(props.shop)}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90"
        >
          <MapPinIcon className="size-4" aria-hidden />
          {t('map.locationDetail.showOnMap')}
        </button>
        {googleMapsDirectionsUrl || googleMapsPlaceSearchUrl ? (
          <button
            type="button"
            onClick={() => openUrl(googleMapsDirectionsUrl || googleMapsPlaceSearchUrl)}
            className="flex items-center justify-center gap-2 rounded-lg bg-zinc-950/10 px-3 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-zinc-950/15 dark:bg-white/10 dark:hover:bg-white/15"
          >
            <NavigationIcon className="size-4" aria-hidden />
            {t('map.locationDetail.navigate')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
