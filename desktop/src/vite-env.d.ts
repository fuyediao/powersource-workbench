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
  agentOverlay: string
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
  harness: string
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
  mapSearch: string
  quick: string
  think: string
  notConfigured: string
}

interface ChatMenuViewState {
  thinkMode: 'quick' | 'think'
  provider: ChatMenuProviderId
  modelId: string
  mapSearch: boolean
  providers: ChatMenuProviderOption[]
}

type ChatMenuAction =
  | { type: 'set-think'; mode: 'quick' | 'think' }
  | { type: 'set-model'; provider: ChatMenuProviderId; modelId: string }
  | { type: 'set-map-search'; enabled: boolean }

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
  | 'scope:personal'
  | 'scope:group'
  | 'event:new'
  | 'calendar:add'
  | 'ics:import'
  | 'ics:export'
  | 'view:today'
  | 'view:previous'
  | 'view:next'
  | 'google:connect'
  | 'google:sync'
  | 'google:disconnect'

type CalendarMenuAction =
  | { type: 'select-group'; groupId: string }
  | { type: 'set-view'; view: string }
  | { type: 'toggle-calendar'; id: string }
  | { type: 'rename-calendar'; id: string }
  | { type: 'delete-calendar'; id: string }
  | { type: 'toggle-google-calendar'; id: string }
  | { type: 'command'; id: CalendarMenuCommand }

interface CalendarMenuGroup {
  id: string
  label: string
}

interface CalendarMenuCalendar {
  id: string
  label: string
  visible: boolean
  canRename: boolean
  canDelete: boolean
}

interface CalendarMenuGoogleCalendar {
  id: string
  label: string
  selected: boolean
  enabled: boolean
}

interface CalendarMenuLabels {
  scope: string
  calendars: string
  connection: string
  view: string
  personal: string
  group: string
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
  connect: string
  connecting: string
  reauth: string
  sync: string
  syncing: string
  disconnect: string
}

interface CalendarMenuViewState {
  mode: 'personal' | 'group'
  groups: CalendarMenuGroup[]
  selectedGroupId: string | null
  canSwitchGroups: boolean
  canCreate: boolean
  calendars: CalendarMenuCalendar[]
  selectedView: string
  showConnectionMenu: boolean
  googleEmail: string | null
  googleConnecting: boolean
  googleSyncing: boolean
  googleNeedsReauth: boolean
  googleCalendars: CalendarMenuGoogleCalendar[]
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
    | 'harness'
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
  | 'harness'
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

interface WorkbenchBridge {
  auth: {
    openGoogleSignIn: () => Promise<void>
    setSignedIn: (signedIn: boolean) => Promise<void>
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
  opportunityBoardLayout: {
    get: (userId: string) => Promise<string | null>
    set: (userId: string, layoutJson: string) => Promise<void>
    clear: (userId: string) => Promise<void>
  }
  harness: {
    testMode: boolean
    getDevicePreferences: (legacyValue?: unknown) => Promise<{
      approvalMode: 'askAlways' | 'askIfUnsafe' | 'fullAccess'
      computerUseEnabled: boolean
      webSearchEnabled: boolean
      computerUseTarget: {
        id: string
        kind: 'display' | 'window'
        label: string
      } | null
      sidebarVisible: boolean
      utilitySidebarVisible: boolean
      utilitySidebarWidth: number
      workFolder: string
      mcpServers: Array<import('../electron/shared/harness').HarnessMcpServerConfig>
    }>
    setDevicePreferences: (value: import('../electron/shared/harness').HarnessDevicePreferences) => Promise<import('../electron/shared/harness').HarnessDevicePreferences>
    status: () => Promise<{ available: boolean; binaryPath: string }>
    start: (options: {
      cwd?: string | null
      resumeThreadId?: string | null
      continuationInstructions?: string | null
      approvalMode: 'askAlways' | 'askIfUnsafe' | 'fullAccess'
      apiKey?: string | null
      model?: string | null
      provider?: string | null
      computerUseProvider?: string | null
      computerUseModel?: string | null
      computerUseEnabled?: boolean
      webSearchEnabled?: boolean
      computerUseTarget?: {
        id: string
        kind: 'display' | 'window'
        label: string
      } | null
      allowedTools?: string[] | null
      activeExpert?: import('../electron/shared/harness').HarnessActiveExpertConfig | null
      developerInstructions?: string | null
      accessToken?: string | null
      apiBaseUrl?: string | null
      mcpServers?: Array<{
        name: string
        transport: 'stdio' | 'streamableHttp'
        command?: string
        args?: string[]
        url?: string
        bearerTokenEnvVar?: string
        httpHeaders?: Record<string, string>
        envHttpHeaders?: Record<string, string>
      }> | null
    }) => Promise<void>
    snapshot: () => Promise<unknown[]>
    startTurn: (
      text: string,
      extras?: {
        wakeJobId?: string | null
        attachments?: Array<{ path: string; kind: 'file' | 'folder' }> | null
        mentions?: Array<{ name: string; path: string }> | null
        goal?: string | null
        planMode?: boolean
        canvasMode?: boolean
        effort?: string | null
      },
    ) => Promise<void>
    defaultWorkFolder: () => Promise<string>
    pickWorkFolder: () => Promise<string | null>
    pickFiles: () => Promise<string[]>
    getPathForFile: (file: File) => string
    pickAttachmentFolder: () => Promise<string | null>
    listWorkspace: (cwd?: string | null, relativePath?: string) => Promise<import('../electron/shared/harness').HarnessWorkspaceEntry[]>
    readWorkspaceFile: (cwd: string | null | undefined, relativePath: string) => Promise<import('../electron/shared/harness').HarnessWorkspaceFile>
    writeCanvasFile: (cwd: string | null | undefined, relativePath: string, content: string) => Promise<import('../electron/shared/harness').HarnessWorkspaceFile>
    snapshotCanvas: (cwd: string | null | undefined, historyId: string) => Promise<void>
    parkCanvas: (cwd: string | null | undefined, historyId?: string | null) => Promise<void>
    restoreCanvas: (cwd: string | null | undefined, historyId: string) => Promise<boolean>
    showCanvasPreview: (bounds: { x: number; y: number; width: number; height: number }, document: string) => Promise<void>
    hideCanvasPreview: () => Promise<void>
    onCanvasConsole: (callback: (entry: { level: 'info' | 'warning' | 'error'; message: string }) => void) => () => void
    ptySpawn: (sessionId: string, cwd: string | null | undefined, cols: number, rows: number) => Promise<void>
    ptyWrite: (sessionId: string, data: string) => Promise<void>
    ptyResize: (sessionId: string, cols: number, rows: number) => Promise<void>
    ptyDispose: (sessionId: string) => Promise<void>
    readReview: (cwd?: string | null) => Promise<import('../electron/shared/harness').HarnessReviewSnapshot>
    mcpLogin: (name: string) => Promise<void>
    listConnectors: (forceRefetch?: boolean) => Promise<Array<{
      id: string
      name: string
      description: string
      iconUrl: string
      installUrl: string
      accessible: boolean
      enabled: boolean
      installed: boolean
      callable: boolean
      toolNames: string[]
    }>>
    installConnector: (connectorId: string, installUrl: string) => Promise<void>
    listComputerTargets: () => Promise<Array<{
      id: string
      kind: 'display' | 'window'
      label: string
    }>>
    interrupt: () => Promise<void>
    respondToApproval: (
      requestId: string,
      decision: 'accept' | 'acceptForSession' | 'decline',
    ) => Promise<void>
    dispose: () => Promise<void>
    onEvent: (listener: (event: unknown) => void) => () => void
    onPtyData: (listener: (sessionId: string, data: string) => void) => () => void
    onPtyExit: (listener: (sessionId: string, exitCode: number) => void) => () => void
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
  agentOverlay: {
    accelerator: string
    toggle: () => Promise<void>
    hide: () => Promise<void>
    setEnabled: (enabled: boolean) => Promise<void>
    usesGlobalShortcut: () => Promise<boolean>
    onShown: (listener: () => void) => () => void
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
