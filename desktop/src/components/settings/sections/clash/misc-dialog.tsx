import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVerge } from '@/hooks/clash/use-verge'
import {
  ClashDialogShell,
  ClashDropdown,
  ClashPrimaryButton,
  ClashRow,
  ClashSecondaryButton,
  ClashSwitchRow,
  ClashTextInput,
} from './clash-ui'

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'silent'] as const
const PROXY_COLUMNS = [6, 1, 2, 3, 4, 5] as const

interface MiscValues {
  appLogLevel: string
  appLogMaxSize: number
  appLogMaxCount: number
  autoCloseConnection: boolean
  enableBuiltinEnhanced: boolean
  proxyLayoutColumn: number
  enableAutoDelayDetection: boolean
  autoDelayDetectionIntervalMinutes: number
  defaultLatencyTest: string
  autoLogClean: number
  defaultLatencyTimeout: number
}

/** Reads verge fields into {@link MiscValues}, matching original defaults. */
function readMiscValues(verge: IVergeConfig | undefined): MiscValues {
  return {
    appLogLevel: verge?.app_log_level ?? 'warn',
    appLogMaxSize: verge?.app_log_max_size ?? 128,
    appLogMaxCount: verge?.app_log_max_count ?? 8,
    autoCloseConnection: verge?.auto_close_connection ?? true,
    enableBuiltinEnhanced: verge?.enable_builtin_enhanced ?? true,
    proxyLayoutColumn: verge?.proxy_layout_column || 6,
    enableAutoDelayDetection: verge?.enable_auto_delay_detection ?? false,
    autoDelayDetectionIntervalMinutes: verge?.auto_delay_detection_interval_minutes ?? 5,
    defaultLatencyTest: verge?.default_latency_test || '',
    autoLogClean: verge?.auto_log_clean || 0,
    defaultLatencyTimeout: verge?.default_latency_timeout || 10000,
  }
}

/**
 * Misc drill-in dialog: logging, connection, and latency-test tuning.
 * @param props - Open state and close callback.
 * @returns Misc dialog.
 */
export function MiscDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { verge, patchVerge } = useVerge()
  const [values, setValues] = useState<MiscValues>(() => readMiscValues(verge))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setValues(readMiscValues(verge))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await patchVerge({
        app_log_level: values.appLogLevel,
        app_log_max_size: values.appLogMaxSize,
        app_log_max_count: values.appLogMaxCount,
        auto_close_connection: values.autoCloseConnection,
        enable_builtin_enhanced: values.enableBuiltinEnhanced,
        proxy_layout_column: values.proxyLayoutColumn,
        enable_auto_delay_detection: values.enableAutoDelayDetection,
        auto_delay_detection_interval_minutes: values.autoDelayDetectionIntervalMinutes,
        default_latency_test: values.defaultLatencyTest,
        default_latency_timeout: values.defaultLatencyTimeout,
        auto_log_clean: values.autoLogClean as 0 | 1 | 2 | 3 | 4,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const autoLogCleanOptions = [
    { value: 0, label: t('settings.clash.misc.options.autoLogClean.never') },
    { value: 1, label: t('settings.clash.misc.options.autoLogClean.retainDays', { n: 1 }) },
    { value: 2, label: t('settings.clash.misc.options.autoLogClean.retainDays', { n: 7 }) },
    { value: 3, label: t('settings.clash.misc.options.autoLogClean.retainDays', { n: 30 }) },
    { value: 4, label: t('settings.clash.misc.options.autoLogClean.retainDays', { n: 90 }) },
  ].map((option) => ({ value: String(option.value), label: option.label }))

  return (
    <ClashDialogShell
      open={open}
      onClose={onClose}
      title={t('settings.clash.misc.title')}
      footer={
        <>
          <ClashSecondaryButton onClick={onClose}>{t('actions.cancel')}</ClashSecondaryButton>
          <ClashPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t('settings.clash.common.saving') : t('settings.clash.common.save')}
          </ClashPrimaryButton>
        </>
      }
    >
      <ClashRow label={t('settings.clash.misc.fields.appLogLevel')}>
        <ClashDropdown
          value={values.appLogLevel}
          options={LOG_LEVELS.map((level) => ({ value: level, label: level[0].toUpperCase() + level.slice(1) }))}
          onChange={(value) => setValues((v) => ({ ...v, appLogLevel: value }))}
        />
      </ClashRow>

      <ClashRow
        label={t('settings.clash.misc.fields.appLogMaxSize')}
        description={t('settings.clash.units.kilobytes')}
      >
        <ClashTextInput
          type="number"
          value={values.appLogMaxSize}
          onChange={(value) =>
            setValues((v) => ({ ...v, appLogMaxSize: Math.max(1, parseInt(value, 10) || 128) }))
          }
        />
      </ClashRow>

      <ClashRow label={t('settings.clash.misc.fields.appLogMaxCount')} description={t('settings.clash.units.files')}>
        <ClashTextInput
          type="number"
          value={values.appLogMaxCount}
          onChange={(value) => setValues((v) => ({ ...v, appLogMaxCount: Math.max(1, parseInt(value, 10) || 1) }))}
        />
      </ClashRow>

      <ClashSwitchRow
        label={t('settings.clash.misc.fields.autoCloseConnections')}
        description={t('settings.clash.misc.tooltips.autoCloseConnections')}
        checked={values.autoCloseConnection}
        onChange={(checked) => setValues((v) => ({ ...v, autoCloseConnection: checked }))}
      />

      <ClashSwitchRow
        label={t('settings.clash.misc.fields.enableBuiltinEnhanced')}
        description={t('settings.clash.misc.tooltips.enableBuiltinEnhanced')}
        checked={values.enableBuiltinEnhanced}
        onChange={(checked) => setValues((v) => ({ ...v, enableBuiltinEnhanced: checked }))}
      />

      <ClashRow label={t('settings.clash.misc.fields.proxyLayoutColumns')}>
        <ClashDropdown
          value={String(values.proxyLayoutColumn)}
          options={PROXY_COLUMNS.map((n) => ({
            value: String(n),
            label: n === 6 ? t('settings.clash.misc.options.proxyLayoutColumns.auto') : String(n),
          }))}
          onChange={(value) => setValues((v) => ({ ...v, proxyLayoutColumn: Number(value) }))}
        />
      </ClashRow>

      <ClashRow label={t('settings.clash.misc.fields.autoLogClean')}>
        <ClashDropdown
          value={String(values.autoLogClean)}
          options={autoLogCleanOptions}
          onChange={(value) => setValues((v) => ({ ...v, autoLogClean: Number(value) }))}
        />
      </ClashRow>

      <ClashSwitchRow
        label={t('settings.clash.misc.fields.autoDelayDetection')}
        description={t('settings.clash.misc.tooltips.autoDelayDetection')}
        checked={values.enableAutoDelayDetection}
        onChange={(checked) => setValues((v) => ({ ...v, enableAutoDelayDetection: checked }))}
      />

      <ClashRow
        label={t('settings.clash.misc.fields.autoDelayDetectionInterval')}
        description={t('settings.clash.units.minutes')}
      >
        <ClashTextInput
          type="number"
          value={values.autoDelayDetectionIntervalMinutes}
          disabled={!values.enableAutoDelayDetection}
          onChange={(value) => {
            const parsed = parseInt(value, 10)
            setValues((v) => ({
              ...v,
              autoDelayDetectionIntervalMinutes: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
            }))
          }}
        />
      </ClashRow>

      <ClashRow
        label={t('settings.clash.misc.fields.defaultLatencyTest')}
        description={t('settings.clash.misc.tooltips.defaultLatencyTest')}
      >
        <ClashTextInput
          value={values.defaultLatencyTest}
          placeholder="http://cp.cloudflare.com/generate_204"
          onChange={(value) => setValues((v) => ({ ...v, defaultLatencyTest: value }))}
          className="w-56"
        />
      </ClashRow>

      <ClashRow
        label={t('settings.clash.misc.fields.defaultLatencyTimeout')}
        description={t('settings.clash.units.milliseconds')}
      >
        <ClashTextInput
          type="number"
          value={values.defaultLatencyTimeout}
          placeholder="10000"
          onChange={(value) => setValues((v) => ({ ...v, defaultLatencyTimeout: parseInt(value, 10) || 0 }))}
        />
      </ClashRow>

      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}
