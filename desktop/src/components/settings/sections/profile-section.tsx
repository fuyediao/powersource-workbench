import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { useProfile } from '@/hooks/use-profile'
import type { SettingsRolesState } from '@/hooks/use-settings-roles'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { PhoneInput } from '@/components/settings/phone-input'
import { ChevronDownIcon } from '@/icons/AllIcons'
import { publicContactEmail } from '@/utils/auth/workbench-username'

interface ProfileSectionProps {
  user: User | null
  roles: SettingsRolesState
  fallbackEmail: string
  fallbackAvatarUrl: string | null
  fallbackDisplayName: string
  onSignOut: () => Promise<void>
}

/**
 * Profile section with view / edit modes (Edit → Save / Cancel).
 * @param props - Auth user, roles, fallbacks, and sign-out.
 * @returns Profile settings UI.
 */
export function ProfileSection({
  user,
  roles,
  fallbackEmail,
  fallbackAvatarUrl,
  fallbackDisplayName,
  onSignOut,
}: ProfileSectionProps) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const emailMenuRef = useRef<HTMLDivElement>(null)
  const profile = useProfile(user, roles, t)
  const [isEditing, setIsEditing] = useState(false)
  const [emailMenuOpen, setEmailMenuOpen] = useState(false)
  const feedback = useDialogPresence(profile.saveSuccess || Boolean(profile.saveError), 220)
  const emailMenuPresence = useDialogPresence(emailMenuOpen, 180)

  const displayName = profile.displayName || fallbackDisplayName
  const avatarUrl = profile.avatarUrl || fallbackAvatarUrl
  const email = profile.email || publicContactEmail(fallbackEmail)
  const showEmail = Boolean(email) || profile.canChooseDisplayEmail

  const emailOptions = profile.canChooseDisplayEmail
    ? [
        {
          value: profile.primaryAuthEmail,
          label: t('settings.profile.emailOptionPrimary', {
            email: profile.primaryAuthEmail,
          }),
        },
        {
          value: profile.googleIdentityEmail,
          label: t('settings.profile.emailOptionGoogle', {
            email: profile.googleIdentityEmail,
          }),
        },
      ]
    : []
  const selectedEmailLabel =
    emailOptions.find((option) => option.value === profile.email)?.label ?? profile.email

  const fieldClass =
    'w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none dark:border-white/10 dark:bg-zinc-950/40' +
    (isEditing ? ' focus:border-brand' : ' cursor-default')

  const nameFieldClass = isEditing
    ? fieldClass
    : 'w-full rounded-2xl border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-brand outline-none'

  useEffect(() => {
    if (!isEditing) {
      setEmailMenuOpen(false)
    }
  }, [isEditing])

  useEffect(() => {
    if (!emailMenuOpen) {
      return
    }
    /**
     * Closes the display-email menu on outside pointer press.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      if (!emailMenuRef.current?.contains(event.target as Node)) {
        setEmailMenuOpen(false)
      }
    }
    /**
     * Closes the display-email menu on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setEmailMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [emailMenuOpen])

  /**
   * Enters edit mode for profile fields.
   * @returns Nothing.
   */
  function startEditing(): void {
    setIsEditing(true)
  }

  /**
   * Discards local edits by reloading from the server.
   * @returns Nothing.
   */
  async function cancelEditing(): Promise<void> {
    await profile.reloadProfile()
    setIsEditing(false)
  }

  /**
   * Saves profile fields and leaves edit mode on success.
   * @returns Nothing.
   */
  async function handleSave(): Promise<void> {
    const ok = await profile.saveProfile()
    if (ok) {
      setIsEditing(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.profile')}</p>

      <div className="flex items-start gap-3">
        <button
          type="button"
          className="relative size-16 shrink-0 overflow-hidden rounded-full bg-brand/15"
          onClick={() => fileRef.current?.click()}
          disabled={profile.isAvatarUploading}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-lg font-extrabold text-brand">
              {(displayName.trim()[0] || profile.employeeId.trim()[0] || 'W').toUpperCase()}
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              void profile.uploadAvatar(file)
            }
          }}
        />

        <div className="min-w-0 flex-1 space-y-2">
          <label className="block space-y-1.5">
            <input
              className={nameFieldClass}
              value={profile.displayName}
              readOnly={!isEditing}
              onChange={(event) => profile.setDisplayName(event.target.value)}
              placeholder={isEditing ? t('settings.profile.placeholders.displayName') : undefined}
              aria-label={t('settings.profile.displayName')}
            />
          </label>
          {isEditing &&
          profile.googleIdentityName &&
          profile.googleIdentityName !== profile.displayName ? (
            <button
              type="button"
              className="text-xs font-semibold text-brand underline-offset-2 hover:underline"
              onClick={profile.applyGoogleName}
            >
              {t('settings.profile.useGoogleName', { name: profile.googleIdentityName })}
            </button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-2xl bg-brand/10 px-3 py-2 text-xs font-bold text-brand transition hover:bg-brand/15"
              onClick={() => fileRef.current?.click()}
            >
              {t('settings.profile.avatar.upload')}
            </button>
            {profile.isGoogleUser && profile.hasCustomUpload ? (
              <button
                type="button"
                className="rounded-2xl bg-brand/10 px-3 py-2 text-xs font-bold text-brand transition hover:bg-brand/15"
                onClick={() => {
                  void profile.restoreGoogleAvatar()
                }}
              >
                {t('settings.profile.avatar.restoreGoogle')}
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          className="shrink-0 self-center rounded-2xl bg-brand/10 px-3 py-2 text-xs font-bold text-brand transition hover:bg-brand/15"
          onClick={() => {
            void onSignOut()
          }}
        >
          {t('auth.signOut')}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted">{t('settings.profile.employeeId')}</p>
          <p className={fieldClass}>{profile.employeeId || '—'}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted">{t('settings.profile.organizationLabel')}</p>
          <p className={fieldClass}>{profile.organizationLabel || '—'}</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0 space-y-1.5">
          <span className="text-xs font-semibold text-muted">{t('settings.profile.phoneNumber')}</span>
          <PhoneInput
            value={profile.phoneNumber}
            countryCode={profile.phoneCountry}
            readOnly={!isEditing}
            onChange={(nextValue, nextIso) => {
              profile.setPhoneNumber(nextValue)
              profile.setPhoneCountry(nextIso)
            }}
          />
        </label>

        {showEmail ? (
          profile.canChooseDisplayEmail && isEditing ? (
            <div className="relative min-w-0 space-y-1.5" ref={emailMenuRef}>
              <span className="text-xs font-semibold text-muted">
                {t('settings.profile.emailDisplayChoice')}
              </span>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-left text-sm font-semibold text-brand outline-none transition hover:bg-zinc-950/5 focus:border-brand dark:border-white/10 dark:bg-zinc-950/40 dark:hover:bg-white/10"
                aria-expanded={emailMenuOpen}
                aria-haspopup="listbox"
                onClick={() => setEmailMenuOpen((open) => !open)}
              >
                <span className="min-w-0 truncate">{selectedEmailLabel}</span>
                <ChevronDownIcon
                  className={`size-4 shrink-0 text-muted transition ${
                    emailMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {emailMenuPresence.mounted ? (
                <ul
                  className={`absolute z-30 mt-2 w-full origin-top overflow-hidden rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
                    emailMenuPresence.leaving
                      ? 'animate-dropdown-out'
                      : 'animate-dropdown-in'
                  }`}
                  role="listbox"
                >
                  {emailOptions.map((option) => {
                    const selected = option.value === profile.email
                    return (
                      <li key={option.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`flex w-full px-4 py-2.5 text-left text-sm font-semibold transition ${
                            selected
                              ? 'bg-brand/15 text-brand'
                              : 'text-brand hover:bg-brand/10 dark:hover:bg-brand/15'
                          }`}
                          onClick={() => {
                            profile.setEmail(option.value)
                            setEmailMenuOpen(false)
                          }}
                        >
                          <span className="truncate">{option.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold text-muted">
                {profile.canChooseDisplayEmail
                  ? t('settings.profile.emailDisplayChoice')
                  : t('settings.profile.email')}
              </p>
              <p className={`truncate ${fieldClass}`}>{email}</p>
            </div>
          )
        ) : null}
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted">{t('settings.profile.bio')}</span>
        <textarea
          className={`${fieldClass} min-h-24`}
          value={profile.bio}
          readOnly={!isEditing}
          onChange={(event) => profile.setBio(event.target.value)}
          placeholder={isEditing ? t('settings.profile.placeholders.bio') : undefined}
        />
      </label>

      {feedback.mounted ? (
        <p
          className={`text-sm font-semibold ${
            profile.saveError ? 'text-red-500' : 'text-brand'
          } ${feedback.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'}`}
        >
          {profile.saveError
            ? t('settings.profile.save.error')
            : t('settings.profile.save.success')}
        </p>
      ) : null}

      {isEditing ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg transition hover:opacity-90 disabled:opacity-50"
            disabled={profile.isSaving || profile.isLoading}
            onClick={() => {
              void handleSave()
            }}
          >
            {profile.isSaving
              ? t('settings.profile.save.saving')
              : t('settings.profile.save.button')}
          </button>
          <button
            type="button"
            className="rounded-2xl bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand/15 disabled:opacity-50"
            disabled={profile.isSaving}
            onClick={() => {
              void cancelEditing()
            }}
          >
            {t('actions.cancel')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg transition hover:opacity-90 disabled:opacity-50"
          disabled={profile.isLoading}
          onClick={startEditing}
        >
          {t('settings.profile.edit')}
        </button>
      )}
    </div>
  )
}
