import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useLockFn } from 'ahooks'
import { updateGeo, type LogLevel } from 'tauri-plugin-mihomo-api'
import { version as vergeVersion } from '@/constants/clash-app-version'
import { useClash, useClashInfo } from '@/hooks/clash/use-clash'
import { useClashLog } from '@/hooks/clash/use-clash-log'
import { useDisplayedMixedPort } from '@/hooks/clash/use-displayed-mixed-port'
import { useVerge } from '@/hooks/clash/use-verge'
import { clashInvoke } from '@/services/clash/bridge'
import {
  copyClashEnv,
  exportDiagnosticInfo,
  invoke_uwp_tool,
  openAppDir,
  openCoreDir,
  openDevTools,
  openLogsDir,
} from '@/services/clash/cmds'
import { navigationItems } from '@/pages/clash/_navigation-meta'
import { AppDataProvider } from '@/providers/clash/app-data-provider'
import getSystem from '@/utils/clash/get-system'
import { openClashPage } from '@/utils/clash-page-request'
import { CopyIcon } from '@/icons/AllIcons'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import {
  ClashDropdown,
  ClashDrillInRow,
  ClashGroupHeading,
  ClashRow,
  ClashSwitchRow,
} from './clash-ui'
import { LegacyClashDialogs, type LegacyClashDialogsRef } from './legacy-clash-dialogs'
import { PortsDialog } from './ports-dialog'
import { ControllerDialog } from './controller-dialog'
import { CorsDialog } from './cors-dialog'
import { CoreDialog } from './core-dialog'
import { NetworkInterfacesDialog } from './network-interfaces-dialog'
import { WebUIDialog } from './web-ui-dialog'
import { TunnelsDialog } from './tunnels-dialog'
import { HotkeysDialog } from './hotkeys-dialog'
import { MiscDialog } from './misc-dialog'
import { LayoutDialog } from './layout-dialog'
import { LiteModeDialog } from './lite-mode-dialog'

const OS = getSystem()

const LOG_LEVEL_VALUES = ['debug', 'info', 'warning', 'error', 'silent'] as const
const ENV_TYPE_VALUES = ['bash', 'fish', 'nushell', 'cmd', 'powershell'] as const
const TRAY_EVENT_VALUES = ['main_window', 'tray_menu', 'system_proxy', 'tun_mode', 'disable'] as const
/** Clash start-page ids kept in Workbench Settings; `/settings` was removed with the Clash sidebar Settings page. */
const START_PAGE_KEYS = ['home', 'proxies', 'profiles', 'connections', 'rules', 'logs', 'unlock'] as const

type DialogKey =
  | 'ports'
  | 'controller'
  | 'cors'
  | 'core'
  | 'networkInterfaces'
  | 'webUi'
  | 'tunnels'
  | 'hotkeys'
  | 'misc'
  | 'layout'
  | 'liteMode'
  | null

/**
 * Settings → Clash: Tailwind-chrome rebuild of the former Clash sidebar Settings page.
 * Simple toggles/dropdowns are native Workbench controls; complex sub-editors (TUN, system
 * proxy, DNS, backup, runtime config) stay as legacy MUI dialogs hosted with a scoped
 * Clash i18n provider (see {@link LegacyClashDialogs}). Launch-at-login / silent-start
 * and language / theme live only in Workbench Preferences / Appearance, per the migration plan.
 * Wraps the body in {@link AppDataProvider} so mixed-port and the system-proxy dialog
 * can read live Mihomo config (Workbench Settings is outside the Clash island tree).
 * @returns Clash settings section.
 */
export function ClashSection() {
  return (
    <AppDataProvider>
      <ClashSectionBody />
    </AppDataProvider>
  )
}

/**
 * Clash settings controls. Must sit under {@link AppDataProvider}.
 * @returns Clash settings body.
 */
function ClashSectionBody() {
  const { t } = useTranslation()
  const { clash, version, mutateClash, patchClash } = useClash()
  const { clashInfo } = useClashInfo()
  const { verge, patchVerge } = useVerge()
  const displayedMixedPort = useDisplayedMixedPort()
  const [, setClashLog] = useClashLog()

  const legacyRef = useRef<LegacyClashDialogsRef>(null)
  const [openDialogKey, setOpenDialogKey] = useState<DialogKey>(null)
  const [dnsBusy, setDnsBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [scriptBusy, setScriptBusy] = useState(false)

  const { ipv6, 'allow-lan': allowLan, 'log-level': logLevel, 'unified-delay': unifiedDelay } = clash ?? {}
  const dnsSettingsEnabled = verge?.enable_dns_settings ?? false

  const handleDnsToggle = useLockFn(async (enable: boolean) => {
    setDnsBusy(true)
    try {
      await patchVerge({ enable_dns_settings: enable })
      await clashInvoke('apply_dns_config', { apply: enable })
      window.setTimeout(() => mutateClash(), 500)
    } catch {
      await patchVerge({ enable_dns_settings: !enable }).catch(() => {})
    } finally {
      setDnsBusy(false)
    }
  })

  async function onLogLevelChange(next: string): Promise<void> {
    setClashLog((prev) => ({ ...prev, logLevel: next.toUpperCase() as LogLevel }))
    await patchClash({ 'log-level': next })
  }

  async function onUpdateGeo(): Promise<void> {
    setMessage(null)
    try {
      await updateGeo()
      setMessage(t('settings.clash.network.messages.geoDataUpdated'))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    }
  }

  async function onCopyEnv(): Promise<void> {
    await copyClashEnv()
    setMessage(t('settings.clash.common.copied'))
  }

  async function onPickStartupScript(): Promise<void> {
    setScriptBusy(true)
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        filters: [{ name: 'Shell Script', extensions: ['sh', 'bat', 'ps1'] }],
      })
      if (selected) {
        await patchVerge({ startup_script: `${selected}` })
      }
    } finally {
      setScriptBusy(false)
    }
  }

  async function onClearStartupScript(): Promise<void> {
    await patchVerge({ startup_script: '' })
  }

  async function copyVergeVersion(): Promise<void> {
    await navigator.clipboard.writeText(`v${vergeVersion}`)
    setMessage(t('settings.clash.common.copied'))
  }

  const logLevelDisplay = logLevel === 'warn' ? 'warning' : logLevel ?? 'info'
  const startPageOptions = START_PAGE_KEYS.map((key) => ({
    value: navigationItems[key].path,
    label: t(`settings.clash.general.startPage.options.${key}`),
  }))
  const normalizedStartPage =
    verge?.start_page && startPageOptions.some((option) => option.value === verge.start_page)
      ? verge.start_page
      : '/'

  useEffect(() => {
    if (verge?.start_page === '/settings') {
      void patchVerge({ start_page: '/' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verge?.start_page])

  return (
    <div className="space-y-8">
      <p className="text-sm font-semibold text-brand" id="settings-clash-label">
        {t('settings.sections.clash')}
      </p>

      <section className="space-y-3">
        <ClashGroupHeading>{t('settings.clash.groups.network')}</ClashGroupHeading>

        <ClashDrillInRow
          label={t('settings.clash.network.tunMode')}
          onClick={() => legacyRef.current?.openTun()}
        />
        <ClashDrillInRow
          label={t('settings.clash.network.systemProxy')}
          onClick={() => legacyRef.current?.openSysproxy()}
        />

        <ClashSwitchRow
          label={t('settings.clash.network.allowLan')}
          checked={allowLan ?? false}
          onChange={(next) => {
            mutateClash((old) => (old ? { ...old, 'allow-lan': next } : old), false)
            void patchClash({ 'allow-lan': next })
          }}
        />
        <ClashDrillInRow
          label={t('settings.clash.network.networkInterfaces')}
          onClick={() => setOpenDialogKey('networkInterfaces')}
        />

        <ClashRow label={t('settings.clash.network.dnsOverride')}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-zinc-950/10 px-3 py-1 text-xs font-semibold text-brand transition hover:bg-zinc-950/5 dark:border-white/10 dark:hover:bg-white/10"
              onClick={() => legacyRef.current?.openDns()}
            >
              {t('settings.clash.common.configure')}
            </button>
            <SettingsSwitch
              checked={dnsSettingsEnabled}
              disabled={dnsBusy}
              aria-label={t('settings.clash.network.dnsOverride')}
              onChange={(next) => void handleDnsToggle(next)}
            />
          </div>
        </ClashRow>

        <ClashSwitchRow
          label={t('settings.clash.network.ipv6')}
          checked={ipv6 ?? false}
          onChange={(next) => {
            mutateClash((old) => (old ? { ...old, ipv6: next } : old), false)
            void patchClash({ ipv6: next })
          }}
        />

        <ClashSwitchRow
          label={t('settings.clash.network.unifiedDelay')}
          description={t('settings.clash.network.tooltips.unifiedDelay')}
          checked={unifiedDelay ?? false}
          onChange={(next) => {
            mutateClash((old) => (old ? { ...old, 'unified-delay': next } : old), false)
            void patchClash({ 'unified-delay': next })
          }}
        />

        <ClashRow label={t('settings.clash.network.logLevel')}>
          <ClashDropdown
            value={logLevelDisplay}
            options={LOG_LEVEL_VALUES.map((level) => ({
              value: level,
              label: t(`settings.clash.network.logLevels.${level}`),
            }))}
            onChange={(value) => void onLogLevelChange(value)}
          />
        </ClashRow>

        <ClashDrillInRow
          label={t('settings.clash.network.ports')}
          value={displayedMixedPort ? String(displayedMixedPort) : undefined}
          onClick={() => setOpenDialogKey('ports')}
        />
        <ClashDrillInRow
          label={t('settings.clash.network.externalController')}
          value={clashInfo?.server || undefined}
          onClick={() => setOpenDialogKey('controller')}
        />
        <ClashDrillInRow
          label={t('settings.clash.network.cors')}
          onClick={() => setOpenDialogKey('cors')}
        />
        <ClashDrillInRow
          label={t('settings.clash.network.webUi')}
          onClick={() => setOpenDialogKey('webUi')}
        />
        <ClashDrillInRow
          label={t('settings.clash.network.clashCore')}
          value={version}
          onClick={() => setOpenDialogKey('core')}
        />
        <ClashDrillInRow
          label={t('settings.clash.network.tunnels')}
          onClick={() => setOpenDialogKey('tunnels')}
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => void onUpdateGeo()}
          >
            {t('settings.clash.network.updateGeoData')}
          </button>
          {OS === 'windows' ? (
            <button
              type="button"
              className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              onClick={() => void invoke_uwp_tool()}
            >
              {t('settings.clash.network.openUwpTool')}
            </button>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <ClashGroupHeading>{t('settings.clash.groups.general')}</ClashGroupHeading>

        <ClashRow label={t('settings.clash.general.copyEnv')}>
          <div className="flex items-center gap-2">
            <ClashDropdown
              value={verge?.env_type ?? (OS === 'windows' ? 'powershell' : 'bash')}
              options={ENV_TYPE_VALUES.map((value) => ({ value, label: value }))}
              onChange={(value) => void patchVerge({ env_type: value })}
            />
            <button
              type="button"
              className="rounded-full p-1.5 text-muted transition hover:bg-zinc-950/5 dark:hover:bg-white/10"
              title={t('settings.clash.common.copy')}
              onClick={() => void onCopyEnv()}
            >
              <CopyIcon className="size-4" />
            </button>
          </div>
        </ClashRow>

        <ClashRow label={t('settings.clash.general.startPageLabel')}>
          <ClashDropdown value={normalizedStartPage} options={startPageOptions} onChange={(value) => void patchVerge({ start_page: value })} />
        </ClashRow>

        <ClashRow label={t('settings.clash.general.startupScript')}>
          <div className="flex items-center gap-2">
            {verge?.startup_script ? (
              <span className="max-w-40 truncate text-xs text-muted" title={verge.startup_script}>
                {verge.startup_script}
              </span>
            ) : null}
            <button
              type="button"
              disabled={scriptBusy}
              className="rounded-full border border-zinc-950/10 px-3 py-1 text-xs font-semibold text-brand transition hover:bg-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
              onClick={() => void onPickStartupScript()}
            >
              {t('settings.clash.common.browse')}
            </button>
            {verge?.startup_script ? (
              <button
                type="button"
                className="rounded-full border border-zinc-950/10 px-3 py-1 text-xs font-semibold text-brand transition hover:bg-zinc-950/5 dark:border-white/10 dark:hover:bg-white/10"
                onClick={() => void onClearStartupScript()}
              >
                {t('settings.clash.common.clear')}
              </button>
            ) : null}
          </div>
        </ClashRow>

        {OS !== 'linux' ? (
          <ClashRow label={t('settings.clash.general.trayClickEvent')}>
            <ClashDropdown
              value={verge?.tray_event ?? 'main_window'}
              options={TRAY_EVENT_VALUES.map((value) => ({
                value,
                label: t(`settings.clash.general.trayClickOptions.${value}`),
              }))}
              onChange={(value) => void patchVerge({ tray_event: value })}
            />
          </ClashRow>
        ) : null}

        <ClashDrillInRow label={t('settings.clash.general.liteMode')} onClick={() => setOpenDialogKey('liteMode')} />
        <ClashDrillInRow label={t('settings.clash.general.hotkeys')} onClick={() => setOpenDialogKey('hotkeys')} />
        <ClashDrillInRow label={t('settings.clash.general.misc')} onClick={() => setOpenDialogKey('misc')} />
        <ClashDrillInRow label={t('settings.clash.general.layout')} onClick={() => setOpenDialogKey('layout')} />
      </section>

      <section className="space-y-3">
        <ClashGroupHeading>{t('settings.clash.groups.backup')}</ClashGroupHeading>

        <ClashDrillInRow label={t('settings.clash.backup.backup')} onClick={() => legacyRef.current?.openBackup()} />
        <ClashDrillInRow label={t('settings.clash.backup.runtimeConfig')} onClick={() => legacyRef.current?.openConfig()} />
        <ClashDrillInRow
          label={t('settings.clash.backup.openLogsPage')}
          onClick={() => openClashPage('/logs')}
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => void openAppDir()}
          >
            {t('settings.clash.backup.openConfigDir')}
          </button>
          <button
            type="button"
            className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => void openCoreDir()}
          >
            {t('settings.clash.backup.openCoreDir')}
          </button>
          <button
            type="button"
            className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => void openLogsDir()}
          >
            {t('settings.clash.backup.openLogsDir')}
          </button>
          <button
            type="button"
            className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => void openDevTools()}
          >
            {t('settings.clash.backup.openDevTools')}
          </button>
        </div>

        <button
          type="button"
          className="w-full rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-sm font-semibold text-brand transition hover:bg-zinc-950/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          onClick={() => void exportDiagnosticInfo().then(() => setMessage(t('settings.clash.common.copied')))}
        >
          {t('settings.clash.backup.exportDiagnostics')}
        </button>

        <ClashRow label={t('settings.clash.backup.vergeVersion')}>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-muted">v{vergeVersion}</span>
            <button
              type="button"
              className="rounded-full p-1.5 text-muted transition hover:bg-zinc-950/5 dark:hover:bg-white/10"
              title={t('settings.clash.common.copy')}
              onClick={() => void copyVergeVersion()}
            >
              <CopyIcon className="size-4" />
            </button>
          </div>
        </ClashRow>
      </section>

      {message ? <p className="text-xs font-semibold text-brand">{message}</p> : null}

      <LegacyClashDialogs ref={legacyRef} />

      <PortsDialog open={openDialogKey === 'ports'} onClose={() => setOpenDialogKey(null)} />
      <ControllerDialog open={openDialogKey === 'controller'} onClose={() => setOpenDialogKey(null)} />
      <CorsDialog open={openDialogKey === 'cors'} onClose={() => setOpenDialogKey(null)} />
      <CoreDialog open={openDialogKey === 'core'} onClose={() => setOpenDialogKey(null)} />
      <NetworkInterfacesDialog open={openDialogKey === 'networkInterfaces'} onClose={() => setOpenDialogKey(null)} />
      <WebUIDialog open={openDialogKey === 'webUi'} onClose={() => setOpenDialogKey(null)} />
      <TunnelsDialog open={openDialogKey === 'tunnels'} onClose={() => setOpenDialogKey(null)} />
      <HotkeysDialog open={openDialogKey === 'hotkeys'} onClose={() => setOpenDialogKey(null)} />
      <MiscDialog open={openDialogKey === 'misc'} onClose={() => setOpenDialogKey(null)} />
      <LayoutDialog open={openDialogKey === 'layout'} onClose={() => setOpenDialogKey(null)} />
      <LiteModeDialog open={openDialogKey === 'liteMode'} onClose={() => setOpenDialogKey(null)} />
    </div>
  )
}
