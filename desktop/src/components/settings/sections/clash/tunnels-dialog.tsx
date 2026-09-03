import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashIcon } from '@/icons/AllIcons'
import { useClash } from '@/hooks/clash/use-clash'
import { useProxiesData } from '@/providers/clash/app-data-context'
import { probeListener, type ListenerTransport } from '@/services/clash/cmds'
import { formatHostPort, isValidPort, normalizeHost, normalizeListenHost } from '@/utils/clash/network'
import {
  ClashDialogShell,
  ClashDropdown,
  ClashPrimaryButton,
  ClashSecondaryButton,
  ClashTextInput,
} from './clash-ui'

interface TunnelEntry {
  network: string[]
  address: string
  target: string
  proxy?: string
}

type TunnelNetwork = ListenerTransport | 'tcp+udp'

const NETWORK_OPTIONS: ReadonlyArray<{ value: TunnelNetwork; label: string }> = [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'tcp+udp', label: 'TCP + UDP' },
]

/**
 * Tunnels drill-in dialog: local-to-remote port forwards routed through a proxy group.
 * Simplified from the original relative to per-node targeting: forwards may only
 * target a proxy group (not an individual node within it), matching the plan's
 * scope-reduction for this dialog.
 * @param props - Open state and close callback.
 * @returns Tunnels dialog.
 */
export function TunnelsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { clash, mutateClash, patchClash } = useClash()
  const { proxyView } = useProxiesData()

  const [draftTunnels, setDraftTunnels] = useState<TunnelEntry[]>(() => clash?.tunnels ?? [])
  const [network, setNetwork] = useState<TunnelNetwork>('tcp+udp')
  const [localAddr, setLocalAddr] = useState('')
  const [localPort, setLocalPort] = useState('')
  const [targetAddr, setTargetAddr] = useState('')
  const [targetPort, setTargetPort] = useState('')
  const [group, setGroup] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const groupNames = useMemo(() => proxyView?.groups.map((item) => item.name) ?? [], [proxyView])
  const groupOptions = useMemo(
    () => [
      { value: '', label: t('settings.clash.tunnels.default') },
      ...groupNames.map((name) => ({ value: name, label: name })),
    ],
    [groupNames, t],
  )

  function resetDraft(): void {
    setDraftTunnels(clash?.tunnels ?? [])
    setNetwork('tcp+udp')
    setLocalAddr('')
    setLocalPort('')
    setTargetAddr('')
    setTargetPort('')
    setGroup('')
    setError(null)
  }

  useEffect(() => {
    if (open) {
      resetDraft()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleAdd(): Promise<void> {
    setError(null)
    if (!localAddr || !localPort || !targetAddr || !targetPort) {
      setError(t('settings.clash.tunnels.errors.incomplete'))
      return
    }
    const localHost = normalizeListenHost(localAddr)
    if (!localHost) {
      setError(t('settings.clash.tunnels.errors.invalidLocalAddr'))
      return
    }
    if (!isValidPort(localPort)) {
      setError(t('settings.clash.tunnels.errors.invalidLocalPort'))
      return
    }
    const targetHost = normalizeHost(targetAddr)
    if (!targetHost) {
      setError(t('settings.clash.tunnels.errors.invalidTargetAddr'))
      return
    }
    if (!isValidPort(targetPort)) {
      setError(t('settings.clash.tunnels.errors.invalidTargetPort'))
      return
    }

    const transports: ListenerTransport[] = network === 'tcp+udp' ? ['tcp', 'udp'] : [network]
    const entry: TunnelEntry = {
      network: transports,
      address: formatHostPort(localHost, localPort),
      target: formatHostPort(targetHost, targetPort),
      ...(group ? { proxy: group } : {}),
    }

    try {
      const outcome = await probeListener({ address: entry.address, transports })
      if (outcome.status === 'conflict') {
        setError(t('settings.clash.tunnels.errors.portInUse', { port: outcome.port }))
        return
      }
      if (outcome.status !== 'available') {
        setError(outcome.message)
        return
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }

    setDraftTunnels((prev) => [...prev, entry])
    setLocalAddr('')
    setLocalPort('')
    setTargetAddr('')
    setTargetPort('')
    setNetwork('tcp+udp')
    setGroup('')
  }

  function handleDelete(index: number): void {
    setDraftTunnels((prev) => prev.filter((_, i) => i !== index))
  }

  async function onSave(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await patchClash({ tunnels: draftTunnels })
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
      title={t('settings.clash.tunnels.title')}
      widthClassName="max-w-xl"
      footer={
        <>
          <ClashSecondaryButton onClick={onClose}>{t('actions.cancel')}</ClashSecondaryButton>
          <ClashPrimaryButton onClick={onSave} disabled={saving}>
            {saving ? t('settings.clash.common.saving') : t('settings.clash.common.save')}
          </ClashPrimaryButton>
        </>
      }
    >
      {draftTunnels.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">{t('settings.clash.tunnels.existing')}</p>
          {draftTunnels.map((tunnel, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-950/10 px-4 py-2.5 dark:border-white/10"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand">
                  {tunnel.address} → {tunnel.target}
                </p>
                <p className="text-xs text-muted">
                  {tunnel.network.join(', ')} · {tunnel.proxy ?? t('settings.clash.tunnels.default')}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-full p-1.5 text-red-500 transition hover:bg-red-500/10"
                onClick={() => handleDelete(index)}
              >
                <TrashIcon className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2 rounded-2xl border border-zinc-950/10 p-4 dark:border-white/10">
        <p className="text-xs font-semibold text-muted">{t('settings.clash.tunnels.actions.addNew')}</p>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-brand">{t('settings.clash.tunnels.protocols')}</span>
          <ClashDropdown value={network} options={NETWORK_OPTIONS} onChange={setNetwork} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-brand">{t('settings.clash.tunnels.localAddr')}</span>
          <ClashTextInput value={localAddr} onChange={setLocalAddr} placeholder="127.0.0.1" className="w-40" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-brand">{t('settings.clash.tunnels.localPort')}</span>
          <ClashTextInput value={localPort} onChange={setLocalPort} placeholder="6553" type="number" className="w-40" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-brand">{t('settings.clash.tunnels.targetAddr')}</span>
          <ClashTextInput value={targetAddr} onChange={setTargetAddr} placeholder="8.8.8.8" className="w-40" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-brand">{t('settings.clash.tunnels.targetPort')}</span>
          <ClashTextInput value={targetPort} onChange={setTargetPort} placeholder="53" type="number" className="w-40" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-brand">
            {t('settings.clash.tunnels.proxyGroup')}{' '}
            <span className="text-xs font-normal text-muted">({t('settings.clash.tunnels.optional')})</span>
          </span>
          <ClashDropdown value={group} options={groupOptions} onChange={setGroup} />
        </div>

        <div className="flex justify-end">
          <ClashSecondaryButton onClick={handleAdd}>{t('settings.clash.tunnels.actions.add')}</ClashSecondaryButton>
        </div>
      </div>

      {error ? <p className="text-xs font-semibold text-red-500">{error}</p> : null}
    </ClashDialogShell>
  )
}
