import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import type { BackgroundError } from '@/hooks/use-background'
import { useSettingsRoles } from '@/hooks/use-settings-roles'
import { useSidebarMode } from '@/hooks/use-sidebar-mode'
import { useSidebarRailMenuHost } from '@/hooks/use-sidebar-rail-menu'
import type { Theme } from '@/hooks/use-theme'
import type { AccentHue, AccentShade } from '@/utils/appearance/accent'
import type { WallpaperItem } from '@/utils/home/library-api'
import type { LinkOpenMode } from '@/utils/settings/link-open-preference'
import {
  SECTION_ORDER,
  groupVisibleSettingsSections,
  isSettingsSection,
  loadPersistedSettingsSection,
  persistSettingsSection,
  type SettingsSection,
} from '@/components/settings/settings-types'
import { SettingsNav } from '@/components/settings/settings-nav'
import { ProfileSection } from '@/components/settings/sections/profile-section'
import { PreferencesSection } from '@/components/settings/sections/preferences-section'
import { AiSection } from '@/components/settings/sections/ai-section'
import { PrivacySection } from '@/components/settings/sections/privacy-section'
import { ThemeSection } from '@/components/settings/sections/theme-section'
import { PageSection } from '@/components/settings/sections/page-section'
import { WidgetsSection } from '@/components/settings/sections/widgets-section'
import { BackgroundSection } from '@/components/settings/sections/background-section'
import { GroupAdminSection } from '@/components/settings/sections/group-admin-section'
import { GroupInfoSection } from '@/components/settings/sections/group-info-section'
import { GroupManagementSection } from '@/components/settings/sections/group-management-section'
import { UserManagementSection } from '@/components/settings/sections/user-management-section'
import { GlobalLeadersSection } from '@/components/settings/sections/global-leaders-section'
import { OaErpSection } from '@/components/settings/sections/oa-erp-section'
import { FeedbackSection } from '@/components/settings/sections/feedback-section'
import { OpenSourceSection } from '@/components/settings/sections/open-source-section'
import { subscribeSettingsSectionRequest } from '@/utils/settings/settings-section-request'

interface SettingsPanelProps {
  theme: Theme
  accentHue: AccentHue
  accentShade: AccentShade
  clockAccentHue: AccentHue
  clockAccentShade: AccentShade
  iconRadius: number
  searchRadius: number
  panelOpacity: number
  searchPanelOpacity: number
  backgroundOpacity: number
  hasBackground: boolean
  activePath: string | null
  wallpapers: WallpaperItem[]
  backgroundError: BackgroundError | null
  rotateEnabled: boolean
  rotateSeconds: number
  onSetTheme: (theme: Theme) => void
  onSetAccentHue: (hue: AccentHue) => void
  onSetAccentShade: (shade: AccentShade) => void
  onSetClockAccentHue: (hue: AccentHue) => void
  onSetClockAccentShade: (shade: AccentShade) => void
  onSetIconRadius: (radius: number) => void
  onSetSearchRadius: (radius: number) => void
  onSetPanelOpacity: (opacity: number) => void
  onSetSearchPanelOpacity: (opacity: number) => void
  onSetBackgroundOpacity: (opacity: number) => void
  openLinksMode: LinkOpenMode
  onSetOpenLinksMode: (mode: LinkOpenMode) => void
  showWeather: boolean
  showMarkets: boolean
  showNews: boolean
  showTodo: boolean
  showCurrency: boolean
  showMail: boolean
  showApps: boolean
  onSetShowWeather: (visible: boolean) => void
  onSetShowMarkets: (visible: boolean) => void
  onSetShowNews: (visible: boolean) => void
  onSetShowTodo: (visible: boolean) => void
  onSetShowCurrency: (visible: boolean) => void
  onSetShowMail: (visible: boolean) => void
  onSetShowApps: (visible: boolean) => void
  peekApps: boolean
  onSetRotateEnabled: (enabled: boolean) => void
  onSetRotateSeconds: (seconds: number) => void
  onUploadBackground: (file: File) => Promise<BackgroundError | null>
  onSelectWallpaper: (path: string) => Promise<BackgroundError | null>
  onRemoveWallpaper: (id: string) => Promise<BackgroundError | null>
  onClearBackground: () => void
  onRestoreDefaults: () => void
  onDismissError: () => void
  userId: string
  user: User | null
  userEmail: string
  userAvatarUrl: string | null
  userDisplayName: string
  onSignOut: () => Promise<void>
}

/**
 * Full-page settings shell: sidebar nav + glass content host with section slide.
 * @param props - Setting values and actions.
 * @returns Settings page panel.
 */
export function SettingsPanel({
  theme,
  accentHue,
  accentShade,
  clockAccentHue,
  clockAccentShade,
  iconRadius,
  searchRadius,
  panelOpacity,
  searchPanelOpacity,
  backgroundOpacity,
  hasBackground,
  activePath,
  wallpapers,
  backgroundError,
  rotateEnabled,
  rotateSeconds,
  onSetTheme,
  onSetAccentHue,
  onSetAccentShade,
  onSetClockAccentHue,
  onSetClockAccentShade,
  onSetIconRadius,
  onSetSearchRadius,
  onSetPanelOpacity,
  onSetSearchPanelOpacity,
  onSetBackgroundOpacity,
  openLinksMode,
  onSetOpenLinksMode,
  showWeather,
  showMarkets,
  showNews,
  showTodo,
  showCurrency,
  showMail,
  showApps,
  onSetShowWeather,
  onSetShowMarkets,
  onSetShowNews,
  onSetShowTodo,
  onSetShowCurrency,
  onSetShowMail,
  onSetShowApps,
  peekApps,
  onSetRotateEnabled,
  onSetRotateSeconds,
  onUploadBackground,
  onSelectWallpaper,
  onRemoveWallpaper,
  onClearBackground,
  onRestoreDefaults,
  onDismissError,
  userId,
  user,
  userEmail,
  userAvatarUrl,
  userDisplayName,
  onSignOut,
}: SettingsPanelProps) {
  const { t } = useTranslation()
  const roles = useSettingsRoles(userId)
  const sidebar = useSidebarMode({
    storageKey: 'workbench-electron-settings-sidebar-mode',
    defaultMode: 'expanded',
  })
  const [section, setSection] = useState<SettingsSection>(() => loadPersistedSettingsSection())
  const [sectionSlide, setSectionSlide] = useState<'up' | 'down' | null>(null)

  const visibleSections = roles.visibleSections

  useEffect(() => {
    if (!visibleSections.includes(section) && visibleSections.length > 0) {
      const next = visibleSections[0]
      setSection(next)
      persistSettingsSection(next)
    }
  }, [visibleSections, section])

  useEffect(() => {
    return subscribeSettingsSectionRequest((next) => {
      if (visibleSections.includes(next)) {
        setSection(next)
        persistSettingsSection(next)
      }
    })
  }, [visibleSections])

  /**
   * Switches settings section with an up/down content slide matching sidebar order.
   * @param next - Section to show.
   * @returns Nothing.
   */
  const selectSection = useCallback((next: SettingsSection): void => {
    if (next === section) {
      return
    }
    const fromIndex = SECTION_ORDER.indexOf(section)
    const toIndex = SECTION_ORDER.indexOf(next)
    setSectionSlide(toIndex > fromIndex ? 'up' : 'down')
    setSection(next)
    persistSettingsSection(next)
  }, [section])

  const railItems = useMemo(
    () =>
      groupVisibleSettingsSections(visibleSections).flatMap((group, groupIndex) =>
        group.map((id, itemIndex) => ({
          id,
          label: t(`settings.sections.${id}`),
          separatorBefore: groupIndex > 0 && itemIndex === 0,
        })),
      ),
    [t, visibleSections],
  )
  const onSelectRailItem = useCallback((id: string) => {
    if (isSettingsSection(id)) {
      selectSection(id)
    }
  }, [selectSection])
  useSidebarRailMenuHost({
    mode: sidebar.mode,
    setMode: sidebar.setMode,
    items: railItems,
    selectedId: section,
    onSelectItem: onSelectRailItem,
  })

  /**
   * Renders the active settings section body.
   * @returns Section content.
   */
  function renderSection(): ReactNode {
    switch (section) {
      case 'profile':
        return (
          <ProfileSection
            user={user}
            roles={roles}
            fallbackEmail={userEmail}
            fallbackAvatarUrl={userAvatarUrl}
            fallbackDisplayName={userDisplayName}
            onSignOut={onSignOut}
          />
        )
      case 'preferences':
        return <PreferencesSection onRestoreDefaults={onRestoreDefaults} />
      case 'ai':
        return <AiSection userId={userId} />
      case 'privacy':
        return <PrivacySection user={user} />
      case 'theme':
        return (
          <ThemeSection
            theme={theme}
            accentHue={accentHue}
            accentShade={accentShade}
            clockAccentHue={clockAccentHue}
            clockAccentShade={clockAccentShade}
            iconRadius={iconRadius}
            searchRadius={searchRadius}
            panelOpacity={panelOpacity}
            searchPanelOpacity={searchPanelOpacity}
            backgroundOpacity={backgroundOpacity}
            onSetTheme={onSetTheme}
            onSetAccentHue={onSetAccentHue}
            onSetAccentShade={onSetAccentShade}
            onSetClockAccentHue={onSetClockAccentHue}
            onSetClockAccentShade={onSetClockAccentShade}
            onSetIconRadius={onSetIconRadius}
            onSetSearchRadius={onSetSearchRadius}
            onSetPanelOpacity={onSetPanelOpacity}
            onSetSearchPanelOpacity={onSetSearchPanelOpacity}
            onSetBackgroundOpacity={onSetBackgroundOpacity}
          />
        )
      case 'page':
        return (
          <PageSection
            openLinksMode={openLinksMode}
            onSetOpenLinksMode={onSetOpenLinksMode}
            showWeather={showWeather}
            showMarkets={showMarkets}
            showNews={showNews}
            showTodo={showTodo}
            showCurrency={showCurrency}
            showMail={showMail}
            showApps={showApps}
            onSetShowWeather={onSetShowWeather}
            onSetShowMarkets={onSetShowMarkets}
            onSetShowNews={onSetShowNews}
            onSetShowTodo={onSetShowTodo}
            onSetShowCurrency={onSetShowCurrency}
            onSetShowMail={onSetShowMail}
            onSetShowApps={onSetShowApps}
            peekApps={peekApps}
          />
        )
      case 'widgets':
        return <WidgetsSection />
      case 'background':
        return (
          <BackgroundSection
            hasBackground={hasBackground}
            activePath={activePath}
            wallpapers={wallpapers}
            backgroundError={backgroundError}
            rotateEnabled={rotateEnabled}
            rotateSeconds={rotateSeconds}
            onSetRotateEnabled={onSetRotateEnabled}
            onSetRotateSeconds={onSetRotateSeconds}
            onUploadBackground={onUploadBackground}
            onSelectWallpaper={onSelectWallpaper}
            onRemoveWallpaper={onRemoveWallpaper}
            onClearBackground={onClearBackground}
            onDismissError={onDismissError}
          />
        )
      case 'oaErp':
        return <OaErpSection userId={userId} />
      case 'feedback':
        return <FeedbackSection userId={userId} fallbackEmail={userEmail} />
      case 'openSource':
        return <OpenSourceSection />
      case 'groupManagement':
        return <GroupManagementSection />
      case 'userManagement':
        return (
          <UserManagementSection
            currentUserId={userId}
            isSuperAdmin={roles.isSuperAdmin}
          />
        )
      case 'globalLeaders':
        return <GlobalLeadersSection />
      case 'groupAdmin':
        return roles.currentGroup ? (
          <GroupAdminSection groupId={roles.currentGroup.id} onRefresh={roles.refresh} />
        ) : null
      case 'groupInfo':
        return roles.currentGroup ? (
          <GroupInfoSection
            groupName={roles.currentGroup.name}
            members={roles.groupMembers}
          />
        ) : null
      default:
    return null
    }
  }

  return (
    <div className="settings-page flex h-dvh max-h-dvh flex-col overflow-hidden text-ink">
      <div className="relative z-10 flex min-h-0 w-full flex-1 overflow-hidden">
        <div className="relative z-10 shrink-0" style={{ width: sidebar.reservedPx }}>
          {sidebar.mode === 'hidden' ? null : (
          <SettingsNav
            section={section}
            onSelectSection={selectSection}
            visibleSections={visibleSections}
            theme={theme}
            expanded={sidebar.expanded}
            mode={sidebar.mode}
            onSetMode={sidebar.setMode}
            onPointerEnter={sidebar.onPointerEnter}
            onPointerLeave={sidebar.onPointerLeave}
            onFocusIn={sidebar.onFocusIn}
            onFocusOut={sidebar.onFocusOut}
          />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-5">
          <div
            key={section}
            className={`glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl p-5 ${
              sectionSlide === 'up'
                ? 'animate-settings-in-up'
                : sectionSlide === 'down'
                  ? 'animate-settings-in-down'
                  : ''
            }`}
          >
            <div
            className="min-h-0 flex-1 overflow-y-auto"
          >
              {renderSection()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
