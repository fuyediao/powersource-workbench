import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getPreferences,
  subscribePreferences,
  updatePreferences,
  type Preferences,
  type StartupAction,
} from '@/hooks/aura/preferences-store'
import { clearRecentFiles } from '@/hooks/aura/document-store'
import { SettingsSegmented } from '@/components/settings/settings-segmented'
import { SettingsSwitch } from '@/components/settings/settings-switch'

/**
 * Preference row with a sliding capsule switch (Background auto-rotate style).
 *
 * @param props - Label and toggle props.
 * @returns Labeled switch row.
 */
function PrefSwitchRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-950/5 px-4 py-3 dark:bg-white/5">
      <p className="min-w-0 text-sm font-semibold text-brand">{label}</p>
      <SettingsSwitch checked={checked} onChange={onChange} aria-label={label} />
    </div>
  )
}

/**
 * Settings → Markdown editor: file/mode/export preferences.
 *
 * @returns Markdown editor settings section.
 */
export function AuraSection() {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState<Preferences>(() => getPreferences())
  const [clearMessage, setClearMessage] = useState<string | null>(null)

  useEffect(() => subscribePreferences(() => setPrefs(getPreferences())), [])

  /**
   * Patch and persist editor preferences.
   *
   * @param patch - Partial preference update.
   */
  function onPatch(patch: Partial<Preferences>): void {
    updatePreferences(patch)
  }

  const startupOptions = [
    { value: 'new' as const, label: t('aura.preferences.files.startupNew') },
    { value: 'last' as const, label: t('aura.preferences.files.startupLast') },
  ]

  const extensionOptions = [
    { value: 'md' as const, label: t('aura.preferences.files.extMd') },
    {
      value: 'markdown' as const,
      label: t('aura.preferences.files.extMarkdown'),
    },
    { value: 'txt' as const, label: t('aura.preferences.files.extTxt') },
  ]

  const editorModeOptions = [
    {
      value: 'wysiwyg' as const,
      label: t('aura.preferences.editor.modeWysiwyg'),
    },
    { value: 'sv' as const, label: t('aura.preferences.editor.modeSv') },
  ]

  const exportOptions = [
    {
      value: 'markdown' as const,
      label: t('aura.preferences.export.formatMarkdown'),
    },
    {
      value: 'html' as const,
      label: t('aura.preferences.export.formatHtml'),
    },
  ]

  return (
    <div className="space-y-8">
      <p className="text-sm font-semibold text-brand" id="settings-aura-label">
        {t('settings.sections.aura')}
      </p>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">
          {t('aura.preferences.files.startup')}
        </h3>
        <SettingsSegmented
          value={prefs.startupAction}
          options={startupOptions}
          labelledBy="settings-aura-label"
          onChange={(startupAction: StartupAction) => onPatch({ startupAction })}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">
          {t('aura.preferences.files.outline')}
        </h3>
        <PrefSwitchRow
          checked={prefs.outlineCollapsible}
          label={t('aura.preferences.files.outlineCollapsible')}
          onChange={(outlineCollapsible) => onPatch({ outlineCollapsible })}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">
          {t('aura.preferences.files.defaultExtension')}
        </h3>
        <SettingsSegmented
          value={prefs.defaultExtension}
          options={extensionOptions}
          onChange={(defaultExtension: Preferences['defaultExtension']) =>
            onPatch({ defaultExtension })
          }
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">
          {t('aura.preferences.files.saveRestore')}
        </h3>
        <PrefSwitchRow
          checked={prefs.autoSave}
          label={t('aura.preferences.files.autoSave')}
          onChange={(autoSave) => onPatch({ autoSave })}
        />
        <PrefSwitchRow
          checked={prefs.autoSaveOnSwitch}
          label={t('aura.preferences.files.autoSaveOnSwitch')}
          onChange={(autoSaveOnSwitch) => onPatch({ autoSaveOnSwitch })}
        />
        <PrefSwitchRow
          checked={prefs.restoreDrafts}
          label={t('aura.preferences.files.restoreDrafts')}
          onChange={(restoreDrafts) => onPatch({ restoreDrafts })}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">
          {t('aura.preferences.files.recent')}
        </h3>
        <PrefSwitchRow
          checked={prefs.rememberRecent}
          label={t('aura.preferences.files.rememberRecent')}
          onChange={(rememberRecent) => onPatch({ rememberRecent })}
        />
        <button
          type="button"
          className="rounded-full border border-zinc-950/10 px-4 py-1.5 text-xs font-bold text-ink transition hover:bg-zinc-950/5 dark:border-white/10 dark:hover:bg-white/10"
          onClick={() => {
            clearRecentFiles()
            setClearMessage(t('aura.preferences.cleared'))
          }}
        >
          {t('aura.preferences.files.clearRecent')}
        </button>
        {clearMessage ? (
          <p className="text-xs text-muted">{clearMessage}</p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-ink">
          {t('aura.preferences.files.dragDrop')}
        </h3>
        <PrefSwitchRow
          checked={prefs.dropFolderAction !== 'ignore'}
          label={t('aura.preferences.files.dropFolder')}
          onChange={(enabled) =>
            onPatch({ dropFolderAction: enabled ? 'open' : 'ignore' })
          }
        />
        <PrefSwitchRow
          checked={prefs.dropMarkdownAction !== 'ignore'}
          label={t('aura.preferences.files.dropMarkdown')}
          onChange={(enabled) =>
            onPatch({ dropMarkdownAction: enabled ? 'open' : 'ignore' })
          }
        />
        <PrefSwitchRow
          checked={prefs.dropImportableAction !== 'ignore'}
          label={t('aura.preferences.files.dropImportable')}
          onChange={(enabled) =>
            onPatch({ dropImportableAction: enabled ? 'import' : 'ignore' })
          }
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">
          {t('aura.preferences.editor.defaultMode')}
        </h3>
        <SettingsSegmented
          value={prefs.defaultEditorMode}
          options={editorModeOptions}
          onChange={(defaultEditorMode: Preferences['defaultEditorMode']) =>
            onPatch({ defaultEditorMode })
          }
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">
          {t('aura.preferences.export.defaultFormat')}
        </h3>
        <SettingsSegmented
          value={prefs.defaultExportFormat}
          options={exportOptions}
          onChange={(defaultExportFormat: Preferences['defaultExportFormat']) =>
            onPatch({ defaultExportFormat })
          }
        />
      </section>
    </div>
  )
}
