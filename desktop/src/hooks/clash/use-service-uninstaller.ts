import { useCallback } from 'react'

import { uninstallService } from '@/services/clash/cmds'
import { showNotice } from '@/services/clash/notice-service'

import { useSystemState } from './use-system-state'

export const useServiceUninstaller = () => {
  const { mutateSystemState } = useSystemState()

  const uninstallServiceAndStartSidecar = useCallback(async () => {
    let uninstallError: unknown
    showNotice.info('settings.statuses.clashService.uninstalling')
    try {
      await uninstallService()
      showNotice.success(
        'settings.feedback.notifications.clashService.uninstallSuccess',
      )
    } catch (error) {
      uninstallError = error
    }

    try {
      await mutateSystemState()
    } catch (error) {
      if (!uninstallError) throw error
    }

    if (uninstallError) throw uninstallError
  }, [mutateSystemState])

  return { uninstallServiceAndStartSidecar }
}
