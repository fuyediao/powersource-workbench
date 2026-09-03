import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AppleIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  MapExplorerIcon,
} from '@/icons/AllIcons'
import {
  EMPLOYEE_ID_PATTERN,
  isAuthPublicApiConfigured,
  resolveEmployeeId,
} from '@/services/auth-public-api'
import { normalizeEmployeeIdForSubmit } from '@/utils/login/login-employee-id'
import { normalizeLoginEmail } from '@/utils/login/normalize-login-email'

type LoginMode = 'employeeId' | 'email' | 'emailOtp'

const MODE_ORDER: LoginMode[] = ['employeeId', 'email', 'emailOtp']
const OTP_CODE_LENGTH = 6
const RESEND_COOLDOWN_SEC = 60

interface LoginFormPanelProps {
  error: string | null
  configured: boolean
  isBusy: boolean
  onClearError: () => void
  onSignInWithGoogle: () => Promise<void>
  onSignInWithPassword: (email: string, password: string) => Promise<boolean>
  onSignInWithOtp: (email: string) => Promise<boolean>
  onVerifyEmailOtp: (email: string, token: string) => Promise<boolean>
  onTypingChange: (typing: boolean) => void
  onPasswordChange: (password: string) => void
  onShowPasswordChange: (show: boolean) => void
}

/**
 * Right form column matching workbench-web Vue LoginFormPanel
 * (employee id / email / OTP + Google / Apple).
 * @param props - Auth actions and error state.
 * @returns Login form panel.
 */
export function LoginFormPanel({
  error,
  configured,
  isBusy,
  onClearError,
  onSignInWithGoogle,
  onSignInWithPassword,
  onSignInWithOtp,
  onVerifyEmailOtp,
  onTypingChange,
  onPasswordChange,
  onShowPasswordChange,
}: LoginFormPanelProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<LoginMode>('employeeId')
  const [employeeId, setEmployeeId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [localError, setLocalError] = useState('')
  const [isSent, setIsSent] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const activeModeIndex = Math.max(0, MODE_ORDER.indexOf(mode))
  const isOtpMode = mode === 'emailOtp'
  const isPasswordMode = mode === 'employeeId' || mode === 'email'
  const displayError = localError || error

  useEffect(() => {
    if (countdown <= 0) {
      return
    }
    const timer = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(timer)
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [countdown])

  /**
   * Switches login mode and clears mode-specific state.
   * @param next - Target mode.
   * @returns Nothing.
   */
  function selectMode(next: LoginMode): void {
    if (next === mode) {
      return
    }
    setMode(next)
    setLocalError('')
    onClearError()
    setIsSent(false)
    setOtpCode('')
    setCountdown(0)
    if (next === 'emailOtp') {
      setPassword('')
      setShowPassword(false)
      onPasswordChange('')
      onShowPasswordChange(false)
    }
  }

  /**
   * Employee id + password: resolve PS#### then password sign-in.
   * @returns Nothing.
   */
  async function handleEmployeeIdSubmit(): Promise<void> {
    setLocalError('')
    onClearError()
    if (!employeeId.trim()) {
      setLocalError(t('auth.employeeIdRequired'))
      return
    }
    if (!password) {
      setLocalError(t('auth.passwordRequired'))
      return
    }
    const id = normalizeEmployeeIdForSubmit(employeeId)
    if (!EMPLOYEE_ID_PATTERN.test(id)) {
      setLocalError(t('auth.employeeIdInvalid'))
      return
    }
    if (!isAuthPublicApiConfigured()) {
      setLocalError(t('auth.employeeIdResolveFailed'))
      return
    }
    const resolvedEmail = await resolveEmployeeId(id)
    if (!resolvedEmail) {
      setLocalError(t('auth.employeeIdResolveFailed'))
      return
    }
    await onSignInWithPassword(normalizeLoginEmail(resolvedEmail), password)
  }

  /**
   * Email + password sign-in.
   * @returns Nothing.
   */
  async function handleEmailPasswordSubmit(): Promise<void> {
    setLocalError('')
    onClearError()
    if (!email.trim()) {
      setLocalError(t('auth.emailRequired'))
      return
    }
    if (!password) {
      setLocalError(t('auth.passwordRequired'))
      return
    }
    await onSignInWithPassword(normalizeLoginEmail(email), password)
  }

  /**
   * Sends or resends the email OTP code.
   * @returns Nothing.
   */
  async function handleSendCode(): Promise<void> {
    if (countdown > 0 || isBusy) {
      return
    }
    setLocalError('')
    onClearError()
    if (!email.trim()) {
      setLocalError(t('auth.emailRequired'))
      return
    }
    const ok = await onSignInWithOtp(normalizeLoginEmail(email))
    if (ok) {
      setIsSent(true)
      setCountdown(RESEND_COOLDOWN_SEC)
    }
  }

  /**
   * Verifies the 6-digit OTP.
   * @returns Nothing.
   */
  async function handleOtpVerify(): Promise<void> {
    setLocalError('')
    onClearError()
    if (!email.trim()) {
      setLocalError(t('auth.emailRequired'))
      return
    }
    if (!isSent) {
      setLocalError(t('auth.otpSendFirst'))
      return
    }
    const code = otpCode.trim()
    if (code.length !== OTP_CODE_LENGTH) {
      setLocalError(t('auth.otpInvalid'))
      return
    }
    await onVerifyEmailOtp(normalizeLoginEmail(email), code)
  }

  /**
   * Submits the active login mode form.
   * @param event - Form submit event.
   * @returns Nothing.
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (mode === 'employeeId') {
      void handleEmployeeIdSubmit()
      return
    }
    if (mode === 'email') {
      void handleEmailPasswordSubmit()
      return
    }
    void handleOtpVerify()
  }

  const submitDisabled =
    isBusy || (isOtpMode && (!isSent || otpCode.length !== OTP_CODE_LENGTH))

  return (
    <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-canvas p-8 text-ink">
      <div className="w-full max-w-[420px]">
        <div className="mb-12 flex items-center justify-center gap-2 text-lg font-semibold lg:hidden">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white shadow-sm dark:bg-zinc-900">
            <MapExplorerIcon className="size-7" />
          </div>
          <span>PowerSource Workbench</span>
        </div>

        <div className="mb-6 text-center">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-ink">
            {t('auth.welcomeBack')}
          </h1>
          <p className="text-sm text-muted">
            {isOtpMode ? t('auth.otpSubtitle') : t('auth.enterDetails')}
          </p>
        </div>

        <div
          className="relative mb-8 grid grid-cols-3 gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-zinc-800"
          role="tablist"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem-0.5rem)/3)] rounded-md bg-brand shadow-sm transition-transform duration-300 ease-out"
            style={{ transform: `translateX(calc(${activeModeIndex} * (100% + 0.25rem)))` }}
          />
          {(
            [
              ['employeeId', 'auth.employeeIdLabel'],
              ['email', 'auth.emailLabel'],
              ['emailOtp', 'auth.modeEmailOtp'],
            ] as const
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={`relative z-10 h-10 rounded-md px-1 text-sm font-medium transition-colors ${
                mode === id ? 'text-brand-fg' : 'text-muted hover:text-ink'
              }`}
              onClick={() => {
                selectMode(id)
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        <form className="space-y-5" noValidate onSubmit={handleSubmit}>
          {mode === 'employeeId' ? (
            <div className="space-y-2">
              <label htmlFor="login-employee-id" className="block text-sm font-medium text-ink">
                {t('auth.employeeIdLabel')}
              </label>
              <input
                id="login-employee-id"
                value={employeeId}
                placeholder={t('auth.employeeIdPlaceholder')}
                autoComplete="username"
                className="h-12 w-full rounded-md border border-zinc-950/10 bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-white/15 dark:bg-zinc-900"
                onFocus={() => {
                  onTypingChange(true)
                }}
                onBlur={() => {
                  onTypingChange(false)
                }}
                onChange={(event) => {
                  setEmployeeId(event.target.value)
                }}
              />
            </div>
          ) : null}

          {mode === 'email' || mode === 'emailOtp' ? (
            <div className="space-y-2">
              <label htmlFor="login-email" className="block text-sm font-medium text-ink">
                {t('auth.emailLabel')}
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                placeholder={t('auth.emailPlaceholder')}
                autoComplete="email"
                className="h-12 w-full rounded-md border border-zinc-950/10 bg-white px-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-white/15 dark:bg-zinc-900"
                onFocus={() => {
                  onTypingChange(true)
                }}
                onBlur={() => {
                  onTypingChange(false)
                }}
                onChange={(event) => {
                  setEmail(event.target.value)
                }}
              />
            </div>
          ) : null}

          {isOtpMode ? (
            <div className="space-y-2">
              <label htmlFor="login-otp" className="block text-sm font-medium text-ink">
                {t('auth.otpLabel')}
              </label>
              <div className="relative">
                <input
                  id="login-otp"
                  value={otpCode}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_CODE_LENGTH}
                  placeholder={t('auth.otpPlaceholder')}
                  className="h-12 w-full rounded-md border border-zinc-950/10 bg-white py-0 pr-28 pl-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-white/15 dark:bg-zinc-900"
                  onChange={(event) => {
                    setOtpCode(event.target.value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH))
                  }}
                />
                <button
                  type="button"
                  disabled={countdown > 0 || isBusy || !email.trim()}
                  className="absolute top-1/2 right-2 inline-flex h-8 -translate-y-1/2 items-center rounded-md px-3 text-xs font-medium text-ink transition hover:bg-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                  onClick={() => {
                    void handleSendCode()
                  }}
                >
                  {countdown > 0
                    ? t('auth.resendIn', { seconds: countdown })
                    : isSent
                      ? t('auth.resend')
                      : t('auth.otpSendCode')}
                </button>
              </div>
            </div>
          ) : null}

          {isPasswordMode ? (
            <div className="space-y-2">
              <label htmlFor="login-password" className="block text-sm font-medium text-ink">
                {t('auth.passwordLabel')}
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete="current-password"
                  required
                  className="h-12 w-full rounded-md border border-zinc-950/10 bg-white py-0 pr-10 pl-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 dark:border-white/15 dark:bg-zinc-900"
                  onChange={(event) => {
                    const next = event.target.value
                    setPassword(next)
                    onPasswordChange(next)
                  }}
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted transition hover:text-ink"
                  onClick={() => {
                    setShowPassword((value) => {
                      const next = !value
                      onShowPasswordChange(next)
                      return next
                    })
                  }}
                >
                  {showPassword ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
                </button>
              </div>
            </div>
          ) : null}

          {displayError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
              {displayError}
            </div>
          ) : null}

          {!configured ? (
            <div className="rounded-lg border border-zinc-950/10 bg-zinc-950/5 p-3 text-sm text-muted dark:border-white/10 dark:bg-white/5">
              {t('auth.notConfigured')}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitDisabled || !configured}
            aria-busy={isBusy}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand text-base font-medium text-brand-fg transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? t('auth.signingIn') : t('auth.logIn')}
          </button>
        </form>

        <div className="relative my-6" role="separator" aria-hidden>
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-zinc-950/10 dark:border-white/15" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-canvas px-3 text-muted">{t('auth.or')}</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={isBusy || !configured}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-md border border-zinc-950/10 bg-white text-sm font-medium text-ink transition hover:bg-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            onClick={() => {
              setLocalError('')
              onClearError()
              void onSignInWithGoogle()
            }}
          >
            <GoogleIcon className="size-5" />
            <span>{t('auth.signInWithGoogle')}</span>
          </button>

          <button
            type="button"
            disabled
            className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-md border border-zinc-950/10 bg-zinc-950 text-sm font-medium text-white opacity-60 dark:border-white/20 dark:bg-white dark:text-zinc-950"
          >
            <AppleIcon className="size-5" />
            <span>{t('auth.signInWithApple')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
