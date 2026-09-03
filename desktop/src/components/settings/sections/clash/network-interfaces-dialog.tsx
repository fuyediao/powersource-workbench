import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyIcon } from '@/icons/AllIcons'
import { useNetworkInterfaces } from '@/hooks/clash/use-network'
import { ClashDialogShell, ClashSecondaryButton } from './clash-ui'

/**
 * Network interfaces drill-in dialog: IPv4 / IPv6 addresses and MAC address per interface.
 * @param props - Open state and close callback.
 * @returns Network interfaces dialog.
 */
export function NetworkInterfacesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { networkInterfaces, loading } = useNetworkInterfaces()
  const [isV4, setIsV4] = useState(true)

  const isEmpty = networkInterfaces.length === 0

  return (
    <ClashDialogShell
      open={open}
      onClose={onClose}
      title={t('settings.clash.networkInterfaces.title')}
      headerExtra={
        <ClashSecondaryButton onClick={() => setIsV4((prev) => !prev)}>
          {isV4 ? 'IPv6' : 'IPv4'}
        </ClashSecondaryButton>
      }
      footer={<ClashSecondaryButton onClick={onClose}>{t('actions.close')}</ClashSecondaryButton>}
    >
      {loading && isEmpty ? (
        <p className="py-8 text-center text-sm text-muted">{t('common.loading')}</p>
      ) : isEmpty ? (
        <p className="py-8 text-center text-sm text-muted">
          {t('settings.clash.networkInterfaces.empty')}
        </p>
      ) : (
        <div className="space-y-4">
          {networkInterfaces.map((item) => (
            <div key={item.name}>
              <p className="text-sm font-semibold text-brand">{item.name}</p>
              <div className="mt-1 space-y-1">
                {item.addr.map((address) => {
                  const ip = isV4 ? address.V4?.ip : address.V6?.ip
                  if (!ip) {
                    return null
                  }
                  return (
                    <AddressRow key={ip} label={t('settings.clash.networkInterfaces.fields.ipAddress')} value={ip} />
                  )
                })}
                <AddressRow
                  label={t('settings.clash.networkInterfaces.fields.macAddress')}
                  value={item.mac_addr ?? ''}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </ClashDialogShell>
  )
}

/** Copyable address row used by {@link NetworkInterfacesDialog}. */
function AddressRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1.5 rounded-xl bg-zinc-950/5 py-1 pr-1 pl-2.5 select-text dark:bg-white/10">
        <span className="text-ink">{value}</span>
        <button
          type="button"
          className="rounded-full p-1 text-muted transition hover:bg-zinc-950/10 dark:hover:bg-white/10"
          onClick={() => void navigator.clipboard.writeText(value)}
        >
          <CopyIcon className="size-3.5" />
        </button>
      </span>
    </div>
  )
}
