import {
  InfoOutlined,
  SettingsOutlined,
  AdminPanelSettingsOutlined,
  DnsOutlined,
  ExtensionOutlined,
} from '@mui/icons-material'
import { Typography, Stack, Divider, IconButton } from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useServiceInstaller } from '@/hooks/clash/use-service-installer'
import { useSystemState } from '@/hooks/clash/use-system-state'
import { useVerge } from '@/hooks/clash/use-verge'
import { getSystemInfo } from '@/services/clash/cmds'
import { version as appVersion } from '@/constants/clash-app-version'
import { openGeoCrmSettings } from '@/utils/settings/settings-section-request'

import { EnhancedCard } from './enhanced-card'

export const SystemInfoCard = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const { isAdminMode, isSidecarMode, mutateSystemState } = useSystemState()
  const { installServiceAndRestartCore } = useServiceInstaller()

  const [osInfo, setOsInfo] = useState('')

  useEffect(() => {
    getSystemInfo()
      .then((info) => {
        const sysName = info.system_name
        let sysVersion = info.system_version

        if (
          sysName &&
          sysVersion.toLowerCase().startsWith(sysName.toLowerCase())
        ) {
          sysVersion = sysVersion.substring(sysName.length).trim()
        }

        setOsInfo(`${sysName} ${sysVersion}`)
      })
      .catch(console.error)
  }, [])

  /**
   * Opens the Workbench Settings Clash section.
   */
  const goToSettings = useCallback(() => {
    openGeoCrmSettings('clash')
  }, [])

  const handleRunningModeClick = useCallback(async () => {
    if (isSidecarMode || (isAdminMode && isSidecarMode)) {
      await installServiceAndRestartCore()
      await mutateSystemState()
    }
  }, [
    isSidecarMode,
    isAdminMode,
    installServiceAndRestartCore,
    mutateSystemState,
  ])

  const runningModeStyle = useMemo(
    () => ({
      cursor:
        isSidecarMode || (isAdminMode && isSidecarMode) ? 'pointer' : 'default',
      textDecoration:
        isSidecarMode || (isAdminMode && isSidecarMode) ? 'underline' : 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 0.5,
      '&:hover': {
        opacity: isSidecarMode || (isAdminMode && isSidecarMode) ? 0.7 : 1,
      },
    }),
    [isSidecarMode, isAdminMode],
  )

  const getModeIcon = () => {
    if (isAdminMode) {
      if (!isSidecarMode) {
        return (
          <>
            <AdminPanelSettingsOutlined
              sx={{ color: 'primary.main', fontSize: 16 }}
              titleAccess={t('home.components.systemInfo.badges.adminMode')}
            />
            <DnsOutlined
              sx={{ color: 'success.main', fontSize: 16, ml: 0.5 }}
              titleAccess={t('home.components.systemInfo.badges.serviceMode')}
            />
          </>
        )
      }
      return (
        <AdminPanelSettingsOutlined
          sx={{ color: 'primary.main', fontSize: 16 }}
          titleAccess={t('home.components.systemInfo.badges.adminMode')}
        />
      )
    } else if (isSidecarMode) {
      return (
        <ExtensionOutlined
          sx={{ color: 'info.main', fontSize: 16 }}
          titleAccess={t('home.components.systemInfo.badges.sidecarMode')}
        />
      )
    } else {
      return (
        <DnsOutlined
          sx={{ color: 'success.main', fontSize: 16 }}
          titleAccess={t('home.components.systemInfo.badges.serviceMode')}
        />
      )
    }
  }

  const getModeText = () => {
    if (isAdminMode) {
      if (!isSidecarMode) {
        return t('home.components.systemInfo.badges.adminServiceMode')
      }
      return t('home.components.systemInfo.badges.adminMode')
    } else if (isSidecarMode) {
      return t('home.components.systemInfo.badges.sidecarMode')
    } else {
      return t('home.components.systemInfo.badges.serviceMode')
    }
  }

  if (!verge) return null

  return (
    <EnhancedCard
      title={t('home.components.systemInfo.title')}
      icon={<InfoOutlined />}
      iconColor="error"
      action={
        <IconButton
          size="small"
          onClick={goToSettings}
          title={t('home.components.systemInfo.actions.settings')}
        >
          <SettingsOutlined fontSize="small" />
        </IconButton>
      }
    >
      <Stack spacing={1.5}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.components.systemInfo.fields.osInfo')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            {osInfo}
          </Typography>
        </Stack>
        <Divider />
        <Stack
          direction="row"
          sx={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Typography variant="body2" color="text.secondary">
            {t('home.components.systemInfo.fields.runningMode')}
          </Typography>
          <Typography
            variant="body2"
            onClick={handleRunningModeClick}
            sx={{ ...runningModeStyle, fontWeight: 'medium' }}
          >
            {getModeIcon()}
            {getModeText()}
          </Typography>
        </Stack>
        <Divider />
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            {t('home.components.systemInfo.fields.vergeVersion')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
            v{appVersion}
          </Typography>
        </Stack>
      </Stack>
    </EnhancedCard>
  )
}
