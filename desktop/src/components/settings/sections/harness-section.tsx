import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderIcon } from '@/icons/AllIcons'
import {
  loadHarnessWorkFolder,
  hydrateHarnessDevicePreferences,
  saveHarnessWorkFolder,
} from '@/utils/settings/harness-prefs'

/**
 * Settings → Harness: local work folder.
 * Third-party MCP servers are edited in Harness Library → MCP.
 * @returns Harness settings body.
 */
export function HarnessSection() {
  const { t } = useTranslation()
  const [workFolder, setWorkFolder] = useState(() => loadHarnessWorkFolder())
  const [defaultFolder, setDefaultFolder] = useState('')

  useEffect(() => {
    void hydrateHarnessDevicePreferences().then(() => {
      setWorkFolder(loadHarnessWorkFolder())
    })
    void window.workbench?.harness?.defaultWorkFolder().then((path) => {
      setDefaultFolder(path)
    })
  }, [])

  /**
   * Opens the native folder picker and stores the chosen Harness work folder.
   * @returns Nothing.
   */
  async function chooseWorkFolder(): Promise<void> {
    const picked = await window.workbench?.harness?.pickWorkFolder()
    if (!picked) {
      return
    }
    saveHarnessWorkFolder(picked)
    setWorkFolder(picked)
  }

  /**
   * Clears the saved work folder so turns use Documents/Harness.
   * @returns Nothing.
   */
  function resetWorkFolder(): void {
    saveHarnessWorkFolder('')
    setWorkFolder('')
  }

  return (
    <div className="space-y-6">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.harness')}</p>

      <section className="space-y-3">
        <p className="text-xs font-semibold text-muted">{t('settings.harness.workFolder.title')}</p>
        <p className="truncate rounded-2xl bg-zinc-950/5 px-4 py-2.5 font-mono text-xs text-ink dark:bg-white/5">
          {workFolder || defaultFolder || 'Documents/Harness'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-2xl bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand/15"
            onClick={() => {
              void chooseWorkFolder()
            }}
          >
            <FolderIcon className="size-4" aria-hidden />
            {t('settings.harness.workFolder.choose')}
          </button>
          <button
            type="button"
            className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-muted transition hover:bg-zinc-950/5 dark:hover:bg-white/5"
            onClick={resetWorkFolder}
          >
            {t('settings.harness.workFolder.reset')}
          </button>
        </div>
      </section>
    </div>
  )
}
