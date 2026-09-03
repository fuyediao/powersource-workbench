import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { TitleBarTabId } from '@/components/layout/MacStyleTitleBar'
import { FEATURE_TAB_LABEL_KEY } from '@/constants/feature-tabs'
import {
  getDocumentStats,
  subscribeDocumentStats,
} from '@/hooks/aura/document-stats-store'
import { isFocusMode, subscribeFocusMode } from '@/hooks/aura/focus-mode-store'
import { getPreferences, subscribePreferences } from '@/hooks/aura/preferences-store'
import { getSidebarCollapsed, subscribeSidebarCollapsed } from '@/hooks/aura/sidebar-store'
import { isSourceMode, subscribeSourceMode } from '@/hooks/aura/source-mode-store'
import type { DocumentStats } from '@/utils/aura/document-stats'
import { dispatchAuraMenuAction } from '@/utils/aura/menu-actions'
import {
  dispatchAuraLibraryMenuAction,
  getAuraLibraryMenuSnapshot,
  subscribeAuraLibraryMenuSnapshot,
} from '@/utils/aura/aura-library-menu'
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
  dispatchFolioMenuAction,
  getFolioMenuSnapshot,
  isFolioScreen,
  subscribeFolioMenuSnapshot,
} from '@/utils/folio/folio-menu'
import {
  dispatchOfficeMenuAction,
  getOfficeMenuSnapshot,
  isOfficeScreen,
  subscribeOfficeMenuSnapshot,
  type OfficeMenuViewState,
} from '@/utils/office/office-menu'
import type { OfficeFeatureId } from '@/constants/office-folder'
import {
  dispatchMailMenuAction,
  getMailMenuSnapshot,
  subscribeMailMenuSnapshot,
} from '@/utils/mail/mail-menu'
import {
  dispatchMapMenuAction,
  getMapMenuSnapshot,
  subscribeMapMenuSnapshot,
} from '@/utils/map/map-menu'
import {
  dispatchOrdersMenuAction,
  getOrdersMenuSnapshot,
  subscribeOrdersMenuSnapshot,
} from '@/utils/orders-menu'
import {
  dispatchCalendarMenuAction,
  getCalendarMenuSnapshot,
  subscribeCalendarMenuSnapshot,
} from '@/utils/calendar/calendar-menu'
import {
  dispatchTeamMenuAction,
  getTeamMenuSnapshot,
  subscribeTeamMenuSnapshot,
} from '@/utils/team-menu'
import { isMenuNavigateTarget } from '@/utils/shared/application-menu'
import { resolveAppLanguage } from '@/i18n'
import { useDesktopModuleAccess } from '@/hooks/use-desktop-module-access'

const WORD_COUNT_MENU_DEBOUNCE_MS = 120

/**
 * Formats document metrics for the macOS Word Count application menu.
 *
 * @param stats - Latest Aura document metrics.
 * @param t - i18n translate function.
 * @returns Menu title and detail row labels.
 */
function formatAuraWordCount(
  stats: DocumentStats,
  t: TFunction,
): AuraWordCountLabels {
  return {
    menu: t('aura.shell.wordCount.wordsShort', { count: String(stats.words) }),
    readingTime: t('aura.shell.wordCount.readingTime', {
      count: String(stats.readingMinutes),
    }),
    lines: t('aura.shell.wordCount.lines', { count: String(stats.lines) }),
    words: t('aura.shell.wordCount.words', { count: String(stats.words) }),
    characters: t('aura.shell.wordCount.characters', {
      count: String(stats.characters),
    }),
  }
}

interface UseApplicationMenuOptions {
  signedIn: boolean
  screen: TitleBarTabId
  /** Auth user id when signed in (desktop Go-menu ACL). */
  userId?: string | null
  /**
   * True when locale JSON for `screen` is in memory. Native menus must wait
   * on this: `t` identity is stable, so a sync during lazy load would stick
   * as raw keys (`aura.menu.format`, `chat.tabs.myFavorites`, …).
   */
  localeReady: boolean
  /** Opens Home or a feature / Settings tab. */
  onNavigate: (target: MenuNavigateTarget) => void
  /** Closes the active title-bar tab (Home is not closable). */
  onCloseTab: () => void
}

/**
 * Returns whether the current screen supports native File Open / Save.
 * Docs / Sheets / Slides use the OnlyOffice editor's own in-iframe menu
 * instead of the native File menu.
 * @param screen - Active title-bar id.
 * @returns True for Aura.
 */
function screenAllowsFileOpenSave(screen: TitleBarTabId): boolean {
  return screen === 'aura'
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
  const [auraView, setAuraView] = useState(() => ({
    sidebarCollapsed: getSidebarCollapsed(),
    outlineCollapsible: getPreferences().outlineCollapsible,
    sourceMode: isSourceMode(),
    focusMode: isFocusMode(),
  }))
  // Keep raw stats (not pre-translated labels): labels are formatted with `t`
  // at menu-push time so a sync while `localeReady` is false cannot stick as
  // raw keys (`aura.shell.wordCount.*`) after returning to the editor.
  const [auraStats, setAuraStats] = useState(() => getDocumentStats())
  const wordCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [auraLibraryView, setAuraLibraryView] = useState(getAuraLibraryMenuSnapshot)
  const [mapView, setMapView] = useState(getMapMenuSnapshot)
  const [mailView, setMailView] = useState(getMailMenuSnapshot)
  const [folioView, setFolioView] = useState(getFolioMenuSnapshot)
  const [officeView, setOfficeView] = useState(() =>
    isOfficeScreen(screen) ? getOfficeMenuSnapshot(screen) : getOfficeMenuSnapshot('docs'),
  )
  const [chatView, setChatView] = useState(getChatMenuSnapshot)
  const [clashView, setClashView] = useState(getSidebarRailMenuSnapshot)
  const [ordersView, setOrdersView] = useState(getOrdersMenuSnapshot)
  const [calendarView, setCalendarView] = useState(getCalendarMenuSnapshot)
  const [teamView, setTeamView] = useState(getTeamMenuSnapshot)

  useEffect(() => {
    /**
     * Pushes live Aura View checkbox state into the native menu.
     * @returns Nothing.
     */
    function syncAuraView(): void {
      setAuraView({
        sidebarCollapsed: getSidebarCollapsed(),
        outlineCollapsible: getPreferences().outlineCollapsible,
        sourceMode: isSourceMode(),
        focusMode: isFocusMode(),
      })
    }
    const unsubs = [
      subscribeSidebarCollapsed(syncAuraView),
      subscribeSourceMode(syncAuraView),
      subscribeFocusMode(syncAuraView),
      subscribePreferences(syncAuraView),
    ]
    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  useEffect(() => {
    /**
     * Pushes the latest document metrics; translation happens when the menu
     * state is built (and only while Aura locales are ready).
     * @returns Nothing.
     */
    function syncWordCount(): void {
      setAuraStats(getDocumentStats())
    }
    syncWordCount()
    const unsubscribe = subscribeDocumentStats(() => {
      if (wordCountTimerRef.current !== null) {
        clearTimeout(wordCountTimerRef.current)
      }
      wordCountTimerRef.current = setTimeout(() => {
        wordCountTimerRef.current = null
        syncWordCount()
      }, WORD_COUNT_MENU_DEBOUNCE_MS)
    })
    return () => {
      unsubscribe()
      if (wordCountTimerRef.current !== null) {
        clearTimeout(wordCountTimerRef.current)
        wordCountTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    /**
     * Pushes live Aura Scope/Library state into the native menu.
     * @returns Nothing.
     */
    function syncAuraLibraryView(): void {
      setAuraLibraryView(getAuraLibraryMenuSnapshot())
    }
    syncAuraLibraryView()
    return subscribeAuraLibraryMenuSnapshot(syncAuraLibraryView)
  }, [])

  useEffect(() => {
    /**
     * Pushes live Map sidebar / selection state into the native menu.
     * @returns Nothing.
     */
    function syncMapView(): void {
      setMapView(getMapMenuSnapshot())
    }
    syncMapView()
    return subscribeMapMenuSnapshot(syncMapView)
  }, [])

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
     * Pushes live Folio scope / selection state into the native menu.
     * @returns Nothing.
     */
    function syncFolioView(): void {
      setFolioView(getFolioMenuSnapshot())
    }
    syncFolioView()
    return subscribeFolioMenuSnapshot(syncFolioView)
  }, [])

  useEffect(() => {
    /**
     * Pushes live Office scope / selection state into the native menu.
     * Only the active Docs / Sheets / Slides kind is mirrored.
     * @param kind - Kind whose snapshot changed.
     * @param view - Latest view for that kind.
     * @returns Nothing.
     */
    function syncOfficeView(kind: OfficeFeatureId, view: OfficeMenuViewState): void {
      if (screenRef.current === kind) {
        setOfficeView(view)
      }
    }
    if (isOfficeScreen(screen)) {
      setOfficeView(getOfficeMenuSnapshot(screen))
    }
    return subscribeOfficeMenuSnapshot(syncOfficeView)
  }, [screen])

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
     * Pushes live Clash sidebar mode into the native menu.
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
     * Pushes live Orders module / group / sync state into the native menu.
     * @returns Nothing.
     */
    function syncOrdersView(): void {
      setOrdersView(getOrdersMenuSnapshot())
    }
    syncOrdersView()
    return subscribeOrdersMenuSnapshot(syncOrdersView)
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
    /**
     * Pushes live Team view / period / group state into the native menu.
     * @returns Nothing.
     */
    function syncTeamView(): void {
      setTeamView(getTeamMenuSnapshot())
    }
    syncTeamView()
    return subscribeTeamMenuSnapshot(syncTeamView)
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
      aura: t(FEATURE_TAB_LABEL_KEY.aura),
      folio: t(FEATURE_TAB_LABEL_KEY.folio),
      docs: t(FEATURE_TAB_LABEL_KEY.docs),
      sheets: t(FEATURE_TAB_LABEL_KEY.sheets),
      slides: t(FEATURE_TAB_LABEL_KEY.slides),
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
      canOpenSave: signedIn && screenAllowsFileOpenSave(screen),
      language: resolveAppLanguage(i18n.language),
      allowedGoFeatures: desktopAccess.isLoaded
        ? (desktopAccess.allowedGoFeatures as NonNullable<
            ApplicationMenuState['allowedGoFeatures']
          >)
        : [],
      labels,
      auraLabels:
        screen === 'aura' && localeReady
          ? {
              edit: t('aura.menu.edit'),
              format: t('aura.menu.format'),
              view: t('aura.menu.view'),
              new: t('aura.menu.new'),
              exportMarkdown: `${t('aura.menu.export')} ${t('aura.menu.exportMarkdown')}`,
              exportHtml: `${t('aura.menu.export')} ${t('aura.menu.exportHtml')}`,
              undo: t('aura.menu.undo'),
              redo: t('aura.menu.redo'),
              cut: t('aura.menu.cut'),
              copy: t('aura.menu.copy'),
              paste: t('aura.menu.paste'),
              selectAll: t('aura.menu.selectAll'),
              find: t('aura.menu.find'),
              replace: t('aura.menu.replace'),
              bold: t('aura.menu.bold'),
              italic: t('aura.menu.italic'),
              strike: t('aura.menu.strike'),
              h1: t('aura.menu.h1'),
              h2: t('aura.menu.h2'),
              h3: t('aura.menu.h3'),
              toggleSidebar: t('aura.menu.toggleSidebar'),
              outline: t('aura.menu.outline'),
              filesPanel: t('aura.menu.filesPanel'),
              sourceMode: t('aura.menu.sourceMode'),
              focusMode: t('aura.menu.focusMode'),
            }
          : undefined,
      auraView: screen === 'aura' && localeReady ? auraView : undefined,
      auraWordCount:
        screen === 'aura' && localeReady
          ? formatAuraWordCount(auraStats, t)
          : undefined,
      auraLibraryLabels:
        screen === 'aura' && localeReady
          ? {
              scope: t('aura.menu.scope'),
              personal: t('aura.scope.personal'),
              group: t('aura.scope.group'),
              groupsMenu: t('aura.scope.groupsMenu'),
              library: t('aura.menu.library'),
              moveToGroup: t('aura.actions.moveToGroup'),
              copyToPersonal: t('aura.actions.copyToPersonal'),
              deleteFile: t('aura.actions.delete'),
            }
          : undefined,
      auraLibraryView: screen === 'aura' && localeReady ? auraLibraryView : undefined,
      mapLabels:
        screen === 'map' && localeReady
          ? {
              toggleSidebar: t('map.menubar.toggleSidebar'),
              favorites: t('chat.tabs.myFavorites'),
              locations: t('chat.tabs.locations'),
              locate: t('map.locate.returnToMyLocation'),
              back: t('chat.panel.goBack'),
              forward: t('chat.panel.goForward'),
              add: t('chat.favorites.modal.addCustomLocation'),
              showAllOnMap: t('chat.favorites.showAllOnMap'),
              export: t('chat.favorites.export'),
              clearAll: t('chat.favorites.clearAllLocations'),
              select: t('chat.favorites.select'),
              done: t('chat.favorites.done'),
              selectAll: t('chat.favorites.selectAll'),
              deselectAll: t('chat.favorites.deselectAll'),
              showOnMap: t('chat.favorites.showOnMap'),
              delete: t('chat.favorites.delete'),
              filter: t('chat.favorites.filterByPriority'),
              important: t('chat.favorites.priority.important'),
              normal: t('chat.favorites.priority.normal'),
              unimportant: t('chat.favorites.priority.unimportant'),
              weekdaysOnly: t('chat.favorites.weekdaysOnly'),
              sundayOnly: t('chat.favorites.sundayOnly'),
              sourceMenu: t('map.menubar.mapMenu'),
              groupMenu: t('map.menubar.groupMenu'),
              allGroups: t('map.menubar.allGroups'),
              sourceMap: t('map.menubar.sources.map'),
              sourceCustomerMap: t('map.menubar.sources.customerMap'),
              sourceCrmMap: t('map.menubar.sources.crmMap'),
              sourceCompetitorMap: t('map.menubar.sources.competitorMap'),
            }
          : undefined,
      mapView: screen === 'map' && localeReady ? mapView : undefined,
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
      folioLabels: isFolioScreen(screen) && localeReady
        ? {
            scope: t('folio.menu.scope'),
            folio: t(FEATURE_TAB_LABEL_KEY.folio),
            personal: t('folio.scope.personal'),
            group: t('folio.scope.group'),
            groupsMenu: t('folio.scope.groupsMenu'),
            newPage: t('folio.newPage'),
            moveToGroup: t('folio.actions.moveToGroup'),
            copyToPersonal: t('folio.actions.copyToPersonal'),
            deletePage: t('folio.actions.delete'),
          }
        : undefined,
      folioView: isFolioScreen(screen) && localeReady ? folioView : undefined,
      officeLabels:
        isOfficeScreen(screen) && localeReady
          ? {
              scope: t('office.menu.scope'),
              office: t(FEATURE_TAB_LABEL_KEY[screen as 'docs' | 'sheets' | 'slides']),
              personal: t('office.menu.personal'),
              group: t('office.menu.group'),
              groupsMenu: t('office.menu.groupsMenu'),
              sidebarControl: t('admin.sidebar.mode.control'),
              sidebarExpanded: t('admin.sidebar.mode.expanded'),
              sidebarCollapsed: t('admin.sidebar.mode.collapsed'),
              sidebarHover: t('admin.sidebar.mode.hover'),
              sidebarHidden: t('admin.sidebar.mode.hidden'),
              newFile: t('office.menu.newFile'),
              moveToGroup: t('office.menu.moveToGroup'),
              copyToPersonal: t('office.menu.copyToPersonal'),
              deleteFile: t('office.menu.deleteFile'),
            }
          : undefined,
      officeView: isOfficeScreen(screen) && localeReady ? officeView : undefined,
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
      ordersLabels:
        screen === 'orders' && localeReady
          ? {
              orders: t('orders.menu.orders'),
              group: t('orders.menu.group'),
              allGroups: t('admin.customers.filterAllGroups'),
              syncErp: t('admin.orders.erp.syncButton'),
              syncing: t('admin.orders.erp.syncing'),
              refresh: t('admin.orders.refresh'),
            }
          : undefined,
      ordersView: screen === 'orders' && localeReady ? ordersView : undefined,
      calendarLabels:
        screen === 'calendar' && localeReady
          ? {
              scope: t('calendar.menu.scope'),
              calendars: t('calendar.menu.calendars'),
              connection: t('calendar.google.connectionMenu'),
              view: t('calendar.menu.view'),
              personal: t('calendar.scope.personal'),
              group: t('calendar.scope.group'),
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
              connect: t('calendar.google.connect'),
              connecting: t('calendar.google.connecting'),
              reauth: t('calendar.google.reauth'),
              sync: t('calendar.google.sync'),
              syncing: t('calendar.google.syncing'),
              disconnect: t('calendar.google.disconnect'),
            }
          : undefined,
      calendarView: screen === 'calendar' && localeReady ? calendarView : undefined,
      teamLabels:
        screen === 'team' && localeReady
          ? {
              view: t('team.menu.view'),
              period: t('team.menu.period'),
              group: t('team.menu.group'),
              year: t('team.menu.year'),
              month: t('team.menu.month'),
              goToCurrent: t('admin.team.goToCurrentMonth'),
              pbc: t('team.menu.pbc'),
              pbcGroup: t('admin.team.pbcGroupLabel'),
              pbcIndividual: t('admin.team.pbcIndividualLabel'),
            }
          : undefined,
      teamView: screen === 'team' && localeReady ? teamView : undefined,
    }
    void window.geocrm?.menu?.setState?.(state)
  }, [
    auraView,
    auraStats,
    auraLibraryView,
    chatView,
    clashView,
    desktopAccess.allowedGoFeatures,
    desktopAccess.isLoaded,
    folioView,
    officeView,
    i18n.language,
    localeReady,
    mailView,
    mapView,
    ordersView,
    calendarView,
    teamView,
    screen,
    signedIn,
    t,
  ])

  useEffect(() => {
    return window.geocrm?.menu?.onNavigate?.((target) => {
      if (!isMenuNavigateTarget(target)) {
        return
      }
      onNavigateRef.current(target)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onLanguage?.((language) => {
      void i18n.changeLanguage(language)
    })
  }, [i18n])

  useEffect(() => {
    return window.geocrm?.menu?.onFileAction?.((action: MenuFileAction) => {
      if (action === 'close-tab') {
        onCloseTabRef.current()
        return
      }
      const current = screenRef.current
      if (current === 'aura') {
        dispatchAuraMenuAction(action === 'open' ? 'file:open' : 'file:save')
      }
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onAuraAction?.((action) => {
      dispatchAuraMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onAuraLibraryAction?.((action) => {
      dispatchAuraLibraryMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onMapAction?.((action) => {
      dispatchMapMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onMailAction?.((action) => {
      dispatchMailMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onFolioAction?.((action) => {
      dispatchFolioMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onOfficeAction?.((action) => {
      const current = screenRef.current
      if (!isOfficeScreen(current)) {
        return
      }
      dispatchOfficeMenuAction(action, current)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onChatAction?.((action) => {
      dispatchChatMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onClashAction?.((action) => {
      dispatchSidebarRailMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onOrdersAction?.((action) => {
      dispatchOrdersMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onCalendarAction?.((action) => {
      dispatchCalendarMenuAction(action)
    })
  }, [])

  useEffect(() => {
    return window.geocrm?.menu?.onTeamAction?.((action) => {
      dispatchTeamMenuAction(action)
    })
  }, [])
}
