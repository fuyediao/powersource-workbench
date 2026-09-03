import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  AlibabaIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  MailIcon,
} from '@/icons/AllIcons'
import { getProviderPresets } from '@/services/mail-api'
import type { MailImapSmtpConfig, MailProvider } from '@/types/mail'

const ALI_PRESET: MailImapSmtpConfig = {
  imapHost: 'imap.qiye.aliyun.com',
  imapPort: 993,
  imapSsl: true,
  smtpHost: 'smtp.qiye.aliyun.com',
  smtpPort: 465,
  smtpSsl: true,
  username: '',
  password: '',
}

const GENERIC_IMAP_PRESET: MailImapSmtpConfig = {
  imapHost: '',
  imapPort: 0,
  imapSsl: true,
  smtpHost: '',
  smtpPort: 0,
  smtpSsl: true,
  username: '',
  password: '',
}

type OnboardStep = 'welcome' | 'provider' | 'ali-form' | 'imap-name' | 'imap-servers'
type ImapProviderKind = Extract<MailProvider, 'alibaba' | 'imap'>
type StepSlide = 'forward' | 'back' | 'none'

const STEP_DEPTH: Record<OnboardStep, number> = {
  welcome: 0,
  provider: 1,
  'ali-form': 2,
  'imap-name': 2,
  'imap-servers': 3,
}

interface MailAddAccountProps {
  open: boolean
  variant: 'onboarding' | 'add'
  error: string | null
  isConnectingGmail: boolean
  onClose: () => void
  onConnectGmail: () => Promise<boolean>
  onCancelGmail: () => void
  onConnectImap: (
    provider: MailProvider,
    email: string,
    displayName: string | null,
    config: MailImapSmtpConfig,
  ) => Promise<boolean>
}

/**
 * Mailspring-style mailbox onboarding: welcome, full-width providers, IMAP wizard.
 * @param props - Variant and connect handlers.
 * @returns Overlay, or null when unmounted.
 */
export function MailAddAccount({
  open,
  variant,
  error,
  isConnectingGmail,
  onClose,
  onConnectGmail,
  onCancelGmail,
  onConnectImap,
}: MailAddAccountProps) {
  const { t } = useTranslation()
  const presence = useDialogPresence(open, 240)
  const [step, setStep] = useState<OnboardStep>(variant === 'onboarding' ? 'welcome' : 'provider')
  const [stepSlide, setStepSlide] = useState<StepSlide>('none')
  const [stepAnimKey, setStepAnimKey] = useState(0)
  const [imapProvider, setImapProvider] = useState<ImapProviderKind>('alibaba')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [imap, setImap] = useState(ALI_PRESET)
  const [aliPreset, setAliPreset] = useState(ALI_PRESET)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    setStep(variant === 'onboarding' ? 'welcome' : 'provider')
    setStepSlide('none')
    setStepAnimKey(0)
    setImapProvider('alibaba')
    setEmail('')
    setDisplayName('')
    setPassword('')
    setShowPassword(false)
    setImap(ALI_PRESET)
    setAliPreset(ALI_PRESET)
    void getProviderPresets()
      .then((presets) => {
        const preset = presets.alibaba
        if (!preset) {
          return
        }
        const next: MailImapSmtpConfig = {
          ...ALI_PRESET,
          imapHost: preset.imapHost || ALI_PRESET.imapHost,
          imapPort: preset.imapPort || ALI_PRESET.imapPort,
          smtpHost: preset.smtpHost || ALI_PRESET.smtpHost,
          smtpPort: preset.smtpPort || ALI_PRESET.smtpPort,
          smtpSsl: preset.smtpSsl,
        }
        setAliPreset(next)
        setImap(next)
      })
      .catch(() => undefined)
  }, [open, variant])

  if (!presence.mounted) {
    return null
  }

  const leaveClass = presence.leaving ? 'dialog-panel-out' : 'dialog-panel-in'
  const backdropClass = presence.leaving ? 'dialog-backdrop-out' : 'dialog-backdrop-in'
  const showBack =
    step === 'welcome' ? false : step === 'provider' ? variant === 'onboarding' : true
  const canQuickConnect = Boolean(
    imap.imapHost.trim() &&
      imap.smtpHost.trim() &&
      imap.imapPort > 0 &&
      imap.smtpPort > 0,
  )
  const stepAnimClass =
    stepSlide === 'forward'
      ? 'mail-onboard-step-forward'
      : stepSlide === 'back'
        ? 'mail-onboard-step-back'
        : undefined

  /**
   * Moves to another onboarding step with a forward/back slide.
   * @param next - Target step.
   */
  function goToStep(next: OnboardStep): void {
    const slide: StepSlide =
      STEP_DEPTH[next] === STEP_DEPTH[step]
        ? 'forward'
        : STEP_DEPTH[next] > STEP_DEPTH[step]
          ? 'forward'
          : 'back'
    setStepSlide(slide)
    setStepAnimKey((key) => key + 1)
    setStep(next)
  }

  /**
   * Goes back one onboarding step.
   */
  function goBack(): void {
    if (step === 'provider') {
      if (variant === 'onboarding') {
        goToStep('welcome')
        return
      }
      onCancelGmail()
      onClose()
      return
    }
    if (step === 'ali-form') {
      goToStep('provider')
      return
    }
    if (step === 'imap-name') {
      goToStep('provider')
      return
    }
    if (step === 'imap-servers') {
      goToStep('imap-name')
    }
  }

  /**
   * Starts Gmail OAuth and closes on success.
   */
  async function handleGmail(): Promise<void> {
    const ok = await onConnectGmail()
    if (ok) {
      onClose()
    }
  }

  /**
   * Opens AliMail one-page credentials or the generic IMAP wizard.
   * @param provider - IMAP provider kind.
   */
  function startImapWizard(provider: ImapProviderKind): void {
    setImapProvider(provider)
    setImap(provider === 'alibaba' ? aliPreset : GENERIC_IMAP_PRESET)
    goToStep(provider === 'alibaba' ? 'ali-form' : 'imap-name')
  }

  /**
   * Submits IMAP credentials for the selected provider.
   */
  async function handleImap(): Promise<void> {
    setIsSaving(true)
    const ok = await onConnectImap(imapProvider, email.trim(), displayName.trim() || null, {
      ...imap,
      username: email.trim(),
      password,
    })
    setIsSaving(false)
    if (ok) {
      onClose()
    }
  }

  const title =
    step === 'welcome'
      ? t('mail.welcomeTitle')
      : step === 'provider'
        ? t('mail.chooseProvider')
        : step === 'ali-form'
          ? t('mail.aliFormTitle')
          : step === 'imap-name'
            ? t('mail.imapIdentityTitle')
            : t('mail.imapServersTitle')

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <button
        type="button"
        className={`absolute inset-0 bg-mail-overlay backdrop-blur-sm ${backdropClass}`}
        aria-label={t('actions.close')}
        onClick={() => {
          onCancelGmail()
          if (variant === 'add') {
            onClose()
          }
        }}
      />
      <div
        className={`relative z-10 flex min-h-[420px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-mail-divider bg-mail-dialog shadow-mail-chrome backdrop-blur-xl ${leaveClass}`}
      >
        <header className="flex items-center gap-2 px-5 pt-5 pb-2">
          {showBack ? (
            <button
              type="button"
              className="rounded-lg p-1 text-muted hover:bg-mail-row-hover hover:text-ink"
              aria-label={t('mail.back')}
              onClick={goBack}
            >
              <ChevronLeftIcon className="size-5" />
            </button>
          ) : (
            <span className="size-7" />
          )}
          <h2
            key={`mail-onboard-title-${step}-${stepAnimKey}`}
            className={`min-w-0 flex-1 text-center text-base font-extrabold tracking-tight text-mail-dialog-title ${stepAnimClass ?? ''}`}
          >
            {title}
          </h2>
          {variant === 'add' ? (
            <button
              type="button"
              className="rounded-lg p-1 text-muted hover:bg-mail-row-hover hover:text-ink"
              aria-label={t('actions.close')}
              onClick={() => {
                onCancelGmail()
                onClose()
              }}
            >
              <CloseIcon className="size-4" />
            </button>
          ) : (
            <span className="size-7" />
          )}
        </header>

        <div
          key={`mail-onboard-body-${step}-${stepAnimKey}`}
          className={`flex min-h-0 flex-1 flex-col px-8 py-4 ${stepAnimClass ?? ''}`}
        >
          {step === 'welcome' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-brand/10 text-brand">
                <MailIcon className="size-8" aria-hidden />
              </span>
              <p className="max-w-sm text-sm font-medium text-muted">{t('mail.welcomeBody')}</p>
              <button
                type="button"
                className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-fg"
                onClick={() => goToStep('provider')}
              >
                {t('mail.getStarted')}
              </button>
            </div>
          ) : null}

          {step === 'provider' ? (
            <div className="flex flex-1 flex-col gap-2 pt-2">
              <button
                type="button"
                className="mail-provider-row flex items-center gap-4 rounded-xl px-3 py-3 text-left disabled:opacity-40"
                disabled={isConnectingGmail}
                onClick={() => void handleGmail()}
              >
                <span className="flex h-8 w-11 shrink-0 items-center justify-center">
                  <GoogleIcon className="size-8" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-mail-dialog-title">{t('mail.provider.gmail')}</span>
                  <span className="block text-xs text-muted">{t('mail.provider.gmailHint')}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted" />
              </button>
              <button
                type="button"
                className="mail-provider-row flex items-center gap-4 rounded-xl px-3 py-3 text-left disabled:opacity-40"
                disabled={isConnectingGmail}
                onClick={() => startImapWizard('alibaba')}
              >
                <span className="flex h-8 w-11 shrink-0 items-center justify-center">
                  <AlibabaIcon className="h-6 w-11" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-mail-dialog-title">{t('mail.provider.alibaba')}</span>
                  <span className="block text-xs text-muted">{t('mail.provider.alibabaHint')}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted" />
              </button>
              <button
                type="button"
                className="mail-provider-row flex items-center gap-4 rounded-xl px-3 py-3 text-left disabled:opacity-40"
                disabled={isConnectingGmail}
                onClick={() => startImapWizard('imap')}
              >
                <span className="flex h-8 w-11 shrink-0 items-center justify-center">
                  <MailIcon className="size-7 text-muted" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-mail-dialog-title">{t('mail.provider.imap')}</span>
                  <span className="block text-xs text-muted">{t('mail.provider.imapHint')}</span>
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-muted" />
              </button>
              {isConnectingGmail ? (
                <p className="mt-4 text-center text-sm font-medium text-muted">{t('mail.oauthWaiting')}</p>
              ) : null}
              {error ? (
                <p className="mt-3 rounded-lg bg-mail-danger-bg px-3 py-2 text-xs text-mail-danger">{error}</p>
              ) : null}
            </div>
          ) : null}

          {step === 'ali-form' ? (
            <form
              className="flex flex-1 flex-col gap-4 pt-2"
              onSubmit={(event) => {
                event.preventDefault()
                void handleImap()
              }}
            >
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.account')}</span>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mail-onboard-input"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.passwordOrAuthCode')}</span>
                <span className="relative block">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mail-onboard-input pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.displayName')}</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mail-onboard-input"
                />
              </label>
              {error ? (
                <p className="rounded-lg bg-mail-danger-bg px-3 py-2 text-xs text-mail-danger">{error}</p>
              ) : null}
              <div className="mt-auto pt-4">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg disabled:opacity-50"
                  disabled={isSaving || !email.trim() || !password}
                >
                  {isSaving ? t('status.saving') : t('mail.connect')}
                </button>
              </div>
            </form>
          ) : null}

          {step === 'imap-name' ? (
            <form
              className="flex flex-1 flex-col gap-4 pt-2"
              onSubmit={(event) => {
                event.preventDefault()
                goToStep('imap-servers')
              }}
            >
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.displayName')}</span>
                <input
                  type="text"
                  autoFocus
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mail-onboard-input"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.email')}</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mail-onboard-input"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.passwordOrAuthCode')}</span>
                <span className="relative block">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mail-onboard-input pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                </span>
              </label>
              <div className="mt-auto pt-4">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg disabled:opacity-50"
                  disabled={!email.trim() || !password}
                >
                  {t('mail.next')}
                </button>
              </div>
            </form>
          ) : null}

          {step === 'imap-servers' ? (
            <form
              className="flex flex-1 flex-col gap-3 pt-2"
              onSubmit={(event) => {
                event.preventDefault()
                void handleImap()
              }}
            >
              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block">
                  <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.imapHost')}</span>
                  <input
                    type="text"
                    value={imap.imapHost}
                    onChange={(event) => setImap((current) => ({ ...current, imapHost: event.target.value }))}
                    className="mail-onboard-input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.imapPort')}</span>
                  <input
                    type="number"
                    value={imap.imapPort > 0 ? imap.imapPort : ''}
                    onChange={(event) =>
                      setImap((current) => ({
                        ...current,
                        imapPort: Number(event.target.value) || 0,
                      }))
                    }
                    className="mail-onboard-input"
                  />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.smtpHost')}</span>
                  <input
                    type="text"
                    value={imap.smtpHost}
                    onChange={(event) => setImap((current) => ({ ...current, smtpHost: event.target.value }))}
                    className="mail-onboard-input"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted">{t('mail.form.smtpPort')}</span>
                  <input
                    type="number"
                    value={imap.smtpPort > 0 ? imap.smtpPort : ''}
                    onChange={(event) =>
                      setImap((current) => ({
                        ...current,
                        smtpPort: Number(event.target.value) || 0,
                      }))
                    }
                    className="mail-onboard-input"
                  />
                </label>
              </div>
              {error ? (
                <p className="rounded-lg bg-mail-danger-bg px-3 py-2 text-xs text-mail-danger">{error}</p>
              ) : null}
              <div className="mt-auto pt-4">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg disabled:opacity-50"
                  disabled={isSaving || !email.trim() || !password || !canQuickConnect}
                >
                  {isSaving ? t('status.saving') : t('mail.connect')}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
