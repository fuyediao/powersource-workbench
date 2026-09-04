import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TitleBarTabId } from '@/components/layout/MacStyleTitleBar'
import { FEATURE_TAB_LABEL_KEY } from '@/constants/feature-tabs'
import {
  dispatchChatMenuAction,
  getChatMenuSnapshot,
  subscribeChatMenuSnapshot,
} from '@/utils/chat/chat-menu'
import {
  dispatchSidebarRailMenuAction,
  getSidebarRailMenuSnapshot,
  isSidebarControlScreen,
  subscribeSidebarRailMenuSnapshot,
} from '@/utils/sidebar-rail-menu'
import {
  dispatchMailMenuAction,
  getMailMenuSnapshot,
  subscribeMailMenuSnapshot,
} from '@/utils/mail/mail-menu'
import {
  dispatchCalendarMenuAction,
  getCalendarMenuSnapshot,
  subscribeCalendarMenuSnapshot,
} from '@/utils/calendar/calendar-menu'
import { isMenuNavigateTarget } from '@/utils/shared/application-menu'
import { resolveAppLanguage } from '@/i18n'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'

interface UseApplicationMenuOptions {
  signedIn: boolean
  screen: TitleBarTabId
  /** Auth user id when signed in (desktop Go-menu ACL). */
  userId?: string | null
  /**
   * True when locale JSON for `screen` is in memory. Native menus must wait
   * on this: `t` identity is stable, so a sync during lazy load would stick
   * as raw keys.
   */
  localeReady: boolean
  /** Opens Home or a feature / Settings tab. */
  onNavigate: (target: MenuNavigateTarget) => void
  /** Closes the active title-bar tab (Home is not closable). */
  onCloseTab: () => void
}

/**
 * Syncs the macOS application menu with the current page and language, and
 * handles Go / File clicks from the native menu bar.
 * @param options - Auth, screen, and navigation callbacks.
 * @returns Nothing.
 */
export function useApplicationMenu(options: UseApplicationMenuOptions): void {
  const { signedIn, screen, userId = null, localeReady, onNavigate, onCloseTab } =
    options
  const { t, i18n } = useTranslation()
  const desktopAccess = useDesktopModuleAccess(signedIn ? userId : null)
  const screenRef = useRef(screen)
  const onNavigateRef = useRef(onNavigate)
  const onCloseTabRef = useRef(onCloseTab)
  screenRef.current = screen
  onNavigateRef.current = onNavigate
  onCloseTabRef.current = onCloseTab
  const [mailView, setMailView] = useState(getMailMenuSnapshot)
  const [chatView, setChatView] = useState(getChatMenuSnapshot)
  const [clashView, setClashView] = useState(getSidebarRailMenuSnapshot)
  const [calendarView, setCalendarView] = useState(getCalendarMenuSnapshot)

  useEffect(() => {
    /**
     * Pushes live Mail account / message / sync state into the native menu.
     * @returns Nothing.
     */
    function syncMailView(): void {
      setMailView(getMailMenuSnapshot())
    }
    syncMailView()
    return subscribeMailMenuSnapshot(syncMailView)
  }, [])

  useEffect(() => {
    /**
     * Pushes live Chat mode / model catalog into the native menu.
     * @returns Nothing.
     */
    function syncChatView(): void {
      setChatView(getChatMenuSnapshot())
    }
    syncChatView()
    return subscribeChatMenuSnapshot(syncChatView)
  }, [])

  useEffect(() => {
    /**
     * Pushes live Settings sidebar mode into the native menu.
     * @returns Nothing.
     */
    function syncClashView(): void {
      setClashView(getSidebarRailMenuSnapshot())
    }
    syncClashView()
    return subscribeSidebarRailMenuSnapshot(syncClashView)
  }, [])

  useEffect(() => {
    /**
     * Pushes live Calendar scope / view / connection state into the native menu.
     * @returns Nothing.
     */
    function syncCalendarView(): void {
      setCalendarView(getCalendarMenuSnapshot())
    }
    syncCalendarView()
    return subscribeCalendarMenuSnapshot(syncCalendarView)
  }, [])

  useEffect(() => {
    const labels: ApplicationMenuLabels = {
      about: t('desktopMenu.about'),
      hide: t('desktopMenu.hide'),
      hideOthers: t('desktopMenu.hideOthers'),
      showAll: t('desktopMenu.showAll'),
      quit: t('desktopMenu.quit'),
      spotlight: t('desktopMenu.spotlight'),
      openApp: t('desktopMenu.openApp'),
      agentOverlay: t('desktopMenu.agentOverlay'),
      signOut: t('desktopMenu.signOut'),
      file: t('desktopMenu.file'),
      closeTab: t('desktopMenu.closeTab'),
      open: t('desktopMenu.open'),
      save: t('desktopMenu.save'),
      edit: t('desktopMenu.edit'),
      undo: t('desktopMenu.undo'),
      redo: t('desktopMenu.redo'),
      cut: t('desktopMenu.cut'),
      copy: t('desktopMenu.copy'),
      paste: t('desktopMenu.paste'),
      selectAll: t('desktopMenu.selectAll'),
      go: t('desktopMenu.go'),
      home: t('nav.home'),
      settings: t('desktopMenu.settings'),
      chat: t(FEATURE_TAB_LABEL_KEY.chat),
      mail: t(FEATURE_TAB_LABEL_KEY.mail),
      calendar: t(FEATURE_TAB_LABEL_KEY.calendar),
      aura: t('functions.apps.ask'),
      folio: t('functions.apps.ask'),
      docs: t('functions.apps.ask'),
      sheets: t('functions.apps.ask'),
      slides: t('functions.apps.ask'),
      harness: t(FEATURE_TAB_LABEL_KEY.harness),
      language: t('desktopMenu.language'),
      languageEn: t('desktopMenu.languageEn'),
      languageZhTw: t('desktopMenu.languageZhTw'),
      languageZhCn: t('desktopMenu.languageZhCn'),
    }
    const state: ApplicationMenuState = {
      signedIn,
      screen,
      canCloseTab: signedIn && screen !== 'home',
      canOpenSave: false,
      language: resolveAppLanguage(i18n.language),
      allowedGoFeatures: desktopAccess.isLoaded
        ? (desktopAccess.allowedGoFeatures as NonNullable<
            ApplicationMenuState['allowedGoFeatures']
          >)
        : [],
      labels,
      mailLabels:
        screen === 'mail' && localeReady
          ? {
              account: t('mail.menu.account'),
              mailbox: t('mail.menu.mailbox'),
              mail: t('mail.menu.mail'),
              sync: t('mail.menu.sync'),
              unifiedInbox: t('mail.unifiedInbox'),
              addAccount: `${t('mail.addAccount')}…`,
              testAccount: t('mail.testAccount'),
              disconnectAccount: t('mail.disconnectAccount'),
              deleteAccount: t('mail.deleteAccount'),
              compose: t('mail.compose'),
              reply: t('mail.reply'),
              replyAll: t('mail.replyAll'),
              forward: t('mail.forward'),
              star: t('mail.star'),
              unstar: t('mail.unstar'),
              unread: t('mail.unread'),
              archive: t('mail.archive'),
              spam: t('mail.spam'),
              notSpam: t('mail.notSpam'),
              applyLabel: t('mail.applyLabel'),
              snooze: t('mail.snooze'),
              trash: t('mail.trash'),
              print: t('mail.print'),
              downloadEml: t('mail.downloadEml'),
              exportMbox: t('mail.exportMbox'),
              signatureEditor: t('mail.signatureEditor'),
              syncNow: t('mail.menu.syncNow'),
              syncing: t('mail.syncing'),
              historicalSync: t('mail.historicalSync'),
              sidebarControl: t('mail.sidebar.mode.control'),
              sidebarExpanded: t('mail.sidebar.mode.expanded'),
              sidebarCollapsed: t('mail.sidebar.mode.collapsed'),
              sidebarHover: t('mail.sidebar.mode.hover'),
            }
          : undefined,
      mailView: screen === 'mail' && localeReady ? mailView : undefined,
      chatLabels:
        screen === 'chat' && localeReady
          ? {
              mode: t('chat.menu.mode'),
              model: t('chat.menu.model'),
              mapSearch: t('chat.menu.mapSearch'),
              quick: t('chat.input.modeQuick'),
              think: t('chat.input.modeThink'),
              notConfigured: t('chat.modelSelector.notConfigured'),
            }
          : undefined,
      chatView: screen === 'chat' && localeReady ? chatView : undefined,
      clashLabels:
        isSidebarControlScreen(screen) && localeReady
          ? {
              sidebarMenu: t('admin.sidebar.mode.menu'),
              sidebarControl: t('admin.sidebar.mode.control'),
              sidebarExpanded: t('admin.sidebar.mode.expanded'),
              sidebarCollapsed: t('admin.sidebar.mode.collapsed'),
              sidebarHover: t('admin.sidebar.mode.hover'),
              sidebarHidden: t('admin.sidebar.mode.hidden'),
            }
          : undefined,
      clashView: isSidebarControlScreen(screen) && localeReady ? clashView : undefined,
      calendarLabels:
        screen === 'calendar' && localeReady
          ? {
              calendars: t('calendar.menu.calendars'),
              view: t('calendar.menu.view'),
              newEvent: t('calendar.newEvent'),
              addCalendar: t('calendar.calendars.add'),
              showCalendar: t('calendar.menu.show'),
              rename: t('calendar.calendars.rename'),
              deleteCalendar: t('calendar.calendars.delete'),
              importIcs: t('calendar.ics.import'),
              exportIcs: t('calendar.ics.export'),
              today: t('calendar.menu.today'),
              previous: t('calendar.menu.previous'),
              next: t('calendar.menu.next'),
              viewDay: t('calendar.menu.day'),
              viewWeek: t('calendar.menu.week'),
              viewMonth: t('calendar.menu.month'),
              viewYear: t('calendar.menu.year'),
              viewList: t('calendar.menu.list'),
              viewFourDays: t('calendar.menu.fourDays'),
            }
          : undefined,
      calendarView: screen === 'calendar' && localeReady ? calendarView : undefined,
    }
    void window.workbench?.menu?.setState?.(state)
  }, [
    chatView,
    clashView,
    desktopAccess.allowedGoFeatures,
    desktopAccess.isLoaded,
    i18n.language,
    localeReady,
    mailView,
    calendarView,
    screen,
    signedIn,
    t,
  ])

  useEffect(() => {
    return window.workbench?.menu?.onNavigate?.((target) => {
      if (!isMenuNavigateTarget(target)) {
        return
      }
      onNavigateRef.current(target)
    })
  }, [])

  useEffect(() => {
    return window.workbench?.menu?.onLanguage?.((language) => {
      void i18n.changeLanguage(language)
    })
  }, [i18n])

  useEffect(() => {
    return window.workbench?.menu?.onFileAction?.((action: MenuFileAction) => {
      if (action === 'close-tab') {
        onCloseTabRef.current()
      }
    })
  }, [])

  useEffect(() => {
    return window.workbench?.menu?.onMailAction?.((action) => {
      dispatchMailMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.workbench?.menu?.onChatAction?.((action) => {
      dispatchChatMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.workbench?.menu?.onClashAction?.((action) => {
      dispatchSidebarRailMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.workbench?.menu?.onCalendarAction?.((action) => {
      dispatchCalendarMenuAction(action)
    })
  }, [])
}
