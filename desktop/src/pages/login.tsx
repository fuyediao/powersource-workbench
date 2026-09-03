import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldIcon } from '@/icons/AllIcons'

interface LoginPageProps {
  error: string | null
  loading: boolean
  onLogin: (username: string, password: string) => Promise<boolean>
}

/**
 * Renders the password-only Workbench login form.
 * @param props - Authentication state and actions.
 * @returns The login screen.
 */
export function LoginPage({ error, loading, onLogin }: LoginPageProps) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  /**
   * Submits the username and password sign-in form.
   * @param event - Form submit event.
   * @returns Nothing.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await onLogin(username.trim(), password)
  }

  return (
    <main className="login-page auth-gate">
      <section className="login-form-panel">
        <form className="login-card" onSubmit={(event) => void handleSubmit(event)}>
          <div className="login-icon"><ShieldIcon width={26} height={26} /></div>
          <h2>{t('auth.title')}</h2>
          <p className="muted">{t('auth.subtitle')}</p>
          <label>
            <span>{t('auth.username')}</span>
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            <span>{t('auth.passwordLabel')}</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {t(loading ? 'auth.signingIn' : 'auth.signIn')}
          </button>
        </form>
      </section>
    </main>
  )
}
