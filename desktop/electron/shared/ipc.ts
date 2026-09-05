/** OAuth deep-link scheme for Electron (must be on GoTrue allow-list). */
export const AUTH_DEEP_LINK_SCHEME = 'com.workbench.electron'

/** OAuth deep-link host. Full URI: com.workbench.electron://login-callback */
export const AUTH_DEEP_LINK_HOST = 'login-callback'

/** Full deep-link URI used as `next` for GET /auth/google. */
export const AUTH_DEEP_LINK_URI = `${AUTH_DEEP_LINK_SCHEME}://${AUTH_DEEP_LINK_HOST}`

/** IPC channel for network proxy method dispatch. */
export const NET_IPC_CHANNEL = 'workbench:net'

/** IPC channel for auth helpers (open Google OAuth). */
export const AUTH_IPC_CHANNEL = 'workbench:auth'

/** Tokens cached in the main process so a destroyed login window cannot drop them. */
export interface StoredAuthSessionPayload {
  accessToken: string
  expiresAt: number
  refreshToken: string
}

/** Event pushed from main when the OAuth deep link returns tokens. */
export const AUTH_SESSION_EVENT = 'workbench:auth-session'

/** IPC channel for frameless window controls (minimize / maximize / close). */
export const WINDOW_IPC_CHANNEL = 'workbench:window'

/** IPC channel for Ask AI page capture (window minus the sidebar). */
export const ASK_AI_IPC_CHANNEL = 'workbench:ask-ai'

/** JPEG screenshot of the main content (no Ask AI sidebar). */
export type AskAiCaptureResult = {
  mimeType: 'image/jpeg'
  data: string
  width: number
  height: number
}

/** Event when maximized state changes. */
export const WINDOW_MAXIMIZED_EVENT = 'workbench:window-maximized'

/** Event when the BrowserWindow gains or loses focus. */
export const WINDOW_FOCUS_EVENT = 'workbench:window-focus'

/** Event when native fullscreen starts or ends (macOS Spaces / F11). */
export const WINDOW_FULLSCREEN_EVENT = 'workbench:window-fullscreen'

/** IPC channel for Spotlight window control (toggle / hide / resize / openInMain). */
export const SPOTLIGHT_IPC_CHANNEL = 'workbench:spotlight'

/** Event pushed to the Spotlight renderer when the window is shown (focus the input). */
export const SPOTLIGHT_SHOWN_EVENT = 'workbench:spotlight-shown'

/** Event pushed to the main renderer to open a URL as an in-app browser tab. */
export const OPEN_URL_IN_APP_EVENT = 'workbench:open-url-in-app'

/** IPC channel for Chrome-style title-bar tab tear-off / merge between app windows. */
export const TAB_TRANSFER_IPC_CHANNEL = 'workbench:tab-transfer'

/** Event pushed to a renderer window that just received a torn-off / merged tab. */
export const TAB_TRANSFER_RECEIVE_EVENT = 'workbench:tab-transfer-receive'

/**
 * Renderer argv flag: this BrowserWindow was spawned by tab tear-off / Open in
 * new window, so the caption omits the Home launcher.
 */
export const APP_WINDOW_HIDE_HOME_ARG = '--workbench-hide-home'

/**
 * Renderer argv flag: this BrowserWindow is the compact sign-in window, not
 * the main Workbench shell.
 */
export const APP_WINDOW_LOGIN_ARG = '--workbench-login'

/** Closable title-bar tab categories that can be torn off into another window. */
export const TAB_TRANSFER_KINDS = ['settings', 'feature', 'browser', 'folio'] as const

/** One {@link TAB_TRANSFER_KINDS} value. */
export type TabTransferKind = (typeof TAB_TRANSFER_KINDS)[number]

/** Peer app window listed in the tab "Move to another window" submenu. */
export interface AppWindowPeer {
  /** Electron `BrowserWindow.id`. */
  id: number
  /** Active tab label (or Home) reported by that window's renderer. */
  title: string
}

/**
 * Returns whether a value is a well-formed {@link AppWindowPeer}.
 * @param value - Candidate IPC payload.
 * @returns True when `id` is an integer and `title` is a string.
 */
export function isAppWindowPeer(value: unknown): value is AppWindowPeer {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'number' &&
    Number.isInteger(record.id) &&
    typeof record.title === 'string'
  )
}

/**
 * Serialized title-bar tab moved between Workbench app windows (Chrome-style tab
 * tear-off / merge). `id` matches the title-bar tab id on both sides so a
 * browser tab's native `WebContentsView` pane can be found and reparented
 * instead of recreated.
 */
export interface TabTransferPayload {
  id: string
  kind: TabTransferKind
  /** Feature id when `kind` is `feature` (e.g. `chat`). */
  feature?: string
  /** Absolute http(s) URL when `kind` is `browser`. */
  url?: string
  /** Folio page id when `kind` is `folio`. */
  pageId?: string
  title?: string
  /** In-app browser favicon, when known. */
  faviconUrl?: string
}

/**
 * Returns whether a value is a well-formed {@link TabTransferPayload}.
 * @param value - Candidate IPC payload.
 * @returns True when `id` and `kind` are present and `kind` is known.
 */
export function isTabTransferPayload(value: unknown): value is TabTransferPayload {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.kind === 'string' &&
    (TAB_TRANSFER_KINDS as readonly string[]).includes(record.kind)
  )
}

/** IPC channel for in-app browser WebContentsView panes (attach / bounds / navigate). */
export const BROWSER_IPC_CHANNEL = 'workbench:browser'

/** Event pushed when an in-app browser pane URL / title / history changes. */
export const BROWSER_NAV_EVENT = 'workbench:browser-nav'

/** Event pushed to the main renderer to open the Settings title-bar tab. */
export const OPEN_SETTINGS_EVENT = 'workbench:open-settings'

/** Event pushed to the main renderer to sign out the current session. */
export const SIGN_OUT_EVENT = 'workbench:sign-out'

/** Event when the native application menu asks to switch UI language. */
export const MENU_LANGUAGE_EVENT = 'workbench:menu-language'

/** UI languages offered in the macOS Workbench application menu. */
export const APP_MENU_LANGUAGES = ['en', 'zh-TW', 'zh-CN'] as const

/** One of {@link APP_MENU_LANGUAGES}. */
export type AppMenuLanguage = (typeof APP_MENU_LANGUAGES)[number]

/**
 * Returns whether a value is a menu-supported UI language.
 * @param value - Candidate locale.
 * @returns True when the value is `en`, `zh-TW`, or `zh-CN`.
 */
export function isAppMenuLanguage(value: unknown): value is AppMenuLanguage {
  return (
    typeof value === 'string' &&
    (APP_MENU_LANGUAGES as readonly string[]).includes(value)
  )
}

/** IPC channel for macOS application-menu state (labels + current screen). */
export const MENU_IPC_CHANNEL = 'workbench:menu'

/** Event when the native application menu asks to open a page. */
export const MENU_NAVIGATE_EVENT = 'workbench:menu-navigate'

/** Event when the native application menu asks for a File action. */
export const MENU_FILE_EVENT = 'workbench:menu-file'

/** Event when the native application menu runs an Aura editor command. */
export const MENU_AURA_EVENT = 'workbench:menu-aura'

/** Event when the native application menu runs an Aura Scope/Library command. */
export const MENU_AURA_LIBRARY_EVENT = 'workbench:menu-aura-library'

/** IPC channel for the one-shot legacy Docs / Sheets / Slides workspace export (retired Univer editor). */
export const OFFICE_WORKSPACE_LEGACY_IPC_CHANNEL = 'workbench:office-workspace-legacy'

/** IPC channel for Home Apps tile order (local SQLite). */
export const HOME_APP_ORDER_IPC_CHANNEL = 'workbench:home-app-order'

/** IPC channel for Home website catalog and per-user layouts (local SQLite). */
export const HOME_LIBRARY_IPC_CHANNEL = 'workbench:home-library'

/** IPC channel for Home / Settings appearance, widgets, and wallpapers (local SQLite). */
export const HOME_SETTINGS_IPC_CHANNEL = 'workbench:home-settings'

/** IPC channel for Settings OA/ERP credentials (local SQLite). */
export const OA_ERP_CREDENTIALS_IPC_CHANNEL = 'workbench:oa-erp-credentials'

/** IPC channel for the desktop AI model allowlist (Settings → AI → Models, local SQLite). */
export const AI_MODEL_ALLOWLIST_IPC_CHANNEL = 'workbench:ai-model-allowlist'

/** IPC channel for Ask conversation transcripts (local SQLite). */
export const CHAT_HISTORY_IPC_CHANNEL = 'workbench:chat-history'

/** IPC channel for personal calendars and events (local SQLite). */
export const CALENDAR_IPC_CHANNEL = 'workbench:calendar'

/** IPC channel for IMAP mailboxes, messages, and attachments (local SQLite + files). */
export const MAIL_IPC_CHANNEL = 'workbench:mail'

/** One explicit enable/disable override row from the AI model allowlist. */
export interface AiModelAllowlistRow {
  provider: string
  modelId: string
  enabled: boolean
}

/** Office editor kind persisted in the retired local workspace database. */
export type OfficeWorkspaceKind = 'docs' | 'sheets' | 'slides'

/**
 * One row from the retired `office-workspace.sqlite` (pre-OnlyOffice Univer
 * editor), read once by the renderer to upload as a personal `office_files`
 * Supabase row, then the local database is deleted.
 */
export type LegacyOfficeWorkspaceFile = {
  id: string
  kind: OfficeWorkspaceKind
  name: string
  snapshot: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

/** Event when the native application menu runs a Map page command. */
export const MENU_MAP_EVENT = 'workbench:menu-map'

/** Event when the native application menu runs a Mail page command. */
export const MENU_MAIL_EVENT = 'workbench:menu-mail'

/** Event when the native application menu runs a Clash page command. */
export const MENU_CLASH_EVENT = 'workbench:menu-clash'

/** Event when the native application menu runs an Orders page command. */
export const MENU_ORDERS_EVENT = 'workbench:menu-orders'

/** Event when the native application menu runs a Calendar page command. */
export const MENU_CALENDAR_EVENT = 'workbench:menu-calendar'

/** Event when the native application menu runs a Team page command. */
export const MENU_TEAM_EVENT = 'workbench:menu-team'

/** Event when the native application menu runs a Folio page command. */
export const MENU_FOLIO_EVENT = 'workbench:menu-folio'

/** Event when the native application menu runs an Office page command. */
export const MENU_OFFICE_EVENT = 'workbench:menu-office'

/** Event when the native application menu runs a Chat page command. */
export const MENU_CHAT_EVENT = 'workbench:menu-chat'

/** Feature pages listed under the Go menu (same ids as title-bar tabs). */
export const MENU_FEATURE_IDS = [
  'chat',
  'mail',
  'calendar',
] as const

/** Go-menu feature id. */
export type MenuFeatureId = (typeof MENU_FEATURE_IDS)[number]

/** Native menu navigation target. */
export type MenuNavigateTarget = 'home' | 'settings' | MenuFeatureId

/** Native File menu action. */
export type MenuFileAction = 'open' | 'save' | 'close-tab'

/** Aura editor commands exposed on the macOS application menu. */
export type AuraMenuAction =
  | 'file:new'
  | 'file:open'
  | 'file:save'
  | 'export:markdown'
  | 'export:html'
  | 'edit:undo'
  | 'edit:redo'
  | 'edit:cut'
  | 'edit:copy'
  | 'edit:paste'
  | 'edit:select-all'
  | 'edit:find'
  | 'edit:replace'
  | 'format:bold'
  | 'format:italic'
  | 'format:strike'
  | 'format:h1'
  | 'format:h2'
  | 'format:h3'
  | 'view:toggle-sidebar'
  | 'view:sidebar-outline'
  | 'view:sidebar-files'
  | 'view:toggle-source'
  | 'view:toggle-focus'

/** i18n labels for Aura File / Edit / Format / View items. */
export type AuraMenuLabels = {
  edit: string
  format: string
  view: string
  new: string
  exportMarkdown: string
  exportHtml: string
  undo: string
  redo: string
  cut: string
  copy: string
  paste: string
  selectAll: string
  find: string
  replace: string
  bold: string
  italic: string
  strike: string
  h1: string
  h2: string
  h3: string
  toggleSidebar: string
  outline: string
  filesPanel: string
  sourceMode: string
  focusMode: string
}

/** Live Aura View-menu checkboxes (sidebar / source / focus). */
export type AuraViewState = {
  sidebarCollapsed: boolean
  outlineCollapsible: boolean
  sourceMode: boolean
  focusMode: boolean
}

/** Formatted Aura word-count strings for the macOS application menu. */
export type AuraWordCountLabels = {
  menu: string
  readingTime: string
  lines: string
  words: string
  characters: string
}

/** Native Aura Scope/Library menu commands (macOS application menu). */
export const AURA_LIBRARY_MENU_COMMANDS = [
  'scope:personal',
  'scope:group',
  'library:move-to-group',
  'library:copy-to-personal',
  'library:delete',
] as const

/** Native Aura Scope/Library menu command id. */
export type AuraLibraryMenuCommand = (typeof AURA_LIBRARY_MENU_COMMANDS)[number]

/** Native Aura Scope/Library menu action (group radio or command). */
export type AuraLibraryMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: AuraLibraryMenuCommand }

/** One group row in the native Aura Scope menu. */
export type AuraLibraryMenuGroup = {
  id: string
  label: string
}

/** i18n labels for the macOS Aura Scope / Groups / Library menus. */
export type AuraLibraryMenuLabels = {
  scope: string
  personal: string
  group: string
  /** Top-level Groups picker (privileged accounts in group mode). */
  groupsMenu: string
  library: string
  moveToGroup: string
  copyToPersonal: string
  deleteFile: string
}

/** Live Aura Scope/Library-menu radios and enablement. */
export type AuraLibraryMenuViewState = {
  mode: 'personal' | 'group'
  groups: AuraLibraryMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  canDelete: boolean
  hasSelection: boolean
}

/** Map sidebar sources shown as radios on the macOS application menu. */
export const MAP_MENU_SOURCES = [
  'map',
  'customer_map',
  'crm_map',
  'competitor_map',
] as const

/** One Map source id on the native Source menu. */
export type MapMenuSourceId = (typeof MAP_MENU_SOURCES)[number]

/** One group row in the native Map Group menu. */
export type MapMenuGroup = {
  id: string
  label: string
}

/** Map page commands exposed on the macOS application menu. */
export const MAP_MENU_ACTIONS = [
  'view:toggle-sidebar',
  'view:favorites',
  'view:locations',
  'view:locate',
  'view:back',
  'view:forward',
  'favorites:add',
  'favorites:show-all',
  'favorites:export',
  'favorites:clear-all',
  'favorites:toggle-select',
  'favorites:select-all',
  'favorites:show-selected',
  'favorites:delete-selected',
  'filter:important',
  'filter:normal',
  'filter:unimportant',
  'filter:weekdays',
  'filter:sunday',
] as const

/** String command ids for the native Map menu. */
export type MapMenuCommand = (typeof MAP_MENU_ACTIONS)[number]

/** Native Map menu action (command, source radio, or group radio). */
export type MapMenuAction =
  | MapMenuCommand
  | { type: 'select-source'; source: MapMenuSourceId }
  | { type: 'select-group'; groupId: string | null }

/** i18n labels for the macOS Map application menu. */
export type MapMenuLabels = {
  toggleSidebar: string
  favorites: string
  locations: string
  locate: string
  back: string
  forward: string
  add: string
  showAllOnMap: string
  export: string
  clearAll: string
  select: string
  done: string
  selectAll: string
  deselectAll: string
  showOnMap: string
  delete: string
  filter: string
  important: string
  normal: string
  unimportant: string
  weekdaysOnly: string
  sundayOnly: string
  sourceMenu: string
  groupMenu: string
  allGroups: string
  sourceMap: string
  sourceCustomerMap: string
  sourceCrmMap: string
  sourceCompetitorMap: string
}

/** Mail native-menu command ids (everything except account switch). */
export const MAIL_MENU_COMMANDS = [
  'mailbox:add',
  'mailbox:test',
  'mailbox:disconnect',
  'mailbox:delete',
  'mail:compose',
  'mail:reply',
  'mail:reply-all',
  'mail:forward',
  'mail:star',
  'mail:unread',
  'mail:archive',
  'mail:spam',
  'mail:labels',
  'mail:snooze',
  'mail:trash',
  'mail:print',
  'mail:eml',
  'mail:mbox',
  'mail:signature',
  'sync:now',
  'sync:historical',
  'sidebar:expanded',
  'sidebar:collapsed',
  'sidebar:hover',
] as const

/** Mail native-menu command id. */
export type MailMenuCommand = (typeof MAIL_MENU_COMMANDS)[number]

/** Native Mail menu action (account radio or command). */
export type MailMenuAction =
  | { type: 'select-account'; accountId: string | null }
  | { type: 'command'; id: MailMenuCommand }

/** One mailbox row in the native Account menu. */
export type MailMenuAccount = {
  id: string
  label: string
}

/** i18n labels for the macOS Mail application menus. */
export type MailMenuLabels = {
  account: string
  mailbox: string
  mail: string
  sync: string
  unifiedInbox: string
  addAccount: string
  testAccount: string
  disconnectAccount: string
  deleteAccount: string
  compose: string
  reply: string
  replyAll: string
  forward: string
  star: string
  unstar: string
  unread: string
  archive: string
  spam: string
  notSpam: string
  applyLabel: string
  snooze: string
  trash: string
  print: string
  downloadEml: string
  exportMbox: string
  signatureEditor: string
  syncNow: string
  syncing: string
  historicalSync: string
  sidebarControl: string
  sidebarExpanded: string
  sidebarCollapsed: string
  sidebarHover: string
}

/** Live Mail-menu radios, enablement, and account list. */
export type MailMenuViewState = {
  accountMenuLabel: string
  accounts: MailMenuAccount[]
  selectedAccountId: string | null
  unifiedInbox: boolean
  hasAccount: boolean
  hasMessage: boolean
  isStarred: boolean
  isSpamView: boolean
  isSyncing: boolean
  sidebarMode: 'expanded' | 'collapsed' | 'hover'
}

/** Native Folio menu commands (macOS application menu). */
export const FOLIO_MENU_COMMANDS = [
  'scope:personal',
  'scope:group',
  'page:new',
  'page:move-to-group',
  'page:copy-to-personal',
  'page:delete',
] as const

/** Native Folio menu command id. */
export type FolioMenuCommand = (typeof FOLIO_MENU_COMMANDS)[number]

/** Native Folio menu action (group radio or command). */
export type FolioMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: FolioMenuCommand }

/** One group row in the native Folio Scope menu. */
export type FolioMenuGroup = {
  id: string
  label: string
}

/** i18n labels for the macOS Folio application menus. */
export type FolioMenuLabels = {
  scope: string
  folio: string
  personal: string
  group: string
  /** Top-level Groups picker (privileged accounts in group mode). */
  groupsMenu: string
  newPage: string
  moveToGroup: string
  copyToPersonal: string
  deletePage: string
}

/** Live Folio-menu radios and enablement. */
export type FolioMenuViewState = {
  mode: 'personal' | 'group'
  groups: FolioMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canCreate: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  canDelete: boolean
  hasSelection: boolean
}

/**
 * Reports whether a title-bar screen id is Folio (feature or per-page tab).
 * @param screen - Active title-bar id.
 * @returns True for Folio screens.
 */
export function isFolioScreen(screen: string): boolean {
  return screen === 'folio' || screen.startsWith('folio:')
}

/** Native Office menu commands (macOS application menu). */
export const OFFICE_MENU_COMMANDS = [
  'scope:personal',
  'scope:group',
  'sidebar:expanded',
  'sidebar:collapsed',
  'sidebar:hover',
  'sidebar:hidden',
  'file:new',
  'file:move-to-group',
  'file:copy-to-personal',
  'file:delete',
] as const

/** Native Office menu command id. */
export type OfficeMenuCommand = (typeof OFFICE_MENU_COMMANDS)[number]

/** Native Office menu action (group radio or command). */
export type OfficeMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: OfficeMenuCommand }

/** One group row in the native Office Scope menu. */
export type OfficeMenuGroup = {
  id: string
  label: string
}

/** i18n labels for the macOS Office application menus. */
export type OfficeMenuLabels = {
  scope: string
  office: string
  personal: string
  group: string
  /** Top-level Groups picker (privileged accounts in group mode). */
  groupsMenu: string
  sidebarControl: string
  sidebarExpanded: string
  sidebarCollapsed: string
  sidebarHover: string
  sidebarHidden: string
  newFile: string
  moveToGroup: string
  copyToPersonal: string
  deleteFile: string
}

/** Live Office-menu radios and enablement. */
export type OfficeMenuViewState = {
  mode: 'personal' | 'group'
  groups: OfficeMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canCreate: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  canDelete: boolean
  hasSelection: boolean
  /** Library rail mode (Admin-style four-state). */
  sidebarMode: 'expanded' | 'collapsed' | 'hover' | 'hidden'
}

/**
 * Reports whether a title-bar screen id is Docs, Sheets, or Slides.
 * @param screen - Active title-bar id.
 * @returns True for Office screens.
 */
export function isOfficeScreen(screen: string): boolean {
  return screen === 'docs' || screen === 'sheets' || screen === 'slides'
}

/** Title-bar screens that use the shared SidebarModeControl native menu. */
export const SIDEBAR_CONTROL_SCREENS = [
  'clash',
  'settings',
  'admin',
  'kanban',
  'products',
  'nexdot',
  'teAdmin',
] as const

/**
 * Reports whether a title-bar screen hosts Sidebar control (Clash / Settings /
 * Board / Admin-shell Function apps).
 * @param screen - Active title-bar id.
 * @returns True when the native Sidebar control menu should appear.
 */
export function isSidebarControlScreen(screen: string): boolean {
  return (SIDEBAR_CONTROL_SCREENS as readonly string[]).includes(screen)
}

/** Chat provider slug for native Model menus. */
export type ChatMenuProviderId = string

/** One vendor model row in the native Cloud Models menu (combined label). */
export type ChatMenuModelOption = {
  id: string
  label: string
}

/** One vendor group in the native Cloud Models list. */
export type ChatMenuProviderOption = {
  id: ChatMenuProviderId
  label: string
  configured: boolean
  models: ChatMenuModelOption[]
}

/** i18n labels for the macOS Chat application menus. */
export type ChatMenuLabels = {
  mode: string
  model: string
  quick: string
  think: string
  notConfigured: string
}

/** Live Chat-menu radios and model catalog. */
export type ChatMenuViewState = {
  thinkMode: 'quick' | 'think'
  provider: ChatMenuProviderId
  modelId: string
  providers: ChatMenuProviderOption[]
}

/** Native Chat menu action. */
export type ChatMenuAction =
  | { type: 'set-think'; mode: 'quick' | 'think' }
  | { type: 'set-model'; provider: ChatMenuProviderId; modelId: string }

/** Native Clash / Settings / Admin-rail menu commands (sidebar mode radios). */
export const CLASH_MENU_ACTIONS = [
  'sidebar:expanded',
  'sidebar:collapsed',
  'sidebar:hover',
  'sidebar:hidden',
] as const

/** One page row in the native Sidebar menu. */
export type ClashMenuNavItem = {
  id: string
  label: string
  separatorBefore?: boolean
}

/** Native Clash menu action. */
export type ClashMenuAction =
  | (typeof CLASH_MENU_ACTIONS)[number]
  | { type: 'select-item'; id: string }

/** i18n labels for the macOS Sidebar application menus. */
export type ClashMenuLabels = {
  sidebarMenu: string
  sidebarControl: string
  sidebarExpanded: string
  sidebarCollapsed: string
  sidebarHover: string
  sidebarHidden: string
}

/** Live Clash-menu radios and sidebar page rows. */
export type ClashMenuViewState = {
  sidebarMode: 'expanded' | 'collapsed' | 'hover' | 'hidden'
  items: ClashMenuNavItem[]
  selectedId: string | null
}

/** Orders native-menu command ids (everything except module / group radios). */
export const ORDERS_MENU_COMMANDS = ['sync-erp', 'refresh'] as const

/** Orders native-menu command id. */
export type OrdersMenuCommand = (typeof ORDERS_MENU_COMMANDS)[number]

/** Native Orders menu action (module radio, group radio, or command). */
export type OrdersMenuAction =
  | { type: 'select-module'; moduleId: string }
  | { type: 'select-group'; groupId: string | null }
  | { type: 'command'; id: OrdersMenuCommand }

/** One labeled row in the native Orders or Group menu. */
export type OrdersMenuItem = {
  id: string
  label: string
}

/** i18n labels for the macOS Orders application menus. */
export type OrdersMenuLabels = {
  orders: string
  group: string
  allGroups: string
  syncErp: string
  syncing: string
  refresh: string
}

/** Live Orders-menu radios and enablement. */
export type OrdersMenuViewState = {
  modules: OrdersMenuItem[]
  selectedModuleId: string | null
  groups: OrdersMenuItem[]
  selectedGroupId: string | null
  showGroupMenu: boolean
  canSyncErp: boolean
  isSyncing: boolean
  canRefresh: boolean
  isRefreshing: boolean
}

/** Calendar native-menu command ids (everything except radios / toggles). */
export const CALENDAR_MENU_COMMANDS = [
  'event:new',
  'calendar:add',
  'ics:import',
  'ics:export',
  'view:today',
  'view:previous',
  'view:next',
] as const

/** Calendar native-menu command id. */
export type CalendarMenuCommand = (typeof CALENDAR_MENU_COMMANDS)[number]

/** Native Calendar menu action. */
export type CalendarMenuAction =
  | { type: 'set-view'; view: string }
  | { type: 'toggle-calendar'; id: string }
  | { type: 'rename-calendar'; id: string }
  | { type: 'delete-calendar'; id: string }
  | { type: 'command'; id: CalendarMenuCommand }

/** One named calendar in the native Calendars menu. */
export type CalendarMenuCalendar = {
  id: string
  label: string
  visible: boolean
  canRename: boolean
  canDelete: boolean
}

/** i18n labels for the macOS Calendar application menus. */
export type CalendarMenuLabels = {
  calendars: string
  view: string
  newEvent: string
  addCalendar: string
  showCalendar: string
  rename: string
  deleteCalendar: string
  importIcs: string
  exportIcs: string
  today: string
  previous: string
  next: string
  viewDay: string
  viewWeek: string
  viewMonth: string
  viewYear: string
  viewList: string
  viewFourDays: string
}

/** Live Calendar-menu radios, checkboxes, and enablement. */
export type CalendarMenuViewState = {
  canCreate: boolean
  calendars: CalendarMenuCalendar[]
  selectedView: string
}

/** Team native-menu command ids (everything except radios). */
export const TEAM_MENU_COMMANDS = ['period:current'] as const

/** Team native-menu command id. */
export type TeamMenuCommand = (typeof TEAM_MENU_COMMANDS)[number]

/** BSC / PBC / Retro radios in the native Team View menu. */
export const TEAM_MENU_MODES = ['bsc', 'pbc', 'retro'] as const

/** Team native-menu view-mode id. */
export type TeamMenuMode = (typeof TEAM_MENU_MODES)[number]

/** PBC group vs individual radios in the native Team PBC menu. */
export const TEAM_PBC_SCOPES = ['group', 'individual'] as const

/** Team native-menu PBC scope id. */
export type TeamPbcScope = (typeof TEAM_PBC_SCOPES)[number]

/** Native Team menu action. */
export type TeamMenuAction =
  | { type: 'select-mode'; mode: TeamMenuMode }
  | { type: 'select-year'; year: number }
  | { type: 'select-month'; month: number }
  | { type: 'select-group'; groupId: string }
  | { type: 'select-pbc-scope'; scope: TeamPbcScope }
  | { type: 'select-pbc-member'; userId: string }
  | { type: 'command'; id: TeamMenuCommand }

/** One labeled row in the native Team menus. */
export type TeamMenuItem = {
  id: string
  label: string
}

/** i18n labels for the macOS Team application menus. */
export type TeamMenuLabels = {
  view: string
  period: string
  group: string
  year: string
  month: string
  goToCurrent: string
  pbc: string
  pbcGroup: string
  pbcIndividual: string
}

/** Live Team-menu radios and enablement. */
export type TeamMenuViewState = {
  modes: TeamMenuItem[]
  selectedMode: TeamMenuMode
  years: TeamMenuItem[]
  selectedYear: number
  months: TeamMenuItem[]
  selectedMonth: number
  canGoToCurrent: boolean
  groups: TeamMenuItem[]
  selectedGroupId: string | null
  showGroupMenu: boolean
  pbcScope: TeamPbcScope
  pbcMembers: TeamMenuItem[]
  selectedPbcMemberId: string | null
}

/** Live Map-menu checkboxes and enablement. */
export type MapMenuViewState = {
  sidebarVisible: boolean
  tab: 'chat' | 'shops'
  canGoBackward: boolean
  canGoForward: boolean
  favoriteCount: number
  filteredCount: number
  shopCount: number
  selectionMode: boolean
  selectedCount: number
  allFilteredSelected: boolean
  filterImportant: boolean
  filterNormal: boolean
  filterUnimportant: boolean
  weekdaysOnly: boolean
  sundayOnly: boolean
  source: MapMenuSourceId
  availableSources: MapMenuSourceId[]
  groups: MapMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
}

/** i18n labels for macOS application-menu items. */
export type ApplicationMenuLabels = {
  about: string
  hide: string
  hideOthers: string
  showAll: string
  quit: string
  spotlight: string
  openApp: string
  signOut: string
  file: string
  closeTab: string
  open: string
  save: string
  edit: string
  undo: string
  redo: string
  cut: string
  copy: string
  paste: string
  selectAll: string
  go: string
  home: string
  settings: string
  chat: string
  mail: string
  calendar: string
  aura: string
  folio: string
  docs: string
  sheets: string
  slides: string
  language: string
  languageEn: string
  languageZhTw: string
  languageZhCn: string
}

/** Renderer → main snapshot used to rebuild the macOS application menu. */
export type ApplicationMenuState = {
  signedIn: boolean
  screen: string
  canCloseTab: boolean
  canOpenSave: boolean
  /** Active UI language for the Language radio submenu. */
  language: AppMenuLanguage
  labels: ApplicationMenuLabels
  /** Go-menu feature ids the user may see (omit or empty = hide all features). */
  allowedGoFeatures?: MenuFeatureId[]
  /** Present only while the Editor (Aura) tab is active. */
  auraLabels?: AuraMenuLabels
  /** Present only while the Editor (Aura) tab is active. */
  auraView?: AuraViewState
  /** Present only while the Editor (Aura) tab is active. */
  auraWordCount?: AuraWordCountLabels
  /** Present only while the Editor (Aura) tab is active. */
  auraLibraryLabels?: AuraLibraryMenuLabels
  /** Present only while the Editor (Aura) tab is active. */
  auraLibraryView?: AuraLibraryMenuViewState
  /** Present only while the Map tab is active. */
  mapLabels?: MapMenuLabels
  /** Present only while the Map tab is active. */
  mapView?: MapMenuViewState
  /** Present only while the Mail tab is active. */
  mailLabels?: MailMenuLabels
  /** Present only while the Mail tab is active. */
  mailView?: MailMenuViewState
  /** Present only while the Folio tab is active. */
  folioLabels?: FolioMenuLabels
  /** Present only while the Folio tab is active. */
  folioView?: FolioMenuViewState
  /** Present only while a Docs/Sheets/Slides tab is active. */
  officeLabels?: OfficeMenuLabels
  /** Present only while a Docs/Sheets/Slides tab is active. */
  officeView?: OfficeMenuViewState
  /** Present only while the Chat tab is active. */
  chatLabels?: ChatMenuLabels
  /** Present only while the Chat tab is active. */
  chatView?: ChatMenuViewState
  /** Present while Clash, Settings, or an Admin-shell Function tab is active. */
  clashLabels?: ClashMenuLabels
  /** Present while Clash, Settings, or an Admin-shell Function tab is active. */
  clashView?: ClashMenuViewState
  /** Present only while the Orders tab is active. */
  ordersLabels?: OrdersMenuLabels
  /** Present only while the Orders tab is active. */
  ordersView?: OrdersMenuViewState
  /** Present only while the Calendar tab is active. */
  calendarLabels?: CalendarMenuLabels
  /** Present only while the Calendar tab is active. */
  calendarView?: CalendarMenuViewState
  /** Present only while the Team tab is active. */
  teamLabels?: TeamMenuLabels
  /** Present only while the Team tab is active. */
  teamView?: TeamMenuViewState
}

/**
 * Returns whether a value is a native Map menu action.
 * @param value - Candidate payload.
 * @returns True for a known command, source radio, or group radio.
 */
export function isMapMenuAction(value: unknown): value is MapMenuAction {
  if (typeof value === 'string') {
    return (MAP_MENU_ACTIONS as readonly string[]).includes(value)
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'select-source') {
    return (
      typeof record.source === 'string' &&
      (MAP_MENU_SOURCES as readonly string[]).includes(record.source)
    )
  }
  if (record.type === 'select-group') {
    return record.groupId === null || typeof record.groupId === 'string'
  }
  return false
}

/**
 * Returns whether a value is a native Mail menu action.
 * @param value - Candidate payload.
 * @returns True for a select-account or known command.
 */
export function isMailMenuAction(value: unknown): value is MailMenuAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'select-account') {
    return record.accountId === null || typeof record.accountId === 'string'
  }
  if (record.type === 'command') {
    return typeof record.id === 'string' && (MAIL_MENU_COMMANDS as readonly string[]).includes(record.id)
  }
  return false
}

/**
 * Returns whether a value is a native Folio menu action.
 * @param value - Candidate payload.
 * @returns True for a select-group or known command.
 */
export function isFolioMenuAction(value: unknown): value is FolioMenuAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'select-group') {
    return typeof record.groupId === 'string'
  }
  if (record.type === 'command') {
    return typeof record.id === 'string' && (FOLIO_MENU_COMMANDS as readonly string[]).includes(record.id)
  }
  return false
}

/**
 * Returns whether a value is a native Aura Scope/Library menu action.
 * @param value - Candidate payload.
 * @returns True for a select-group or known command.
 */
export function isAuraLibraryMenuAction(value: unknown): value is AuraLibraryMenuAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'select-group') {
    return typeof record.groupId === 'string'
  }
  if (record.type === 'command') {
    return (
      typeof record.id === 'string' &&
      (AURA_LIBRARY_MENU_COMMANDS as readonly string[]).includes(record.id)
    )
  }
  return false
}

/**
 * Returns whether a value is a native Office menu action.
 * @param value - Candidate payload.
 * @returns True for a select-group or known command.
 */
export function isOfficeMenuAction(value: unknown): value is OfficeMenuAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'select-group') {
    return typeof record.groupId === 'string'
  }
  if (record.type === 'command') {
    return (
      typeof record.id === 'string' && (OFFICE_MENU_COMMANDS as readonly string[]).includes(record.id)
    )
  }
  return false
}

/**
 * Returns whether a value is a native Chat menu action.
 * @param value - Candidate payload.
 * @returns True for a known Chat action.
 */
export function isChatMenuAction(value: unknown): value is ChatMenuAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'set-think') {
    return record.mode === 'quick' || record.mode === 'think'
  }
  if (record.type === 'set-model') {
    return (
      typeof record.provider === 'string' &&
      record.provider.length > 0 &&
      typeof record.modelId === 'string' &&
      record.modelId.length > 0
    )
  }
  return false
}

/**
 * Returns whether a value is a native Clash menu action.
 * @param value - Candidate payload.
 * @returns True for a known sidebar-mode command or a page radio.
 */
export function isClashMenuAction(value: unknown): value is ClashMenuAction {
  if (typeof value === 'string') {
    return (CLASH_MENU_ACTIONS as readonly string[]).includes(value)
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return record.type === 'select-item' && typeof record.id === 'string' && record.id.length > 0
}

/**
 * Returns whether a value is a native Orders menu action.
 * @param value - Candidate payload.
 * @returns True for a module radio, group radio, or known command.
 */
export function isOrdersMenuAction(value: unknown): value is OrdersMenuAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'select-module') {
    return typeof record.moduleId === 'string' && record.moduleId.length > 0
  }
  if (record.type === 'select-group') {
    return record.groupId === null || typeof record.groupId === 'string'
  }
  if (record.type === 'command') {
    return (
      typeof record.id === 'string' &&
      (ORDERS_MENU_COMMANDS as readonly string[]).includes(record.id)
    )
  }
  return false
}

/**
 * Returns whether a value is a native Calendar menu action.
 * @param value - Candidate payload.
 * @returns True for a known Calendar action.
 */
export function isCalendarMenuAction(value: unknown): value is CalendarMenuAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'set-view') {
    return typeof record.view === 'string' && record.view.length > 0
  }
  if (
    record.type === 'toggle-calendar' ||
    record.type === 'rename-calendar' ||
    record.type === 'delete-calendar'
  ) {
    return typeof record.id === 'string' && record.id.length > 0
  }
  if (record.type === 'command') {
    return (
      typeof record.id === 'string' &&
      (CALENDAR_MENU_COMMANDS as readonly string[]).includes(record.id)
    )
  }
  return false
}

/**
 * Returns whether a value is a native Team menu action.
 * @param value - Candidate payload.
 * @returns True for a known Team action.
 */
export function isTeamMenuAction(value: unknown): value is TeamMenuAction {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type === 'select-mode') {
    return (
      typeof record.mode === 'string' &&
      (TEAM_MENU_MODES as readonly string[]).includes(record.mode)
    )
  }
  if (record.type === 'select-year') {
    return typeof record.year === 'number' && Number.isInteger(record.year)
  }
  if (record.type === 'select-month') {
    return (
      typeof record.month === 'number' &&
      Number.isInteger(record.month) &&
      record.month >= 1 &&
      record.month <= 12
    )
  }
  if (record.type === 'select-group') {
    return typeof record.groupId === 'string' && record.groupId.length > 0
  }
  if (record.type === 'select-pbc-scope') {
    return (
      typeof record.scope === 'string' &&
      (TEAM_PBC_SCOPES as readonly string[]).includes(record.scope)
    )
  }
  if (record.type === 'select-pbc-member') {
    return typeof record.userId === 'string' && record.userId.length > 0
  }
  if (record.type === 'command') {
    return (
      typeof record.id === 'string' &&
      (TEAM_MENU_COMMANDS as readonly string[]).includes(record.id)
    )
  }
  return false
}

/**
 * Returns whether a string is a Go-menu navigation target.
 * @param value - Candidate id.
 * @returns True for home, settings, or a known feature.
 */
export function isMenuNavigateTarget(value: string): value is MenuNavigateTarget {
  return (
    value === 'home' ||
    value === 'settings' ||
    (MENU_FEATURE_IDS as readonly string[]).includes(value)
  )
}

/** IPC channel for app metadata / update checks. */
export const APP_IPC_CHANNEL = 'workbench:app'

/** Result of a desktop update check. */
export type AppUpdateCheckResult = {
  status: 'upToDate' | 'available' | 'unavailable' | 'error'
  currentVersion: string
  latestVersion?: string
  downloadUrl?: string
  fileName?: string
  forceUpdate?: boolean
  message?: string
  /** Server-declared floor (dotted version) below which the build must update. */
  minSupportedVersion?: string
}

/**
 * Event pushed from the main-process background update scheduler to the
 * renderer whenever a periodic or resume-triggered check finds a result
 * worth acting on (forced updates surface the blocking gate without a
 * restart; non-forced updates are handled by a native OS notification).
 */
export const APP_UPDATE_AVAILABLE_EVENT = 'workbench:app-update-available'

/** Progress of an in-app desktop installer download / install. */
export type AppUpdateInstallProgress = {
  phase: 'downloading' | 'installing' | 'relaunching' | 'error'
  percent: number
  message?: string
}

/** Main → renderer progress for {@link AppUpdateInstallProgress}. */
export const APP_UPDATE_PROGRESS_EVENT = 'workbench:app-update-progress'

/** Launch-at-login / silent-start preferences. */
export type LoginLaunchSettings = {
  openAtLogin: boolean
  silentLaunch: boolean
}
