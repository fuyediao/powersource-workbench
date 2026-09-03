import { Menu, MenuItem, ThemeProvider } from '@mui/material'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router'

import { BaseErrorBoundary } from '@/components/clash/base'
import { ClashSidebar } from '@/components/clash/layout/clash-sidebar'
import { NoticeManager } from '@/components/clash/layout/notice-manager'
import { ServiceMigrationDialog } from '@/components/clash/layout/service-migration-dialog'
import { SysproxyPrivilegeDialog } from '@/components/clash/layout/sysproxy-privilege-dialog'
import {
  WindowControls,
  WindowResizeHandles,
} from '@/components/clash/layout/window-controller'
import { useI18n } from '@/hooks/clash/use-i18n'
import { useVerge } from '@/hooks/clash/use-verge'
import { useWindowDecorations } from '@/hooks/clash/use-window'
import { useSidebarMode } from '@/hooks/use-sidebar-mode'
import { useSidebarRailMenuHost } from '@/hooks/use-sidebar-rail-menu'
import geocrmI18n from '@/i18n'
import { isGeocrmHosted } from '@/services/clash/bridge'
import {
  areLanguageSectionsLoaded,
  clashSectionsForPath,
  ensureLanguageSections,
  resolveLanguage,
} from '@/services/clash/i18n'
import { useThemeMode } from '@/services/clash/states'
import getSystem from '@/utils/clash/get-system'

import {
  useCustomTheme,
  useLayoutEvents,
  useLoadingOverlay,
  useNavMenuOrder,
  usePendingFailures,
} from './_layout/hooks'
import { handleNoticeMessage } from './_layout/utils'
import { navItems } from './_navigation'

import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'

type MenuContextPosition = { top: number; left: number }

/**
 * Maps a Clash language code to a dayjs locale.
 * @param language - Clash language (`en` / `zh` / `zhtw`).
 * @returns dayjs locale id.
 */
function dayjsLocaleForClash(language: string): string {
  if (language === 'zh') {
    return 'zh-cn'
  }
  if (language === 'zhtw') {
    return 'zh-tw'
  }
  return 'en'
}

/**
 * Applies Clash UI + dayjs locale from a GeoCRM or Clash language code.
 * @param rawLanguage - GeoCRM (`en` / `zh-TW` / `zh-CN`) or Clash code.
 * @param switchLanguage - Clash i18n switcher.
 * @returns Nothing.
 */
function applyClashLanguage(
  rawLanguage: string,
  switchLanguage: (language: string) => void | Promise<void>,
): void {
  const clashLanguage = resolveLanguage(rawLanguage)
  dayjs.locale(dayjsLocaleForClash(clashLanguage))
  void switchLanguage(clashLanguage)
}

dayjs.extend(relativeTime)

const OS = getSystem()

/**
 * Loads every Clash locale JSON file for the island (current language).
 * @returns True when the full Clash bundle is in memory.
 */
function useClashRouteLocales(): boolean {
  const { i18n } = useTranslation()
  const location = useLocation()
  const language = resolveLanguage(i18n.language)
  const needed = `${language}:${location.pathname}`
  const [loadedFor, setLoadedFor] = useState<string | null>(() => {
    const sections = clashSectionsForPath(location.pathname)
    return areLanguageSectionsLoaded(sections, language) ? needed : null
  })

  useEffect(() => {
    let cancelled = false
    const sections = clashSectionsForPath(location.pathname)
    if (areLanguageSectionsLoaded(sections, language)) {
      setLoadedFor(needed)
      return
    }
    void ensureLanguageSections(sections, language).then(() => {
      if (!cancelled) {
        setLoadedFor(needed)
      }
    })
    return () => {
      cancelled = true
    }
  }, [language, location.pathname, needed])

  const sections = clashSectionsForPath(location.pathname)
  return loadedFor === needed || areLanguageSectionsLoaded(sections, language)
}

/**
 * Clash island shell: Admin-style sidebar plus rounded workspace.
 * @returns Layout.
 */
const Layout = () => {
  const mode = useThemeMode()
  const { t } = useTranslation()
  const routeLocalesReady = useClashRouteLocales()
  const { theme } = useCustomTheme()
  const { verge, mutateVerge, patchVerge } = useVerge()
  const { language } = verge ?? {}
  const { switchLanguage } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const themeReady = useMemo(() => Boolean(theme), [theme])
  const sidebar = useSidebarMode({
    storageKey: 'geocrm-electron-clash-sidebar-mode',
    defaultMode: 'hover',
  })

  const [menuUnlocked, setMenuUnlocked] = useState(false)
  const [menuContextPosition, setMenuContextPosition] =
    useState<MenuContextPosition | null>(null)

  const hosted = isGeocrmHosted()
  const { decorated } = useWindowDecorations()

  const handleMenuOrderOptimisticUpdate = useCallback(
    (order: string[]) => {
      mutateVerge(
        (prev) => (prev ? { ...prev, menu_order: order } : prev),
        false,
      )
    },
    [mutateVerge],
  )

  const handleMenuOrderPersist = useCallback(
    (order: string[]) => patchVerge({ menu_order: order }),
    [patchVerge],
  )

  const {
    menuOrder,
    navItemMap,
    handleMenuDragEnd,
    isDefaultOrder,
    resetMenuOrder,
  } = useNavMenuOrder({
    enabled: menuUnlocked,
    items: navItems,
    storedOrder: verge?.menu_order,
    onOptimisticUpdate: handleMenuOrderOptimisticUpdate,
    onPersist: handleMenuOrderPersist,
  })

  const sidebarItems = useMemo(
    () =>
      menuOrder.flatMap((path) => {
        const item = navItemMap.get(path)
        if (!item) {
          return []
        }
        return [
          {
            path: item.path,
            icon: item.icon,
            label: t(item.label),
          },
        ]
      }),
    [menuOrder, navItemMap, t],
  )

  const railItems = useMemo(
    () => sidebarItems.map((item) => ({ id: item.path, label: item.label })),
    [sidebarItems],
  )
  const onSelectRailItem = useCallback(
    (id: string) => {
      navigate(id)
    },
    [navigate],
  )
  useSidebarRailMenuHost({
    mode: sidebar.mode,
    setMode: sidebar.setMode,
    items: railItems,
    selectedId: location.pathname,
    onSelectItem: onSelectRailItem,
  })

  const handleMenuContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      setMenuContextPosition({ top: event.clientY, left: event.clientX })
    },
    [],
  )

  const handleMenuContextClose = useCallback(() => {
    setMenuContextPosition(null)
  }, [])

  const handleResetMenuOrder = useCallback(() => {
    setMenuContextPosition(null)
    void resetMenuOrder()
  }, [resetMenuOrder])

  const handleUnlockMenu = useCallback(() => {
    setMenuUnlocked(true)
    setMenuContextPosition(null)
  }, [])

  const handleLockMenu = useCallback(() => {
    setMenuUnlocked(false)
    setMenuContextPosition(null)
  }, [])

  const customTitlebar = useMemo(
    () =>
      decorated === false ? (
        <div className="the_titlebar">
          <div
            className="the_titlebar-drag-region"
            data-tauri-drag-region="true"
          />
          <WindowControls />
        </div>
      ) : null,
    [decorated],
  )

  useLoadingOverlay(themeReady)

  const handleNotice = useCallback(
    (payload: [string, string]) => {
      const [status, msg] = payload
      try {
        handleNoticeMessage(status, msg, t, navigate)
      } catch (error) {
        console.error('[notice] failed:', error)
      }
    },
    [t, navigate],
  )

  useLayoutEvents(handleNotice)
  usePendingFailures()

  useEffect(() => {
    if (hosted) {
      applyClashLanguage(geocrmI18n.language, switchLanguage)
      const onHostLanguageChanged = (lng: string): void => {
        applyClashLanguage(lng, switchLanguage)
      }
      geocrmI18n.on('languageChanged', onHostLanguageChanged)
      return () => {
        geocrmI18n.off('languageChanged', onHostLanguageChanged)
      }
    }

    if (language) {
      applyClashLanguage(language, switchLanguage)
    }
  }, [hosted, language, switchLanguage])

  if (!themeReady) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{
          background: mode === 'light' ? '#fff' : '#181a1b',
          color: mode === 'light' ? '#333' : '#fff',
        }}
      />
    )
  }

  return (
    <ThemeProvider theme={theme}>
      <NoticeManager position={verge?.notice_position} />
      <ServiceMigrationDialog />
      <SysproxyPrivilegeDialog />
      {decorated === false && <WindowResizeHandles />}
      {hosted ? null : customTitlebar}

      <div
        className={`${OS} relative flex h-full min-h-0 overflow-hidden text-ink${hosted ? ' layout--geocrm-hosted' : ''}`}
        onContextMenu={(e) => {
          if (
            OS === 'windows' &&
            !['input', 'textarea'].includes(
              e.currentTarget.tagName.toLowerCase(),
            ) &&
            !e.currentTarget.isContentEditable
          ) {
            e.preventDefault()
          }
        }}
      >
        <div
          className="relative z-10 shrink-0"
          style={{ width: sidebar.reservedPx }}
        >
          {sidebar.mode === 'hidden' ? null : (
          <ClashSidebar
            items={sidebarItems}
            expanded={sidebar.expanded}
            mode={sidebar.mode}
            menuUnlocked={menuUnlocked}
            onSetMode={sidebar.setMode}
            onPointerEnter={sidebar.onPointerEnter}
            onPointerLeave={sidebar.onPointerLeave}
            onFocusIn={sidebar.onFocusIn}
            onFocusOut={sidebar.onFocusOut}
            onContextMenu={handleMenuContextMenu}
            onDragEnd={handleMenuDragEnd}
          />
          )}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5">
          <div className="glass-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
            <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <BaseErrorBoundary>
                {routeLocalesReady ? <Outlet /> : null}
              </BaseErrorBoundary>
            </div>
          </div>
        </div>
      </div>

      <Menu
        open={Boolean(menuContextPosition)}
        onClose={handleMenuContextClose}
        anchorReference="anchorPosition"
        anchorPosition={
          menuContextPosition
            ? {
                top: menuContextPosition.top,
                left: menuContextPosition.left,
              }
            : undefined
        }
        transitionDuration={200}
        slotProps={{
          list: {
            sx: { py: 0.5 },
          },
        }}
      >
        <MenuItem
          onClick={menuUnlocked ? handleLockMenu : handleUnlockMenu}
          dense
        >
          {menuUnlocked
            ? t('layout.components.navigation.menu.lock')
            : t('layout.components.navigation.menu.unlock')}
        </MenuItem>
        <MenuItem
          onClick={handleResetMenuOrder}
          dense
          disabled={isDefaultOrder}
        >
          {t('layout.components.navigation.menu.restoreDefaultOrder')}
        </MenuItem>
      </Menu>
    </ThemeProvider>
  )
}

export default Layout
