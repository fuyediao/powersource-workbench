/**
 * T&E community-user detail tab chrome (Vue TeCommunityUserDetailTabs parity).
 */

import { useMemo, type ComponentType, type SVGProps } from 'react'
import { useTranslation } from 'react-i18next'
import {
  KeyIcon,
  LucideClipboardListIcon,
  LucideMessagesSquareIcon,
  LucidePackageIcon,
  UserIcon,
} from '@/icons/AllIcons'

/** Detail tab keys for the community user page. */
export type TeUserDetailTab = 'profile' | 'account' | 'orders' | 'teForms' | 'community'

const BASE_DETAIL_TABS: TeUserDetailTab[] = [
  'profile',
  'orders',
  'teForms',
  'community',
]

interface TeUserDetailTabsProps {
  activeTab: TeUserDetailTab
  canEdit: boolean
  onChange: (tab: TeUserDetailTab) => void
}

interface TabItem {
  key: TeUserDetailTab
  labelKey: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

/**
 * Tabs allowed for the current operator (account is moderator-only).
 *
 * @param canEdit - Whether `te_users` update is granted.
 * @returns Visible tab keys.
 */
export function allowedTeUserDetailTabs(canEdit: boolean): TeUserDetailTab[] {
  return canEdit ? ['profile', 'account', ...BASE_DETAIL_TABS.slice(1)] : BASE_DETAIL_TABS
}

/**
 * Normalizes a raw `?tab=` query value into a known tab key.
 *
 * @param raw - Query value.
 * @param canEdit - Whether the account tab is allowed.
 * @returns A valid tab key (defaults to profile).
 */
export function normalizeTeUserDetailTab(
  raw: string | null,
  canEdit: boolean,
): TeUserDetailTab {
  const allowed = allowedTeUserDetailTabs(canEdit)
  if (raw && (allowed as string[]).includes(raw)) {
    return raw as TeUserDetailTab
  }
  return 'profile'
}

/**
 * Detail tabs: profile, account (when canEdit), orders, T&E forms, community.
 *
 * @param props - Active tab, write flag, and change handler.
 * @returns Tab bar.
 */
export function TeUserDetailTabs({
  activeTab,
  canEdit,
  onChange,
}: TeUserDetailTabsProps) {
  const { t } = useTranslation()

  const tabs = useMemo((): TabItem[] => {
    const items: TabItem[] = [
      {
        key: 'profile',
        labelKey: 'admin.teUsers.tabs.profile',
        icon: UserIcon,
      },
    ]
    if (canEdit) {
      items.push({
        key: 'account',
        labelKey: 'admin.teUsers.tabs.account',
        icon: KeyIcon,
      })
    }
    items.push(
      {
        key: 'orders',
        labelKey: 'admin.teUsers.tabs.orders',
        icon: LucidePackageIcon,
      },
      {
        key: 'teForms',
        labelKey: 'admin.teUsers.tabs.teForms',
        icon: LucideClipboardListIcon,
      },
      {
        key: 'community',
        labelKey: 'admin.teUsers.tabs.community',
        icon: LucideMessagesSquareIcon,
      },
    )
    return items
  }, [canEdit])

  return (
    <div className="no-scrollbar flex gap-0 overflow-x-auto border-b border-ink/10">
      {tabs.map((tab) => {
        const active = activeTab === tab.key
        const Icon = tab.icon
        return (
          <button
            key={tab.key}
            type="button"
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              active
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:border-ink/20 hover:text-ink'
            }`}
            onClick={() => onChange(tab.key)}
          >
            <Icon className="size-[15px]" />
            {t(tab.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
