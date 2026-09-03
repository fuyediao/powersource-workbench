/**
 * KOL location tab: favorites picker plus structured geography fields.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dash, detailSectionCardClass } from '@/components/admin/customer-detail/detail-shared'
import {
  KOL_DETAIL_INPUT_CLASS,
  KOL_DETAIL_LABEL_CLASS,
} from '@/components/admin/kol-detail/detail-shared'
import { CountryFlag } from '@/components/common/country-flag'
import {
  CrmFilterSelect,
  type CrmFilterOption,
} from '@/components/common/crm-filter-select'
import { COUNTRY_OPTIONS } from '@/constants/countries'
import { useFavorites } from '@/hooks/use-favorites'
import { useLinkOpen } from '@/hooks/link-open-context'
import { CloseIcon, ExternalLinkIcon, MapPinIcon } from '@/icons/AllIcons'
import type { Favorite } from '@/types/favorite'
import type { KolFormInput } from '@/types/kol'
import { hasStructuredAddress } from '@/utils/customer-structured-address'
import { countryMatchesSearch, getCountryDisplayName } from '@/utils/map/country-alpha2'

interface LocationPanelProps {
  userId: string
  form: KolFormInput
  editing: boolean
  onPatch: (patch: Partial<KolFormInput>) => void
}

/**
 * Writes KOL geography fields from a saved place.
 * @param fav - Selected favorite.
 * @returns Partial form patch.
 */
function patchFromFavorite(fav: Favorite): Partial<KolFormInput> {
  if (hasStructuredAddress(fav)) {
    return {
      country: fav.country?.trim() || null,
      state: fav.stateProvince?.trim() || null,
      city: fav.city?.trim() || null,
      postalCode: fav.postalCode?.trim() || null,
      addressLine1: fav.addressLine1?.trim() || null,
      addressLine2: fav.addressLine2?.trim() || null,
      region: null,
      county: null,
      town: null,
      circle: null,
      latitude: fav.latitude,
      longitude: fav.longitude,
    }
  }
  return {
    country: null,
    state: null,
    city: null,
    postalCode: null,
    addressLine1: fav.address?.trim() || null,
    addressLine2: null,
    region: null,
    county: null,
    town: null,
    circle: null,
    latitude: fav.latitude,
    longitude: fav.longitude,
  }
}

/**
 * Empty geography patch used when clearing location.
 * @returns Cleared location fields.
 */
function emptyLocationPatch(): Partial<KolFormInput> {
  return {
    country: null,
    region: null,
    state: null,
    county: null,
    city: null,
    town: null,
    circle: null,
    postalCode: null,
    addressLine1: null,
    addressLine2: null,
    latitude: null,
    longitude: null,
  }
}

/**
 * Location tab: saved-place picker and structured address fields.
 * @param props - User id, form, edit flag, and patch.
 * @returns Panel UI.
 */
export function LocationPanel({
  userId,
  form,
  editing,
  onPatch,
}: LocationPanelProps) {
  const { t, i18n } = useTranslation()
  const { openUrl } = useLinkOpen()
  const { favorites, loadFavorites } = useFavorites()
  const [search, setSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectedFavorite, setSelectedFavorite] = useState<Favorite | null>(null)

  useEffect(() => {
    void loadFavorites(userId)
  }, [loadFavorites, userId])

  const resolvedFavorite = useMemo(() => {
    if (selectedFavorite) {
      return selectedFavorite
    }
    const lat = form.latitude
    const lng = form.longitude
    if (lat != null && lng != null) {
      const byCoords = favorites.find(
        (fav) => fav.latitude === lat && fav.longitude === lng,
      )
      if (byCoords) {
        return byCoords
      }
    }
    const address = (form.addressLine1 ?? '').trim().toLowerCase()
    if (address) {
      return (
        favorites.find(
          (fav) => (fav.address ?? '').trim().toLowerCase() === address,
        ) ?? null
      )
    }
    return null
  }, [favorites, form.addressLine1, form.latitude, form.longitude, selectedFavorite])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      return favorites
    }
    return favorites.filter(
      (fav) =>
        fav.shopName.toLowerCase().includes(q) ||
        (fav.address?.toLowerCase().includes(q) ?? false),
    )
  }, [favorites, search])

  const structured = resolvedFavorite
    ? hasStructuredAddress(resolvedFavorite)
    : false
  const lockCountry = Boolean(structured && resolvedFavorite?.country?.trim())
  const lockState = Boolean(structured && resolvedFavorite?.stateProvince?.trim())
  const lockCity = Boolean(structured && resolvedFavorite?.city?.trim())
  const lockPostal = Boolean(structured && resolvedFavorite?.postalCode?.trim())
  const lockLine1 = Boolean(
    resolvedFavorite &&
      (structured
        ? resolvedFavorite.addressLine1?.trim()
        : resolvedFavorite.address?.trim()),
  )
  const lockLine2 = Boolean(structured && resolvedFavorite?.addressLine2?.trim())
  const lockLatLng = Boolean(resolvedFavorite)

  const countryOptions = useMemo<CrmFilterOption[]>(
    () => [
      { value: '', label: t('admin.kolDetail.field.countryPlaceholder') },
      ...COUNTRY_OPTIONS.map((name) => ({
        value: name,
        label: getCountryDisplayName(name, i18n.language) || name,
      })),
    ],
    [i18n.language, t],
  )

  const mapUrl =
    form.latitude != null && form.longitude != null
      ? `https://www.google.com/maps?q=${form.latitude},${form.longitude}`
      : null

  const selectedLabel =
    resolvedFavorite?.shopName ?? form.addressLine1 ?? ''

  /**
   * Selects a saved place and writes geography onto the form.
   * @param fav - Favorite row.
   * @returns Nothing.
   */
  function selectFavorite(fav: Favorite): void {
    setSelectedFavorite(fav)
    setDropdownOpen(false)
    setSearch('')
    onPatch(patchFromFavorite(fav))
  }

  /**
   * Clears the selected place and all location fields.
   * @returns Nothing.
   */
  function clearLocation(): void {
    setSelectedFavorite(null)
    setSearch('')
    onPatch(emptyLocationPatch())
  }

  return (
    <div className={`${detailSectionCardClass()} space-y-4`}>
      {editing ? (
        <div>
          <label className={`${KOL_DETAIL_LABEL_CLASS} flex items-center gap-2`}>
            <MapPinIcon className="size-3 text-brand" />
            {t('admin.kolDetail.location.selectLocation')}
          </label>
          {resolvedFavorite || (form.latitude != null && form.longitude != null) ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-ink/10 bg-white/70 px-3 py-2">
                <p className="truncate text-xs text-ink">{selectedLabel || '—'}</p>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-muted hover:text-ink"
                  title={t('admin.kolDetail.location.clearLocation')}
                  onClick={clearLocation}
                >
                  <CloseIcon className="size-3" />
                </button>
              </div>
              {mapUrl ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                  onClick={() => openUrl(mapUrl)}
                >
                  <ExternalLinkIcon className="size-2.5" />
                  {t('admin.kolDetail.location.openOnMap')}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={search}
                placeholder={t('admin.kolDetail.location.searchPlaceholder')}
                className={KOL_DETAIL_INPUT_CLASS}
                onFocus={() => setDropdownOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setDropdownOpen(false), 200)
                }}
                onChange={(event) => setSearch(event.target.value)}
              />
              {dropdownOpen ? (
                <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-44 overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-xl dark:bg-zinc-900">
                  {favorites.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted">
                      {t('admin.kolDetail.location.noFavorites')}
                    </p>
                  ) : (
                    <>
                      {filtered.map((fav) => (
                        <button
                          key={fav.id}
                          type="button"
                          className="w-full border-b border-ink/5 px-3 py-2 text-left text-sm last:border-0 hover:bg-brand/5"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            selectFavorite(fav)
                          }}
                        >
                          <span className="block truncate font-medium text-ink">
                            {fav.shopName}
                          </span>
                          {fav.address ? (
                            <span className="block truncate text-xs text-muted">
                              {fav.address}
                            </span>
                          ) : null}
                        </button>
                      ))}
                      {filtered.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted">
                          {t('admin.kolDetail.location.noMatchingFavorites')}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : mapUrl ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
          onClick={() => openUrl(mapUrl)}
        >
          <ExternalLinkIcon className="size-2.5" />
          {t('admin.kolDetail.location.openOnMap')}
        </button>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={KOL_DETAIL_LABEL_CLASS}>
            {t('admin.kolDetail.field.country')}
          </label>
          {editing ? (
            <CrmFilterSelect
              className="w-full"
              value={form.country ?? ''}
              options={countryOptions}
              searchable
              disabled={lockCountry}
              searchPlaceholder={t('admin.kolDetail.field.countryPlaceholder')}
              emptyLabel={t('admin.kolDetail.field.countryNoMatch')}
              ariaLabel={t('admin.kolDetail.field.country')}
              renderLeading={(option) =>
                option.value ? (
                  <CountryFlag countryName={option.value} size={16} />
                ) : null
              }
              filterOption={(option, query) =>
                countryMatchesSearch(option.value, query) ||
                option.label.toLowerCase().includes(query.toLowerCase())
              }
              onChange={(next) => onPatch({ country: next || null })}
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-ink">
              {form.country ? (
                <CountryFlag countryName={form.country} size={16} />
              ) : null}
              <span>
                {form.country
                  ? getCountryDisplayName(form.country, i18n.language) ||
                    form.country
                  : '—'}
              </span>
            </div>
          )}
        </div>
        <GeoField
          id="kol-region"
          label={t('admin.kolDetail.field.region')}
          value={form.region}
          editing={editing}
          locked={false}
          onChange={(value) => onPatch({ region: value })}
        />
        <GeoField
          id="kol-state"
          label={t('admin.kolDetail.field.state')}
          value={form.state}
          editing={editing}
          locked={lockState}
          onChange={(value) => onPatch({ state: value })}
        />
        <GeoField
          id="kol-city"
          label={t('admin.kolDetail.field.city')}
          value={form.city}
          editing={editing}
          locked={lockCity}
          onChange={(value) => onPatch({ city: value })}
        />
        <GeoField
          id="kol-county"
          label={t('admin.kolDetail.field.county')}
          value={form.county}
          editing={editing}
          locked={false}
          onChange={(value) => onPatch({ county: value })}
        />
        <GeoField
          id="kol-town"
          label={t('admin.kolDetail.field.town')}
          value={form.town}
          editing={editing}
          locked={false}
          onChange={(value) => onPatch({ town: value })}
        />
        <GeoField
          id="kol-circle"
          label={t('admin.kolDetail.field.circle')}
          value={form.circle}
          editing={editing}
          locked={false}
          onChange={(value) => onPatch({ circle: value })}
        />
        <GeoField
          id="kol-postal"
          label={t('admin.kolDetail.field.postalCode')}
          value={form.postalCode}
          editing={editing}
          locked={lockPostal}
          onChange={(value) => onPatch({ postalCode: value })}
        />
        <GeoField
          id="kol-line1"
          label={t('admin.kolDetail.field.addressLine1')}
          value={form.addressLine1}
          editing={editing}
          locked={lockLine1}
          placeholder={t('admin.kolDetail.field.addressLine1Placeholder')}
          className="sm:col-span-2"
          onChange={(value) => onPatch({ addressLine1: value })}
        />
        <GeoField
          id="kol-line2"
          label={t('admin.kolDetail.field.addressLine2')}
          value={form.addressLine2}
          editing={editing}
          locked={lockLine2}
          placeholder={t('admin.kolDetail.field.addressLine2Placeholder')}
          className="sm:col-span-2"
          onChange={(value) => onPatch({ addressLine2: value })}
        />
        <GeoNumberField
          id="kol-lat"
          label={t('admin.kolDetail.field.latitude')}
          value={form.latitude}
          editing={editing}
          locked={lockLatLng}
          onChange={(value) => onPatch({ latitude: value })}
        />
        <GeoNumberField
          id="kol-lng"
          label={t('admin.kolDetail.field.longitude')}
          value={form.longitude}
          editing={editing}
          locked={lockLatLng}
          onChange={(value) => onPatch({ longitude: value })}
        />
      </div>
    </div>
  )
}

interface GeoFieldProps {
  id: string
  label: string
  value: string | null | undefined
  editing: boolean
  locked: boolean
  placeholder?: string
  className?: string
  onChange: (value: string | null) => void
}

/**
 * Text geography field with view-mode dash display.
 * @param props - Label, value, lock, and change handler.
 * @returns Field UI.
 */
function GeoField({
  id,
  label,
  value,
  editing,
  locked,
  placeholder,
  className,
  onChange,
}: GeoFieldProps) {
  return (
    <div className={className}>
      <label className={KOL_DETAIL_LABEL_CLASS} htmlFor={id}>
        {label}
      </label>
      {editing ? (
        <input
          id={id}
          type="text"
          value={value ?? ''}
          disabled={locked}
          placeholder={placeholder}
          className={`${KOL_DETAIL_INPUT_CLASS} disabled:opacity-60`}
          onChange={(event) => onChange(event.target.value.trim() || null)}
        />
      ) : (
        <p className="text-sm text-ink">{dash(value)}</p>
      )}
    </div>
  )
}

interface GeoNumberFieldProps {
  id: string
  label: string
  value: number | null | undefined
  editing: boolean
  locked: boolean
  onChange: (value: number | null) => void
}

/**
 * Numeric lat/lng field.
 * @param props - Label, value, lock, and change handler.
 * @returns Field UI.
 */
function GeoNumberField({
  id,
  label,
  value,
  editing,
  locked,
  onChange,
}: GeoNumberFieldProps) {
  return (
    <div>
      <label className={KOL_DETAIL_LABEL_CLASS} htmlFor={id}>
        {label}
      </label>
      {editing ? (
        <input
          id={id}
          type="number"
          step="any"
          value={value ?? ''}
          disabled={locked}
          className={`${KOL_DETAIL_INPUT_CLASS} disabled:opacity-60`}
          onChange={(event) => {
            const raw = event.target.value.trim()
            if (!raw) {
              onChange(null)
              return
            }
            const parsed = Number(raw)
            onChange(Number.isFinite(parsed) ? parsed : null)
          }}
        />
      ) : (
        <p className="text-sm text-ink">{dash(value)}</p>
      )}
    </div>
  )
}
