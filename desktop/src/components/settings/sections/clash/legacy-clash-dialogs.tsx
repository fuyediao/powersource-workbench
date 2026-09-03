import { useImperativeHandle, useRef, type Ref } from 'react'
import type { DialogRef } from '@/components/clash/base'
import { BackupViewer } from '@/components/clash/setting/mods/backup-viewer'
import { ConfigViewer } from '@/components/clash/setting/mods/config-viewer'
import { DnsViewer } from '@/components/clash/setting/mods/dns-viewer'
import { SysproxyViewer } from '@/components/clash/setting/mods/sysproxy-viewer'
import { TunViewer } from '@/components/clash/setting/mods/tun-viewer'
import { LegacyClashDialogHost } from './legacy-clash-dialog-host'

export interface LegacyClashDialogsRef {
  openTun: () => void
  openSysproxy: () => void
  openDns: () => void
  openBackup: () => void
  openConfig: () => void
}

/**
 * Mounts the five Clash sub-editors that keep their original Material UI chrome:
 * TUN, system proxy, DNS, backup, and the read-only runtime config viewer. Each is
 * high-risk, self-contained business logic (native routing validation, WebDAV
 * credentials, YAML rendering) that the settings-to-Workbench plan scopes out of the
 * Tailwind rewrite; only the Clash i18n context is supplied via
 * {@link LegacyClashDialogHost} so their copy still resolves correctly inside Workbench.
 * @param props - Imperative ref exposing an `open*` method per dialog.
 * @returns Hidden dialog hosts (each renders its own modal chrome when opened).
 */
export function LegacyClashDialogs({ ref }: { ref?: Ref<LegacyClashDialogsRef> }) {
  const tunRef = useRef<DialogRef>(null)
  const sysproxyRef = useRef<DialogRef>(null)
  const dnsRef = useRef<DialogRef>(null)
  const backupRef = useRef<DialogRef>(null)
  const configRef = useRef<DialogRef>(null)

  useImperativeHandle(ref, () => ({
    openTun: () => tunRef.current?.open(),
    openSysproxy: () => sysproxyRef.current?.open(),
    openDns: () => dnsRef.current?.open(),
    openBackup: () => backupRef.current?.open(),
    openConfig: () => configRef.current?.open(),
  }))

  return (
    <LegacyClashDialogHost>
      <TunViewer ref={tunRef} />
      <SysproxyViewer ref={sysproxyRef} />
      <DnsViewer ref={dnsRef} />
      <BackupViewer ref={backupRef} />
      <ConfigViewer ref={configRef} />
    </LegacyClashDialogHost>
  )
}
