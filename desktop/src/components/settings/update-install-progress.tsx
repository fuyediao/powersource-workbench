import { useTranslation } from 'react-i18next'
import type { AppUpdateInstallProgress } from '@/utils/settings/app-updates'

interface UpdateInstallProgressProps {
  progress: AppUpdateInstallProgress
}

/**
 * Step list and percent bar for the in-app desktop installer.
 * @param props - Current install progress.
 * @returns Progress UI.
 */
export function UpdateInstallProgress({ progress }: UpdateInstallProgressProps) {
  const { t } = useTranslation()
  const steps = [
    { id: 'downloading' as const, label: t('settings.updates.stepDownload') },
    { id: 'installing' as const, label: t('settings.updates.stepInstall') },
    { id: 'relaunching' as const, label: t('settings.updates.stepRestart') },
  ]
  const activeIndex =
    progress.phase === 'error'
      ? -1
      : progress.phase === 'downloading'
        ? 0
        : progress.phase === 'installing'
          ? 1
          : 2

  return (
    <div className="space-y-3">
      <ol className="space-y-1.5 text-sm">
        {steps.map((step, index) => {
          const done = activeIndex > index
          const current = activeIndex === index
          return (
            <li
              key={step.id}
              className={
                current
                  ? 'font-semibold text-brand'
                  : done
                    ? 'text-brand'
                    : 'text-muted'
              }
            >
              {index + 1}. {step.label}
              {current && progress.phase === 'downloading' ? ` (${progress.percent}%)` : ''}
            </li>
          )
        })}
      </ol>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-950/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-brand"
          style={{
            width: `${progress.phase === 'downloading' ? progress.percent : 100}%`,
          }}
        />
      </div>
      {progress.phase === 'error' && progress.message ? (
        <p className="text-sm text-red-600 dark:text-red-400">{progress.message}</p>
      ) : null}
    </div>
  )
}
