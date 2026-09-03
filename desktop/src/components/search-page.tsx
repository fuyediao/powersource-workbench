import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Languages, Monitor, Search, Settings, UserRound } from '@/icons/all-icons'
import type { WorkbenchPage } from '@/types/navigation'

interface SearchPageProps {
  onNavigate: (page: WorkbenchPage) => void
}

/**
 * Renders local Workbench navigation and settings search.
 * @param props - Navigation action.
 * @returns The search page.
 */
export function SearchPage({ onNavigate }: SearchPageProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const entries = useMemo(() => [
    { id: 'desktop', title: t('nav.home'), detail: t('home.lead'), page: 'home' as const, icon: Monitor },
    { id: 'settings', title: t('nav.settings'), detail: t('settings.noPermissionEditor'), page: 'settings' as const, icon: Settings },
    { id: 'language', title: t('settings.language'), detail: t('settings.general'), page: 'settings' as const, icon: Languages },
    { id: 'account', title: t('settings.account'), detail: t('settings.profile'), page: 'settings' as const, icon: UserRound },
  ], [t])
  const normalized = query.trim().toLocaleLowerCase()
  const results = entries.filter((entry) => !normalized || `${entry.title} ${entry.detail}`.toLocaleLowerCase().includes(normalized))

  return (
    <section className="page search-page">
      <div className="page-title"><Search size={24} /><h2>{t('search.title')}</h2></div>
      <div className="search-box">
        <Search size={20} />
        <input aria-label={t('search.placeholder')} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search.placeholder')} />
      </div>
      <p className="result-label">{t('search.results')}</p>
      <div className="search-results">
        {results.map((entry) => {
          const Icon = entry.icon
          return (
            <button key={entry.id} type="button" onClick={() => onNavigate(entry.page)}>
              <span className="result-icon"><Icon size={19} /></span>
              <span><strong>{entry.title}</strong><small>{entry.detail}</small></span>
              <ChevronRight size={18} />
            </button>
          )
        })}
        {results.length === 0 ? <p className="empty-result">{t('search.noResults')}</p> : null}
      </div>
    </section>
  )
}
