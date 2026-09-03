import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UpdateInstallProgress } from '@/components/settings/update-install-progress'
import {
  installAppUpdate,
  subscribeAppUpdateInstallProgress,
  type AppUpdateCheckResult,
  type AppUpdateInstallProgress,
} from '@/utils/settings/app-updates'

interface ForceUpdateDialogProps {
  result: AppUpdateCheckResult
}

/**
 * Blocking overlay that downloads and installs a newer desktop build.
 * Backdrop clicks do not dismiss it.
 * @param props - Required update result.
 * @returns Full-screen force-update dialog.
 */
export function ForceUpdateDialog({ result }: ForceUpdateDialogProps) {
  const { t } = useTranslation()
  const [progress, setProgress] = useState<AppUpdateInstallProgress | null>(null)
  const started = useRef(false)
  const downloadUrl = result.downloadUrl ?? ''

  useEffect(() => {
    return subscribeAppUpdateInstallProgress(setProgress)
  }, [])

  useEffect(() => {
    if (!downloadUrl || started.current) {
      return
    }
    started.current = true
    void installAppUpdate(downloadUrl, result.fileName).catch((error: unknown) => {
      setProgress({
        phase: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : t('settings.updates.installError'),
      })
    })
  }, [downloadUrl, result.fileName, t])

  /**
   * Retries the in-app installer after a failure.
   * @returns Nothing.
   */
  function retry(): void {
    if (!downloadUrl) {
      return
    }
    setProgress({ phase: 'downloading', percent: 0 })
    void installAppUpdate(downloadUrl, result.fileName).catch((error: unknown) => {
      setProgress({
        phase: 'error',
        percent: 0,
        message: error instanceof Error ? error.message : t('settings.updates.installError'),
      })
    })
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-zinc-950/70 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
        <p className="text-base font-bold text-brand">{t('settings.updates.forceTitle')}</p>
        <p className="text-sm text-muted">
          {t('settings.updates.forceBody', {
            version: result.currentVersion,
            latestVersion: result.latestVersion ?? '',
          })}
        </p>
        {progress ? <UpdateInstallProgress progress={progress} /> : null}
        {progress?.phase === 'error' ? (
          <button
            type="button"
            className="w-full rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg"
            onClick={retry}
          >
            {t('settings.updates.retry')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
