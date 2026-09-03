import { lazy, Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import {
  FEATURE_TAB_LABEL_KEY,
  type FeatureTabId,
} from '@/constants/feature-tabs'
import { AdminAppsIcon, HarnessIcon, MessageSquareIcon } from '@/icons/AllIcons'
import { StatusLoading } from '@/components/common/status-loading'
import { isOfficeFeatureId } from '@/constants/office-folder'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'

const AuraPage = lazy(async () => {
  const module = await import('@/pages/aura-page')
  return { default: module.AuraPage }
})

const ChatPage = lazy(async () => {
  const module = await import('@/pages/chat-page')
  return { default: module.ChatPage }
})

const MailPage = lazy(async () => {
  const module = await import('@/pages/mail-page')
  return { default: module.MailPage }
})

const MapPage = lazy(async () => {
  const module = await import('@/pages/map-page')
  return { default: module.MapPage }
})

const OfficeWorkspacePageLazy = lazy(async () => {
  const module = await import('@/pages/office-workspace-page')
  return { default: module.OfficeWorkspacePage }
})

const FolioPageLazy = lazy(async () => {
  const module = await import('@/pages/folio-page')
  return { default: module.FolioPage }
})

const CalendarPageLazy = lazy(async () => {
  const module = await import('@/pages/calendar-page')
  return { default: module.CalendarPage }
})

const AdminPageLazy = lazy(async () => {
  const module = await import('@/pages/admin-page')
  return { default: module.AdminPage }
})

const OrdersPageLazy = lazy(async () => {
  const module = await import('@/pages/orders-page')
  return { default: module.OrdersPage }
})

const ProductsPageLazy = lazy(async () => {
  const module = await import('@/pages/products-page')
  return { default: module.ProductsPage }
})

const NexdotPageLazy = lazy(async () => {
  const module = await import('@/pages/nexdot-page')
  return { default: module.NexdotPage }
})

const TeAdminPageLazy = lazy(async () => {
  const module = await import('@/pages/te-admin-page')
  return { default: module.TeAdminPage }
})

const TeamPageLazy = lazy(async () => {
  const module = await import('@/pages/team-page')
  return { default: module.TeamPage }
})

const KanbanPageLazy = lazy(async () => {
  const module = await import('@/pages/kanban-page')
  return { default: module.KanbanPage }
})

const ClashPageLazy = lazy(async () => {
  const module = await import('@/pages/clash-page')
  return { default: module.ClashPage }
})

const HarnessPageLazy = lazy(async () => {
  const module = await import('@/pages/harness-page')
  return { default: module.HarnessPage }
})

interface FeaturePageProps {
  feature: FeatureTabId
  userId: string
  user: User
  folioPageId?: string | null
  /**
   * Opens another feature tab (Board → Admin shortcuts).
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
 * Sub-page for a GeoCRM feature tab (Artificial Intelligence / Messages / Mail / …).
 * Heavy feature modules load on demand so the signed-in Home shell stays light.
 *
 * @param props - Active feature id and signed-in user.
 * @returns Feature page UI.
 */
export function FeaturePage({
  feature,
  userId,
  user,
  folioPageId = null,
  onOpenFeature,
}: FeaturePageProps) {
  const { t } = useTranslation()
  const access = useDesktopModuleAccess(userId)

  if (!access.isLoaded) {
    return (
      <div className="feature-page h-dvh max-h-dvh">
        <StatusLoading />
      </div>
    )
  }

  if (!access.isFeatureAllowed(feature)) {
    const title = t(FEATURE_TAB_LABEL_KEY[feature])
    return (
      <div className="feature-page flex h-dvh max-h-dvh flex-col overflow-hidden text-ink">
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-5 py-8 sm:px-8">
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-4xl border border-zinc-950/10 bg-white/55 p-8 text-center shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/50">
            <h1 className="text-2xl font-extrabold tracking-tight text-brand">{title}</h1>
            <p className="max-w-md text-sm font-medium text-muted">
              {t('features.unauthorizedBody', {
                defaultValue: 'You do not have access to this Function.',
              })}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (feature === 'chat') {
    return (
      <FeatureSuspense>
        <ChatPage userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  if (feature === 'aura') {
    return (
      <FeatureSuspense>
        <AuraPage userId={userId} />
      </FeatureSuspense>
    )
  }

  if (feature === 'map') {
    return (
      <FeatureSuspense>
        <MapPage userId={userId} user={user} />
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

  if (feature === 'folio') {
    return (
      <FeatureSuspense>
        <FolioPageLazy userId={userId} user={user} initialPageId={folioPageId} />
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

  if (feature === 'kanban') {
    return (
      <FeatureSuspense>
        <KanbanPageLazy
          userId={userId}
          user={user}
          onOpenFeature={onOpenFeature ?? (() => undefined)}
        />
      </FeatureSuspense>
    )
  }

  if (feature === 'clash') {
    return (
      <FeatureSuspense>
        <ClashPageLazy />
      </FeatureSuspense>
    )
  }

  if (feature === 'harness') {
    return (
      <FeatureSuspense>
        <HarnessPageLazy userId={userId} />
      </FeatureSuspense>
    )
  }

  if (feature === 'admin') {
    return (
      <FeatureSuspense>
        <AdminPageLazy userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  if (feature === 'orders') {
    return (
      <FeatureSuspense>
        <OrdersPageLazy userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  if (feature === 'products') {
    return (
      <FeatureSuspense>
        <ProductsPageLazy userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  if (feature === 'nexdot') {
    return (
      <FeatureSuspense>
        <NexdotPageLazy userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  if (feature === 'teAdmin') {
    return (
      <FeatureSuspense>
        <TeAdminPageLazy userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  if (feature === 'team') {
    return (
      <FeatureSuspense>
        <TeamPageLazy userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  if (isOfficeFeatureId(feature)) {
    return (
      <FeatureSuspense>
        <OfficeWorkspacePageLazy kind={feature} userId={userId} user={user} />
      </FeatureSuspense>
    )
  }

  const title = t(FEATURE_TAB_LABEL_KEY[feature])

  return (
    <div className="feature-page flex h-dvh max-h-dvh flex-col overflow-hidden text-ink">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-5 py-8 sm:px-8">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-4xl border border-zinc-950/10 bg-white/55 p-8 text-center shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/50">
          <span className="grid size-16 place-items-center rounded-2xl bg-brand/10 text-brand">
            {feature === 'messages' ? (
              <MessageSquareIcon className="size-8" aria-hidden />
            ) : feature === 'harness' ? (
              <HarnessIcon className="size-8" aria-hidden />
            ) : (
              <AdminAppsIcon className="size-8" aria-hidden />
            )}
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
