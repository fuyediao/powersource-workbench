import { useEffect, useState } from 'react'
import { ForceUpdateDialog } from '@/components/settings/force-update-dialog'
import {
  checkAppForUpdates,
  subscribeAppUpdateAvailable,
  type AppUpdateCheckResult,
} from '@/utils/settings/app-updates'
import { requireAppUpdate, subscribeRequiredAppUpdate } from '@/utils/settings/required-app-update'

/**
 * Checks for a newer desktop build on launch, and stays subscribed to the
 * main-process background scheduler (periodic + OS-resume checks) so a
 * forced update below the server's `minSupportedVersion` floor shows the
 * blocking overlay without waiting for a restart. Non-forced updates never
 * reach this gate — they surface as a native OS notification instead.
 * @returns Force-update dialog, or null.
 */
export function RequiredAppUpdateGate() {
  const [required, setRequired] = useState<AppUpdateCheckResult | null>(null)

  useEffect(() => {
    return subscribeRequiredAppUpdate(setRequired)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const packaged = await window.workbench?.app?.isPackaged?.()
      if (cancelled || !packaged) {
        return
      }
      const result = await checkAppForUpdates()
      if (!cancelled && result.status === 'available' && result.forceUpdate) {
        requireAppUpdate(result)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return subscribeAppUpdateAvailable((result) => {
      if (result.status === 'available' && result.forceUpdate) {
        requireAppUpdate(result)
      }
    })
  }, [])

  if (!required?.downloadUrl) {
    return null
  }
  return <ForceUpdateDialog result={required} />
}
