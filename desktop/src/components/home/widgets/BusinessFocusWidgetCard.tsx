/**
 * Home aside: business-focus shortcuts (Board dashboard parity).
 */

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LucideBriefcaseIcon,
  LucideListChecksIcon,
  LucideUsersIcon,
} from '@/icons/AllIcons'
import { useCrmAsideWidgets } from '@/hooks/use-crm-aside-widgets'
import { openKanbanPath } from '@/utils/kanban/kanban-open-request'

interface BusinessFocusWidgetCardProps {
  /**
   * Opens Admin on a CRM path.
   * @param path - Absolute Admin path.
   */
  onOpenAdminPath: (path: string) => void
}

interface FocusRowProps {
  icon: ReactNode
  label: string
  count: number
  onClick: () => void
}

/**
 * One business-focus shortcut row (brand palette accents).
 * @param props - Icon, label, badge count, click handler.
 * @returns Button row.
 */
function FocusRow({ icon, label, count, onClick }: FocusRowProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-2xl border border-ink/10 bg-white/60 p-3 text-left transition-colors hover:border-brand/35 dark:bg-zinc-900/50"
      onClick={onClick}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium text-ink">{label}</span>
      {count > 0 ? (
        <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-bold tabular-nums text-brand">
          {count}
        </span>
      ) : null}
    </button>
  )
}

/**
 * Compact business-focus widget for the home aside.
 * @param props - Admin navigation handoff.
 * @returns Business focus card.
 */
export function BusinessFocusWidgetCard({ onOpenAdminPath }: BusinessFocusWidgetCardProps) {
  const { t } = useTranslation()
  const { businessFocus, loading } = useCrmAsideWidgets()

  return (
    <section className="glass-panel overflow-hidden rounded-3xl">
      <div className="p-5">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-brand">
            {t('home.aside.businessFocus')}
          </h2>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand">
            <LucideBriefcaseIcon className="size-5" aria-hidden />
          </span>
        </header>

        {loading ? <div className="mb-2 h-10 animate-pulse rounded-2xl bg-ink/5" /> : null}

        <div className="space-y-2">
          <FocusRow
            icon={<LucideListChecksIcon className="size-4" aria-hidden />}
            label={t('home.aside.focus.recentLeads')}
            count={businessFocus.recentLeads}
            onClick={() => onOpenAdminPath('/admin/leads')}
          />
          <FocusRow
            icon={<LucideUsersIcon className="size-4" aria-hidden />}
            label={t('home.aside.focus.recentAccounts')}
            count={businessFocus.recentAccounts}
            onClick={() => onOpenAdminPath('/admin/customers')}
          />
          <FocusRow
            icon={<LucideBriefcaseIcon className="size-4" aria-hidden />}
            label={t('home.aside.focus.activeOpportunities')}
            count={businessFocus.activeOpportunities}
            onClick={() => openKanbanPath('/kanban/opportunities')}
          />
        </div>
      </div>
    </section>
  )
}
