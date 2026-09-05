/// <reference types="vite/client" />

declare module 'virtual:workbench-i18n-resources' {
  const resources: {
    en: { translation: Record<string, unknown> }
    'zh-TW': { translation: Record<string, unknown> }
    'zh-CN': { translation: Record<string, unknown> }
  }
  export default resources
}

interface AuthSessionPayload {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: string
  error?: string
}

interface ApplicationMenuLabels {
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

interface AuraMenuLabels {
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

interface AuraViewState {
  sidebarCollapsed: boolean
  outlineCollapsible: boolean
  sourceMode: boolean
  focusMode: boolean
}

interface AuraWordCountLabels {
  menu: string
  readingTime: string
  lines: string
  words: string
  characters: string
}

type MailMenuCommand =
  | 'mailbox:add'
  | 'mailbox:test'
  | 'mailbox:disconnect'
  | 'mailbox:delete'
  | 'mail:compose'
  | 'mail:reply'
  | 'mail:reply-all'
  | 'mail:forward'
  | 'mail:star'
  | 'mail:unread'
  | 'mail:archive'
  | 'mail:spam'
  | 'mail:labels'
  | 'mail:snooze'
  | 'mail:trash'
  | 'mail:print'
  | 'mail:eml'
  | 'mail:mbox'
  | 'mail:signature'
  | 'sync:now'
  | 'sync:historical'
  | 'sidebar:expanded'
  | 'sidebar:collapsed'
  | 'sidebar:hover'

type MailMenuAction =
  | { type: 'select-account'; accountId: string | null }
  | { type: 'command'; id: MailMenuCommand }

interface MailMenuAccount {
  id: string
  label: string
}

interface MailMenuLabels {
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

interface MailMenuViewState {
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

type FolioMenuCommand =
  | 'scope:personal'
  | 'scope:group'
  | 'page:new'
  | 'page:move-to-group'
  | 'page:copy-to-personal'
  | 'page:delete'

type FolioMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: FolioMenuCommand }

interface FolioMenuGroup {
  id: string
  label: string
}

interface FolioMenuLabels {
  scope: string
  folio: string
  personal: string
  group: string
  groupsMenu: string
  newPage: string
  moveToGroup: string
  copyToPersonal: string
  deletePage: string
}

interface FolioMenuViewState {
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

type OfficeMenuCommand =
  | 'scope:personal'
  | 'scope:group'
  | 'sidebar:expanded'
  | 'sidebar:collapsed'
  | 'sidebar:hover'
  | 'sidebar:hidden'
  | 'file:new'
  | 'file:move-to-group'
  | 'file:copy-to-personal'
  | 'file:delete'

type OfficeMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: OfficeMenuCommand }

interface OfficeMenuGroup {
  id: string
  label: string
}

interface OfficeMenuLabels {
  scope: string
  office: string
  personal: string
  group: string
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

interface OfficeMenuViewState {
  mode: 'personal' | 'group'
  groups: OfficeMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canCreate: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  canDelete: boolean
  hasSelection: boolean
  sidebarMode: 'expanded' | 'collapsed' | 'hover' | 'hidden'
}

type ChatMenuProviderId = string

interface ChatMenuModelOption {
  id: string
  label: string
}

interface ChatMenuProviderOption {
  id: ChatMenuProviderId
  label: string
  configured: boolean
  models: ChatMenuModelOption[]
}

interface ChatMenuLabels {
  mode: string
  model: string
  quick: string
  think: string
  notConfigured: string
}

interface ChatMenuViewState {
  thinkMode: 'quick' | 'think'
  provider: ChatMenuProviderId
  modelId: string
  providers: ChatMenuProviderOption[]
}

type ChatMenuAction =
  | { type: 'set-think'; mode: 'quick' | 'think' }
  | { type: 'set-model'; provider: ChatMenuProviderId; modelId: string }

type ClashMenuAction =
  | 'sidebar:expanded'
  | 'sidebar:collapsed'
  | 'sidebar:hover'
  | 'sidebar:hidden'
  | { type: 'select-item'; id: string }

interface ClashMenuNavItem {
  id: string
  label: string
  separatorBefore?: boolean
}

interface ClashMenuLabels {
  sidebarMenu: string
  sidebarControl: string
  sidebarExpanded: string
  sidebarCollapsed: string
  sidebarHover: string
  sidebarHidden: string
}

interface ClashMenuViewState {
  sidebarMode: 'expanded' | 'collapsed' | 'hover' | 'hidden'
  items: ClashMenuNavItem[]
  selectedId: string | null
}

type OrdersMenuCommand = 'sync-erp' | 'refresh'

type OrdersMenuAction =
  | { type: 'select-module'; moduleId: string }
  | { type: 'select-group'; groupId: string | null }
  | { type: 'command'; id: OrdersMenuCommand }

interface OrdersMenuItem {
  id: string
  label: string
}

interface OrdersMenuLabels {
  orders: string
  group: string
  allGroups: string
  syncErp: string
  syncing: string
  refresh: string
}

interface OrdersMenuViewState {
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

type CalendarMenuCommand =
  | 'event:new'
  | 'calendar:add'
  | 'ics:import'
  | 'ics:export'
  | 'view:today'
  | 'view:previous'
  | 'view:next'

type CalendarMenuAction =
  | { type: 'set-view'; view: string }
  | { type: 'toggle-calendar'; id: string }
  | { type: 'rename-calendar'; id: string }
  | { type: 'delete-calendar'; id: string }
  | { type: 'command'; id: CalendarMenuCommand }

interface CalendarMenuCalendar {
  id: string
  label: string
  visible: boolean
  canRename: boolean
  canDelete: boolean
}

interface CalendarMenuLabels {
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

interface CalendarMenuViewState {
  canCreate: boolean
  calendars: CalendarMenuCalendar[]
  selectedView: string
}

type TeamMenuCommand = 'period:current'

type TeamMenuMode = 'bsc' | 'pbc' | 'retro'

type TeamMenuAction =
  | { type: 'select-mode'; mode: TeamMenuMode }
  | { type: 'select-year'; year: number }
  | { type: 'select-month'; month: number }
  | { type: 'select-group'; groupId: string }
  | { type: 'select-pbc-scope'; scope: TeamPbcScope }
  | { type: 'select-pbc-member'; userId: string }
  | { type: 'command'; id: TeamMenuCommand }

type TeamPbcScope = 'group' | 'individual'

interface TeamMenuItem {
  id: string
  label: string
}

interface TeamMenuLabels {
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

interface TeamMenuViewState {
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

type MapMenuSourceId = 'map' | 'customer_map' | 'crm_map' | 'competitor_map'

interface MapMenuGroup {
  id: string
  label: string
}

type MapMenuAction =
  | 'view:toggle-sidebar'
  | 'view:favorites'
  | 'view:locations'
  | 'view:locate'
  | 'view:back'
  | 'view:forward'
  | 'favorites:add'
  | 'favorites:show-all'
  | 'favorites:export'
  | 'favorites:clear-all'
  | 'favorites:toggle-select'
  | 'favorites:select-all'
  | 'favorites:show-selected'
  | 'favorites:delete-selected'
  | 'filter:important'
  | 'filter:normal'
  | 'filter:unimportant'
  | 'filter:weekdays'
  | 'filter:sunday'
  | { type: 'select-source'; source: MapMenuSourceId }
  | { type: 'select-group'; groupId: string | null }

interface MapMenuLabels {
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

interface MapMenuViewState {
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

interface ApplicationMenuState {
  signedIn: boolean
  screen: string
  canCloseTab: boolean
  canOpenSave: boolean
  language: 'en' | 'zh-TW' | 'zh-CN'
  labels: ApplicationMenuLabels
  allowedGoFeatures?: Array<
    | 'chat'
    | 'mail'
    | 'calendar'
    | 'aura'
  >
  auraLabels?: AuraMenuLabels
  auraView?: AuraViewState
  auraWordCount?: AuraWordCountLabels
  auraLibraryLabels?: AuraLibraryMenuLabels
  auraLibraryView?: AuraLibraryMenuViewState
  mapLabels?: MapMenuLabels
  mapView?: MapMenuViewState
  mailLabels?: MailMenuLabels
  mailView?: MailMenuViewState
  folioLabels?: FolioMenuLabels
  folioView?: FolioMenuViewState
  officeLabels?: OfficeMenuLabels
  officeView?: OfficeMenuViewState
  chatLabels?: ChatMenuLabels
  chatView?: ChatMenuViewState
  clashLabels?: ClashMenuLabels
  clashView?: ClashMenuViewState
  ordersLabels?: OrdersMenuLabels
  ordersView?: OrdersMenuViewState
  calendarLabels?: CalendarMenuLabels
  calendarView?: CalendarMenuViewState
  teamLabels?: TeamMenuLabels
  teamView?: TeamMenuViewState
}

type MenuNavigateTarget =
  | 'home'
  | 'settings'
  | 'chat'
  | 'mail'
  | 'calendar'
  | 'aura'

type MenuFileAction = 'open' | 'save' | 'close-tab'

type AuraMenuAction =
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

type AuraLibraryMenuCommand =
  | 'scope:personal'
  | 'scope:group'
  | 'library:move-to-group'
  | 'library:copy-to-personal'
  | 'library:delete'

type AuraLibraryMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'command'; id: AuraLibraryMenuCommand }

interface AuraLibraryMenuGroup {
  id: string
  label: string
}

interface AuraLibraryMenuLabels {
  scope: string
  personal: string
  group: string
  groupsMenu: string
  library: string
  moveToGroup: string
  copyToPersonal: string
  deleteFile: string
}

interface AuraLibraryMenuViewState {
  mode: 'personal' | 'group'
  groups: AuraLibraryMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canMoveToGroup: boolean
  canCopyToPersonal: boolean
  canDelete: boolean
  hasSelection: boolean
}

interface WorkbenchMenuBridge {
  setState: (state: ApplicationMenuState) => Promise<void>
  onNavigate: (listener: (target: MenuNavigateTarget) => void) => () => void
  onLanguage: (listener: (language: 'en' | 'zh-TW' | 'zh-CN') => void) => () => void
  onFileAction: (listener: (action: MenuFileAction) => void) => () => void
  onAuraAction: (listener: (action: AuraMenuAction) => void) => () => void
  onAuraLibraryAction: (listener: (action: AuraLibraryMenuAction) => void) => () => void
  onMapAction: (listener: (action: MapMenuAction) => void) => () => void
  onMailAction: (listener: (action: MailMenuAction) => void) => () => void
  onFolioAction: (listener: (action: FolioMenuAction) => void) => () => void
  onOfficeAction: (listener: (action: OfficeMenuAction) => void) => () => void
  onChatAction: (listener: (action: ChatMenuAction) => void) => () => void
  onClashAction: (listener: (action: ClashMenuAction) => void) => () => void
  onOrdersAction: (listener: (action: OrdersMenuAction) => void) => () => void
  onCalendarAction: (listener: (action: CalendarMenuAction) => void) => () => void
  onTeamAction: (listener: (action: TeamMenuAction) => void) => () => void
}

interface AskAiCaptureResult {
  mimeType: 'image/jpeg'
  data: string
  width: number
  height: number
}

interface WorkbenchWindowBridge {
  usesCustomTitleBar: boolean
  usesCustomTrafficLights: boolean
  usesNativeApplicationMenu: boolean
  /** False on torn-off windows (no Home launcher in the caption). */
  showHomeLauncher: boolean
  /** True in the compact sign-in window. */
  isLoginWindow: boolean
  minimize: () => Promise<void>
  maximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  isFocused: () => Promise<boolean>
  isFullScreen: () => Promise<boolean>
  isAlwaysOnTop: () => Promise<boolean>
  toggleAlwaysOnTop: () => Promise<boolean>
  onMaximizedChange: (listener: (maximized: boolean) => void) => () => void
  onFocusChange: (listener: (focused: boolean) => void) => () => void
  onFullScreenChange: (listener: (fullScreen: boolean) => void) => () => void
  onOpenSettings: (listener: (section?: string) => void) => () => void
  onSignOut: (listener: () => void) => () => void
}

interface AppUpdateCheckResult {
  status: 'upToDate' | 'available' | 'unavailable' | 'error'
  currentVersion: string
  latestVersion?: string
  downloadUrl?: string
  fileName?: string
  forceUpdate?: boolean
  message?: string
  minSupportedVersion?: string
}

interface AppUpdateInstallProgress {
  phase: 'downloading' | 'installing' | 'relaunching' | 'error'
  percent: number
  message?: string
}

interface LoginLaunchSettings {
  openAtLogin: boolean
  silentLaunch: boolean
}

/** One row exported once from the retired Univer-era `office-workspace.sqlite`. */
interface LegacyOfficeWorkspaceFile {
  id: string
  kind: 'docs' | 'sheets' | 'slides'
  name: string
  snapshot: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

interface StoredAuthSessionPayload {
  accessToken: string
  expiresAt: number
  refreshToken: string
}

interface WorkbenchBridge {
  auth: {
    openGoogleSignIn: () => Promise<void>
    setSignedIn: (signedIn: boolean) => Promise<void>
    getStoredSession: () => Promise<StoredAuthSessionPayload | null>
    setStoredSession: (session: StoredAuthSessionPayload) => Promise<void>
    clearStoredSession: () => Promise<void>
    getLastUsername: () => Promise<string>
    setLastUsername: (username: string) => Promise<void>
    onSession: (listener: (payload: AuthSessionPayload) => void) => () => void
  }
  net: {
    invoke: (method: string, ...args: unknown[]) => Promise<unknown>
  }
  officeWorkspaceLegacy: {
    export: () => Promise<LegacyOfficeWorkspaceFile[]>
    retire: () => Promise<void>
  }
  homeAppOrder: {
    get: (userId: string) => Promise<string[]>
    set: (userId: string, appIds: string[]) => Promise<void>
  }
  homeLibrary: {
    listCategories: () => Promise<
      import('../electron/shared/home-library').HomeLibraryCategoryDto[]
    >
    listCategoryApps: (
      userId: string,
      categoryId: string,
    ) => Promise<import('../electron/shared/home-library').HomeLibraryAppDto[]>
    createApp: (
      userId: string,
      categoryId: string,
      fields: { url: string; name: string },
    ) => Promise<import('../electron/shared/home-library').HomeLibraryAppDto>
    linkSite: (
      userId: string,
      categoryId: string,
      siteId: string,
    ) => Promise<import('../electron/shared/home-library').HomeLibraryAppDto>
    saveOrder: (userId: string, categoryId: string, itemIds: string[]) => Promise<void>
    removeApp: (
      userId: string,
      categoryId: string,
      siteId: string,
    ) => Promise<import('../electron/shared/home-library').HomeLibraryAppDto[]>
    searchSites: (
      userId: string,
      categoryId: string,
      query: string,
    ) => Promise<import('../electron/shared/home-library').HomeLibrarySiteHitDto[]>
  }
  homeSettings: {
    getSettings: (
      userId: string,
    ) => Promise<import('../electron/shared/home-settings').HomeSettingsRecord>
    patchSettings: (
      userId: string,
      patch: Partial<import('../electron/shared/home-settings').HomeSettingsRecord>,
    ) => Promise<import('../electron/shared/home-settings').HomeSettingsRecord>
    listWallpapers: (
      userId: string,
    ) => Promise<import('../electron/shared/home-settings').HomeWallpaperItemDto[]>
    addWallpaper: (
      userId: string,
      bytes: ArrayBuffer,
      mimeType: string,
      thumbBytes: ArrayBuffer | null,
    ) => Promise<import('../electron/shared/home-settings').HomeWallpaperItemDto>
    removeWallpaper: (userId: string, wallpaperId: string) => Promise<string | null>
    listTodos: (
      userId: string,
    ) => Promise<import('../electron/shared/home-settings').HomeTodoItemDto[]>
    createTodo: (
      userId: string,
      text: string,
    ) => Promise<import('../electron/shared/home-settings').HomeTodoItemDto>
    setTodoDone: (userId: string, todoId: string, done: boolean) => Promise<void>
    deleteTodo: (userId: string, todoId: string) => Promise<void>
    listMarketAssets: (
      userId: string,
    ) => Promise<import('../electron/shared/home-settings').HomeMarketAssetDto[]>
    saveMarketAssets: (
      userId: string,
      assets: import('../electron/shared/home-settings').HomeMarketAssetDto[],
    ) => Promise<import('../electron/shared/home-settings').HomeMarketAssetDto[]>
    listSearchHistory: (
      userId: string,
    ) => Promise<import('../electron/shared/home-settings').HomeSearchHistoryItemDto[]>
    recordSearchHistory: (
      userId: string,
      query: string,
      engine: string,
    ) => Promise<import('../electron/shared/home-settings').HomeSearchHistoryItemDto[]>
    deleteSearchHistory: (
      userId: string,
      historyId: string,
    ) => Promise<import('../electron/shared/home-settings').HomeSearchHistoryItemDto[]>
  }
  chatHistory: {
    list: (
      userId: string,
      kind: import('../electron/shared/chat-history').ChatHistoryKind,
    ) => Promise<import('../electron/shared/chat-history').ChatHistoryRowDto[]>
    add: (
      userId: string,
      input: import('../electron/shared/chat-history').ChatHistoryCreateInput,
    ) => Promise<import('../electron/shared/chat-history').ChatHistoryRowDto>
    update: (
      userId: string,
      historyId: string,
      updates: import('../electron/shared/chat-history').ChatHistoryUpdateInput,
    ) => Promise<import('../electron/shared/chat-history').ChatHistoryRowDto | null>
    remove: (userId: string, historyId: string) => Promise<boolean>
  }
  calendar: {
    listCalendars: (
      userId: string,
      scope: import('../electron/shared/calendar').CalendarScopeDto,
    ) => Promise<import('../electron/shared/calendar').CalendarListRecordDto[]>
    ensureDefault: (
      userId: string,
      scope: import('../electron/shared/calendar').CalendarScopeDto,
      defaultName: string,
    ) => Promise<import('../electron/shared/calendar').CalendarListRecordDto[]>
    createCalendar: (
      userId: string,
      scope: import('../electron/shared/calendar').CalendarScopeDto,
      name: string,
      color?: string,
    ) => Promise<import('../electron/shared/calendar').CalendarListRecordDto>
    updateCalendar: (
      userId: string,
      calendarId: string,
      patch: { name?: string; color?: string },
    ) => Promise<import('../electron/shared/calendar').CalendarListRecordDto>
    deleteCalendar: (userId: string, calendarId: string) => Promise<void>
    listEvents: (
      userId: string,
      scope: import('../electron/shared/calendar').CalendarScopeDto,
      rangeStartIso: string,
      rangeEndIso: string,
    ) => Promise<import('../electron/shared/calendar').CalendarEventRecordDto[]>
    getEvent: (
      userId: string,
      eventId: string,
    ) => Promise<import('../electron/shared/calendar').CalendarEventRecordDto | null>
    createEvent: (
      userId: string,
      write: import('../electron/shared/calendar').CalendarEventWriteDto,
    ) => Promise<import('../electron/shared/calendar').CalendarEventRecordDto>
    updateEvent: (
      userId: string,
      eventId: string,
      write: import('../electron/shared/calendar').CalendarEventWriteDto,
    ) => Promise<import('../electron/shared/calendar').CalendarEventRecordDto>
    deleteEvent: (userId: string, eventId: string) => Promise<void>
    rsvp: (
      userId: string,
      eventId: string,
      status: import('../electron/shared/calendar').CalendarAttendeeStatus,
    ) => Promise<import('../electron/shared/calendar').CalendarAttendeeStatus>
  }
  mail: {
    presets: (userId: string) => Promise<Record<string, import('../electron/shared/mail-types').MailProviderPreset>>
    addImap: (
      userId: string,
      provider: import('../electron/shared/mail-types').MailProvider,
      email: string,
      displayName: string | null,
      config: import('../electron/shared/mail-types').MailImapSmtpConfig,
    ) => Promise<{ id: string; email: string; provider: string }>
    listAccounts: (userId: string) => Promise<import('../electron/shared/mail-types').MailAccount[]>
    listFolders: (
      userId: string,
      accountId: string,
    ) => Promise<import('../electron/shared/mail-types').MailFolderInfo[]>
    listLabels: (
      userId: string,
      accountId: string,
    ) => Promise<import('../electron/shared/mail-types').MailLabel[]>
    folderCounts: (
      userId: string,
      accountId: string,
    ) => Promise<import('../electron/shared/mail-types').MailFolderCountsResponse>
    listMessages: (
      userId: string,
      accountId: string,
      options: {
        folderId?: string
        label?: string
        q?: string
        page?: number
        threadId?: string
        category?: string
      },
    ) => Promise<import('../electron/shared/mail-types').MailMessagePage>
    getDetail: (
      userId: string,
      messageId: string,
    ) => Promise<import('../electron/shared/mail-types').MailMessageDetail>
    markRead: (userId: string, messageId: string, isRead: boolean) => Promise<void>
    toggleStar: (userId: string, messageId: string, starred: boolean) => Promise<void>
    bulk: (
      userId: string,
      messageIds: string[],
      action: import('../electron/shared/mail-types').MailBulkAction,
      extra: { label?: string; snoozeUntil?: string },
    ) => Promise<{ updated: number }>
    sync: (userId: string, accountId: string) => Promise<{ jobId: string }>
    historicalSync: (userId: string, accountId: string) => Promise<{ jobId: string }>
    fetchSyncJob: (
      userId: string,
      jobId: string,
    ) => Promise<import('../electron/shared/mail-types').MailSyncJobStatus>
    saveDraft: (
      userId: string,
      req: import('../electron/shared/mail-types').MailDraftRequest,
    ) => Promise<{ id: string }>
    updateDraft: (
      userId: string,
      draftId: string,
      req: import('../electron/shared/mail-types').MailDraftRequest,
    ) => Promise<void>
    deleteDraft: (userId: string, draftId: string) => Promise<void>
    send: (
      userId: string,
      req: import('../electron/shared/mail-types').MailSendRequest,
    ) => Promise<{ ok: boolean; jobId: string | null }>
    downloadAttachment: (
      userId: string,
      messageId: string,
      attachmentId: string,
    ) => Promise<import('../electron/shared/mail-types').MailBinaryDto>
    downloadEml: (
      userId: string,
      messageId: string,
    ) => Promise<import('../electron/shared/mail-types').MailBinaryDto>
    disconnect: (userId: string, accountId: string) => Promise<void>
    deleteAccount: (userId: string, accountId: string) => Promise<void>
    updateAccount: (userId: string, accountId: string, displayName: string | null) => Promise<void>
    test: (
      userId: string,
      accountId: string,
    ) => Promise<import('../electron/shared/mail-types').MailAccountTestResult>
    unreadSummary: (userId: string) => Promise<number>
    emptyFolder: (
      userId: string,
      accountId: string,
      role: 'trash' | 'spam',
    ) => Promise<{ updated: number }>
    listSyncTasks: (
      userId: string,
      options?: { accountId?: string | null; status?: string; limit?: number },
    ) => Promise<import('../electron/shared/mail-types').MailSyncTaskPage>
  }
  oaErpCredentials: {
    get: (userId: string) => Promise<{
      oaUsername: string
      oaPassword: string
      erpUsername: string
      erpPassword: string
    } | null>
    set: (
      userId: string,
      record: {
        oaUsername: string
        oaPassword: string
        erpUsername: string
        erpPassword: string
      },
    ) => Promise<void>
  }
  aiModelAllowlist: {
    list: () => Promise<Array<{ provider: string; modelId: string; enabled: boolean }>>
    get: (provider: string, modelId: string) => Promise<boolean | null>
    set: (provider: string, modelId: string, enabled: boolean) => Promise<void>
  }
  clawd: {
    reportActivity: (activity: {
      sessionId: string
      event: string
      state: string
      cwd?: string
      toolName?: string
    }) => Promise<void>
  }
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  askAi: {
    captureMainContent: (excludeRightPx: number) => Promise<AskAiCaptureResult | null>
  }
  window: WorkbenchWindowBridge
  menu: WorkbenchMenuBridge
  spotlight: {
    accelerator: string
    toggle: () => Promise<void>
    hide: () => Promise<void>
    setEnabled: (enabled: boolean) => Promise<void>
    usesGlobalShortcut: () => Promise<boolean>
    resize: (height: number) => Promise<void>
    /** Opens http(s) in-app or a known `workbench://` page in the main window. */
    openInMain: (url: string) => Promise<void>
    onShown: (listener: () => void) => () => void
    onOpenInApp: (listener: (url: string) => void) => () => void
  }
  browser: {
    invoke: (method: string, ...args: unknown[]) => Promise<unknown>
    onNav: (
      listener: (state: {
        tabId: string
        url: string
        title: string
        faviconUrl: string
        canGoBack: boolean
        canGoForward: boolean
      }) => void,
    ) => () => void
  }
  tabs: {
    dropTab: (
      payload: import('../electron/shared/ipc').TabTransferPayload,
      point: { x: number; y: number },
    ) => Promise<{ accepted: boolean }>
    openInNewWindow: (
      payload: import('../electron/shared/ipc').TabTransferPayload,
    ) => Promise<{ accepted: boolean }>
    moveToWindow: (
      payload: import('../electron/shared/ipc').TabTransferPayload,
      windowId: number,
    ) => Promise<{ accepted: boolean }>
    listPeerWindows: () => Promise<Array<{ id: number; title: string }>>
    setWindowLabel: (label: string) => Promise<void>
    ready: () => Promise<void>
    unready: () => Promise<void>
    onReceive: (
      listener: (payload: import('../electron/shared/ipc').TabTransferPayload) => void,
    ) => () => void
  }
  app: {
    /** Settings locale written by the Windows installer, or null when unset. */
    getInstallLanguage: () => string | null
    getVersion: () => Promise<string>
    isPackaged: () => Promise<boolean>
    checkForUpdates: () => Promise<AppUpdateCheckResult>
    installUpdate: (downloadUrl: string, fileName?: string) => Promise<void>
    onInstallProgress: (listener: (progress: AppUpdateInstallProgress) => void) => () => void
    /** Background scheduler push (periodic + OS-resume checks); see {@link AppUpdateCheckResult}. */
    onUpdateAvailable: (listener: (result: AppUpdateCheckResult) => void) => () => void
    quit: () => Promise<void>
    getLoginLaunchSettings: () => Promise<LoginLaunchSettings>
    setLoginLaunchSettings: (patch: Partial<LoginLaunchSettings>) => Promise<LoginLaunchSettings>
    setBadgeCount: (count: number) => Promise<number>
  }
}

interface WorkbenchClashBridge {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
  listen: (name: string, handler: (payload: unknown) => void) => () => void
}

interface Window {
  /** Typed Workbench desktop bridge from preload. */
  workbench: WorkbenchBridge
  /** Clash Verge invoke/listen when this document is the hosted Clash view. */
  workbenchClash?: WorkbenchClashBridge
  SpeechRecognition?: new () => SpeechRecognition
  webkitSpeechRecognition?: new () => SpeechRecognition
}

interface ImportMetaEnv {
  readonly VITE_DEPLOYMENT_DOMAIN?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ALLOWED_AUTH_EMAILS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null
  onerror: ((this: SpeechRecognition, ev: Event) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
  start(): void
  stop(): void
}
