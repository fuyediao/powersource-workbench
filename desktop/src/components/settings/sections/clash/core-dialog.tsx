import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { closeAllConnections, upgradeCore } from 'tauri-plugin-mihomo-api'
import { RefreshIcon } from '@/icons/AllIcons'
import { useClash, useClashInfo } from '@/hooks/clash/use-clash'
import { useVerge } from '@/hooks/clash/use-verge'
import { changeClashCore, restartCore } from '@/services/clash/cmds'
import { ClashDialogShell, ClashSecondaryButton } from './clash-ui'

const VALID_CORE = [{ name: 'Mihomo', core: 'verge-mihomo' }] as const

/**
 * Clash core drill-in dialog: core selection, restart, and upgrade.
 * @param props - Open state and close callback.
 * @returns Core dialog.
 */
export function CoreDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { verge, mutateVerge } = useVerge()
  const { mutateVersion } = useClash()
  const { invalidateClashConfig } = useClashInfo()

  const [upgrading, setUpgrading] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [changingCore, setChangingCore] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const clashCore = verge?.clash_core ?? 'verge-mihomo'
  const busy = restarting || upgrading || changingCore !== null

  async function onCoreChange(core: string): Promise<void> {
    if (core === clashCore || busy) {
      return
    }
    setChangingCore(core)
    setMessage(null)
    try {
      closeAllConnections()
      const errorMsg = await changeClashCore(core)
      if (errorMsg) {
        setMessage(errorMsg)
        return
      }
      mutateVerge()
      await new Promise((resolve) => setTimeout(resolve, 500))
      invalidateClashConfig()
      mutateVersion()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setChangingCore(null)
    }
  }

  async function onRestart(): Promise<void> {
    setRestarting(true)
    setMessage(null)
    try {
      await restartCore()
      setMessage(t('settings.clash.core.messages.restartSuccess'))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setRestarting(false)
    }
  }

  async function onUpgrade(): Promise<void> {
    setUpgrading(true)
    setMessage(null)
    try {
      await upgradeCore()
      mutateVersion()
      setMessage(t('settings.clash.core.messages.upgraded'))
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setMessage(
        errMsg.includes('already using latest version')
          ? t('settings.clash.core.messages.alreadyLatest')
          : errMsg,
      )
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <ClashDialogShell
      open={open}
      onClose={onClose}
      title={t('settings.clash.core.title')}
      footer={<ClashSecondaryButton onClick={onClose}>{t('actions.close')}</ClashSecondaryButton>}
    >
      <div className="flex items-center justify-end gap-2">
        <ClashSecondaryButton onClick={onUpgrade} disabled={busy}>
          {upgrading ? t('settings.clash.common.saving') : t('settings.clash.core.actions.upgrade')}
        </ClashSecondaryButton>
        <ClashSecondaryButton onClick={onRestart} disabled={busy}>
          <span className="flex items-center gap-1.5">
            <RefreshIcon className="size-3.5" />
            {t('settings.clash.core.actions.restart')}
          </span>
        </ClashSecondaryButton>
      </div>

      <ul className="space-y-2">
        {VALID_CORE.map((item) => {
          const selected = item.core === clashCore
          return (
            <li key={item.core}>
              <button
                type="button"
                disabled={busy}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed ${
                  selected
                    ? 'border-brand/40 bg-brand/10'
                    : 'border-zinc-950/10 hover:bg-zinc-950/5 dark:border-white/10 dark:hover:bg-white/10'
                }`}
                onClick={() => onCoreChange(item.core)}
              >
                <span>
                  <span className="block text-sm font-semibold text-brand">{item.name}</span>
                  <span className="block text-xs text-muted">/{item.core}</span>
                </span>
                {changingCore === item.core ? (
                  <span className="text-xs text-muted">{t('settings.clash.common.saving')}</span>
                ) : selected ? (
                  <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
                    {t('settings.clash.core.variants.release')}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {message ? <p className="text-xs font-semibold text-muted">{message}</p> : null}
    </ClashDialogShell>
  )
}
