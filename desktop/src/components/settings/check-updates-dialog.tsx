import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { UpdateInstallProgress } from '@/components/settings/update-install-progress'
import {
  checkAppForUpdates,
  installAppUpdate,
  subscribeAppUpdateInstallProgress,
  type AppUpdateCheckResult,
  type AppUpdateInstallProgress,
} from '@/utils/settings/app-updates'
import { requireAppUpdate } from '@/utils/settings/required-app-update'

interface CheckUpdatesDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Modal that runs a desktop update check and can install a newer build.
 * @param props - Open state and close callback.
 * @returns Update-check dialog, or null while unmounted.
 */
export function CheckUpdatesDialog({ open, onClose }: CheckUpdatesDialogProps) {
  const { t } = useTranslation()
  const presence = useDialogPresence(open, 200)
  const [isChecking, setIsChecking] = useState(false)
  const [result, setResult] = useState<AppUpdateCheckResult | null>(null)
  const [progress, setProgress] = useState<AppUpdateInstallProgress | null>(null)

  useEffect(() => {
    return subscribeAppUpdateInstallProgress(setProgress)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    setIsChecking(true)
    setResult(null)
    setProgress(null)
    void checkAppForUpdates().then((next) => {
      if (cancelled) {
        return
      }
      if (next.status === 'available' && next.forceUpdate) {
        requireAppUpdate(next)
        onClose()
        return
      }
      setResult(next)
      setIsChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!presence.mounted) {
    return null
  }

  const installing = Boolean(progress && progress.phase !== 'error')
  const downloadUrl = result?.status === 'available' ? result.downloadUrl : undefined

  const message = (() => {
    if (isChecking || !result) {
      return t('settings.updates.checking')
    }
    if (result.status === 'upToDate') {
      return t('settings.updates.upToDate', { version: result.currentVersion })
    }
    if (result.status === 'available') {
      return t('settings.updates.available', {
        version: result.currentVersion,
        latestVersion: result.latestVersion ?? '',
      })
    }
    if (result.status === 'unavailable') {
      return t('settings.updates.unavailable', {
        version: result.currentVersion,
        defaultValue: result.message,
      })
    }
    return t('settings.updates.error', {
      defaultValue: result.message ?? 'Could not check for updates.',
    })
  })()

  /**
   * Starts the in-app download and install pipeline.
   * @returns Nothing.
   */
  function startInstall(): void {
    if (!downloadUrl) {
      return
    }
    setProgress({ phase: 'downloading', percent: 0 })
    void installAppUpdate(downloadUrl, result?.fileName).catch((error: unknown) => {
      setProgress({
        phase: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : t('settings.updates.installError'),
      })
    })
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 ${
        presence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
      }`}
      onClick={installing ? undefined : onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-base font-bold text-brand">{t('settings.updates.title')}</p>
        <p className="text-sm text-muted">{message}</p>
        {!isChecking && result?.currentVersion && result.currentVersion !== '—' ? (
          <p className="text-xs text-muted">
            {t('settings.updates.currentVersion', { version: result.currentVersion })}
          </p>
        ) : null}
        {progress ? <UpdateInstallProgress progress={progress} /> : null}
        <div className="flex flex-col gap-2">
          {downloadUrl && !installing ? (
            <button
              type="button"
              className="w-full rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg"
              onClick={startInstall}
            >
              {progress?.phase === 'error'
                ? t('settings.updates.retry')
                : t('settings.updates.install')}
            </button>
          ) : null}
          <button
            type="button"
            className={`w-full rounded-2xl px-4 py-2.5 text-sm font-bold ${
              downloadUrl
                ? 'border border-zinc-950/10 bg-zinc-950/5 text-brand dark:border-white/10 dark:bg-white/5'
                : 'bg-brand text-brand-fg'
            }`}
            disabled={installing}
            onClick={onClose}
          >
            {t('settings.updates.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
