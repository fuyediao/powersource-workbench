import { useTranslation } from 'react-i18next'
import { LocationIcon, WeatherIcon } from '@/icons/AllIcons'
import { useAnimatedHeight } from '@/hooks/use-animated-height'
import { weatherConditionKey } from '@/hooks/use-weather'
import { useWidgetTools } from '@/hooks/use-widget-tools'

/**
 * Converts Celsius to Fahrenheit.
 * @param celsius - Temperature in °C.
 * @returns Temperature in °F.
 */
function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

/**
 * Converts km/h to mph.
 * @param kmh - Speed in kilometres per hour.
 * @returns Speed in miles per hour.
 */
function toMph(kmh: number): number {
  return kmh / 1.609344
}

/**
 * Renders a compact weather widget for a saved city or device location.
 * @returns Weather widget.
 */
export function WeatherCard() {
  const { t } = useTranslation()
  const {
    openTools,
    fahrenheit,
    weather,
    weatherPlace: place,
    weatherHasLocation: hasLocation,
    weatherPermission: permission,
    weatherLoading: loading,
    weatherRequesting: requesting,
    weatherReady: ready,
    requestWeatherLocation: requestLocation,
  } = useWidgetTools()
  const needsLocation = ready && !hasLocation && permission !== 'unsupported'
  const { shellRef, contentRef } = useAnimatedHeight([
    permission,
    ready,
    hasLocation,
    fahrenheit,
    place,
    weather?.weatherCode,
    weather?.temperatureC,
    loading,
    requesting,
  ])

  const temperature = weather
    ? Math.round(fahrenheit ? toFahrenheit(weather.temperatureC) : weather.temperatureC)
    : null
  const windValue = weather
    ? Math.round(fahrenheit ? toMph(weather.windSpeedKmh) : weather.windSpeedKmh)
    : null

  return (
    <section
      ref={shellRef}
      className="glass-panel overflow-hidden rounded-3xl will-change-[height]"
    >
      <div ref={contentRef} className="p-5">
        <header className="mb-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-brand">{t('weather.title')}</h2>
            <p className="mt-1 truncate text-xs text-muted">
              {place ?? t('weather.subtitle')}
            </p>
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <WeatherIcon className="size-5" />
          </span>
        </header>

        {ready && permission === 'unsupported' && !hasLocation ? (
          <div className="space-y-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-brand-fg shadow-lg shadow-brand/25 transition hover:opacity-95"
              onClick={() => openTools('weather')}
            >
              {t('weather.pickCity')}
            </button>
            <p className="text-xs leading-relaxed text-muted">{t('weather.unsupported')}</p>
          </div>
        ) : null}

        {!ready ? <p className="text-xs text-muted opacity-60">{t('status.loading')}</p> : null}

        {needsLocation ? (
          <div className="space-y-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-xs font-bold text-brand-fg shadow-lg shadow-brand/25 transition hover:opacity-95"
              disabled={requesting}
              onClick={requestLocation}
            >
              <LocationIcon className="size-4" />
              {requesting ? t('weather.requesting') : t('weather.allowLocation')}
            </button>
            <p className="text-xs leading-relaxed text-muted">
              {permission === 'denied' ? t('weather.denied') : t('weather.needPermission')}
            </p>
          </div>
        ) : null}

        {ready && hasLocation ? (
          weather && temperature !== null && windValue !== null ? (
            <div className={`space-y-3 transition ${loading ? 'opacity-60' : ''}`}>
              <div className="flex items-end justify-between gap-3">
                <p className="text-3xl font-extrabold leading-none tracking-tight text-brand tabular-nums">
                  {temperature}
                  {fahrenheit ? '°F' : '°C'}
                </p>
                <p className="pb-1 text-right text-xs font-semibold text-muted">
                  {t(`weather.condition.${weatherConditionKey(weather.weatherCode)}`)}
                </p>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{t('weather.humidity', { value: weather.humidity })}</span>
                <span>
                  {fahrenheit
                    ? t('weather.windMph', { value: windValue })
                    : t('weather.wind', { value: windValue })}
                </span>
              </div>
            </div>
          ) : (
            <p className={`text-xs text-muted ${loading ? 'opacity-60' : ''}`}>
              {loading ? t('status.loading') : t('weather.unavailable')}
            </p>
          )
        ) : null}
      </div>
    </section>
  )
}
