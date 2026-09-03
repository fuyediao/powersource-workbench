import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRightIcon, MoonIcon, SunIcon } from '@/icons/AllIcons'
import type { Theme } from '@/hooks/use-theme'
import {
  ACCENT_SHADES,
  accentSwatchVar,
  isNeutralAccent,
  visibleAccentHues,
  type AccentHue,
  type AccentShade,
} from '@/utils/appearance/accent'
import { MAX_ICON_RADIUS, MIN_ICON_RADIUS } from '@/utils/appearance/icon-radius'
import { MAX_SEARCH_RADIUS, MIN_SEARCH_RADIUS } from '@/utils/appearance/search-radius'

interface ThemeSectionProps {
  theme: Theme
  accentHue: AccentHue
  accentShade: AccentShade
  clockAccentHue: AccentHue
  clockAccentShade: AccentShade
  iconRadius: number
  searchRadius: number
  panelOpacity: number
  searchPanelOpacity: number
  backgroundOpacity: number
  onSetTheme: (theme: Theme) => void
  onSetAccentHue: (hue: AccentHue) => void
  onSetAccentShade: (shade: AccentShade) => void
  onSetClockAccentHue: (hue: AccentHue) => void
  onSetClockAccentShade: (shade: AccentShade) => void
  onSetIconRadius: (radius: number) => void
  onSetSearchRadius: (radius: number) => void
  onSetPanelOpacity: (opacity: number) => void
  onSetSearchPanelOpacity: (opacity: number) => void
  onSetBackgroundOpacity: (opacity: number) => void
}

/**
 * Appearance, accent colors, radii, and opacity controls for Settings.
 * @param props - Theme values and setters.
 * @returns Theme settings section.
 */
export function ThemeSection({
  theme,
  accentHue,
  accentShade,
  clockAccentHue,
  clockAccentShade,
  iconRadius,
  searchRadius,
  panelOpacity,
  searchPanelOpacity,
  backgroundOpacity,
  onSetTheme,
  onSetAccentHue,
  onSetAccentShade,
  onSetClockAccentHue,
  onSetClockAccentShade,
  onSetIconRadius,
  onSetSearchRadius,
  onSetPanelOpacity,
  onSetSearchPanelOpacity,
  onSetBackgroundOpacity,
}: ThemeSectionProps) {
  const { t } = useTranslation()
  const [accentTarget, setAccentTarget] = useState<'brand' | 'clock'>('brand')
  const editingAccentHue = accentTarget === 'brand' ? accentHue : clockAccentHue
  const editingAccentShade = accentTarget === 'brand' ? accentShade : clockAccentShade
  const showAccentShades = !isNeutralAccent(editingAccentHue)

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-brand">{t('settings.appearanceLabel')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
              theme === 'light'
                ? 'bg-brand text-brand-fg shadow-lg shadow-brand/25'
                : 'bg-zinc-950/5 text-brand hover:bg-brand/10 dark:bg-white/5'
            }`}
            onClick={() => onSetTheme('light')}
          >
            <SunIcon className="size-4 shrink-0" />
            {t('settings.themeLight')}
          </button>
          <button
            type="button"
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
              theme === 'dark'
                ? 'bg-brand text-brand-fg shadow-lg shadow-brand/25'
                : 'bg-zinc-950/5 text-brand hover:bg-brand/10 dark:bg-white/5'
            }`}
            onClick={() => onSetTheme('dark')}
          >
            <MoonIcon className="size-4 shrink-0" />
            {t('settings.themeDark')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-brand">{t('settings.accentSectionLabel')}</p>
        <div className="relative grid h-10 shrink-0 grid-cols-2 rounded-2xl bg-zinc-950/5 p-1 dark:bg-white/5">
          <span
            className={`pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-brand shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              accentTarget === 'clock'
                ? 'translate-x-[calc(100%+0.25rem)]'
                : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            className={`relative z-10 rounded-xl text-sm font-semibold transition-colors duration-300 ${
              accentTarget === 'brand' ? 'text-brand-fg' : 'text-brand/55 hover:text-brand'
            }`}
            onClick={() => setAccentTarget('brand')}
          >
            {t('common.theme')}
          </button>
          <button
            type="button"
            className={`relative z-10 rounded-xl text-sm font-semibold transition-colors duration-300 ${
              accentTarget === 'clock' ? 'text-brand-fg' : 'text-brand/55 hover:text-brand'
            }`}
            onClick={() => setAccentTarget('clock')}
          >
            {t('settings.accentTabClock')}
          </button>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-brand">{t('settings.accentHueLabel')}</p>
          <div className="grid grid-cols-6 gap-2.5 p-1.5 sm:grid-cols-9 sm:gap-3 sm:p-2">
            {visibleAccentHues(theme).map((hue) => {
              const selected = editingAccentHue === hue
              const neutral = isNeutralAccent(hue)
              return (
                <button
                  type="button"
                  key={hue}
                  aria-pressed={selected}
                  title={hue}
                  className={`mx-auto size-7 rounded-full transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-90 sm:size-8 ${
                    // White needs a resting outline on light panels; black needs one when
                    // selected so a dark brand ring is not lost against the swatch.
                    hue === 'white' && !selected ? 'ring-1 ring-zinc-400' : ''
                  } ${
                    selected
                      ? neutral
                        ? 'scale-105 ring-2 ring-ink ring-offset-2 ring-offset-white dark:ring-offset-zinc-900'
                        : 'scale-105 ring-2 ring-brand ring-offset-2 ring-offset-white dark:ring-offset-zinc-900'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: accentSwatchVar(hue) }}
                  onClick={() => {
                    if (accentTarget === 'brand') {
                      onSetAccentHue(hue)
                      return
                    }
                    onSetClockAccentHue(hue)
                  }}
                />
              )
            })}
          </div>

          <div
            className={`grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              showAccentShades
                ? 'mt-3 grid-rows-[1fr] opacity-100'
                : 'pointer-events-none mt-0 grid-rows-[0fr] opacity-0'
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div
                className={`space-y-3 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  showAccentShades ? 'translate-y-0' : '-translate-y-2'
                }`}
              >
                <p className="text-sm font-semibold text-brand">
                  {t('settings.accentShadeLabel')}
                </p>
                <div className="grid grid-cols-5 gap-2 p-1 sm:gap-2.5 sm:p-1.5">
                  {ACCENT_SHADES.map((shade) => {
                    const selected = editingAccentShade === shade
                    const lightLabel = shade <= 400
                    return (
                      <button
                        type="button"
                        key={shade}
                        tabIndex={showAccentShades ? 0 : -1}
                        className={`flex min-h-9 min-w-0 items-center justify-center rounded-xl px-0.5 text-center text-[10px] font-bold tabular-nums transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 sm:min-h-10 sm:rounded-2xl sm:px-2 sm:text-xs ${
                          selected
                            ? 'scale-[1.03] ring-2 ring-brand ring-offset-2 ring-offset-(--panel)'
                            : 'hover:opacity-90'
                        } ${lightLabel ? 'text-zinc-950' : 'text-white'}`}
                        style={{
                          backgroundColor: `var(--color-${editingAccentHue}-${shade})`,
                        }}
                        onClick={() => {
                          if (accentTarget === 'brand') {
                            onSetAccentShade(shade)
                            return
                          }
                          onSetClockAccentShade(shade)
                        }}
                      >
                        <span className="hidden sm:inline">{shade}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <p className="text-sm font-semibold text-brand">{t('settings.iconRadiusLabel')}</p>
            <div className="flex items-center gap-1.5 text-brand">
              <span className="size-3.5 shrink-0 rounded-[2px] bg-current" />
              <ArrowRightIcon className="size-3 shrink-0 opacity-60" />
              <span className="size-3.5 shrink-0 rounded-full bg-current" />
            </div>
          </div>
          <p className="text-sm font-bold text-brand tabular-nums">{iconRadius}%</p>
        </div>
        <input
          type="range"
          min={MIN_ICON_RADIUS}
          max={MAX_ICON_RADIUS}
          step={1}
          value={iconRadius}
          className="w-full accent-brand"
          onChange={(event) => onSetIconRadius(Number(event.target.value))}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <p className="text-sm font-semibold text-brand">{t('settings.searchRadiusLabel')}</p>
            <div className="flex items-center gap-1.5 text-brand">
              <span className="size-3.5 shrink-0 rounded-[2px] bg-current" />
              <ArrowRightIcon className="size-3 shrink-0 opacity-60" />
              <span className="h-3.5 w-6 shrink-0 rounded-full bg-current" />
            </div>
          </div>
          <p className="text-sm font-bold text-brand tabular-nums">{searchRadius}%</p>
        </div>
        <input
          type="range"
          min={MIN_SEARCH_RADIUS}
          max={MAX_SEARCH_RADIUS}
          step={1}
          value={searchRadius}
          className="w-full accent-brand"
          onChange={(event) => onSetSearchRadius(Number(event.target.value))}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm font-semibold text-brand">{t('settings.opacityLabel')}</p>
          <p className="text-sm font-bold text-brand tabular-nums">
            {Math.round((1 - panelOpacity) * 100)}%
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round((1 - panelOpacity) * 100)}
          className="w-full accent-brand"
          onChange={(event) => onSetPanelOpacity(1 - Number(event.target.value) / 100)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm font-semibold text-brand">
            {t('settings.searchPanelOpacityLabel')}
          </p>
          <p className="text-sm font-bold text-brand tabular-nums">
            {Math.round((1 - searchPanelOpacity) * 100)}%
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round((1 - searchPanelOpacity) * 100)}
          className="w-full accent-brand"
          onChange={(event) =>
            onSetSearchPanelOpacity(1 - Number(event.target.value) / 100)
          }
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <p className="text-sm font-semibold text-brand">
            {t('settings.backgroundOpacityLabel')}
          </p>
          <p className="text-sm font-bold text-brand tabular-nums">
            {Math.round(backgroundOpacity * 100)}%
          </p>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(backgroundOpacity * 100)}
          className="w-full accent-brand"
          onChange={(event) => onSetBackgroundOpacity(Number(event.target.value) / 100)}
        />
      </div>
    </div>
  )
}
