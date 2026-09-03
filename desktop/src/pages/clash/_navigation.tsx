import { type ComponentType, type ReactNode } from 'react'

import {
  GlobeIcon,
  HomeIcon,
  LucideGitForkIcon,
  LucideListIcon,
  LucideLockOpenIcon,
  LucideServerIcon,
  LucideWifiIcon,
} from '@/icons/AllIcons'

import { navigationItems } from './_navigation-meta'
import ConnectionsPage from './connections'
import HomePage from './home'
import LogsPage from './logs'
import ProfilePage from './profiles'
import ProxyPage from './proxies'
import RulesPage from './rules'
import UnlockPage from './unlock'

const navIconClass = 'size-[18px] shrink-0'

type NavigationItem = {
  label: (typeof navigationItems)[keyof typeof navigationItems]['label']
  path: string
  icon: ReactNode
  Component: ComponentType
}

export const navItems: NavigationItem[] = [
  {
    ...navigationItems.home,
    icon: <HomeIcon className={navIconClass} aria-hidden />,
    Component: HomePage,
  },
  {
    ...navigationItems.proxies,
    icon: <LucideWifiIcon className={navIconClass} aria-hidden />,
    Component: ProxyPage,
  },
  {
    ...navigationItems.profiles,
    icon: <LucideServerIcon className={navIconClass} aria-hidden />,
    Component: ProfilePage,
  },
  {
    ...navigationItems.connections,
    icon: <GlobeIcon className={navIconClass} aria-hidden />,
    Component: ConnectionsPage,
  },
  {
    ...navigationItems.rules,
    icon: <LucideGitForkIcon className={navIconClass} aria-hidden />,
    Component: RulesPage,
  },
  {
    ...navigationItems.unlock,
    icon: <LucideLockOpenIcon className={navIconClass} aria-hidden />,
    Component: UnlockPage,
  },
]

/**
 * Clash routes kept out of the sidebar (opened from GeoCRM Settings → Clash).
 */
export const hiddenNavItems: NavigationItem[] = [
  {
    ...navigationItems.logs,
    icon: <LucideListIcon className={navIconClass} aria-hidden />,
    Component: LogsPage,
  },
]
