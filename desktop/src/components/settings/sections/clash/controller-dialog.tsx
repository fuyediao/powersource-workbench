import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyIcon } from '@/icons/AllIcons'
import { useClashInfo } from '@/hooks/clash/use-clash'
import { useVerge } from '@/hooks/clash/use-verge'
import {
  ClashDialogShell,
  ClashPrimaryButton,
  ClashRow,
  ClashSecondaryButton,
  ClashSwitchRow,
  ClashTextInput,
} from './clash-ui'

/**
 * External controller drill-in dialog: address, secret, and enable toggle.
 * @param props - Open state and close callback.
 * @returns Controller dialog.
 */
export function ControllerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { clashInfo, patchInfo } = useClashInfo()
  const { verge, patchVerge } = useVerge()

  const [controller, setController] = useState(clashInfo?.server || '')
  const [secret, setSecret] = useState(clashInfo?.secret || '')
  const [enableController, setEnableController] = useState(verge?.enable_external_controller ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'controller' | 'secret' | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setController(clashInfo?.server || '')
    setSecret(clashInfo?.secret || '')
    setEnableController(verge?.enable_external_controller ?? false)
    setError(null)
    setCopied(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await patchVerge({ enable_external_controller: enableController })

      if (enableController) {
        if (!controller.trim()) {
          setError(t('settings.clash.controller.errors.addressRequired'))
          return
        }
        if (!secret.trim()) {
          setError(t('settings.clash.controller.errors.secretRequired'))
          return
        }
        await patchInfo({ 'external-controller': controller, secret })
      } else {
        await patchInfo({ 'external-controller': '' })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function copy(text: string, which: 'controller' | 'secret'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 1500)
    } catch (err) {
      console.warn('[ControllerDialog] copy to clipboard failed:', err)
    }
  }

  return (
    <ClashDialogShell
      open={open}
      onClose={onClose}
      title={t('settings.clash.controller.title')}
      footer={
        <>
          <ClashSecondaryButton onClick={onClose}>{t('actions.cancel')}</ClashSecondaryButton>
          <ClashPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t('settings.clash.common.saving') : t('settings.clash.common.save')}
          </ClashPrimaryButton>
        </>
      }
    >
      <ClashSwitchRow
        label={t('settings.clash.controller.fields.enable')}
        checked={enableController}
        disabled={saving}
        onChange={setEnableController}
      />

      <ClashRow label={t('settings.clash.controller.fields.address')}>
        <div className="flex items-center gap-1.5">
          <ClashTextInput
            value={controller}
            disabled={saving || !enableController}
            placeholder={t('settings.clash.controller.placeholders.address')}
            onChange={setController}
            className="w-40"
          />
          <button
            type="button"
            disabled={saving || !enableController}
            className="rounded-full p-1.5 text-muted transition hover:bg-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
            title={t('settings.clash.controller.tooltips.copy')}
            onClick={() => copy(controller, 'controller')}
          >
            <CopyIcon className="size-4" />
          </button>
        </div>
      </ClashRow>
      {copied === 'controller' ? (
        <p className="text-right text-xs text-brand">{t('settings.clash.controller.copied')}</p>
      ) : null}

      <ClashRow label={t('settings.clash.controller.fields.secret')}>
        <div className="flex items-center gap-1.5">
          <ClashTextInput
            value={secret}
            disabled={saving || !enableController}
            placeholder={t('settings.clash.controller.placeholders.secret')}
            onChange={setSecret}
            className="w-40"
          />
          <button
            type="button"
            disabled={saving || !enableController}
            className="rounded-full p-1.5 text-muted transition hover:bg-zinc-950/5 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10"
            title={t('settings.clash.controller.tooltips.copy')}
            onClick={() => copy(secret, 'secret')}
          >
            <CopyIcon className="size-4" />
          </button>
        </div>
      </ClashRow>
      {copied === 'secret' ? (
        <p className="text-right text-xs text-brand">{t('settings.clash.controller.copied')}</p>
      ) : null}

      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}
