import { lazy, Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import {
  FEATURE_TAB_LABEL_KEY,
  type FeatureTabId,
} from '@/constants/feature-tabs'
import { AdminAppsIcon } from '@/icons/AllIcons'
import { StatusLoading } from '@/components/common/status-loading'

const ChatPage = lazy(async () => {
  const module = await import('@/pages/chat-page')
  return { default: module.ChatPage }
})

const MailPage = lazy(async () => {
  const module = await import('@/pages/mail-page')
  return { default: module.MailPage }
})

const CalendarPageLazy = lazy(async () => {
  const module = await import('@/pages/calendar-page')
  return { default: module.CalendarPage }
})

interface FeaturePageProps {
  feature: FeatureTabId
  userId: string
  user: User
  /**
   * Opens another feature tab.
   * @param feature - Feature tab id.
   */
  onOpenFeature?: (feature: FeatureTabId) => void
}

/**
 * Suspense boundary with a shared loading placeholder for feature chunks.
 *
 * @param props - Fallback label and lazy children
 * @returns Suspense wrapper
 */
function FeatureSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<StatusLoading />}>{children}</Suspense>
}

/**
 * Sub-page for a Workbench feature tab.
 * Heavy feature modules load on demand so the signed-in Home shell stays light.
 *
 * @param props - Active feature id and signed-in user.
 * @returns Feature page UI.
 */
export function FeaturePage({
  feature,
  userId,
  user,
}: FeaturePageProps) {
  const { t } = useTranslation()

  if (feature === 'chat') {
    return (
      <FeatureSuspense>
        <ChatPage userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  if (feature === 'mail') {
    return (
      <FeatureSuspense>
        <MailPage userId={userId} />
      </FeatureSuspense>
    )
  }

  if (feature === 'calendar') {
    return (
      <FeatureSuspense>
        <CalendarPageLazy userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  const title = t(FEATURE_TAB_LABEL_KEY[feature])

  return (
    <div className="feature-page flex h-dvh max-h-dvh flex-col overflow-hidden text-ink">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-5 py-8 sm:px-8">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-4xl border border-zinc-950/10 bg-white/55 p-8 text-center shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/50">
          <span className="grid size-16 place-items-center rounded-2xl bg-brand/10 text-brand">
            <AdminAppsIcon className="size-8" aria-hidden />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand">{title}</h1>
          <p className="max-w-md text-sm font-medium text-muted">
            {t('features.placeholderBody')}
          </p>
        </div>
      </div>
    </div>
  )
}
