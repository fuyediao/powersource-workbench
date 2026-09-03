import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, RefreshIcon, ResetIcon } from '@/icons/AllIcons'
import type { AppLanguage } from '@/i18n'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import {
  FOCUS_RING_SHELL,
  FocusRingFrame,
} from '@/components/ui/focus-ring-frame'
import { CheckUpdatesDialog } from '@/components/settings/check-updates-dialog'
import { SettingsSwitch } from '@/components/settings/settings-switch'

interface PreferencesSectionProps {
  onRestoreDefaults: () => void
}

/**
 * Preferences settings: language, launch-at-login, update check, and restore defaults.
 * @param props - Restore-defaults callback from the settings page shell.
 * @returns Preferences section.
 */
export function PreferencesSection({ onRestoreDefaults }: PreferencesSectionProps) {
  const { t, i18n } = useTranslation()
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false)
  const [showUpdatesDialog, setShowUpdatesDialog] = useState(false)
  const [openAtLogin, setOpenAtLogin] = useState(false)
  const [silentLaunch, setSilentLaunch] = useState(false)
  const [launchBusy, setLaunchBusy] = useState(false)
  const languageMenuPresence = useDialogPresence(languageMenuOpen, 180)
  const languageMenuRef = useRef<HTMLDivElement>(null)
  const activeLanguage = i18n.language.startsWith('zh-CN')
    ? 'zh-CN'
    : i18n.language.startsWith('zh')
      ? 'zh-TW'
      : 'en'
  const languageOptions: Array<{ value: AppLanguage; label: string }> = [
    { value: 'en', label: t('settings.languageEn') },
    { value: 'zh-TW', label: t('settings.languageZhTw') },
    { value: 'zh-CN', label: t('settings.languageZhCn') },
  ]
  const activeLanguageLabel =
    languageOptions.find((option) => option.value === activeLanguage)?.label ??
    t('settings.languageEn')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const settings = await window.geocrm.app.getLoginLaunchSettings()
        if (cancelled) {
          return
        }
        setOpenAtLogin(settings.openAtLogin)
        setSilentLaunch(settings.silentLaunch)
      } catch {
        // Main-process bridge unavailable (e.g. non-Electron); leave defaults off.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!languageMenuOpen) {
      return
    }
    /**
     * Closes the language menu on outside pointer press.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false)
      }
    }
    /**
     * Closes the language menu on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setLanguageMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [languageMenuOpen])

  /**
   * Persists a launch-preference patch and syncs local switch state.
   * @param patch - Fields to change.
   * @returns Nothing.
   */
  async function updateLaunchSettings(patch: {
    openAtLogin?: boolean
    silentLaunch?: boolean
  }): Promise<void> {
    setLaunchBusy(true)
    try {
      const next = await window.geocrm.app.setLoginLaunchSettings(patch)
      setOpenAtLogin(next.openAtLogin)
      setSilentLaunch(next.silentLaunch)
    } catch {
      // Keep previous UI state when the main process rejects the update.
    } finally {
      setLaunchBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.preferences')}</p>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted" id="settings-language-label">
          {t('settings.preferences.languageLabel')}
        </p>
        <div className="relative" ref={languageMenuRef}>
          <FocusRingFrame
            active={languageMenuOpen}
            shellClassName={`${FOCUS_RING_SHELL} overflow-hidden`}
          >
            <button
              type="button"
              id="settings-language"
              aria-labelledby="settings-language-label"
              className="flex w-full items-center justify-between gap-3 py-3 pr-3 pl-4 text-left text-sm font-semibold text-brand outline-none transition hover:bg-zinc-950/5 dark:hover:bg-white/10"
              onClick={() => setLanguageMenuOpen((openMenu) => !openMenu)}
            >
              <span>{activeLanguageLabel}</span>
              <ChevronDownIcon
                className={`size-4 shrink-0 transition ${languageMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </FocusRingFrame>
          {languageMenuPresence.mounted ? (
            <ul
              className={`absolute z-30 mt-2 w-full origin-top overflow-hidden rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
                languageMenuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
            >
              {languageOptions.map((option) => {
                const selected = option.value === activeLanguage
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      className={`flex w-full px-4 py-2.5 text-left text-sm font-semibold transition ${
                        selected
                          ? 'bg-brand/15 text-brand'
                          : 'text-brand hover:bg-brand/10 dark:hover:bg-brand/15'
                      }`}
                      onClick={() => {
                        void i18n.changeLanguage(option.value)
                        setLanguageMenuOpen(false)
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted">{t('settings.preferences.startupLabel')}</p>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 dark:border-white/10 dark:bg-white/5">
          <p className="min-w-0 text-sm font-semibold text-brand">
            {t('settings.preferences.launchAtLogin')}
          </p>
          <SettingsSwitch
            checked={openAtLogin}
            disabled={launchBusy}
            aria-label={t('settings.preferences.launchAtLogin')}
            onChange={(next) => {
              void updateLaunchSettings({
                openAtLogin: next,
                silentLaunch: next ? silentLaunch : false,
              })
            }}
          />
        </div>
        <div
          className={`flex items-center justify-between gap-4 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 dark:border-white/10 dark:bg-white/5 ${
            openAtLogin ? '' : 'opacity-60'
          }`}
        >
          <p className="min-w-0 text-sm font-semibold text-brand">
            {t('settings.preferences.silentLaunch')}
          </p>
          <SettingsSwitch
            checked={silentLaunch}
            disabled={!openAtLogin || launchBusy}
            aria-label={t('settings.preferences.silentLaunch')}
            onChange={(next) => {
              void updateLaunchSettings({ silentLaunch: next })
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">{t('settings.preferences.systemLabel')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => setShowUpdatesDialog(true)}
          >
            <RefreshIcon className="size-4 shrink-0" />
            {t('settings.checkForUpdates')}
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={onRestoreDefaults}
          >
            <ResetIcon className="size-4 shrink-0" />
            {t('settings.restoreDefaults')}
          </button>
        </div>
      </div>

      <CheckUpdatesDialog open={showUpdatesDialog} onClose={() => setShowUpdatesDialog(false)} />
    </div>
  )
}
