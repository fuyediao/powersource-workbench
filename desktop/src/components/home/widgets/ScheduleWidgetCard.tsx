/**
 * Home aside: upcoming follow-up schedule (includes overdue planned items).
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FollowUpCreateDialog } from '@/components/admin/follow-up-create-dialog'
import { LucideCalendarCheckIcon, PlusIcon } from '@/icons/AllIcons'
import { useCrmAsideWidgets } from '@/hooks/use-crm-aside-widgets'
import {
  HOME_SCHEDULE_PREVIEW_LIMIT,
  type HomeScheduleItem,
} from '@/services/follow-ups-api'
import { followUpEntityPath, followUpsListPath } from '@/utils/follow-up-routes'

interface ScheduleWidgetCardProps {
  /** Signed-in user id (create dialog + owner scope). */
  userId: string
  /**
   * Opens Admin on a CRM path.
   * @param path - Absolute Admin path.
   */
  onOpenAdminPath: (path: string) => void
}

/**
 * Resolves the Todo List timeline path for a schedule row.
 * @param item - Schedule item.
 * @returns Admin follow-ups entity (or list) path.
 */
function scheduleAdminPath(item: HomeScheduleItem): string {
  const name = item.subtitle.trim() || undefined
  if (item.customerId) {
    return followUpEntityPath('customer', item.customerId, name)
  }
  if (item.leadId) {
    return followUpEntityPath('lead', item.leadId, name)
  }
  if (item.opportunityId) {
    return followUpEntityPath('opportunity', item.opportunityId, name)
  }
  if (item.kolId) {
    return followUpEntityPath('kol', item.kolId, name)
  }
  if (item.competitorShopId) {
    return followUpEntityPath('competitor', item.competitorShopId, name)
  }
  return followUpsListPath()
}

/**
 * Formats a scheduled follow-up timestamp.
 * @param iso - ISO datetime.
 * @returns Localized short date/time.
 */
function formatFollowUpTime(iso: string): string {
  if (!iso) {
    return '—'
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * Card classes: opaque enough to stay readable over home wallpaper, with
 * brand / amber accents matching the Todo List timeline palette.
 * @param overdue - Whether the plan is past due.
 * @returns Tailwind class string.
 */
function scheduleCardClass(overdue: boolean): string {
  if (overdue) {
    return 'border-amber-500/50 bg-white/90 shadow-sm hover:border-amber-500/70 dark:bg-zinc-900/90'
  }
  return 'border-brand/35 bg-white/90 shadow-sm hover:border-brand/55 dark:bg-zinc-900/90'
}

/**
 * Compact schedule reminder widget for the home aside.
 * @param props - User id and Admin navigation handoff.
 * @returns Schedule card.
 */
export function ScheduleWidgetCard({
  userId,
  onOpenAdminPath,
}: ScheduleWidgetCardProps) {
  const { t } = useTranslation()
  const { schedule, scheduleTotal, loading, refresh } = useCrmAsideWidgets()
  const [createOpen, setCreateOpen] = useState(false)
  const preview = schedule.slice(0, HOME_SCHEDULE_PREVIEW_LIMIT)
  const showViewMore = scheduleTotal > HOME_SCHEDULE_PREVIEW_LIMIT

  return (
    <section className="glass-panel overflow-hidden rounded-3xl">
      <div className="p-5">
        <header className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-base font-bold text-brand">
              {t('home.aside.scheduleReminder')}
            </h2>
            {!loading && scheduleTotal > 0 ? (
              <span className="rounded-full bg-brand/20 px-2 py-0.5 text-xs font-bold tabular-nums text-brand">
                {scheduleTotal}
              </span>
            ) : null}
          </div>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/20 text-brand">
            <LucideCalendarCheckIcon className="size-5" aria-hidden />
          </span>
        </header>

        <div className="mb-3 flex justify-start">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon className="size-3" aria-hidden />
            {t('home.aside.addFollowUpPlan')}
          </button>
        </div>

        <div className="space-y-2">
          {loading && preview.length === 0 ? (
            <div className="h-16 animate-pulse rounded-2xl bg-white/70 dark:bg-zinc-900/70" />
          ) : null}
          {!loading && preview.length === 0 ? (
            <p className="rounded-xl bg-white/80 px-3 py-2 text-xs font-medium text-muted dark:bg-zinc-900/80">
              {t('admin.followUpTimeline.noFollowUps')}
            </p>
          ) : null}
          {preview.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`flex w-full flex-col rounded-2xl border px-3 py-2.5 text-left transition-colors ${scheduleCardClass(item.overdue)}`}
              onClick={() => onOpenAdminPath(scheduleAdminPath(item))}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink">
                  {t(`admin.followUps.type.${item.type}`, {
                    defaultValue: item.type,
                  })}
                </span>
                {item.overdue ? (
                  <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase dark:bg-amber-400/20 dark:text-amber-300">
                    {t('admin.followUpTimeline.overdue')}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 truncate text-[11px] font-medium text-ink/70">
                {item.subtitle}
              </span>
              <span
                className={`mt-1 text-[11px] font-semibold ${
                  item.overdue
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-brand'
                }`}
              >
                {formatFollowUpTime(item.scheduledAt)}
              </span>
            </button>
          ))}
        </div>

        {showViewMore ? (
          <button
            type="button"
            className="mt-3 w-full rounded-xl bg-white/80 py-1.5 text-center text-xs font-semibold text-brand hover:underline dark:bg-zinc-900/80"
            onClick={() => onOpenAdminPath('/admin/follow-ups')}
          >
            {t('home.aside.viewMore')}
          </button>
        ) : null}
      </div>

      <FollowUpCreateDialog
        open={createOpen}
        userId={userId}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />
    </section>
  )
}
