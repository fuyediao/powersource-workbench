/**
 * Detail tab chrome for a T&E community post (Vue TeCommunityPostDetailTabs parity).
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FileTextIcon,
  GridIcon,
  LucideMessagesSquareIcon,
  ShieldIcon,
} from '@/icons/AllIcons'

/** Detail tab keys for a community post. */
export type TeCommunityPostTab = 'overview' | 'content' | 'comments' | 'reports'

interface TeCommunityPostDetailTabsProps {
  /** Currently active tab. */
  value: TeCommunityPostTab
  /** Comment-report total shown as a red badge on the Comments tab. */
  commentReportCount?: number
  /** Post report count shown as a red badge on the Reports tab. */
  reportCount?: number
  /**
   * Called when the user picks a tab.
   *
   * @param tab - Selected tab key.
   */
  onChange: (tab: TeCommunityPostTab) => void
}

interface TabSpec {
  key: TeCommunityPostTab
  labelKey: string
  icon: (props: { className?: string }) => ReactNode
  badge: number | undefined
}

/**
 * Renders overview / content / comments / reports tabs with optional red badges.
 *
 * @param props - Active tab, badge counts, and change handler.
 * @returns Tab bar.
 */
export function TeCommunityPostDetailTabs({
  value,
  commentReportCount,
  reportCount,
  onChange,
}: TeCommunityPostDetailTabsProps): ReactNode {
  const { t } = useTranslation()

  const tabs: TabSpec[] = [
    {
      key: 'overview',
      labelKey: 'admin.teCommunity.tabs.overview',
      icon: GridIcon,
      badge: undefined,
    },
    {
      key: 'content',
      labelKey: 'admin.teCommunity.tabs.content',
      icon: FileTextIcon,
      badge: undefined,
    },
    {
      key: 'comments',
      labelKey: 'admin.teCommunity.tabs.comments',
      icon: LucideMessagesSquareIcon,
      badge: commentReportCount,
    },
    {
      key: 'reports',
      labelKey: 'admin.teCommunity.tabs.reports',
      icon: ShieldIcon,
      badge: reportCount,
    },
  ]

  return (
    <div className="no-scrollbar flex gap-0 overflow-x-auto border-b border-ink/10 dark:border-white/10">
      {tabs.map((tab) => {
        const active = value === tab.key
        const Icon = tab.icon
        const showBadge = typeof tab.badge === 'number' && tab.badge > 0
        return (
          <button
            key={tab.key}
            type="button"
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none ${
              active
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:border-ink/20 hover:text-ink'
            }`}
            onClick={() => onChange(tab.key)}
          >
            <Icon className="size-[15px]" />
            {t(tab.labelKey)}
            {showBadge ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500/20 px-1.5 py-0.5 text-[11px] font-medium text-red-600 tabular-nums dark:text-red-300">
                {tab.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
