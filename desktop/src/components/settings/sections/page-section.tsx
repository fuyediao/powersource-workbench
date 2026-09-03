import { useTranslation } from 'react-i18next'
import type { LinkOpenMode } from '@/utils/settings/link-open-preference'

interface PageSectionProps {
  openLinksMode: LinkOpenMode
  onSetOpenLinksMode: (mode: LinkOpenMode) => void
  showWeather: boolean
  showMarkets: boolean
  showNews: boolean
  showTodo: boolean
  showCurrency: boolean
  showSchedule: boolean
  showMail: boolean
  showFocus: boolean
  showApps: boolean
  peekApps: boolean
  onSetShowWeather: (visible: boolean) => void
  onSetShowMarkets: (visible: boolean) => void
  onSetShowNews: (visible: boolean) => void
  onSetShowTodo: (visible: boolean) => void
  onSetShowCurrency: (visible: boolean) => void
  onSetShowSchedule: (visible: boolean) => void
  onSetShowMail: (visible: boolean) => void
  onSetShowFocus: (visible: boolean) => void
  onSetShowApps: (visible: boolean) => void
}

/**
 * Shared selected / idle styles for a home widget visibility row.
 * @param visible - Whether the widget is currently shown.
 * @returns Class string.
 */
function widgetRowClass(visible: boolean): string {
  return `flex items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
    visible
      ? 'bg-brand text-brand-fg shadow-lg shadow-brand/25'
      : 'bg-zinc-950/5 text-brand hover:bg-brand/10 dark:bg-white/5'
  }`
}

/**
 * Link-open mode and home widget visibility controls for Settings.
 * @param props - Page widget and link-open values/setters.
 * @returns Page settings section.
 */
export function PageSection({
  openLinksMode,
  onSetOpenLinksMode,
  showWeather,
  showMarkets,
  showNews,
  showTodo,
  showCurrency,
  showSchedule,
  showMail,
  showApps,
  peekApps,
  onSetShowWeather,
  onSetShowMarkets,
  onSetShowNews,
  onSetShowTodo,
  onSetShowCurrency,
  onSetShowSchedule,
  onSetShowMail,
  onSetShowApps,
}: PageSectionProps) {
  const { t } = useTranslation()
  const appsVisible = showApps || peekApps

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-brand">{t('settings.openLinksLabel')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              openLinksMode === 'inApp'
                ? 'bg-brand text-brand-fg shadow-lg shadow-brand/25'
                : 'bg-zinc-950/5 text-brand hover:bg-brand/10 dark:bg-white/5'
            }`}
            onClick={() => onSetOpenLinksMode('inApp')}
          >
            {t('settings.openLinksInApp')}
          </button>
          <button
            type="button"
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
              openLinksMode === 'external'
                ? 'bg-brand text-brand-fg shadow-lg shadow-brand/25'
                : 'bg-zinc-950/5 text-brand hover:bg-brand/10 dark:bg-white/5'
            }`}
            onClick={() => onSetOpenLinksMode('external')}
          >
            {t('settings.openLinksExternal')}
          </button>
        </div>
      </div>

      <p className="text-sm font-semibold text-brand">{t('settings.pageWidgetsLabel')}</p>
      <div className="grid gap-2">
        <button
          type="button"
          className={widgetRowClass(appsVisible)}
          onClick={() => onSetShowApps(!appsVisible)}
        >
          <span>{t('settings.appsModeLabel')}</span>
          <span className="text-xs font-bold opacity-80">
            {appsVisible ? t('settings.widgetVisible') : t('settings.widgetHidden')}
          </span>
        </button>
        <button
          type="button"
          className={widgetRowClass(showWeather)}
          onClick={() => onSetShowWeather(!showWeather)}
        >
          <span>{t('weather.title')}</span>
          <span className="text-xs font-bold opacity-80">
            {showWeather ? t('settings.widgetVisible') : t('settings.widgetHidden')}
          </span>
        </button>
        <button
          type="button"
          className={widgetRowClass(showMarkets)}
          onClick={() => onSetShowMarkets(!showMarkets)}
        >
          <span>{t('markets.title')}</span>
          <span className="text-xs font-bold opacity-80">
            {showMarkets ? t('settings.widgetVisible') : t('settings.widgetHidden')}
          </span>
        </button>
        <button
          type="button"
          className={widgetRowClass(showNews)}
          onClick={() => onSetShowNews(!showNews)}
        >
          <span>{t('news.title')}</span>
          <span className="text-xs font-bold opacity-80">
            {showNews ? t('settings.widgetVisible') : t('settings.widgetHidden')}
          </span>
        </button>
        <button
          type="button"
          className={widgetRowClass(showTodo)}
          onClick={() => onSetShowTodo(!showTodo)}
        >
          <span>{t('todo.title')}</span>
          <span className="text-xs font-bold opacity-80">
            {showTodo ? t('settings.widgetVisible') : t('settings.widgetHidden')}
          </span>
        </button>
        <button
          type="button"
          className={widgetRowClass(showCurrency)}
          onClick={() => onSetShowCurrency(!showCurrency)}
        >
          <span>{t('currency.title')}</span>
          <span className="text-xs font-bold opacity-80">
            {showCurrency ? t('settings.widgetVisible') : t('settings.widgetHidden')}
          </span>
        </button>
        <button
          type="button"
          className={widgetRowClass(showSchedule)}
          onClick={() => onSetShowSchedule(!showSchedule)}
        >
          <span>{t('home.aside.scheduleReminder')}</span>
          <span className="text-xs font-bold opacity-80">
            {showSchedule ? t('settings.widgetVisible') : t('settings.widgetHidden')}
          </span>
        </button>
        <button
          type="button"
          className={widgetRowClass(showMail)}
          onClick={() => onSetShowMail(!showMail)}
        >
          <span>{t('home.aside.mailReminder')}</span>
          <span className="text-xs font-bold opacity-80">
            {showMail ? t('settings.widgetVisible') : t('settings.widgetHidden')}
          </span>
        </button>
      </div>
    </div>
  )
}
