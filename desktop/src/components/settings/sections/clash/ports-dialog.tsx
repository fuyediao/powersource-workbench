import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVerge } from '@/hooks/clash/use-verge'
import { useDisplayedMixedPort } from '@/hooks/clash/use-displayed-mixed-port'
import { saveProxyPorts } from '@/services/clash/cmds'
import getSystem from '@/utils/clash/get-system'
import {
  ClashDialogShell,
  ClashPrimaryButton,
  ClashRow,
  ClashSecondaryButton,
  ClashTextInput,
} from './clash-ui'
import { SettingsSwitch } from '@/components/settings/settings-switch'

const OS = getSystem()

const generateRandomPort = () => Math.floor(Math.random() * (65535 - 1025 + 1)) + 1025

/**
 * Ports drill-in dialog: mixed / SOCKS / HTTP / redirect / TPROXY listener config.
 * @param props - Open state and close callback.
 * @returns Ports dialog.
 */
export function PortsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const displayedMixedPort = useDisplayedMixedPort()

  const [mixedPort, setMixedPort] = useState(displayedMixedPort)
  const [socksPort, setSocksPort] = useState(verge?.verge_socks_port ?? 7898)
  const [socksEnabled, setSocksEnabled] = useState(verge?.verge_socks_enabled ?? false)
  const [httpPort, setHttpPort] = useState(verge?.verge_port ?? 7899)
  const [httpEnabled, setHttpEnabled] = useState(verge?.verge_http_enabled ?? false)
  const [redirPort, setRedirPort] = useState(verge?.verge_redir_port ?? 7895)
  const [redirEnabled, setRedirEnabled] = useState(verge?.verge_redir_enabled ?? false)
  const [tproxyPort, setTproxyPort] = useState(verge?.verge_tproxy_port ?? 7896)
  const [tproxyEnabled, setTproxyEnabled] = useState(verge?.verge_tproxy_enabled ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setMixedPort(displayedMixedPort)
    setSocksPort(verge?.verge_socks_port ?? 7898)
    setSocksEnabled(verge?.verge_socks_enabled ?? false)
    setHttpPort(verge?.verge_port ?? 7899)
    setHttpEnabled(verge?.verge_http_enabled ?? false)
    setRedirPort(verge?.verge_redir_port ?? 7895)
    setRedirEnabled(verge?.verge_redir_enabled ?? false)
    setTproxyPort(verge?.verge_tproxy_port ?? 7896)
    setTproxyEnabled(verge?.verge_tproxy_enabled ?? false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSave(): Promise<void> {
    const portList = [
      mixedPort,
      socksEnabled ? socksPort : -1,
      httpEnabled ? httpPort : -1,
      redirEnabled ? redirPort : -1,
      tproxyEnabled ? tproxyPort : -1,
    ].filter((port) => port !== -1)
    if (new Set(portList).size !== portList.length) {
      setError(t('settings.clash.ports.errors.duplicate'))
      return
    }
    const isValidPort = (port: number) => port >= 1 && port <= 65535
    const allValid = [mixedPort, socksEnabled ? socksPort : 0, httpEnabled ? httpPort : 0, redirEnabled ? redirPort : 0, tproxyEnabled ? tproxyPort : 0].every(
      (port) => port === 0 || isValidPort(port),
    )
    if (!allValid) {
      setError(t('settings.clash.ports.errors.invalid'))
      return
    }

    setSaving(true)
    setError(null)
    try {
      const outcome = await saveProxyPorts({
        mixedPort,
        socks: { enabled: socksEnabled, port: socksPort },
        http: { enabled: httpEnabled, port: httpPort },
        redir: { enabled: redirEnabled, port: redirPort },
        tproxy: { enabled: tproxyEnabled, port: tproxyPort },
      })
      if (outcome.status === 'conflict') {
        setError(t('settings.clash.ports.errors.portInUse', { port: outcome.port }))
        return
      }
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
      title={t('settings.clash.ports.title')}
      footer={
        <>
          <ClashSecondaryButton onClick={onClose}>{t('actions.cancel')}</ClashSecondaryButton>
          <ClashPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t('settings.clash.common.saving') : t('settings.clash.common.save')}
          </ClashPrimaryButton>
        </>
      }
    >
      {open ? (
        <PortsFields
          mixedPort={mixedPort}
          setMixedPort={setMixedPort}
          socksPort={socksPort}
          setSocksPort={setSocksPort}
          socksEnabled={socksEnabled}
          setSocksEnabled={setSocksEnabled}
          httpPort={httpPort}
          setHttpPort={setHttpPort}
          httpEnabled={httpEnabled}
          setHttpEnabled={setHttpEnabled}
          redirPort={redirPort}
          setRedirPort={setRedirPort}
          redirEnabled={redirEnabled}
          setRedirEnabled={setRedirEnabled}
          tproxyPort={tproxyPort}
          setTproxyPort={setTproxyPort}
          tproxyEnabled={tproxyEnabled}
          setTproxyEnabled={setTproxyEnabled}
        />
      ) : null}
      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}

interface PortsFieldsProps {
  mixedPort: number
  setMixedPort: (value: number) => void
  socksPort: number
  setSocksPort: (value: number) => void
  socksEnabled: boolean
  setSocksEnabled: (value: boolean) => void
  httpPort: number
  setHttpPort: (value: number) => void
  httpEnabled: boolean
  setHttpEnabled: (value: boolean) => void
  redirPort: number
  setRedirPort: (value: number) => void
  redirEnabled: boolean
  setRedirEnabled: (value: boolean) => void
  tproxyPort: number
  setTproxyPort: (value: number) => void
  tproxyEnabled: boolean
  setTproxyEnabled: (value: boolean) => void
}

const parsePort = (raw: string) => Number(raw.replace(/\D+/g, '').slice(0, 5)) || 0

/** Body fields for {@link PortsDialog}, split out to keep the shell lean. */
function PortsFields(props: PortsFieldsProps) {
  const { t } = useTranslation()
  const {
    mixedPort,
    setMixedPort,
    socksPort,
    setSocksPort,
    socksEnabled,
    setSocksEnabled,
    httpPort,
    setHttpPort,
    httpEnabled,
    setHttpEnabled,
    redirPort,
    setRedirPort,
    redirEnabled,
    setRedirEnabled,
    tproxyPort,
    setTproxyPort,
    tproxyEnabled,
    setTproxyEnabled,
  } = props

  return (
    <>
      <ClashRow label={t('settings.clash.ports.fields.mixed')}>
        <div className="flex items-center gap-2">
          <ClashTextInput value={mixedPort} onChange={(v) => setMixedPort(parsePort(v))} className="w-24" />
          <ClashSecondaryButton onClick={() => setMixedPort(generateRandomPort())}>
            {t('settings.clash.ports.actions.random')}
          </ClashSecondaryButton>
        </div>
      </ClashRow>

      <ClashRow label={t('settings.clash.ports.fields.socks')}>
        <div className="flex items-center gap-2">
          <ClashTextInput
            value={socksPort}
            disabled={!socksEnabled}
            onChange={(v) => setSocksPort(parsePort(v))}
            className="w-24"
          />
          <ClashSecondaryButton onClick={() => setSocksPort(generateRandomPort())}>
            {t('settings.clash.ports.actions.random')}
          </ClashSecondaryButton>
          <SettingsSwitch checked={socksEnabled} onChange={setSocksEnabled} />
        </div>
      </ClashRow>

      <ClashRow label={t('settings.clash.ports.fields.http')}>
        <div className="flex items-center gap-2">
          <ClashTextInput
            value={httpPort}
            disabled={!httpEnabled}
            onChange={(v) => setHttpPort(parsePort(v))}
            className="w-24"
          />
          <ClashSecondaryButton onClick={() => setHttpPort(generateRandomPort())}>
            {t('settings.clash.ports.actions.random')}
          </ClashSecondaryButton>
          <SettingsSwitch checked={httpEnabled} onChange={setHttpEnabled} />
        </div>
      </ClashRow>

      {OS !== 'windows' ? (
        <ClashRow label={t('settings.clash.ports.fields.redir')}>
          <div className="flex items-center gap-2">
            <ClashTextInput
              value={redirPort}
              disabled={!redirEnabled}
              onChange={(v) => setRedirPort(parsePort(v))}
              className="w-24"
            />
            <ClashSecondaryButton onClick={() => setRedirPort(generateRandomPort())}>
              {t('settings.clash.ports.actions.random')}
            </ClashSecondaryButton>
            <SettingsSwitch checked={redirEnabled} onChange={setRedirEnabled} />
          </div>
        </ClashRow>
      ) : null}

      {OS === 'linux' ? (
        <ClashRow label={t('settings.clash.ports.fields.tproxy')}>
          <div className="flex items-center gap-2">
            <ClashTextInput
              value={tproxyPort}
              disabled={!tproxyEnabled}
              onChange={(v) => setTproxyPort(parsePort(v))}
              className="w-24"
            />
            <ClashSecondaryButton onClick={() => setTproxyPort(generateRandomPort())}>
              {t('settings.clash.ports.actions.random')}
            </ClashSecondaryButton>
            <SettingsSwitch checked={tproxyEnabled} onChange={setTproxyEnabled} />
          </div>
        </ClashRow>
      ) : null}
    </>
  )
}
