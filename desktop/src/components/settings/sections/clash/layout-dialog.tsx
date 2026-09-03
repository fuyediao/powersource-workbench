import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { exists } from '@tauri-apps/plugin-fs'
import { useVerge } from '@/hooks/clash/use-verge'
import { DEFAULT_HOVER_DELAY } from '@/components/clash/proxy/proxy-group-navigator'
import { copyIconFile, getAppDir } from '@/services/clash/cmds'
import getSystem from '@/utils/clash/get-system'
import {
  ClashDialogShell,
  ClashDropdown,
  ClashRow,
  ClashSecondaryButton,
  ClashSwitchRow,
  ClashTextInput,
} from './clash-ui'

const OS = getSystem()

const TOAST_POSITION_OPTIONS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const
const TRAY_ICON_OPTIONS = ['monochrome', 'colorful'] as const
const TRAY_GROUPS_DISPLAY_OPTIONS = ['default', 'inline', 'disable'] as const

const clampHoverDelay = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_HOVER_DELAY
  }
  return Math.min(5000, Math.max(0, Math.round(value)))
}

async function resolveIconPath(iconDir: string, name: string): Promise<string> {
  const updateTime = localStorage.getItem(`icon_${name}_update_time`) || ''
  const png = await join(iconDir, `${name}-${updateTime}.png`)
  const ico = await join(iconDir, `${name}-${updateTime}.ico`)
  return (await exists(ico)) ? ico : png
}

type TrayIconKind = 'common' | 'sysproxy' | 'tun'

/**
 * Layout drill-in dialog: UI density, tray behavior, and tray icon overrides.
 *
 * The original Clash "prefer system titlebar", navigation-icon style, and
 * collapse-navbar toggles are dropped here: Workbench owns window chrome, and the
 * Clash rail uses the same expand / collapse / hover control as Admin.
 * @param props - Open state and close callback.
 * @returns Layout dialog.
 */
export function LayoutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { verge, patchVerge, mutateVerge } = useVerge()
  const [error, setError] = useState<string | null>(null)
  const [icons, setIcons] = useState<Record<TrayIconKind, string>>({ common: '', sysproxy: '', tun: '' })

  async function refreshIcons(): Promise<void> {
    try {
      const appDir = await getAppDir()
      const iconDir = await join(appDir, 'icons')
      const [common, sysproxy, tun] = await Promise.all([
        resolveIconPath(iconDir, 'common'),
        resolveIconPath(iconDir, 'sysproxy'),
        resolveIconPath(iconDir, 'tun'),
      ])
      setIcons({ common, sysproxy, tun })
    } catch (err) {
      console.warn('[LayoutDialog] failed to resolve tray icon paths:', err)
    }
  }

  useEffect(() => {
    if (open) {
      void refreshIcons()
      setError(null)
    }
  }, [open])

  async function patchField<K extends keyof IVergeConfig>(key: K, value: IVergeConfig[K]): Promise<void> {
    mutateVerge((old) => (old ? { ...old, [key]: value } : old), false)
    try {
      await patchVerge({ [key]: value } as Partial<IVergeConfig>)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function pickTrayIcon(kind: TrayIconKind, currentlySet: boolean | undefined): Promise<void> {
    setError(null)
    const field = `${kind}_tray_icon` as const
    if (currentlySet) {
      await patchField(field, false)
      return
    }
    try {
      const selected = await openDialog({
        directory: false,
        multiple: false,
        filters: [{ name: 'Tray Icon Image', extensions: ['png', 'ico'] }],
      })
      if (!selected) {
        return
      }
      await copyIconFile(`${selected}`, kind)
      await refreshIcons()
      await patchField(field, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <ClashDialogShell
      open={open}
      onClose={onClose}
      title={t('settings.clash.layout.title')}
      widthClassName="max-w-xl"
      footer={<ClashSecondaryButton onClick={onClose}>{t('actions.close')}</ClashSecondaryButton>}
    >
      <ClashSwitchRow
        label={t('settings.clash.layout.fields.trafficGraph')}
        checked={verge?.traffic_graph ?? true}
        onChange={(checked) => void patchField('traffic_graph', checked)}
      />
      <ClashSwitchRow
        label={t('settings.clash.layout.fields.memoryUsage')}
        checked={verge?.enable_memory_usage ?? true}
        onChange={(checked) => void patchField('enable_memory_usage', checked)}
      />
      <ClashSwitchRow
        label={t('settings.clash.layout.fields.proxyGroupIcon')}
        checked={verge?.enable_group_icon ?? true}
        onChange={(checked) => void patchField('enable_group_icon', checked)}
      />
      <ClashSwitchRow
        label={t('settings.clash.layout.fields.pauseRenderTrafficStatsOnBlur')}
        checked={verge?.pause_render_traffic_stats_on_blur ?? true}
        onChange={(checked) => void patchField('pause_render_traffic_stats_on_blur', checked)}
      />

      <ClashRow label={t('settings.clash.layout.fields.toastPosition')}>
        <ClashDropdown
          value={verge?.notice_position ?? 'top-right'}
          options={TOAST_POSITION_OPTIONS.map((value) => ({
            value,
            label: t(`settings.clash.layout.options.toastPosition.${value.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`),
          }))}
          onChange={(value) => void patchField('notice_position', value)}
        />
      </ClashRow>

      <ClashSwitchRow
        label={t('settings.clash.layout.fields.hoverNavigator')}
        description={t('settings.clash.layout.tooltips.hoverNavigator')}
        checked={verge?.enable_hover_jump_navigator ?? true}
        onChange={(checked) => void patchField('enable_hover_jump_navigator', checked)}
      />
      <ClashRow
        label={t('settings.clash.layout.fields.hoverNavigatorDelay')}
        description={t('settings.clash.units.milliseconds')}
      >
        <ClashTextInput
          type="number"
          value={verge?.hover_jump_navigator_delay ?? DEFAULT_HOVER_DELAY}
          disabled={!(verge?.enable_hover_jump_navigator ?? true)}
          onChange={(value) => void patchField('hover_jump_navigator_delay', clampHoverDelay(Number(value)))}
        />
      </ClashRow>

      {OS === 'macos' ? (
        <>
          <ClashRow label={t('settings.clash.layout.fields.trayIcon')}>
            <ClashDropdown
              value={verge?.tray_icon ?? 'monochrome'}
              options={TRAY_ICON_OPTIONS.map((value) => ({
                value,
                label: t(`settings.clash.layout.options.icon.${value}`),
              }))}
              onChange={(value) => void patchField('tray_icon', value)}
            />
          </ClashRow>
          <ClashSwitchRow
            label={t('settings.clash.layout.fields.enableTraySpeed')}
            checked={verge?.enable_tray_speed ?? false}
            onChange={(checked) => void patchField('enable_tray_speed', checked)}
          />
        </>
      ) : null}

      <ClashRow label={t('settings.clash.layout.fields.proxyGroupsDisplayMode')}>
        <ClashDropdown
          value={verge?.tray_proxy_groups_display_mode ?? 'default'}
          options={TRAY_GROUPS_DISPLAY_OPTIONS.map((value) => ({
            value,
            label: t(`settings.clash.layout.options.proxyGroupsDisplayMode.${value}`),
          }))}
          onChange={(value) => void patchField('tray_proxy_groups_display_mode', value)}
        />
      </ClashRow>
      <ClashSwitchRow
        label={t('settings.clash.layout.fields.showOutboundModesInline')}
        checked={verge?.tray_inline_outbound_modes ?? false}
        onChange={(checked) => void patchField('tray_inline_outbound_modes', checked)}
      />

      <TrayIconRow
        label={t('settings.clash.layout.fields.commonTrayIcon')}
        active={verge?.common_tray_icon ?? false}
        iconPath={icons.common}
        onPick={() => void pickTrayIcon('common', verge?.common_tray_icon)}
      />
      <TrayIconRow
        label={t('settings.clash.layout.fields.systemProxyTrayIcon')}
        active={verge?.sysproxy_tray_icon ?? false}
        iconPath={icons.sysproxy}
        onPick={() => void pickTrayIcon('sysproxy', verge?.sysproxy_tray_icon)}
      />
      <TrayIconRow
        label={t('settings.clash.layout.fields.tunTrayIcon')}
        active={verge?.tun_tray_icon ?? false}
        iconPath={icons.tun}
        onPick={() => void pickTrayIcon('tun', verge?.tun_tray_icon)}
      />

      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}

/** Custom tray icon picker row, shared by common / sysproxy / TUN icon fields. */
function TrayIconRow({
  label,
  active,
  iconPath,
  onPick,
}: {
  label: string
  active: boolean
  iconPath: string
  onPick: () => void
}) {
  const { t } = useTranslation()
  return (
    <ClashRow label={label}>
      <ClashSecondaryButton onClick={onPick}>
        <span className="flex items-center gap-1.5">
          {active && iconPath ? <img className="h-4 w-4" src={convertFileSrc(iconPath)} alt="" /> : null}
          {active ? t('settings.clash.common.clear') : t('settings.clash.layout.actions.browse')}
        </span>
      </ClashSecondaryButton>
    </ClashRow>
  )
}
