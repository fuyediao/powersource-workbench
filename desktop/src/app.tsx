import { AppShell } from '@/components/app-shell'
import { LoginPage } from '@/components/login-page'
import { useAuth } from '@/hooks/use-auth'

/**
 * Selects the authenticated or signed-out Workbench experience.
 * @returns The application root.
 */
export default function App() {
  const auth = useAuth()
  if (auth.loading && !auth.user) {
    return <div className="loading-screen"><span /></div>
  }
  if (!auth.user) {
    return <LoginPage error={auth.error} loading={auth.loading} onLogin={auth.login} />
  }
  return <AppShell user={auth.user} onSignOut={auth.logout} />
}
