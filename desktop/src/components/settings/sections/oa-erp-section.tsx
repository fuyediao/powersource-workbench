import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { EyeIcon, EyeOffIcon } from '@/icons/AllIcons'
import {
  fetchOaErpCredentials,
  OaErpApiError,
  saveOaErpCredentials,
} from '@/services/oa-erp-api'

interface OaErpSectionProps {
  /** Signed-in user id (owner of the local credentials row). */
  userId: string
}

/**
 * Settings → OA/ERP: two credential forms (OA + ERP) with employee-id defaults.
 * Values are stored on this machine in Electron SQLite for in-app autofill.
 *
 * @param props - Signed-in user id
 * @returns OA/ERP settings section
 */
export function OaErpSection({ userId }: OaErpSectionProps) {
  const { t } = useTranslation()
  const [oaUsername, setOaUsername] = useState('')
  const [erpUsername, setErpUsername] = useState('')
  const [oaPassword, setOaPassword] = useState('')
  const [erpPassword, setErpPassword] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [showOaPassword, setShowOaPassword] = useState(false)
  const [showErpPassword, setShowErpPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const feedback = useDialogPresence(saveSuccess || Boolean(saveError), 220)
  const localStorageAvailable = Boolean(window.geocrm?.oaErpCredentials)

  const fieldClass =
    'w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-brand outline-none dark:border-white/10 dark:bg-zinc-950/40' +
    (isEditing ? ' focus:border-brand' : ' cursor-default')
  const passwordFieldClass = `${fieldClass} pr-11`

  /**
   * Loads credentials from local SQLite and applies employee-id defaults.
   * @returns Nothing
   */
  const load = useCallback(async (): Promise<void> => {
    if (!localStorageAvailable) {
      setIsLoading(false)
      setSaveError(t('settings.oaErp.errors.notConfigured'))
      return
    }
    setIsLoading(true)
    setSaveError(null)
    try {
      const data = await fetchOaErpCredentials(userId)
      setEmployeeId(data.employeeId)
      setOaUsername(data.oaUsername || data.employeeId)
      setErpUsername(data.erpUsername || data.employeeId)
      setOaPassword(data.oaPassword)
      setErpPassword(data.erpPassword)
    } catch (err) {
      const message =
        err instanceof OaErpApiError
          ? err.message
          : t('settings.oaErp.errors.loadFailed')
      setSaveError(message)
    } finally {
      setIsLoading(false)
    }
  }, [localStorageAvailable, t, userId])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Enters edit mode with the current stored passwords.
   * @returns Nothing
   */
  function startEditing(): void {
    setSaveSuccess(false)
    setSaveError(null)
    setShowOaPassword(false)
    setShowErpPassword(false)
    setIsEditing(true)
  }

  /**
   * Reloads from local SQLite and exits edit mode.
   * @returns Nothing
   */
  async function cancelEditing(): Promise<void> {
    setIsEditing(false)
    setShowOaPassword(false)
    setShowErpPassword(false)
    setSaveSuccess(false)
    await load()
  }

  /**
   * Persists both OA and ERP username/password pairs.
   * @returns Nothing
   */
  async function handleSave(): Promise<void> {
    setIsSaving(true)
    setSaveSuccess(false)
    setSaveError(null)
    try {
      const data = await saveOaErpCredentials(userId, {
        oaUsername: oaUsername.trim() || employeeId,
        oaPassword,
        erpUsername: erpUsername.trim() || employeeId,
        erpPassword,
      })
      setOaUsername(data.oaUsername || data.employeeId)
      setErpUsername(data.erpUsername || data.employeeId)
      setOaPassword(data.oaPassword)
      setErpPassword(data.erpPassword)
      setEmployeeId(data.employeeId)
      setIsEditing(false)
      setShowOaPassword(false)
      setShowErpPassword(false)
      setSaveSuccess(true)
    } catch (err) {
      const message =
        err instanceof OaErpApiError
          ? err.message
          : t('settings.oaErp.errors.saveFailed')
      setSaveError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-extrabold text-brand">{t('settings.oaErp.title')}</h2>
      </div>

      <section className="space-y-3 rounded-3xl border border-zinc-950/10 bg-white/40 p-4 dark:border-white/10 dark:bg-zinc-950/30">
        <h3 className="text-sm font-extrabold text-brand">{t('settings.oaErp.oa.title')}</h3>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">
            {t('settings.oaErp.fields.username')}
          </span>
          <input
            type="text"
            className={fieldClass}
            value={oaUsername}
            readOnly={!isEditing}
            autoComplete="username"
            placeholder={employeeId || t('settings.oaErp.fields.usernamePlaceholder')}
            onChange={(event) => setOaUsername(event.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">
            {t('settings.oaErp.fields.password')}
          </span>
          <span className="relative block">
            <input
              type={showOaPassword ? 'text' : 'password'}
              className={passwordFieldClass}
              value={oaPassword}
              readOnly={!isEditing}
              autoComplete="current-password"
              placeholder={isEditing ? t('settings.oaErp.fields.passwordPlaceholder') : undefined}
              onChange={(event) => setOaPassword(event.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition hover:text-brand disabled:opacity-40"
              disabled={!oaPassword}
              aria-label={
                showOaPassword
                  ? t('settings.oaErp.fields.hidePassword')
                  : t('settings.oaErp.fields.showPassword')
              }
              onClick={() => setShowOaPassword((value) => !value)}
            >
              {showOaPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </span>
        </label>
      </section>

      <section className="space-y-3 rounded-3xl border border-zinc-950/10 bg-white/40 p-4 dark:border-white/10 dark:bg-zinc-950/30">
        <h3 className="text-sm font-extrabold text-brand">{t('settings.oaErp.erp.title')}</h3>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">
            {t('settings.oaErp.fields.username')}
          </span>
          <input
            type="text"
            className={fieldClass}
            value={erpUsername}
            readOnly={!isEditing}
            autoComplete="username"
            placeholder={employeeId || t('settings.oaErp.fields.usernamePlaceholder')}
            onChange={(event) => setErpUsername(event.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted">
            {t('settings.oaErp.fields.password')}
          </span>
          <span className="relative block">
            <input
              type={showErpPassword ? 'text' : 'password'}
              className={passwordFieldClass}
              value={erpPassword}
              readOnly={!isEditing}
              autoComplete="current-password"
              placeholder={isEditing ? t('settings.oaErp.fields.passwordPlaceholder') : undefined}
              onChange={(event) => setErpPassword(event.target.value)}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted transition hover:text-brand disabled:opacity-40"
              disabled={!erpPassword}
              aria-label={
                showErpPassword
                  ? t('settings.oaErp.fields.hidePassword')
                  : t('settings.oaErp.fields.showPassword')
              }
              onClick={() => setShowErpPassword((value) => !value)}
            >
              {showErpPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </span>
        </label>
      </section>

      {feedback.mounted ? (
        <p
          className={`text-sm font-semibold ${
            saveError ? 'text-red-500' : 'text-brand'
          } ${feedback.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'}`}
        >
          {saveError ?? t('settings.oaErp.save.success')}
        </p>
      ) : null}

      {isEditing ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg transition hover:opacity-90 disabled:opacity-50"
            disabled={isSaving || isLoading}
            onClick={() => {
              void handleSave()
            }}
          >
            {isSaving ? t('settings.oaErp.save.saving') : t('settings.oaErp.save.button')}
          </button>
          <button
            type="button"
            className="rounded-2xl bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand/15 disabled:opacity-50"
            disabled={isSaving}
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
          disabled={isLoading || !localStorageAvailable}
          onClick={startEditing}
        >
          {t('settings.oaErp.edit')}
        </button>
      )}
    </div>
  )
}
