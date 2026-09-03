import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import type { TitleBarTabId } from '@/components/layout/MacStyleTitleBar'
import { WallpaperBackdrop } from '@/components/layout/WallpaperBackdrop'
import { AppearanceProvider } from '@/hooks/appearance-context'
import {
  BackgroundProvider,
  useSharedBackground,
  useSharedBackgroundOpacity,
} from '@/hooks/background-context'
import { GlassOpacityProvider } from '@/hooks/glass-opacity-context'
import { PageWidgetsProvider } from '@/hooks/page-widgets-context'
import { WidgetToolsProvider } from '@/hooks/use-widget-tools'
import type { BrowserTabState } from '@/hooks/use-title-tabs'
import { useTabSlideDirection } from '@/hooks/use-tab-slide-direction'
import { HomePage } from '@/pages/home'
import { StatusLoading } from '@/components/common/status-loading'
import { FUNCTIONS_CATEGORY_ID } from '@/constants/rail-categories'
import { isFeatureTabId, type FeatureTabId } from '@/constants/feature-tabs'
import { isBrowserTabId } from '@/utils/settings/link-open-preference'
import { resolveUserAvatarUrl, resolveUserDisplayName } from '@/utils/shared/user-profile'

/** Settings is loaded only when the Settings tab is open. */
const SettingsPage = lazy(async () => {
  const module = await import('@/pages/settings')
  return { default: module.SettingsPage }
})

/** Feature hosts (Ask / Mail / Calendar / Harness) load when a feature tab is active. */
const FeaturePage = lazy(async () => {
  const module = await import('@/pages/feature-page')
  return { default: module.FeaturePage }
})

/** In-app browser chrome loads only when at least one browser tab exists. */
const InAppBrowser = lazy(async () => {
  const module = await import('@/components/browser/InAppBrowser')
  return { default: module.InAppBrowser }
})

interface SignedInShellProps {
  user: User
  screen: TitleBarTabId
  /** Closable title-bar tabs currently open (keeps Feature/Settings trees alive while hidden). */
  openTabs: TitleBarTabId[]
  browserTabs: BrowserTabState[]
  onOpenSettings: () => void
  onOpenFeature: (feature: FeatureTabId) => void
  onBrowserTabTitle: (tabId: TitleBarTabId, title: string, faviconUrl: string) => void
  onSignOut: () => Promise<void>
  /** Generation per tab id; bumping remounts Settings / feature pages. */
  tabReloadEpoch?: Record<string, number>
}

/**
 * Suspense boundary with a shared loading placeholder for deferred shell chunks.
 *
 * @param props - Lazy children
 * @returns Suspense wrapper
 */
function ShellSuspense({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<StatusLoading />}>
      {children}
    </Suspense>
  )
}

/**
 * Wallpaper layer that reads shared background state (must sit under BackgroundProvider).
 * @param props - Whether Home/Settings/feature is the active title tab.
 * @returns Fixed wallpaper backdrop.
 */
function SignedInWallpaper({ showShell }: { showShell: boolean }) {
  const background = useSharedBackground()
  const { opacity } = useSharedBackgroundOpacity()
  return (
    <WallpaperBackdrop
      backgroundUrl={background.dataUrl}
      backgroundCrossfadeMs={background.crossfadeMs}
      backgroundOpacity={opacity}
      visible={showShell}
    />
  )
}

/**
 * Authenticated page host (Home / Settings / features / in-app browser) with shared
 * appearance and wallpaper state. Home is eager; Settings and each open Feature tab
 * stay mounted while the tab remains in the strip (hidden when inactive) so form
 * drafts survive Function switches — same keep-alive pattern as Home and browser tabs.
 *
 * @param props - Session user, active title-bar screen, open tabs, and browser tabs.
 * @returns Signed-in page tree.
 */
export function SignedInShell({
  user,
  screen,
  openTabs,
  browserTabs,
  onOpenSettings,
  onOpenFeature,
  onBrowserTabTitle,
  onSignOut,
  tabReloadEpoch = {},
}: SignedInShellProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(FUNCTIONS_CATEGORY_ID)
  const slide = useTabSlideDirection(screen)
  const email = user.email ?? ''
  const showHome = screen === 'home'
  const showSettings = screen === 'settings'
  const settingsMounted = openTabs.includes('settings')
  const openFeatureIds = useMemo(
    () => openTabs.filter((id): id is FeatureTabId => isFeatureTabId(id)),
    [openTabs],
  )
  const showFeature = isFeatureTabId(screen)
  const showShell = showHome || showSettings || showFeature
  const animateShell = !isBrowserTabId(screen)
  const homeSettingsSlide =
    animateShell && slide === 'forward'
      ? 'animate-tab-page-forward'
      : animateShell && slide === 'back'
        ? 'animate-tab-page-back'
        : undefined

  return (
    <AppearanceProvider userId={user.id}>
      <BackgroundProvider userId={user.id}>
        <GlassOpacityProvider userId={user.id}>
          <PageWidgetsProvider userId={user.id}>
            <WidgetToolsProvider userId={user.id}>
              <SignedInWallpaper showShell={showShell} />
              <div className="relative h-full min-h-0">
                <div
                  className={`h-full min-h-0 overflow-y-auto ${showHome ? (homeSettingsSlide ?? '') : ''}`}
                  hidden={!showHome}
                >
                  <HomePage
                    userId={user.id}
                    selectedCategoryId={selectedCategoryId}
                    onSelectCategory={setSelectedCategoryId}
                    onOpenSettings={onOpenSettings}
                    onOpenFeature={onOpenFeature}
                  />
                </div>
                {settingsMounted ? (
                  <div
                    key={`settings:${tabReloadEpoch.settings ?? 0}`}
                    className={`h-full min-h-0 overflow-y-auto ${showSettings ? (homeSettingsSlide ?? '') : ''}`}
                    hidden={!showSettings}
                  >
                    <ShellSuspense>
                      <SettingsPage
                        userId={user.id}
                        user={user}
                        userEmail={email}
                        userAvatarUrl={resolveUserAvatarUrl(user)}
                        userDisplayName={resolveUserDisplayName(user, email)}
                        onSignOut={onSignOut}
                      />
                    </ShellSuspense>
                  </div>
                ) : null}
                {openFeatureIds.map((featureId) => {
                  const active = screen === featureId
                  return (
                    <div
                      key={`${featureId}:${tabReloadEpoch[featureId] ?? 0}`}
                      className={`h-full min-h-0 ${active ? (homeSettingsSlide ?? '') : ''}`}
                      hidden={!active}
                    >
                      <ShellSuspense>
                        <FeaturePage
                          feature={featureId}
                          userId={user.id}
                          user={user}
                          onOpenFeature={onOpenFeature}
                        />
                      </ShellSuspense>
                    </div>
                  )
                })}
                {browserTabs.length > 0 ? (
                  <ShellSuspense>
                    {browserTabs.map((tab) => (
                      <InAppBrowser
                        key={tab.id}
                        tabId={tab.id}
                        initialUrl={tab.url}
                        active={screen === tab.id}
                        userId={user.id}
                        onTitleChange={(title, faviconUrl) => {
                          onBrowserTabTitle(tab.id, title, faviconUrl)
                        }}
                      />
                    ))}
                  </ShellSuspense>
                ) : null}
              </div>
            </WidgetToolsProvider>
          </PageWidgetsProvider>
        </GlassOpacityProvider>
      </BackgroundProvider>
    </AppearanceProvider>
  )
}
