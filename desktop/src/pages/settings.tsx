import { SettingsPanel } from '@/components/settings/SettingsPanel'
import { useSharedAppearance } from '@/hooks/appearance-context'
import {
  useSharedBackground,
  useSharedBackgroundOpacity,
} from '@/hooks/background-context'
import {
  useSharedPanelOpacity,
  useSharedSearchPanelOpacity,
} from '@/hooks/glass-opacity-context'
import { useLinkOpen } from '@/hooks/link-open-context'
import { useSharedPageWidgets } from '@/hooks/page-widgets-context'
import {
  DEFAULT_BACKGROUND_OPACITY,
  DEFAULT_PANEL_OPACITY,
  DEFAULT_SEARCH_PANEL_OPACITY,
  DEFAULT_WALLPAPER_ROTATE_ENABLED,
  DEFAULT_WALLPAPER_ROTATE_SECONDS,
} from '@/utils/home/library-api'

import type { User } from '@supabase/supabase-js'

interface SettingsPageProps {
  userId: string
  user: User | null
  userEmail: string
  userAvatarUrl: string | null
  userDisplayName: string
  onSignOut: () => Promise<void>
}

/**
 * Standalone settings page (profile, language, theme, page widgets, wallpaper).
 * @param props - Signed-in user profile.
 * @returns Settings page.
 */
export function SettingsPage({
  userId,
  user,
  userEmail,
  userAvatarUrl,
  userDisplayName,
  onSignOut,
}: SettingsPageProps) {
  const {
    theme,
    setTheme,
    accentHue,
    setAccentHue,
    accentShade,
    setAccentShade,
    clockAccentHue,
    setClockAccentHue,
    clockAccentShade,
    setClockAccentShade,
    iconRadius,
    setIconRadius,
    searchRadius,
    setSearchRadius,
    restoreDefaults,
  } = useSharedAppearance()
  const { mode: openLinksMode, setMode: setOpenLinksMode } = useLinkOpen()
  const { opacity: panelOpacity, setOpacity: setPanelOpacity } = useSharedPanelOpacity()
  const { opacity: searchPanelOpacity, setOpacity: setSearchPanelOpacity } =
    useSharedSearchPanelOpacity()
  const { opacity: backgroundOpacity, setOpacity: setBackgroundOpacity } =
    useSharedBackgroundOpacity()
  const background = useSharedBackground()
  const pageWidgets = useSharedPageWidgets()
  const { showWeather, showMarkets, showNews, showTodo, showCurrency, showMail, showApps, peekApps } =
    pageWidgets.widgets

  return (
    <SettingsPanel
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
      hasBackground={Boolean(background.dataUrl)}
      activePath={background.activePath}
      wallpapers={background.items}
      backgroundError={background.error}
      rotateEnabled={background.rotateEnabled}
      rotateSeconds={background.rotateSeconds}
      onSetTheme={setTheme}
      onSetAccentHue={setAccentHue}
      onSetAccentShade={setAccentShade}
      onSetClockAccentHue={setClockAccentHue}
      onSetClockAccentShade={setClockAccentShade}
      onSetIconRadius={setIconRadius}
      onSetSearchRadius={setSearchRadius}
      onSetPanelOpacity={setPanelOpacity}
      onSetSearchPanelOpacity={setSearchPanelOpacity}
      onSetBackgroundOpacity={setBackgroundOpacity}
      openLinksMode={openLinksMode}
      onSetOpenLinksMode={setOpenLinksMode}
      showWeather={showWeather}
      showMarkets={showMarkets}
      showNews={showNews}
      showTodo={showTodo}
      showCurrency={showCurrency}
      showMail={showMail}
      showApps={showApps}
      peekApps={peekApps}
      onSetShowWeather={pageWidgets.setShowWeather}
      onSetShowMarkets={pageWidgets.setShowMarkets}
      onSetShowNews={pageWidgets.setShowNews}
      onSetShowTodo={pageWidgets.setShowTodo}
      onSetShowCurrency={pageWidgets.setShowCurrency}
      onSetShowMail={pageWidgets.setShowMail}
      onSetShowApps={pageWidgets.setShowApps}
      onSetRotateEnabled={background.setRotateEnabled}
      onSetRotateSeconds={background.setRotateSeconds}
      onUploadBackground={background.setFromFile}
      onSelectWallpaper={background.select}
      onRemoveWallpaper={background.remove}
      onClearBackground={() => {
        void background.clear()
      }}
      onRestoreDefaults={() => {
        restoreDefaults()
        pageWidgets.restoreDefaults()
        setOpenLinksMode('inApp')
        setPanelOpacity(DEFAULT_PANEL_OPACITY)
        setSearchPanelOpacity(DEFAULT_SEARCH_PANEL_OPACITY)
        setBackgroundOpacity(DEFAULT_BACKGROUND_OPACITY)
        background.setRotateEnabled(DEFAULT_WALLPAPER_ROTATE_ENABLED)
        background.setRotateSeconds(DEFAULT_WALLPAPER_ROTATE_SECONDS)
      }}
      onDismissError={background.clearError}
      userId={userId}
      user={user}
      userEmail={userEmail}
      userAvatarUrl={userAvatarUrl}
      userDisplayName={userDisplayName}
      onSignOut={onSignOut}
    />
  )
}
