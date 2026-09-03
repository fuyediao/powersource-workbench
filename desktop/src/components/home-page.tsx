import { useTranslation } from 'react-i18next'
import { Search, Settings, Sparkles } from '@/icons/all-icons'
import type { WorkbenchUser } from '@/types/auth'
import type { WorkbenchPage } from '@/types/navigation'

interface HomePageProps {
  user: WorkbenchUser
  onNavigate: (page: WorkbenchPage) => void
}

/**
 * Resolves the localized greeting period for the current time.
 * @returns Translation key suffix for morning, afternoon, or evening.
 */
function greetingPeriod(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/**
 * Renders the clean group desktop without legacy business applications.
 * @param props - Current account and navigation action.
 * @returns The desktop page.
 */
export function HomePage({ user, onNavigate }: HomePageProps) {
  const { t } = useTranslation()
  return (
    <section className="page home-page">
      <header className="hero-card">
        <div className="brand-mark"><Sparkles size={24} /></div>
        <div>
          <p className="eyebrow">{t('app.name')}</p>
          <h2>{t('home.greeting', { name: user.displayName || user.username, period: t(`home.${greetingPeriod()}`) })}</h2>
          <p>{t('home.lead')}</p>
        </div>
      </header>
      <div className="section-heading"><h3>{t('home.quickAccess')}</h3></div>
      <div className="quick-grid">
        <button className="quick-card" type="button" onClick={() => onNavigate('search')}>
          <span className="quick-icon"><Search size={24} /></span>
          <strong>{t('home.searchTitle')}</strong>
          <span>{t('home.searchDescription')}</span>
        </button>
        <button className="quick-card" type="button" onClick={() => onNavigate('settings')}>
          <span className="quick-icon"><Settings size={24} /></span>
          <strong>{t('home.settingsTitle')}</strong>
          <span>{t('home.settingsDescription')}</span>
        </button>
      </div>
      <div className="empty-workspace">
        <Sparkles size={30} />
        <h3>{t('home.emptyTitle')}</h3>
        <p>{t('home.emptyDescription')}</p>
      </div>
    </section>
  )
}
