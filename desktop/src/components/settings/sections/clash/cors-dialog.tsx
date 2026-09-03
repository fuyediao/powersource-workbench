import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, TrashIcon } from '@/icons/AllIcons'
import { useClash } from '@/hooks/clash/use-clash'
import { restartCore } from '@/services/clash/cmds'
import {
  ClashDialogShell,
  ClashPrimaryButton,
  ClashSecondaryButton,
  ClashSwitchRow,
  ClashTextInput,
} from './clash-ui'

const DEV_URLS = ['tauri://localhost', 'http://tauri.localhost', 'http://localhost:3000']

const filterBaseOrigins = (origins: string[]) => origins.filter((origin) => !DEV_URLS.includes(origin.trim()))
const withDevOrigins = (origins: string[]) => [...new Set([...origins, ...DEV_URLS])]

/**
 * External controller CORS drill-in dialog: allowed origins and private-network flag.
 * @param props - Open state and close callback.
 * @returns CORS dialog.
 */
export function CorsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { clash, mutateClash, patchClash } = useClash()

  const [allowPrivateNetwork, setAllowPrivateNetwork] = useState(true)
  const [origins, setOrigins] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const cors = clash?.['external-controller-cors']
    setAllowPrivateNetwork(cors?.['allow-private-network'] ?? true)
    setOrigins(filterBaseOrigins(cors?.['allow-origins'] ?? []))
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await patchClash({
        'external-controller-cors': {
          'allow-private-network': allowPrivateNetwork,
          'allow-origins': withDevOrigins(origins).filter((origin) => origin.trim() !== ''),
        },
      })
      await restartCore()
      await mutateClash()
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
      title={t('settings.clash.cors.title')}
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
        label={t('settings.clash.cors.fields.allowPrivateNetwork')}
        checked={allowPrivateNetwork}
        disabled={saving}
        onChange={setAllowPrivateNetwork}
      />

      <div>
        <p className="mb-2 text-xs font-semibold text-muted">{t('settings.clash.cors.fields.allowedOrigins')}</p>
        <div className="space-y-2">
          {origins.map((origin, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <ClashTextInput
                value={origin}
                disabled={saving}
                placeholder={t('settings.clash.cors.placeholders.origin')}
                onChange={(value) => {
                  const next = [...origins]
                  next[index] = value
                  setOrigins(next)
                }}
                className="flex-1"
              />
              <button
                type="button"
                disabled={saving}
                className="rounded-full p-1.5 text-red-500 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => setOrigins(origins.filter((_, i) => i !== index))}
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <ClashSecondaryButton onClick={() => setOrigins([...origins, ''])} disabled={saving}>
          <span className="flex items-center gap-1.5">
            <PlusIcon className="size-3.5" />
            {t('settings.clash.cors.actions.add')}
          </span>
        </ClashSecondaryButton>
        <p className="mt-2 text-xs text-muted">
          {t('settings.clash.cors.messages.alwaysIncluded', { urls: DEV_URLS.join(', ') })}
        </p>
      </div>

      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}
