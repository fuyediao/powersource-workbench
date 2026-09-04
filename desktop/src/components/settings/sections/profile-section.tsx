import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { useProfile } from '@/hooks/use-profile'
import type { SettingsRolesState } from '@/hooks/use-settings-roles'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { PhoneInput } from '@/components/settings/phone-input'
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
  const profile = useProfile(user, roles, t)
  const [isEditing, setIsEditing] = useState(false)
  const feedback = useDialogPresence(profile.saveSuccess || Boolean(profile.saveError), 220)

  const displayName = profile.displayName || fallbackDisplayName
  const avatarUrl = profile.avatarUrl || fallbackAvatarUrl
  const email = profile.email || publicContactEmail(fallbackEmail)
  const showEmail = Boolean(email)

  const fieldClass =
    'w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none dark:border-white/10 dark:bg-zinc-950/40' +
    (isEditing ? ' focus:border-brand' : ' cursor-default')

  const nameFieldClass = isEditing
    ? fieldClass
    : 'w-full rounded-2xl border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-brand outline-none'

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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-2xl bg-brand/10 px-3 py-2 text-xs font-bold text-brand transition hover:bg-brand/15"
              onClick={() => fileRef.current?.click()}
            >
              {t('settings.profile.avatar.upload')}
            </button>
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
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-semibold text-muted">{t('settings.profile.email')}</p>
            <p className={`truncate ${fieldClass}`}>{email}</p>
          </div>
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
