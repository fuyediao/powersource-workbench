import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'

/**
 * Centered loading placeholder: spinner plus the shared `status.loading` label.
 * @param props - Optional extra layout classes for the outer flex box.
 * @returns Centered spinner and status text.
 */
export function StatusLoading({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <div
      className={twMerge(
        'flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 text-sm font-medium text-muted',
        className,
      )}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <span
        className="size-7 shrink-0 animate-spin rounded-full border-2 border-brand/25 border-t-brand"
        aria-hidden
      />
      <span>{t('status.loading')}</span>
    </div>
  )
}
