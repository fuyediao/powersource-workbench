import {
  DnsOutlined,
  RouterOutlined,
  SpeedOutlined,
} from '@mui/icons-material'
import { Grid, Skeleton } from '@mui/material'
import { Suspense, lazy, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { BasePage } from '@/components/clash/base'
import { ClashModeCard } from '@/components/clash/home/clash-mode-card'
import { CurrentProxyCard } from '@/components/clash/home/current-proxy-card'
import { EnhancedCard } from '@/components/clash/home/enhanced-card'
import { EnhancedTrafficStats } from '@/components/clash/home/enhanced-traffic-stats'
import { HomeProfileCard } from '@/components/clash/home/home-profile-card'
import { ProxyTunCard } from '@/components/clash/home/proxy-tun-card'
import { useProfiles } from '@/hooks/clash/use-profiles'
import { useVerge } from '@/hooks/clash/use-verge'

const preloadTestCard = () =>
  import('@/components/clash/home/test-card').then((module) => ({
    default: module.TestCard,
  }))
const preloadIpInfoCard = () =>
  import('@/components/clash/home/ip-info-card').then((module) => ({
    default: module.IpInfoCard,
  }))
const preloadClashInfoCard = () =>
  import('@/components/clash/home/clash-info-card').then((module) => ({
    default: module.ClashInfoCard,
  }))
const preloadSystemInfoCard = () =>
  import('@/components/clash/home/system-info-card').then((module) => ({
    default: module.SystemInfoCard,
  }))

const LazyTestCard = lazy(preloadTestCard)
const LazyIpInfoCard = lazy(preloadIpInfoCard)
const LazyClashInfoCard = lazy(preloadClashInfoCard)
const LazySystemInfoCard = lazy(preloadSystemInfoCard)

/**
 * Preloads optional Home cards without blocking first paint.
 * @returns Settled import results.
 */
export const preloadHomePageCards = () =>
  Promise.all([
    preloadTestCard().catch(() => {}),
    preloadIpInfoCard().catch(() => {}),
    preloadClashInfoCard().catch(() => {}),
    preloadSystemInfoCard().catch(() => {}),
  ])

interface HomeCardsSettings {
  profile: boolean
  proxy: boolean
  network: boolean
  mode: boolean
  traffic: boolean
  info: boolean
  clashinfo: boolean
  systeminfo: boolean
  test: boolean
  ip: boolean
  [key: string]: boolean
}

const DEFAULT_HOME_CARDS: HomeCardsSettings = {
  info: false,
  profile: true,
  proxy: true,
  network: true,
  mode: true,
  traffic: true,
  clashinfo: true,
  systeminfo: true,
  test: true,
  ip: true,
}

const HomePage = () => {
  const { t } = useTranslation()
  const { verge } = useVerge()
  const { current, mutateProfiles } = useProfiles()

  const homeCards =
    (verge?.home_cards as HomeCardsSettings | undefined) ?? DEFAULT_HOME_CARDS

  /**
   * Renders a Home card when its visibility flag is on.
   * @param cardKey - Flag on `homeCards`.
   * @param component - Card body.
   * @param size - Grid span.
   * @returns Grid item, or null.
   */
  const renderCard = useCallback(
    (cardKey: string, component: React.ReactNode, size: number = 6) => {
      if (!homeCards[cardKey]) return null

      return (
        <Grid size={size} key={cardKey}>
          {component}
        </Grid>
      )
    },
    [homeCards],
  )

  const criticalCards = useMemo(
    () => [
      renderCard(
        'profile',
        <HomeProfileCard current={current} onProfileUpdated={mutateProfiles} />,
      ),
      renderCard('proxy', <CurrentProxyCard />),
      renderCard('network', <NetworkSettingsCard />),
      renderCard('mode', <ClashModeEnhancedCard />),
    ],
    [current, mutateProfiles, renderCard],
  )

  const nonCriticalCards = useMemo(
    () => [
      renderCard(
        'traffic',
        <EnhancedCard
          title={t('home.page.cards.trafficStats')}
          icon={<SpeedOutlined />}
          iconColor="secondary"
        >
          <EnhancedTrafficStats />
        </EnhancedCard>,
        12,
      ),
      renderCard(
        'test',
        <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
          <LazyTestCard />
        </Suspense>,
      ),
      renderCard(
        'ip',
        <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
          <LazyIpInfoCard />
        </Suspense>,
      ),
      renderCard(
        'clashinfo',
        <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
          <LazyClashInfoCard />
        </Suspense>,
      ),
      renderCard(
        'systeminfo',
        <Suspense fallback={<Skeleton variant="rectangular" height={200} />}>
          <LazySystemInfoCard />
        </Suspense>,
      ),
    ],
    [t, renderCard],
  )
  return (
    <BasePage title={t('home.page.title')} contentStyle={{ padding: 2 }}>
      <Grid container spacing={1.5} columns={{ xs: 6, sm: 6, md: 12 }}>
        {criticalCards}

        {nonCriticalCards}
      </Grid>
    </BasePage>
  )
}

/**
 * Network settings card wrapping TUN / system-proxy controls.
 * @returns Card.
 */
const NetworkSettingsCard = () => {
  const { t } = useTranslation()
  return (
    <EnhancedCard
      title={t('home.page.cards.networkSettings')}
      icon={<DnsOutlined />}
      iconColor="primary"
      action={null}
    >
      <ProxyTunCard />
    </EnhancedCard>
  )
}

/**
 * Proxy-mode card wrapping Clash mode toggles.
 * @returns Card.
 */
const ClashModeEnhancedCard = () => {
  const { t } = useTranslation()
  return (
    <EnhancedCard
      title={t('home.page.cards.proxyMode')}
      icon={<RouterOutlined />}
      iconColor="info"
      action={null}
    >
      <ClashModeCard />
    </EnhancedCard>
  )
}

export default HomePage
