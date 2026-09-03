import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVerge } from '@/hooks/clash/use-verge'
import { entry_lightweight_mode } from '@/services/clash/cmds'
import {
  ClashDialogShell,
  ClashPrimaryButton,
  ClashRow,
  ClashSecondaryButton,
  ClashSwitchRow,
  ClashTextInput,
} from './clash-ui'

/**
 * Lite mode drill-in dialog: manual entry and auto-entry delay.
 * @param props - Open state and close callback.
 * @returns Lite mode dialog.
 */
export function LiteModeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()

  const [autoEnter, setAutoEnter] = useState(verge?.enable_auto_light_weight_mode ?? false)
  const [delayMinutes, setDelayMinutes] = useState(verge?.auto_light_weight_minutes ?? 10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setAutoEnter(verge?.enable_auto_light_weight_mode ?? false)
    setDelayMinutes(verge?.auto_light_weight_minutes ?? 10)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await patchVerge({
        enable_auto_light_weight_mode: autoEnter,
        auto_light_weight_minutes: delayMinutes,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ClashDialogShell
      open={open}
      onClose={onClose}
      title={t('settings.clash.liteMode.title')}
      footer={
        <>
          <ClashSecondaryButton onClick={onClose}>{t('actions.cancel')}</ClashSecondaryButton>
          <ClashPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t('settings.clash.common.saving') : t('settings.clash.common.save')}
          </ClashPrimaryButton>
        </>
      }
    >
      <ClashRow label={t('settings.clash.liteMode.actions.enterNow')}>
        <button
          type="button"
          className="text-sm font-bold text-brand transition hover:underline"
          onClick={() => void entry_lightweight_mode()}
        >
          {t('settings.clash.common.enable')}
        </button>
      </ClashRow>

      <ClashSwitchRow
        label={t('settings.clash.liteMode.toggles.autoEnter')}
        description={t('settings.clash.liteMode.tooltips.autoEnter')}
        checked={autoEnter}
        disabled={saving}
        onChange={setAutoEnter}
      />

      {autoEnter ? (
        <>
          <ClashRow label={t('settings.clash.liteMode.fields.delay')} description={t('settings.clash.units.minutes')}>
            <ClashTextInput
              type="number"
              value={delayMinutes}
              disabled={saving}
              onChange={(value) => setDelayMinutes(parseInt(value, 10) || 1)}
            />
          </ClashRow>
          <p className="text-xs italic text-muted">
            {t('settings.clash.liteMode.messages.autoEnterHint', { n: delayMinutes })}
          </p>
        </>
      ) : null}

      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}
