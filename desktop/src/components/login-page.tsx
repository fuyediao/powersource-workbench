import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ShieldCheck, Sparkles } from '@/icons/all-icons'

interface LoginPageProps {
  error: string
  loading: boolean
  onActivate: (code: string, username: string, password: string) => Promise<boolean>
  onLogin: (username: string, password: string) => Promise<boolean>
}

/**
 * Renders the password-only login and invitation activation flows.
 * @param props - Authentication state and actions.
 * @returns The login page.
 */
export function LoginPage({ error, loading, onActivate, onLogin }: LoginPageProps) {
  const { t } = useTranslation()
  const [activationMode, setActivationMode] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [localError, setLocalError] = useState('')

  /**
   * Submits the active authentication flow.
   * @param event - Form submit event.
   * @returns Nothing.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setLocalError('')
    if (activationMode) {
      if (password !== confirmPassword) {
        setLocalError(t('auth.passwordMismatch'))
        return
      }
      await onActivate(invitationCode.trim(), username.trim(), password)
      return
    }
    await onLogin(username.trim(), password)
  }

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="brand-mark"><Sparkles size={24} /></div>
        <div>
          <p className="eyebrow">POWERSOURCE</p>
          <h1>{t('app.name')}</h1>
          <p>{t('app.tagline')}</p>
        </div>
        <div className="login-orbit" aria-hidden="true" />
      </section>
      <section className="login-form-panel">
        <form className="login-card" onSubmit={(event) => void handleSubmit(event)}>
          {activationMode ? (
            <button className="back-button" type="button" onClick={() => setActivationMode(false)}>
              <ArrowLeft size={16} /> {t('auth.backToSignIn')}
            </button>
          ) : null}
          <div className="login-icon"><ShieldCheck size={26} /></div>
          <h2>{t(activationMode ? 'auth.activationTitle' : 'auth.title')}</h2>
          <p className="muted">{t(activationMode ? 'auth.activationSubtitle' : 'auth.subtitle')}</p>
          {activationMode ? (
            <label>
              <span>{t('auth.invitationCode')}</span>
              <input value={invitationCode} onChange={(event) => setInvitationCode(event.target.value)} required />
            </label>
          ) : null}
          <label>
            <span>{t('auth.username')}</span>
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label>
            <span>{t('auth.password')}</span>
            <input autoComplete={activationMode ? 'new-password' : 'current-password'} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} />
          </label>
          {activationMode ? (
            <label>
              <span>{t('auth.confirmPassword')}</span>
              <input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={10} />
            </label>
          ) : null}
          {localError || error ? <p className="form-error" role="alert">{localError || error}</p> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {t(loading ? (activationMode ? 'auth.activating' : 'auth.signingIn') : activationMode ? 'auth.activate' : 'auth.signIn')}
          </button>
          {!activationMode ? (
            <button className="text-button" type="button" onClick={() => setActivationMode(true)}>
              {t('auth.activate')}
            </button>
          ) : null}
        </form>
      </section>
    </main>
  )
}
