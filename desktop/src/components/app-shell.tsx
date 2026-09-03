import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid2X2, LogOut, Search, Settings, Sparkles } from '@/icons/all-icons'
import { HomePage } from '@/components/home-page'
import { SearchPage } from '@/components/search-page'
import { SettingsPage } from '@/components/settings-page'
import type { WorkbenchUser } from '@/types/auth'
import type { WorkbenchPage } from '@/types/navigation'

interface AppShellProps {
  user: WorkbenchUser
  onSignOut: () => Promise<void>
}

/**
 * Renders the signed-in navigation shell for the three migrated areas.
 * @param props - Current account and sign-out action.
 * @returns The signed-in Workbench shell.
 */
export function AppShell({ user, onSignOut }: AppShellProps) {
  const { t } = useTranslation()
  const [page, setPage] = useState<WorkbenchPage>('home')

  useEffect(() => {
    /**
     * Opens Workbench search with the standard desktop shortcut.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPage('search')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const items = [
    { id: 'home' as const, label: t('nav.home'), icon: Grid2X2 },
    { id: 'search' as const, label: t('nav.search'), icon: Search },
    { id: 'settings' as const, label: t('nav.settings'), icon: Settings },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark small"><Sparkles size={18} /></span><span><strong>PowerSource</strong><small>Workbench</small></span></div>
        <nav>{items.map((item) => { const Icon = item.icon; return <button className={page === item.id ? 'active' : ''} key={item.id} type="button" onClick={() => setPage(item.id)}><Icon size={19} /><span>{item.label}</span></button> })}</nav>
        <div className="sidebar-account"><div className="avatar small">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</div><span><strong>{user.displayName || user.username}</strong><small>@{user.username}</small></span><button aria-label={t('auth.signOut')} type="button" onClick={() => void onSignOut()}><LogOut size={18} /></button></div>
      </aside>
      <main className="workspace">
        {page === 'home' ? <HomePage user={user} onNavigate={setPage} /> : null}
        {page === 'search' ? <SearchPage onNavigate={setPage} /> : null}
        {page === 'settings' ? <SettingsPage user={user} /> : null}
      </main>
    </div>
  )
}
