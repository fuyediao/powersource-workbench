import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { usePrivacy } from '@/hooks/use-privacy'

interface PrivacySectionProps {
  user: User | null
}

/**
 * Privacy & security: login password.
 * @param props - Signed-in user.
 * @returns Privacy settings UI.
 */
export function PrivacySection({ user }: PrivacySectionProps) {
  const { t } = useTranslation()
  const privacy = usePrivacy(user)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  /**
   * Submits password set / change form.
   * @returns Nothing.
   */
  async function handlePasswordSubmit(): Promise<void> {
    if (newPassword !== confirmPassword) {
      return
    }
    if (privacy.hasPasswordSet) {
      await privacy.changePassword(currentPassword, newPassword)
    } else {
      await privacy.setPassword(newPassword)
    }
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.privacy')}</p>

      <section className="space-y-3">
        <p className="text-xs font-semibold text-muted">{t('settings.privacy.password.title')}</p>
        {privacy.hasPasswordSet ? (
          <input
            type="password"
            className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none dark:border-white/10 dark:bg-zinc-950/40"
            placeholder={t('settings.privacy.password.current')}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        ) : null}
        <input
          type="password"
          className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none dark:border-white/10 dark:bg-zinc-950/40"
          placeholder={t('settings.privacy.password.new')}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <input
          type="password"
          className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none dark:border-white/10 dark:bg-zinc-950/40"
          placeholder={t('settings.privacy.password.confirm')}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <button
          type="button"
          className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
          disabled={privacy.isPasswordSaving || !newPassword || newPassword !== confirmPassword}
          onClick={() => {
            void handlePasswordSubmit()
          }}
        >
          {privacy.hasPasswordSet
            ? t('settings.privacy.password.changePassword')
            : t('settings.privacy.password.setPassword')}
        </button>
        {privacy.passwordError ? (
          <p className="text-sm font-semibold text-red-500">
            {privacy.passwordError === 'too_short'
              ? t('settings.privacy.password.errors.tooShort', { min: privacy.passwordMinLength })
              : privacy.passwordError === 'current_invalid'
                ? t('settings.privacy.password.errors.currentInvalid')
                : t('settings.privacy.password.errors.updateFailed')}
          </p>
        ) : null}
        {privacy.passwordSuccess ? (
          <p className="text-sm font-semibold text-brand">
            {privacy.passwordSuccess === 'set'
              ? t('settings.privacy.password.setSuccess')
              : t('settings.privacy.password.updateSuccess')}
          </p>
        ) : null}
        {newPassword && confirmPassword && newPassword !== confirmPassword ? (
          <p className="text-sm font-semibold text-red-500">
            {t('settings.privacy.password.errors.mismatch')}
          </p>
        ) : null}
      </section>
    </div>
  )
}
