/**
 * T&E application detail tab bar (Vue TeApplicationDetailTabs parity).
 */

import { useTranslation } from 'react-i18next'
import type { TeApplicationDetailTab } from '@/components/admin/te-application-shared'
import {
  FileTextIcon,
  LucideClipboardListIcon,
  LucidePackageIcon,
  SparklesIcon,
} from '@/icons/AllIcons'

interface TeApplicationDetailTabsProps {
  activeTab: TeApplicationDetailTab
  onChange: (tab: TeApplicationDetailTab) => void
}

const TABS: Array<{
  key: TeApplicationDetailTab
  labelKey: string
  Icon: typeof FileTextIcon
}> = [
  { key: 'application', labelKey: 'admin.te.tabs.application', Icon: FileTextIcon },
  { key: 'aiReview', labelKey: 'admin.te.tabs.aiReview', Icon: SparklesIcon },
  { key: 'operations', labelKey: 'admin.te.tabs.operations', Icon: LucidePackageIcon },
  { key: 'audit', labelKey: 'admin.te.tabs.audit', Icon: LucideClipboardListIcon },
]

/**
 * Renders application / AI review / operations / audit tabs.
 *
 * @param props - Active tab and change handler
 * @returns Tab bar
 */
export function TeApplicationDetailTabs({
  activeTab,
  onChange,
}: TeApplicationDetailTabsProps) {
  const { t } = useTranslation()

  return (
    <div className="no-scrollbar flex gap-0 overflow-x-auto border-b border-ink/10 dark:border-white/10">
      {TABS.map((tab) => {
        const active = activeTab === tab.key
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
            <tab.Icon className="size-[15px]" />
            {t(tab.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
