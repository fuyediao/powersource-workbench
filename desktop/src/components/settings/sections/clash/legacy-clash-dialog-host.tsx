import { useEffect, type ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { useTranslation } from 'react-i18next'
import clashI18n, { initializeDialogLanguage } from '@/services/clash/i18n'

/**
 * Mounts Clash's own (MUI-styled) dialogs inside Workbench Settings.
 *
 * Backup and the runtime Config viewer are intentionally kept as Clash's original
 * Material UI dialogs rather than restyled: both are self-contained subsystems with
 * high-risk business logic (WebDAV credentials, backup history, YAML rendering) that
 * the settings-to-Workbench plan explicitly scopes out of the pixel-for-pixel Tailwind
 * rewrite. This host only supplies Clash's `I18nextProvider` (never mounted globally
 * in Settings) so their `useTranslation()` calls resolve real Clash copy instead of
 * Workbench's unrelated keys. Dialogs stay closed until opened, so the host keeps
 * children mounted (imperative `open*` refs) while the full Clash locale bundle
 * loads in the background.
 *
 * @param props - Dialog subtree (e.g. `<BackupViewer ref={...} />`).
 * @returns Children wrapped in Clash's i18n context.
 */
export function LegacyClashDialogHost({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation()

  useEffect(() => {
    void initializeDialogLanguage(i18n.language).catch((error: unknown) => {
      console.error('[clash] dialog locales failed:', error)
    })
  }, [i18n.language])

  return <I18nextProvider i18n={clashI18n}>{children}</I18nextProvider>
}
