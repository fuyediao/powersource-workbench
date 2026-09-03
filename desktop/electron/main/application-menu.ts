import { BrowserWindow, Menu, app, type MenuItemConstructorOptions } from 'electron'
import { APP_DISPLAY_NAME } from '../shared/app-identity'
import {
  MENU_AURA_EVENT,
  MENU_AURA_LIBRARY_EVENT,
  MENU_CHAT_EVENT,
  MENU_FEATURE_IDS,
  MENU_FILE_EVENT,
  MENU_MAIL_EVENT,
  MENU_CLASH_EVENT,
  MENU_ORDERS_EVENT,
  MENU_CALENDAR_EVENT,
  MENU_TEAM_EVENT,
  MENU_FOLIO_EVENT,
  MENU_OFFICE_EVENT,
  MENU_MAP_EVENT,
  MENU_NAVIGATE_EVENT,
  MAP_MENU_SOURCES,
  TEAM_MENU_MODES,
  TEAM_PBC_SCOPES,
  OPEN_SETTINGS_EVENT,
  SIGN_OUT_EVENT,
  MENU_LANGUAGE_EVENT,
  isAppMenuLanguage,
  type ApplicationMenuLabels,
  type ApplicationMenuState,
  type AuraMenuAction,
  type AuraMenuLabels,
  type AuraViewState,
  type AuraWordCountLabels,
  type AuraLibraryMenuAction,
  type AuraLibraryMenuGroup,
  type AuraLibraryMenuLabels,
  type AuraLibraryMenuViewState,
  type ChatMenuAction,
  type ChatMenuLabels,
  type ChatMenuProviderId,
  type ChatMenuProviderOption,
  type ChatMenuViewState,
  type ClashMenuAction,
  type ClashMenuLabels,
  type ClashMenuNavItem,
  type ClashMenuViewState,
  type OrdersMenuAction,
  type OrdersMenuItem,
  type OrdersMenuLabels,
  type OrdersMenuViewState,
  type CalendarMenuAction,
  type CalendarMenuCalendar,
  type CalendarMenuGoogleCalendar,
  type CalendarMenuGroup,
  type CalendarMenuLabels,
  type CalendarMenuViewState,
  type TeamMenuAction,
  type TeamMenuItem,
  type TeamMenuLabels,
  type TeamMenuMode,
  type TeamMenuViewState,
  type TeamPbcScope,
  type MenuFeatureId,
  type MailMenuAction,
  type MailMenuAccount,
  type MailMenuLabels,
  type MailMenuViewState,
  type FolioMenuAction,
  type FolioMenuGroup,
  type FolioMenuLabels,
  type FolioMenuViewState,
  type OfficeMenuAction,
  type OfficeMenuLabels,
  type OfficeMenuViewState,
  type MapMenuAction,
  type MapMenuGroup,
  type MapMenuLabels,
  type MapMenuSourceId,
  type MapMenuViewState,
  type MenuFileAction,
  type MenuNavigateTarget,
  type AppMenuLanguage,
  isFolioScreen,
  isOfficeScreen,
  isSidebarControlScreen,
} from '../shared/ipc'
import {
  CLOSE_TAB_ACCELERATOR,
  AGENT_OVERLAY_ACCELERATOR,
  QUIT_ACCELERATOR,
  SETTINGS_ACCELERATOR,
  SPOTLIGHT_ACCELERATOR,
} from '../shared/platform'
import { toggleAgentOverlay } from './agent-overlay'
import { isAuxiliaryWindow } from './auxiliary-windows'
import { updateDarwinTrayMenu } from './platform/darwin/tray'
import { quitWindowsApp, updateWindowsTrayMenu } from './platform/windows/tray'
import { toggleSpotlight } from './spotlight'

const DEFAULT_LABELS: ApplicationMenuLabels = {
  about: `About ${APP_DISPLAY_NAME}`,
  hide: `Hide ${APP_DISPLAY_NAME}`,
  hideOthers: 'Hide Others',
  showAll: 'Show All',
  quit: `Quit ${APP_DISPLAY_NAME}`,
  spotlight: 'Spotlight',
  openApp: `Open ${APP_DISPLAY_NAME}`,
  agentOverlay: 'Ask Agent',
  signOut: 'Sign out',
  file: 'File',
  closeTab: 'Close Tab',
  open: 'Open…',
  save: 'Save',
  edit: 'Edit',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  go: 'Go',
  home: 'Home',
  settings: 'Settings…',
  chat: 'Artificial Intelligence',
  messages: 'Messages',
  mail: 'Mail',
  calendar: 'Calendar',
  kanban: 'Board',
  map: 'Map',
  admin: 'Admin',
  orders: 'Orders',
  products: 'Products',
  nexdot: 'NEXDOT',
  teAdmin: 'T&E Admin',
  team: 'Team',
  aura: 'Editor',
  folio: 'Folio',
  docs: 'Docs',
  sheets: 'Sheets',
  slides: 'Slides',
  clash: 'Clash',
  harness: 'Harness',
  language: 'Language',
  languageEn: 'English',
  languageZhTw: 'Traditional Chinese',
  languageZhCn: 'Simplified Chinese',
}

const DEFAULT_AURA_LABELS: AuraMenuLabels = {
  edit: 'Edit',
  format: 'Format',
  view: 'View',
  new: 'New',
  exportMarkdown: 'Export Markdown',
  exportHtml: 'Export HTML',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  find: 'Find',
  replace: 'Replace',
  bold: 'Bold',
  italic: 'Italic',
  strike: 'Strikethrough',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  toggleSidebar: 'Toggle Sidebar',
  outline: 'Outline',
  filesPanel: 'Files',
  sourceMode: 'Source Mode',
  focusMode: 'Focus Mode',
}

const DEFAULT_AURA_WORD_COUNT: AuraWordCountLabels = {
  menu: '0 words',
  readingTime: '0 min',
  lines: '0 lines',
  words: '0 words',
  characters: '0 characters',
}

const DEFAULT_AURA_LIBRARY_LABELS: AuraLibraryMenuLabels = {
  scope: 'Scope',
  personal: 'Personal',
  group: 'Group',
  groupsMenu: 'Groups',
  library: 'Library',
  moveToGroup: 'Move to group',
  copyToPersonal: 'Copy to personal',
  deleteFile: 'Delete',
}

const DEFAULT_AURA_LIBRARY_VIEW: AuraLibraryMenuViewState = {
  mode: 'personal',
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
  canMoveToGroup: false,
  canCopyToPersonal: false,
  canDelete: false,
  hasSelection: false,
}

const DEFAULT_MAP_LABELS: MapMenuLabels = {
  toggleSidebar: 'Show/hide sidebar',
  favorites: 'Favorites',
  locations: 'Locations',
  locate: 'Return to my location',
  back: 'Back',
  forward: 'Forward',
  add: 'Add Custom Location',
  showAllOnMap: 'Show All on Map',
  export: 'Export',
  clearAll: 'Clear all locations from map',
  select: 'Select',
  done: 'Done',
  selectAll: 'Select All',
  deselectAll: 'Deselect All',
  showOnMap: 'Show on Map',
  delete: 'Delete',
  filter: 'Filter',
  important: 'Important',
  normal: 'Normal',
  unimportant: 'Unimportant',
  weekdaysOnly: 'Weekdays Only',
  sundayOnly: 'Sunday Only',
  sourceMenu: 'Map source',
  groupMenu: 'Group',
  allGroups: 'All groups',
  sourceMap: 'Map',
  sourceCustomerMap: 'Customer map',
  sourceCrmMap: 'Leads map',
  sourceCompetitorMap: 'Competitor map',
}

const DEFAULT_MAP_VIEW: MapMenuViewState = {
  sidebarVisible: true,
  tab: 'chat',
  canGoBackward: false,
  canGoForward: false,
  favoriteCount: 0,
  filteredCount: 0,
  shopCount: 0,
  selectionMode: false,
  selectedCount: 0,
  allFilteredSelected: false,
  filterImportant: false,
  filterNormal: false,
  filterUnimportant: false,
  weekdaysOnly: false,
  sundayOnly: false,
  source: 'map',
  availableSources: ['map'],
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
}

const DEFAULT_MAIL_LABELS: MailMenuLabels = {
  account: 'Account',
  mailbox: 'Mailbox',
  mail: 'Mail',
  sync: 'Sync',
  unifiedInbox: 'All accounts',
  addAccount: 'Add Account…',
  testAccount: 'Test connection',
  disconnectAccount: 'Disconnect mailbox',
  deleteAccount: 'Delete mailbox',
  compose: 'Compose new message',
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward',
  star: 'Star',
  unstar: 'Unstar',
  unread: 'Unread',
  archive: 'Archive',
  spam: 'Mark as spam',
  notSpam: 'Report not spam',
  applyLabel: 'Labels…',
  snooze: 'Snooze',
  trash: 'Move to trash',
  print: 'Print',
  downloadEml: 'Download as .eml',
  exportMbox: 'Export mbox',
  signatureEditor: 'Signature',
  syncNow: 'Sync Now',
  syncing: 'Syncing…',
  historicalSync: 'Historical sync',
  sidebarControl: 'Sidebar control',
  sidebarExpanded: 'Expanded',
  sidebarCollapsed: 'Collapsed',
  sidebarHover: 'Expand on hover',
}

const DEFAULT_MAIL_VIEW: MailMenuViewState = {
  accountMenuLabel: 'Account',
  accounts: [],
  selectedAccountId: null,
  unifiedInbox: true,
  hasAccount: false,
  hasMessage: false,
  isStarred: false,
  isSpamView: false,
  isSyncing: false,
  sidebarMode: 'expanded',
}

const DEFAULT_FOLIO_LABELS: FolioMenuLabels = {
  scope: 'Scope',
  folio: 'Folio',
  personal: 'Personal',
  group: 'Group',
  groupsMenu: 'Groups',
  newPage: 'New page',
  moveToGroup: 'Move to group',
  copyToPersonal: 'Copy to personal',
  deletePage: 'Delete',
}

const DEFAULT_FOLIO_VIEW: FolioMenuViewState = {
  mode: 'personal',
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
  canCreate: false,
  canMoveToGroup: false,
  canCopyToPersonal: false,
  canDelete: false,
  hasSelection: false,
}


const DEFAULT_OFFICE_LABELS: OfficeMenuLabels = {
  scope: 'Scope',
  office: 'Office',
  personal: 'Personal',
  group: 'Group',
  groupsMenu: 'Groups',
  sidebarControl: 'Sidebar control',
  sidebarExpanded: 'Expanded',
  sidebarCollapsed: 'Collapsed',
  sidebarHover: 'Expand on hover',
  sidebarHidden: 'Hide',
  newFile: 'New file',
  moveToGroup: 'Move to group',
  copyToPersonal: 'Copy to personal',
  deleteFile: 'Delete',
}

const DEFAULT_OFFICE_VIEW: OfficeMenuViewState = {
  mode: 'personal',
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
  canCreate: false,
  canMoveToGroup: false,
  canCopyToPersonal: false,
  canDelete: false,
  hasSelection: false,
  sidebarMode: 'expanded',
}

const DEFAULT_CHAT_LABELS: ChatMenuLabels = {
  mode: 'Mode',
  model: 'Cloud Models',
  mapSearch: 'Map',
  quick: 'Quick',
  think: 'Think',
  notConfigured: 'Not Configured',
}

const DEFAULT_CHAT_VIEW: ChatMenuViewState = {
  thinkMode: 'quick',
  provider: 'gemini',
  modelId: 'gemini-3.1-pro-preview',
  mapSearch: false,
  providers: [],
}

const DEFAULT_CLASH_LABELS: ClashMenuLabels = {
  sidebarMenu: 'Sidebar',
  sidebarControl: 'Sidebar control',
  sidebarExpanded: 'Expanded',
  sidebarCollapsed: 'Collapsed',
  sidebarHover: 'Expand on hover',
  sidebarHidden: 'Hide',
}

const DEFAULT_CLASH_VIEW: ClashMenuViewState = {
  sidebarMode: 'hover',
  items: [],
  selectedId: null,
}

const DEFAULT_ORDERS_LABELS: OrdersMenuLabels = {
  orders: 'Orders',
  group: 'Group',
  allGroups: 'All groups',
  syncErp: 'Sync ERP',
  syncing: 'Syncing...',
  refresh: 'Refresh',
}

const DEFAULT_ORDERS_VIEW: OrdersMenuViewState = {
  modules: [],
  selectedModuleId: null,
  groups: [],
  selectedGroupId: null,
  showGroupMenu: false,
  canSyncErp: false,
  isSyncing: false,
  canRefresh: false,
  isRefreshing: false,
}

const DEFAULT_CALENDAR_LABELS: CalendarMenuLabels = {
  scope: 'Scope',
  calendars: 'Calendars',
  connection: 'Connection',
  view: 'View',
  personal: 'Personal',
  group: 'Group',
  newEvent: 'New event',
  addCalendar: 'Add calendar',
  showCalendar: 'Show',
  rename: 'Rename',
  deleteCalendar: 'Delete calendar',
  importIcs: 'Import ICS…',
  exportIcs: 'Export ICS…',
  today: 'Today',
  previous: 'Previous',
  next: 'Next',
  viewDay: 'Day',
  viewWeek: 'Week',
  viewMonth: 'Month',
  viewYear: 'Year',
  viewList: 'Schedule',
  viewFourDays: '4 days',
  connect: 'Connect Google',
  connecting: 'Waiting…',
  reauth: 'Reconnect Google',
  sync: 'Sync Google',
  syncing: 'Syncing…',
  disconnect: 'Disconnect',
}

const DEFAULT_CALENDAR_VIEW: CalendarMenuViewState = {
  mode: 'personal',
  groups: [],
  selectedGroupId: null,
  canSwitchGroups: false,
  canCreate: false,
  calendars: [],
  selectedView: 'month-grid',
  showConnectionMenu: false,
  googleEmail: null,
  googleConnecting: false,
  googleSyncing: false,
  googleNeedsReauth: false,
  googleCalendars: [],
}

const DEFAULT_TEAM_LABELS: TeamMenuLabels = {
  view: 'View',
  period: 'Period',
  group: 'Group',
  year: 'Year',
  month: 'Month',
  goToCurrent: 'This month',
  pbc: 'PBC',
  pbcGroup: 'Group',
  pbcIndividual: 'Individual',
}

const DEFAULT_TEAM_VIEW: TeamMenuViewState = {
  modes: [],
  selectedMode: 'bsc',
  years: [],
  selectedYear: new Date().getFullYear(),
  months: [],
  selectedMonth: new Date().getMonth() + 1,
  canGoToCurrent: false,
  groups: [],
  selectedGroupId: null,
  showGroupMenu: false,
  pbcScope: 'group',
  pbcMembers: [],
  selectedPbcMemberId: null,
}

let getMainWindow: () => BrowserWindow | null = () => null
let menuState: ApplicationMenuState = {
  signedIn: false,
  screen: 'home',
  canCloseTab: false,
  canOpenSave: false,
  language: 'en',
  labels: DEFAULT_LABELS,
}
let lastMenuFingerprint = ''

/**
 * Resolves the main BrowserWindow (not Spotlight).
 * @returns Window or null.
 */
function targetWindow(): BrowserWindow | null {
  const fromGetter = getMainWindow()
  if (fromGetter && !fromGetter.isDestroyed()) {
    return fromGetter
  }
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed() && !isAuxiliaryWindow(focused)) {
    return focused
  }
  return (
    BrowserWindow.getAllWindows().find(
      (win) => !win.isDestroyed() && !isAuxiliaryWindow(win),
    ) ?? null
  )
}

/**
 * Sends a Go / Settings navigation request to the renderer.
 * @param target - Page to open.
 * @returns Nothing.
 */
function sendNavigate(target: MenuNavigateTarget): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  if (target === 'settings') {
    win.webContents.send(OPEN_SETTINGS_EVENT)
    return
  }
  win.webContents.send(MENU_NAVIGATE_EVENT, target)
}

/**
 * Shows the main window and asks the renderer to sign out.
 * @returns Nothing.
 */
function sendSignOut(): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(SIGN_OUT_EVENT)
}

/**
 * Asks the renderer to switch the UI language (works while signed out).
 * @param language - Supported Settings locale.
 * @returns Nothing.
 */
function sendLanguage(language: AppMenuLanguage): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_LANGUAGE_EVENT, language)
}

/**
 * Sends a File menu action to the renderer.
 * @param action - Open, save, or close tab.
 * @returns Nothing.
 */
function sendFileAction(action: MenuFileAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_FILE_EVENT, action)
}

/**
 * Sends an Aura editor command from the native application menu.
 * @param action - Aura menu action id.
 * @returns Nothing.
 */
function sendAuraAction(action: AuraMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_AURA_EVENT, action)
}

/**
 * Sends an Aura Scope/Library command from the native application menu.
 * @param action - Aura Scope/Library menu action.
 * @returns Nothing.
 */
function sendAuraLibraryAction(action: AuraLibraryMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_AURA_LIBRARY_EVENT, action)
}

/**
 * Sends a Map page command from the native application menu.
 * @param action - Map menu action (command, source, or group).
 * @returns Nothing.
 */
function sendMapAction(action: MapMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_MAP_EVENT, action)
}

/**
 * Sends a Mail page command from the native application menu.
 * @param action - Mail menu action.
 * @returns Nothing.
 */
function sendMailAction(action: MailMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_MAIL_EVENT, action)
}

/**
 * Sends a Folio page command from the native application menu.
 * @param action - Folio menu action.
 * @returns Nothing.
 */
function sendFolioAction(action: FolioMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_FOLIO_EVENT, action)
}
/**
 * Sends an Office page command from the native application menu.
 * @param action - Office menu action.
 * @returns Nothing.
 */
function sendOfficeAction(action: OfficeMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_OFFICE_EVENT, action)
}


/**
 * Sends a Chat page command from the native application menu.
 * @param action - Chat menu action.
 * @returns Nothing.
 */
function sendChatAction(action: ChatMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_CHAT_EVENT, action)
}

/**
 * Sends a Clash page command from the native application menu.
 * @param action - Clash menu action.
 * @returns Nothing.
 */
function sendClashAction(action: ClashMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_CLASH_EVENT, action)
}

/**
 * Sends an Orders page command from the native application menu.
 * @param action - Orders menu action.
 * @returns Nothing.
 */
function sendOrdersAction(action: OrdersMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_ORDERS_EVENT, action)
}

/**
 * Sends a Calendar page command from the native application menu.
 * @param action - Calendar menu action.
 * @returns Nothing.
 */
function sendCalendarAction(action: CalendarMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_CALENDAR_EVENT, action)
}

/**
 * Sends a Team page command from the native application menu.
 * @param action - Team menu action.
 * @returns Nothing.
 */
function sendTeamAction(action: TeamMenuAction): void {
  const win = targetWindow()
  if (!win) {
    return
  }
  win.show()
  win.focus()
  win.webContents.send(MENU_TEAM_EVENT, action)
}

/**
 * Sanitizes renderer-provided Map menu labels.
 * @param value - Candidate labels.
 * @returns Merged labels, or undefined when missing.
 */
function sanitizeMapLabels(value: unknown): MapMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_MAP_LABELS }
  for (const key of Object.keys(DEFAULT_MAP_LABELS) as (keyof MapMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Map menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeMapView(value: unknown): MapMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const tab = record.tab === 'shops' ? 'shops' : 'chat'
  const availableSources = sanitizeMapSources(record.availableSources)
  const source =
    typeof record.source === 'string' && availableSources.includes(record.source as MapMenuSourceId)
      ? (record.source as MapMenuSourceId)
      : (availableSources[0] ?? 'map')
  const selectedGroupId =
    typeof record.selectedGroupId === 'string' && record.selectedGroupId.length > 0
      ? record.selectedGroupId
      : null
  return {
    sidebarVisible: Boolean(record.sidebarVisible),
    tab,
    canGoBackward: Boolean(record.canGoBackward),
    canGoForward: Boolean(record.canGoForward),
    favoriteCount: Number(record.favoriteCount) || 0,
    filteredCount: Number(record.filteredCount) || 0,
    shopCount: Number(record.shopCount) || 0,
    selectionMode: Boolean(record.selectionMode),
    selectedCount: Number(record.selectedCount) || 0,
    allFilteredSelected: Boolean(record.allFilteredSelected),
    filterImportant: Boolean(record.filterImportant),
    filterNormal: Boolean(record.filterNormal),
    filterUnimportant: Boolean(record.filterUnimportant),
    weekdaysOnly: Boolean(record.weekdaysOnly),
    sundayOnly: Boolean(record.sundayOnly),
    source,
    availableSources,
    groups: sanitizeMapGroups(record.groups),
    selectedGroupId,
    canSwitchGroups: Boolean(record.canSwitchGroups),
  }
}

/**
 * Sanitizes renderer-provided Map source radios.
 * @param value - Candidate list.
 * @returns Valid source ids (at least Map).
 */
function sanitizeMapSources(value: unknown): MapMenuSourceId[] {
  if (!Array.isArray(value)) {
    return ['map']
  }
  const sources: MapMenuSourceId[] = []
  for (const raw of value) {
    if (typeof raw !== 'string' || !(MAP_MENU_SOURCES as readonly string[]).includes(raw)) {
      continue
    }
    const source = raw as MapMenuSourceId
    if (!sources.includes(source)) {
      sources.push(source)
    }
  }
  return sources.length > 0 ? sources : ['map']
}

/**
 * Sanitizes renderer-provided Map group rows.
 * @param value - Candidate list.
 * @returns Valid group rows.
 */
function sanitizeMapGroups(value: unknown): MapMenuGroup[] {
  if (!Array.isArray(value)) {
    return []
  }
  const groups: MapMenuGroup[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    groups.push({ id: record.id, label: record.label })
  }
  return groups
}

/**
 * Translated label for a Map source radio.
 * @param labels - Map menu labels.
 * @param source - Source id.
 * @returns Menu title / radio label.
 */
function mapSourceLabel(labels: MapMenuLabels, source: MapMenuSourceId): string {
  switch (source) {
    case 'customer_map':
      return labels.sourceCustomerMap
    case 'crm_map':
      return labels.sourceCrmMap
    case 'competitor_map':
      return labels.sourceCompetitorMap
    case 'map':
    default:
      return labels.sourceMap
  }
}

/**
 * Returns whether the native Group menu should appear.
 * @param view - Live Map menu snapshot.
 * @returns True when admins can switch groups on a CRM layer.
 */
function mapGroupMenuVisible(view: MapMenuViewState): boolean {
  return view.canSwitchGroups && view.groups.length > 0 && view.source !== 'map'
}

/**
 * Sanitizes renderer-provided Mail menu labels.
 * @param value - Candidate labels.
 * @returns Merged labels, or undefined when missing.
 */
function sanitizeMailLabels(value: unknown): MailMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_MAIL_LABELS }
  for (const key of Object.keys(DEFAULT_MAIL_LABELS) as (keyof MailMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Mail account rows.
 * @param value - Candidate list.
 * @returns Valid account rows.
 */
function sanitizeMailAccounts(value: unknown): MailMenuAccount[] {
  if (!Array.isArray(value)) {
    return []
  }
  const accounts: MailMenuAccount[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    accounts.push({ id: record.id, label: record.label })
  }
  return accounts
}

/**
 * Sanitizes renderer-provided Mail menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeMailView(value: unknown): MailMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const selectedAccountId =
    typeof record.selectedAccountId === 'string' && record.selectedAccountId.length > 0
      ? record.selectedAccountId
      : null
  const accountMenuLabel =
    typeof record.accountMenuLabel === 'string' && record.accountMenuLabel.length > 0
      ? record.accountMenuLabel
      : DEFAULT_MAIL_VIEW.accountMenuLabel
  const sidebarMode =
    record.sidebarMode === 'collapsed' || record.sidebarMode === 'hover'
      ? record.sidebarMode
      : 'expanded'
  return {
    accountMenuLabel,
    accounts: sanitizeMailAccounts(record.accounts),
    selectedAccountId,
    unifiedInbox: Boolean(record.unifiedInbox),
    hasAccount: Boolean(record.hasAccount),
    hasMessage: Boolean(record.hasMessage),
    isStarred: Boolean(record.isStarred),
    isSpamView: Boolean(record.isSpamView),
    isSyncing: Boolean(record.isSyncing),
    sidebarMode,
  }
}

/**
 * Sanitizes renderer-provided Folio menu labels.
 * @param value - Candidate labels.
 * @returns Labels, or undefined when missing.
 */
function sanitizeFolioLabels(value: unknown): FolioMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_FOLIO_LABELS }
  for (const key of Object.keys(DEFAULT_FOLIO_LABELS) as (keyof FolioMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Folio group rows.
 * @param value - Candidate list.
 * @returns Valid group rows.
 */
function sanitizeFolioGroups(value: unknown): FolioMenuGroup[] {
  if (!Array.isArray(value)) {
    return []
  }
  const groups: FolioMenuGroup[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    groups.push({ id: record.id, label: record.label })
  }
  return groups
}

/**
 * Sanitizes renderer-provided Folio menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeFolioView(value: unknown): FolioMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const selectedGroupId =
    typeof record.selectedGroupId === 'string' && record.selectedGroupId.length > 0
      ? record.selectedGroupId
      : null
  return {
    mode: record.mode === 'group' ? 'group' : 'personal',
    groups: sanitizeFolioGroups(record.groups),
    selectedGroupId,
    canSwitchGroups: Boolean(record.canSwitchGroups),
    canCreate: Boolean(record.canCreate),
    canMoveToGroup: Boolean(record.canMoveToGroup),
    canCopyToPersonal: Boolean(record.canCopyToPersonal),
    canDelete: Boolean(record.canDelete),
    hasSelection: Boolean(record.hasSelection),
  }
}

/**
 * Sanitizes renderer-provided Office menu labels.
 * @param value - Candidate labels.
 * @returns Labels, or undefined when missing.
 */
function sanitizeOfficeLabels(value: unknown): OfficeMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_OFFICE_LABELS }
  for (const key of Object.keys(DEFAULT_OFFICE_LABELS) as (keyof OfficeMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Office menu view state.
 * @param value - Candidate view.
 * @returns View, or undefined when missing.
 */
function sanitizeOfficeView(value: unknown): OfficeMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const groupsRaw = Array.isArray(record.groups) ? record.groups : []
  const groups = groupsRaw
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null
      }
      const group = row as Record<string, unknown>
      if (typeof group.id !== 'string' || typeof group.label !== 'string') {
        return null
      }
      return { id: group.id, label: group.label }
    })
    .filter((row): row is { id: string; label: string } => row !== null)
  return {
    mode: record.mode === 'group' ? 'group' : 'personal',
    groups,
    selectedGroupId: typeof record.selectedGroupId === 'string' ? record.selectedGroupId : null,
    canSwitchGroups: Boolean(record.canSwitchGroups),
    canCreate: Boolean(record.canCreate),
    canMoveToGroup: Boolean(record.canMoveToGroup),
    canCopyToPersonal: Boolean(record.canCopyToPersonal),
    canDelete: Boolean(record.canDelete),
    hasSelection: Boolean(record.hasSelection),
    sidebarMode:
      record.sidebarMode === 'collapsed' ||
      record.sidebarMode === 'hover' ||
      record.sidebarMode === 'hidden'
        ? record.sidebarMode
        : 'expanded',
  }
}


/**
 * Sanitizes renderer-provided Aura Scope/Library menu labels.
 * @param value - Candidate labels.
 * @returns Labels, or undefined when missing.
 */
function sanitizeAuraLibraryLabels(value: unknown): AuraLibraryMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_AURA_LIBRARY_LABELS }
  for (const key of Object.keys(DEFAULT_AURA_LIBRARY_LABELS) as (keyof AuraLibraryMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Aura group rows.
 * @param value - Candidate list.
 * @returns Valid group rows.
 */
function sanitizeAuraLibraryGroups(value: unknown): AuraLibraryMenuGroup[] {
  if (!Array.isArray(value)) {
    return []
  }
  const groups: AuraLibraryMenuGroup[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    groups.push({ id: record.id, label: record.label })
  }
  return groups
}

/**
 * Sanitizes renderer-provided Aura Scope/Library menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeAuraLibraryView(value: unknown): AuraLibraryMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const selectedGroupId =
    typeof record.selectedGroupId === 'string' && record.selectedGroupId.length > 0
      ? record.selectedGroupId
      : null
  return {
    mode: record.mode === 'group' ? 'group' : 'personal',
    groups: sanitizeAuraLibraryGroups(record.groups),
    selectedGroupId,
    canSwitchGroups: Boolean(record.canSwitchGroups),
    canMoveToGroup: Boolean(record.canMoveToGroup),
    canCopyToPersonal: Boolean(record.canCopyToPersonal),
    canDelete: Boolean(record.canDelete),
    hasSelection: Boolean(record.hasSelection),
  }
}

/**
 * Sanitizes renderer-provided Chat menu labels.
 * @param value - Candidate labels.
 * @returns Labels, or undefined when missing.
 */
function sanitizeChatLabels(value: unknown): ChatMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const out: ChatMenuLabels = { ...DEFAULT_CHAT_LABELS }
  for (const key of Object.keys(DEFAULT_CHAT_LABELS) as (keyof ChatMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      out[key] = record[key]
    }
  }
  return out
}

/**
 * Sanitizes renderer-provided Chat provider catalog rows.
 * @param value - Candidate list.
 * @returns Valid provider groups.
 */
function sanitizeChatProviders(value: unknown): ChatMenuProviderOption[] {
  if (!Array.isArray(value)) {
    return []
  }
  const providers: ChatMenuProviderOption[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    const models: ChatMenuProviderOption['models'] = []
    if (Array.isArray(record.models)) {
      for (const modelRaw of record.models) {
        if (!modelRaw || typeof modelRaw !== 'object') {
          continue
        }
        const model = modelRaw as Record<string, unknown>
        if (typeof model.id !== 'string' || model.id.length === 0) {
          continue
        }
        if (typeof model.label !== 'string' || model.label.length === 0) {
          continue
        }
        models.push({ id: model.id, label: model.label })
      }
    }
    providers.push({
      id: record.id as ChatMenuProviderId,
      label: record.label,
      configured: Boolean(record.configured),
      models,
    })
  }
  return providers
}

/**
 * Sanitizes renderer-provided Chat menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeChatView(value: unknown): ChatMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const provider =
    typeof record.provider === 'string' && record.provider.length > 0
      ? record.provider
      : DEFAULT_CHAT_VIEW.provider
  const modelId =
    typeof record.modelId === 'string' && record.modelId.length > 0
      ? record.modelId
      : DEFAULT_CHAT_VIEW.modelId
  return {
    thinkMode: record.thinkMode === 'think' ? 'think' : 'quick',
    provider,
    modelId,
    mapSearch: record.mapSearch === true,
    providers: sanitizeChatProviders(record.providers),
  }
}

/**
 * Combined picker-style native menu title, with an optional right-aligned hint.
 * macOS treats a tab as the same alignment as a keyboard shortcut.
 * @param title - Combined `OpenAI · GPT-5.6 Sol` label.
 * @param suffix - Optional status shown to the right (Not Configured).
 * @returns Native menu item label.
 */
function chatModelMenuLabel(title: string, suffix?: string): string {
  if (!suffix) {
    return title
  }
  return `${title}\t${suffix}`
}

/**
 * Builds Chat Mode + Map + Model menus. Cloud Models is a flat radio list of
 * combined vendor · model labels (same as the in-window picker).
 * @param labels - Translated Chat menu labels.
 * @param view - Live radios and catalog.
 * @returns Top-level menu items.
 */
function buildChatMenus(
  labels: ChatMenuLabels,
  view: ChatMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_CHAT_VIEW

  const modeSubmenu: MenuItemConstructorOptions[] = [
    {
      label: labels.quick,
      type: 'radio',
      checked: state.thinkMode === 'quick',
      click: () => sendChatAction({ type: 'set-think', mode: 'quick' }),
    },
    {
      label: labels.think,
      type: 'radio',
      checked: state.thinkMode === 'think',
      click: () => sendChatAction({ type: 'set-think', mode: 'think' }),
    },
  ]

  const modelSubmenu: MenuItemConstructorOptions[] = state.providers.flatMap((provider) => {
    if (provider.models.length === 0) {
      return [
        {
          label: provider.configured
            ? provider.label
            : chatModelMenuLabel(provider.label, labels.notConfigured),
          enabled: provider.configured,
        },
      ]
    }
    return provider.models.map((model) => {
      if (!provider.configured) {
        return {
          label: chatModelMenuLabel(model.label, labels.notConfigured),
          enabled: false,
        }
      }
      return {
        label: model.label,
        type: 'radio' as const,
        checked: state.provider === provider.id && state.modelId === model.id,
        click: () =>
          sendChatAction({
            type: 'set-model',
            provider: provider.id,
            modelId: model.id,
          }),
      }
    })
  })

  return [
    {
      label: labels.mode,
      submenu: modeSubmenu,
    },
    {
      label: labels.mapSearch,
      submenu: [
        {
          label: labels.mapSearch,
          type: 'checkbox',
          checked: state.mapSearch,
          click: (menuItem) =>
            sendChatAction({ type: 'set-map-search', enabled: menuItem.checked }),
        },
      ],
    },
    {
      label: labels.model,
      submenu: modelSubmenu.length > 0 ? modelSubmenu : [{ label: labels.notConfigured, enabled: false }],
    },
  ]
}

/**
 * Sanitizes renderer-provided Clash menu labels.
 * @param value - Candidate labels.
 * @returns Labels, or undefined when missing.
 */
function sanitizeClashLabels(value: unknown): ClashMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_CLASH_LABELS }
  for (const key of Object.keys(DEFAULT_CLASH_LABELS) as (keyof ClashMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Sidebar page rows.
 * @param value - Candidate list.
 * @returns Valid nav rows.
 */
function sanitizeClashNavItems(value: unknown): ClashMenuNavItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const items: ClashMenuNavItem[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    items.push({
      id: record.id,
      label: record.label,
      separatorBefore: Boolean(record.separatorBefore),
    })
  }
  return items
}

/**
 * Sanitizes renderer-provided Clash menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeClashView(value: unknown): ClashMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const sidebarMode =
    record.sidebarMode === 'expanded' ||
    record.sidebarMode === 'collapsed' ||
    record.sidebarMode === 'hidden'
      ? record.sidebarMode
      : 'hover'
  const selectedId =
    typeof record.selectedId === 'string' && record.selectedId.length > 0
      ? record.selectedId
      : null
  return {
    sidebarMode,
    items: sanitizeClashNavItems(record.items),
    selectedId,
  }
}

/**
 * Builds native Sidebar (page radios) and Sidebar control (mode radios) menus.
 * Used on Clash, Settings, and Admin-shell Function screens (including Board).
 * Mail is unchanged.
 * @param labels - Translated item labels.
 * @param view - Live radios and page rows.
 * @returns Menu template fragments.
 */
function buildClashMenus(
  labels: ClashMenuLabels,
  view: ClashMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_CLASH_VIEW
  const pageItems: MenuItemConstructorOptions[] = []
  for (const item of state.items) {
    if (item.separatorBefore && pageItems.length > 0) {
      pageItems.push({ type: 'separator' })
    }
    pageItems.push({
      label: item.label,
      type: 'radio',
      checked: item.id === state.selectedId,
      click: () => sendClashAction({ type: 'select-item', id: item.id }),
    })
  }

  const menus: MenuItemConstructorOptions[] = []
  if (pageItems.length > 0) {
    menus.push({
      label: labels.sidebarMenu,
      submenu: pageItems,
    })
  }
  menus.push({
    label: labels.sidebarControl,
    submenu: [
      {
        label: labels.sidebarExpanded,
        type: 'radio',
        checked: state.sidebarMode === 'expanded',
        click: () => sendClashAction('sidebar:expanded'),
      },
      {
        label: labels.sidebarCollapsed,
        type: 'radio',
        checked: state.sidebarMode === 'collapsed',
        click: () => sendClashAction('sidebar:collapsed'),
      },
      {
        label: labels.sidebarHover,
        type: 'radio',
        checked: state.sidebarMode === 'hover',
        click: () => sendClashAction('sidebar:hover'),
      },
      {
        label: labels.sidebarHidden,
        type: 'radio',
        checked: state.sidebarMode === 'hidden',
        click: () => sendClashAction('sidebar:hidden'),
      },
    ],
  })
  return menus
}

/**
 * Sanitizes renderer-provided Orders menu labels.
 * @param value - Candidate labels.
 * @returns Labels, or undefined when missing.
 */
function sanitizeOrdersLabels(value: unknown): OrdersMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_ORDERS_LABELS }
  for (const key of Object.keys(DEFAULT_ORDERS_LABELS) as (keyof OrdersMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Orders labeled rows.
 * @param value - Candidate list.
 * @returns Valid id/label rows.
 */
function sanitizeOrdersMenuItems(value: unknown): OrdersMenuItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const items: OrdersMenuItem[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    items.push({ id: record.id, label: record.label })
  }
  return items
}

/**
 * Sanitizes renderer-provided Orders menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeOrdersView(value: unknown): OrdersMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const selectedModuleId =
    typeof record.selectedModuleId === 'string' && record.selectedModuleId.length > 0
      ? record.selectedModuleId
      : null
  const selectedGroupId =
    typeof record.selectedGroupId === 'string' && record.selectedGroupId.length > 0
      ? record.selectedGroupId
      : null
  return {
    modules: sanitizeOrdersMenuItems(record.modules),
    selectedModuleId,
    groups: sanitizeOrdersMenuItems(record.groups),
    selectedGroupId,
    showGroupMenu: Boolean(record.showGroupMenu),
    canSyncErp: Boolean(record.canSyncErp),
    isSyncing: Boolean(record.isSyncing),
    canRefresh: Boolean(record.canRefresh),
    isRefreshing: Boolean(record.isRefreshing),
  }
}

/**
 * Builds native Orders (module radios + Sync ERP / Refresh) and Group menus.
 * @param labels - Translated item labels.
 * @param view - Live radios and enablement.
 * @returns Menu template fragments.
 */
function buildOrdersMenus(
  labels: OrdersMenuLabels,
  view: OrdersMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_ORDERS_VIEW
  const ordersItems: MenuItemConstructorOptions[] = []
  for (const item of state.modules) {
    ordersItems.push({
      label: item.label,
      type: 'radio',
      checked: item.id === state.selectedModuleId,
      click: () => sendOrdersAction({ type: 'select-module', moduleId: item.id }),
    })
  }
  if (ordersItems.length > 0) {
    ordersItems.push({ type: 'separator' })
  }
  ordersItems.push(
    {
      label: state.isSyncing ? labels.syncing : labels.syncErp,
      enabled: state.canSyncErp && !state.isSyncing,
      click: () => sendOrdersAction({ type: 'command', id: 'sync-erp' }),
    },
    {
      label: labels.refresh,
      enabled: state.canRefresh && !state.isRefreshing,
      click: () => sendOrdersAction({ type: 'command', id: 'refresh' }),
    },
  )

  const menus: MenuItemConstructorOptions[] = [
    {
      label: labels.orders,
      submenu: ordersItems,
    },
  ]
  if (state.showGroupMenu) {
    const groupItems: MenuItemConstructorOptions[] = [
      {
        label: labels.allGroups,
        type: 'radio',
        checked: state.selectedGroupId === null,
        click: () => sendOrdersAction({ type: 'select-group', groupId: null }),
      },
    ]
    if (state.groups.length > 0) {
      groupItems.push({ type: 'separator' })
      for (const group of state.groups) {
        groupItems.push({
          label: group.label,
          type: 'radio',
          checked: group.id === state.selectedGroupId,
          click: () => sendOrdersAction({ type: 'select-group', groupId: group.id }),
        })
      }
    }
    menus.push({
      label: labels.group,
      submenu: groupItems,
    })
  }
  return menus
}

/**
 * Sanitizes renderer-provided Calendar menu labels.
 * @param value - Candidate labels.
 * @returns Labels, or undefined when missing.
 */
function sanitizeCalendarLabels(value: unknown): CalendarMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_CALENDAR_LABELS }
  for (const key of Object.keys(DEFAULT_CALENDAR_LABELS) as (keyof CalendarMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Calendar group rows.
 * @param value - Candidate list.
 * @returns Valid group rows.
 */
function sanitizeCalendarGroups(value: unknown): CalendarMenuGroup[] {
  if (!Array.isArray(value)) {
    return []
  }
  const groups: CalendarMenuGroup[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    groups.push({ id: record.id, label: record.label })
  }
  return groups
}

/**
 * Sanitizes renderer-provided named calendar rows.
 * @param value - Candidate list.
 * @returns Valid calendar rows.
 */
function sanitizeCalendarCalendars(value: unknown): CalendarMenuCalendar[] {
  if (!Array.isArray(value)) {
    return []
  }
  const calendars: CalendarMenuCalendar[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    calendars.push({
      id: record.id,
      label: record.label,
      visible: Boolean(record.visible),
      canRename: Boolean(record.canRename),
      canDelete: Boolean(record.canDelete),
    })
  }
  return calendars
}

/**
 * Sanitizes renderer-provided Google calendar rows.
 * @param value - Candidate list.
 * @returns Valid Google calendar rows.
 */
function sanitizeCalendarGoogleCalendars(value: unknown): CalendarMenuGoogleCalendar[] {
  if (!Array.isArray(value)) {
    return []
  }
  const calendars: CalendarMenuGoogleCalendar[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    calendars.push({
      id: record.id,
      label: record.label,
      selected: Boolean(record.selected),
      enabled: Boolean(record.enabled),
    })
  }
  return calendars
}

/**
 * Sanitizes renderer-provided Calendar menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeCalendarView(value: unknown): CalendarMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const selectedGroupId =
    typeof record.selectedGroupId === 'string' && record.selectedGroupId.length > 0
      ? record.selectedGroupId
      : null
  const googleEmail =
    typeof record.googleEmail === 'string' && record.googleEmail.length > 0
      ? record.googleEmail
      : null
  const selectedView =
    typeof record.selectedView === 'string' && record.selectedView.length > 0
      ? record.selectedView
      : DEFAULT_CALENDAR_VIEW.selectedView
  return {
    mode: record.mode === 'group' ? 'group' : 'personal',
    groups: sanitizeCalendarGroups(record.groups),
    selectedGroupId,
    canSwitchGroups: Boolean(record.canSwitchGroups),
    canCreate: Boolean(record.canCreate),
    calendars: sanitizeCalendarCalendars(record.calendars),
    selectedView,
    showConnectionMenu: Boolean(record.showConnectionMenu),
    googleEmail,
    googleConnecting: Boolean(record.googleConnecting),
    googleSyncing: Boolean(record.googleSyncing),
    googleNeedsReauth: Boolean(record.googleNeedsReauth),
    googleCalendars: sanitizeCalendarGoogleCalendars(record.googleCalendars),
  }
}

const CALENDAR_VIEW_RADIOS: Array<{
  id: string
  labelKey: keyof CalendarMenuLabels
}> = [
  { id: 'day', labelKey: 'viewDay' },
  { id: 'week', labelKey: 'viewWeek' },
  { id: 'month-grid', labelKey: 'viewMonth' },
  { id: 'year', labelKey: 'viewYear' },
  { id: 'list', labelKey: 'viewList' },
  { id: 'four-days', labelKey: 'viewFourDays' },
]

/**
 * Builds native Calendar menus (Scope / Calendars / Connection / View).
 * @param labels - Translated item labels.
 * @param view - Live radios, checkboxes, and enablement.
 * @returns Menu template fragments.
 */
function buildCalendarMenus(
  labels: CalendarMenuLabels,
  view: CalendarMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_CALENDAR_VIEW
  const scopeItems: MenuItemConstructorOptions[] = [
    {
      label: labels.personal,
      type: 'radio',
      checked: state.mode === 'personal',
      click: () => sendCalendarAction({ type: 'command', id: 'scope:personal' }),
    },
    {
      label: labels.group,
      type: 'radio',
      checked: state.mode === 'group',
      click: () => sendCalendarAction({ type: 'command', id: 'scope:group' }),
    },
  ]
  if (state.mode === 'group' && state.canSwitchGroups && state.groups.length > 0) {
    scopeItems.push({ type: 'separator' })
    for (const group of state.groups) {
      scopeItems.push({
        label: group.label,
        type: 'radio',
        checked: group.id === state.selectedGroupId,
        click: () => sendCalendarAction({ type: 'select-group', groupId: group.id }),
      })
    }
  }

  const calendarItems: MenuItemConstructorOptions[] = state.calendars.map((calendar) => ({
    label: calendar.label,
    submenu: [
      {
        label: labels.showCalendar,
        type: 'checkbox',
        checked: calendar.visible,
        click: () => sendCalendarAction({ type: 'toggle-calendar', id: calendar.id }),
      },
      {
        label: labels.rename,
        enabled: calendar.canRename,
        click: () => sendCalendarAction({ type: 'rename-calendar', id: calendar.id }),
      },
      {
        label: labels.deleteCalendar,
        enabled: calendar.canDelete,
        click: () => sendCalendarAction({ type: 'delete-calendar', id: calendar.id }),
      },
    ],
  }))
  if (calendarItems.length > 0) {
    calendarItems.push({ type: 'separator' })
  }
  calendarItems.push(
    {
      label: labels.addCalendar,
      enabled: state.canCreate,
      click: () => sendCalendarAction({ type: 'command', id: 'calendar:add' }),
    },
    {
      label: labels.importIcs,
      enabled: state.canCreate,
      click: () => sendCalendarAction({ type: 'command', id: 'ics:import' }),
    },
    {
      label: labels.exportIcs,
      click: () => sendCalendarAction({ type: 'command', id: 'ics:export' }),
    },
    { type: 'separator' },
    {
      label: labels.newEvent,
      accelerator: 'CommandOrControl+N',
      enabled: state.canCreate,
      click: () => sendCalendarAction({ type: 'command', id: 'event:new' }),
    },
  )

  const viewItems: MenuItemConstructorOptions[] = CALENDAR_VIEW_RADIOS.map((row) => ({
    label: labels[row.labelKey],
    type: 'radio' as const,
    checked: state.selectedView === row.id,
    click: () => sendCalendarAction({ type: 'set-view', view: row.id }),
  }))
  viewItems.push(
    { type: 'separator' },
    {
      label: labels.today,
      click: () => sendCalendarAction({ type: 'command', id: 'view:today' }),
    },
    {
      label: labels.previous,
      click: () => sendCalendarAction({ type: 'command', id: 'view:previous' }),
    },
    {
      label: labels.next,
      click: () => sendCalendarAction({ type: 'command', id: 'view:next' }),
    },
  )

  const menus: MenuItemConstructorOptions[] = [
    {
      label: labels.scope,
      submenu: scopeItems,
    },
    {
      label: labels.calendars,
      submenu: calendarItems,
    },
  ]

  if (state.showConnectionMenu) {
    const connectionItems: MenuItemConstructorOptions[] = []
    if (state.googleEmail) {
      connectionItems.push({
        label: state.googleEmail,
        enabled: false,
      })
      if (state.googleNeedsReauth) {
        connectionItems.push({
          label: state.googleConnecting ? labels.connecting : labels.reauth,
          enabled: !state.googleConnecting,
          click: () => sendCalendarAction({ type: 'command', id: 'google:connect' }),
        })
      } else {
        for (const googleCalendar of state.googleCalendars) {
          connectionItems.push({
            label: googleCalendar.label,
            type: 'checkbox',
            checked: googleCalendar.selected,
            enabled: googleCalendar.enabled,
            click: () =>
              sendCalendarAction({
                type: 'toggle-google-calendar',
                id: googleCalendar.id,
              }),
          })
        }
        connectionItems.push({
          label: state.googleSyncing ? labels.syncing : labels.sync,
          enabled: !state.googleSyncing,
          click: () => sendCalendarAction({ type: 'command', id: 'google:sync' }),
        })
      }
      connectionItems.push({
        label: labels.disconnect,
        enabled: !state.googleSyncing && !state.googleConnecting,
        click: () => sendCalendarAction({ type: 'command', id: 'google:disconnect' }),
      })
    } else {
      connectionItems.push({
        label: state.googleConnecting ? labels.connecting : labels.connect,
        enabled: !state.googleConnecting,
        click: () => sendCalendarAction({ type: 'command', id: 'google:connect' }),
      })
    }
    menus.push({
      label: labels.connection,
      submenu: connectionItems,
    })
  }

  menus.push({
    label: labels.view,
    submenu: viewItems,
  })
  return menus
}

/**
 * Sanitizes renderer-provided Team menu labels.
 * @param value - Candidate labels.
 * @returns Labels, or undefined when missing.
 */
function sanitizeTeamLabels(value: unknown): TeamMenuLabels | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const next = { ...DEFAULT_TEAM_LABELS }
  for (const key of Object.keys(DEFAULT_TEAM_LABELS) as (keyof TeamMenuLabels)[]) {
    if (typeof record[key] === 'string' && record[key].length > 0) {
      next[key] = record[key]
    }
  }
  return next
}

/**
 * Sanitizes renderer-provided Team labeled rows.
 * @param value - Candidate list.
 * @returns Valid id/label rows.
 */
function sanitizeTeamMenuItems(value: unknown): TeamMenuItem[] {
  if (!Array.isArray(value)) {
    return []
  }
  const items: TeamMenuItem[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const record = raw as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) {
      continue
    }
    if (typeof record.label !== 'string' || record.label.length === 0) {
      continue
    }
    items.push({ id: record.id, label: record.label })
  }
  return items
}

/**
 * Sanitizes a calendar year from the renderer snapshot.
 * @param value - Candidate year.
 * @returns Integer year, or the default.
 */
function sanitizeTeamYear(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 2000 && value <= 2100) {
    return value
  }
  return DEFAULT_TEAM_VIEW.selectedYear
}

/**
 * Sanitizes a calendar month from the renderer snapshot.
 * @param value - Candidate month.
 * @returns Month 1–12, or the default.
 */
function sanitizeTeamMonth(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12) {
    return value
  }
  return DEFAULT_TEAM_VIEW.selectedMonth
}

/**
 * Sanitizes renderer-provided Team menu view state.
 * @param value - Candidate snapshot.
 * @returns View state, or undefined when missing.
 */
function sanitizeTeamView(value: unknown): TeamMenuViewState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const record = value as Record<string, unknown>
  const selectedMode: TeamMenuMode =
    typeof record.selectedMode === 'string' &&
    (TEAM_MENU_MODES as readonly string[]).includes(record.selectedMode)
      ? (record.selectedMode as TeamMenuMode)
      : DEFAULT_TEAM_VIEW.selectedMode
  const selectedGroupId =
    typeof record.selectedGroupId === 'string' && record.selectedGroupId.length > 0
      ? record.selectedGroupId
      : null
  const pbcScope: TeamPbcScope =
    typeof record.pbcScope === 'string' &&
    (TEAM_PBC_SCOPES as readonly string[]).includes(record.pbcScope)
      ? (record.pbcScope as TeamPbcScope)
      : DEFAULT_TEAM_VIEW.pbcScope
  const selectedPbcMemberId =
    typeof record.selectedPbcMemberId === 'string' && record.selectedPbcMemberId.length > 0
      ? record.selectedPbcMemberId
      : null
  return {
    modes: sanitizeTeamMenuItems(record.modes),
    selectedMode,
    years: sanitizeTeamMenuItems(record.years),
    selectedYear: sanitizeTeamYear(record.selectedYear),
    months: sanitizeTeamMenuItems(record.months),
    selectedMonth: sanitizeTeamMonth(record.selectedMonth),
    canGoToCurrent: Boolean(record.canGoToCurrent),
    groups: sanitizeTeamMenuItems(record.groups),
    selectedGroupId,
    showGroupMenu: Boolean(record.showGroupMenu),
    pbcScope,
    pbcMembers: sanitizeTeamMenuItems(record.pbcMembers),
    selectedPbcMemberId,
  }
}

/**
 * Builds native Team menus (View / PBC / Period / Group).
 * @param labels - Translated item labels.
 * @param view - Live radios and enablement.
 * @returns Menu template fragments.
 */
function buildTeamMenus(
  labels: TeamMenuLabels,
  view: TeamMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_TEAM_VIEW
  const viewItems: MenuItemConstructorOptions[] = state.modes.map((mode) => ({
    label: mode.label,
    type: 'radio',
    checked: mode.id === state.selectedMode,
    click: () => {
      if (mode.id === 'bsc' || mode.id === 'pbc' || mode.id === 'retro') {
        sendTeamAction({ type: 'select-mode', mode: mode.id })
      }
    },
  }))
  const yearItems: MenuItemConstructorOptions[] = state.years.map((year) => ({
    label: year.label,
    type: 'radio',
    checked: year.id === String(state.selectedYear),
    click: () => {
      const parsed = Number.parseInt(year.id, 10)
      if (Number.isInteger(parsed)) {
        sendTeamAction({ type: 'select-year', year: parsed })
      }
    },
  }))
  const monthItems: MenuItemConstructorOptions[] = state.months.map((month) => ({
    label: month.label,
    type: 'radio',
    checked: month.id === String(state.selectedMonth),
    click: () => {
      const parsed = Number.parseInt(month.id, 10)
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 12) {
        sendTeamAction({ type: 'select-month', month: parsed })
      }
    },
  }))
  const periodItems: MenuItemConstructorOptions[] = [
    {
      label: labels.year,
      submenu: yearItems,
    },
    {
      label: labels.month,
      submenu: monthItems,
    },
    { type: 'separator' },
    {
      label: labels.goToCurrent,
      enabled: state.canGoToCurrent,
      click: () => sendTeamAction({ type: 'command', id: 'period:current' }),
    },
  ]
  const menus: MenuItemConstructorOptions[] = [
    {
      label: labels.view,
      submenu: viewItems,
    },
  ]
  if (state.selectedMode === 'pbc') {
    const pbcItems: MenuItemConstructorOptions[] = [
      {
        label: labels.pbcGroup,
        type: 'radio',
        checked: state.pbcScope === 'group',
        click: () => sendTeamAction({ type: 'select-pbc-scope', scope: 'group' }),
      },
      {
        label: labels.pbcIndividual,
        type: 'radio',
        checked: state.pbcScope === 'individual',
        click: () => sendTeamAction({ type: 'select-pbc-scope', scope: 'individual' }),
      },
    ]
    if (state.pbcScope === 'individual' && state.pbcMembers.length > 0) {
      pbcItems.push({ type: 'separator' })
      for (const member of state.pbcMembers) {
        pbcItems.push({
          label: member.label,
          type: 'radio',
          checked: member.id === state.selectedPbcMemberId,
          click: () => sendTeamAction({ type: 'select-pbc-member', userId: member.id }),
        })
      }
    }
    menus.push({
      label: labels.pbc,
      submenu: pbcItems,
    })
  }
  menus.push({
    label: labels.period,
    submenu: periodItems,
  })
  if (state.showGroupMenu) {
    const groupItems: MenuItemConstructorOptions[] = state.groups.map((group) => ({
      label: group.label,
      type: 'radio',
      checked: group.id === state.selectedGroupId,
      click: () => sendTeamAction({ type: 'select-group', groupId: group.id }),
    }))
    menus.push({
      label: labels.group,
      submenu: groupItems,
    })
  }
  return menus
}

/**
 * Builds the native Map Source menu (explore / customer / leads / competitor).
 * The top-level label is always "Map source"; radios inside name each layer.
 * @param labels - Translated Map item labels.
 * @param view - Live source radios.
 * @returns Menu template fragment.
 */
function buildMapSourceMenu(
  labels: MapMenuLabels,
  view: MapMenuViewState,
): MenuItemConstructorOptions {
  const sources: MapMenuSourceId[] =
    view.availableSources.length > 0 ? view.availableSources : ['map']
  return {
    label: labels.sourceMenu,
    submenu: sources.map((source) => ({
      label: mapSourceLabel(labels, source),
      type: 'radio' as const,
      checked: source === view.source,
      click: () => sendMapAction({ type: 'select-source', source }),
    })),
  }
}

/**
 * Builds the native Map Group menu (all groups + admin radios).
 * @param labels - Translated Map item labels.
 * @param view - Live group radios.
 * @returns Menu template fragment.
 */
function buildMapGroupMenu(
  labels: MapMenuLabels,
  view: MapMenuViewState,
): MenuItemConstructorOptions {
  const selectedLabel =
    view.selectedGroupId == null
      ? labels.allGroups
      : (view.groups.find((group) => group.id === view.selectedGroupId)?.label ?? labels.groupMenu)
  const items: MenuItemConstructorOptions[] = [
    {
      label: labels.allGroups,
      type: 'radio',
      checked: view.selectedGroupId == null,
      click: () => sendMapAction({ type: 'select-group', groupId: null }),
    },
  ]
  if (view.groups.length > 0) {
    items.push({ type: 'separator' })
    for (const group of view.groups) {
      items.push({
        label: group.label,
        type: 'radio',
        checked: group.id === view.selectedGroupId,
        click: () => sendMapAction({ type: 'select-group', groupId: group.id }),
      })
    }
  }
  return {
    label: selectedLabel,
    submenu: items,
  }
}

/**
 * Builds native Map menus (source, optional group, Map, Filter).
 * @param menuTitle - Top-level Map menu label.
 * @param labels - Translated Map item labels.
 * @param view - Live checkboxes and enablement.
 * @returns Menu template fragments.
 */
function buildMapMenus(
  menuTitle: string,
  labels: MapMenuLabels,
  view: MapMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_MAP_VIEW
  const menus: MenuItemConstructorOptions[] = [buildMapSourceMenu(labels, state)]
  if (mapGroupMenuVisible(state)) {
    menus.push(buildMapGroupMenu(labels, state))
  }
  menus.push(buildMapMenu(menuTitle, labels, state), buildMapFilterMenu(labels, state))
  return menus
}

/**
 * Builds the Map native menu (sidebar, tabs, locate, favorites actions).
 * @param menuTitle - Top-level menu label (Map).
 * @param labels - Translated Map item labels.
 * @param view - Live checkboxes and enablement.
 * @returns Menu template fragment.
 */
function buildMapMenu(
  menuTitle: string,
  labels: MapMenuLabels,
  view: MapMenuViewState | undefined,
): MenuItemConstructorOptions {
  const state = view ?? DEFAULT_MAP_VIEW
  const onFavoritesTab = state.tab === 'chat'
  const hasFavorites = state.favoriteCount > 0
  const hasFiltered = state.filteredCount > 0
  const hasSelection = state.selectionMode && state.selectedCount > 0

  return {
    label: menuTitle,
    submenu: [
      {
        label: labels.toggleSidebar,
        type: 'checkbox',
        checked: state.sidebarVisible,
        click: () => sendMapAction('view:toggle-sidebar'),
      },
      {
        label: labels.favorites,
        type: 'radio',
        checked: onFavoritesTab,
        click: () => sendMapAction('view:favorites'),
      },
      {
        label: labels.locations,
        type: 'radio',
        checked: !onFavoritesTab,
        click: () => sendMapAction('view:locations'),
      },
      { type: 'separator' },
      {
        label: labels.locate,
        click: () => sendMapAction('view:locate'),
      },
      {
        label: labels.back,
        enabled: state.canGoBackward,
        click: () => sendMapAction('view:back'),
      },
      {
        label: labels.forward,
        enabled: state.canGoForward,
        click: () => sendMapAction('view:forward'),
      },
      { type: 'separator' },
      {
        label: labels.add,
        click: () => sendMapAction('favorites:add'),
      },
      {
        label: labels.showAllOnMap,
        enabled: onFavoritesTab && hasFiltered,
        click: () => sendMapAction('favorites:show-all'),
      },
      {
        label: labels.export,
        enabled: hasFavorites,
        click: () => sendMapAction('favorites:export'),
      },
      {
        label: labels.clearAll,
        enabled: state.shopCount > 0 || hasFiltered,
        click: () => sendMapAction('favorites:clear-all'),
      },
      { type: 'separator' },
      {
        label: state.selectionMode ? labels.done : labels.select,
        enabled: onFavoritesTab && hasFavorites,
        click: () => sendMapAction('favorites:toggle-select'),
      },
      {
        label: state.allFilteredSelected ? labels.deselectAll : labels.selectAll,
        enabled: onFavoritesTab && state.selectionMode && hasFiltered,
        click: () => sendMapAction('favorites:select-all'),
      },
      {
        label: labels.showOnMap,
        enabled: hasSelection,
        click: () => sendMapAction('favorites:show-selected'),
      },
      {
        label: labels.delete,
        enabled: hasSelection,
        click: () => sendMapAction('favorites:delete-selected'),
      },
    ],
  }
}

/**
 * Builds the Map Filter native menu (priority / weekday / Sunday).
 * @param labels - Translated Map item labels.
 * @param view - Live checkboxes and enablement.
 * @returns Menu template fragment.
 */
function buildMapFilterMenu(
  labels: MapMenuLabels,
  view: MapMenuViewState | undefined,
): MenuItemConstructorOptions {
  const state = view ?? DEFAULT_MAP_VIEW
  const enabled = state.tab === 'chat' && state.favoriteCount > 0

  return {
    label: labels.filter,
    submenu: [
      {
        label: labels.important,
        type: 'checkbox',
        checked: state.filterImportant,
        enabled,
        click: () => sendMapAction('filter:important'),
      },
      {
        label: labels.normal,
        type: 'checkbox',
        checked: state.filterNormal,
        enabled,
        click: () => sendMapAction('filter:normal'),
      },
      {
        label: labels.unimportant,
        type: 'checkbox',
        checked: state.filterUnimportant,
        enabled,
        click: () => sendMapAction('filter:unimportant'),
      },
      { type: 'separator' },
      {
        label: labels.weekdaysOnly,
        type: 'checkbox',
        checked: state.weekdaysOnly,
        enabled,
        click: () => sendMapAction('filter:weekdays'),
      },
      {
        label: labels.sundayOnly,
        type: 'checkbox',
        checked: state.sundayOnly,
        enabled,
        click: () => sendMapAction('filter:sunday'),
      },
    ],
  }
}

/**
 * Builds one Functions native menu whose radio list switches Univer ribbon tabs.
 * @param tabs - Translated tab labels and which tab is active.
 * @param functionsHeading - Native menu title (Functions).
 * @returns Menu template fragments.
 */
/**
 * Builds the four native Mail menus (Account / Mailbox / Mail / Sync).
 * @param labels - Translated Mail item labels.
 * @param view - Live radios and enablement.
 * @returns Menu template fragments.
 */
function buildMailMenus(
  labels: MailMenuLabels,
  view: MailMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_MAIL_VIEW
  const hasAccount = state.hasAccount
  const hasMessage = state.hasMessage
  const accountItems: MenuItemConstructorOptions[] = [
    {
      label: labels.unifiedInbox,
      type: 'radio',
      checked: state.unifiedInbox,
      click: () => sendMailAction({ type: 'select-account', accountId: null }),
    },
  ]
  if (state.accounts.length > 0) {
    accountItems.push({ type: 'separator' })
    for (const account of state.accounts) {
      accountItems.push({
        label: account.label,
        type: 'radio',
        checked: !state.unifiedInbox && account.id === state.selectedAccountId,
        click: () => sendMailAction({ type: 'select-account', accountId: account.id }),
      })
    }
  }

  return [
    {
      label: state.accountMenuLabel || labels.account,
      submenu: accountItems,
    },
    {
      label: labels.mailbox,
      submenu: [
        {
          label: labels.addAccount,
          click: () => sendMailAction({ type: 'command', id: 'mailbox:add' }),
        },
        {
          label: labels.testAccount,
          enabled: hasAccount,
          click: () => sendMailAction({ type: 'command', id: 'mailbox:test' }),
        },
        {
          label: labels.disconnectAccount,
          enabled: hasAccount,
          click: () => sendMailAction({ type: 'command', id: 'mailbox:disconnect' }),
        },
        {
          label: labels.deleteAccount,
          enabled: hasAccount,
          click: () => sendMailAction({ type: 'command', id: 'mailbox:delete' }),
        },
      ],
    },
    {
      label: labels.mail,
      submenu: [
        {
          label: labels.compose,
          accelerator: 'CommandOrControl+N',
          registerAccelerator: false,
          click: () => sendMailAction({ type: 'command', id: 'mail:compose' }),
        },
        {
          label: labels.reply,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:reply' }),
        },
        {
          label: labels.replyAll,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:reply-all' }),
        },
        {
          label: labels.forward,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:forward' }),
        },
        { type: 'separator' },
        {
          label: state.isStarred ? labels.unstar : labels.star,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:star' }),
        },
        {
          label: labels.unread,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:unread' }),
        },
        {
          label: labels.archive,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:archive' }),
        },
        {
          label: state.isSpamView ? labels.notSpam : labels.spam,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:spam' }),
        },
        {
          label: labels.applyLabel,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:labels' }),
        },
        {
          label: labels.snooze,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:snooze' }),
        },
        {
          label: labels.trash,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:trash' }),
        },
        { type: 'separator' },
        {
          label: labels.print,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:print' }),
        },
        {
          label: labels.downloadEml,
          enabled: hasMessage,
          click: () => sendMailAction({ type: 'command', id: 'mail:eml' }),
        },
        {
          label: labels.exportMbox,
          click: () => sendMailAction({ type: 'command', id: 'mail:mbox' }),
        },
        { type: 'separator' },
        {
          label: labels.signatureEditor,
          click: () => sendMailAction({ type: 'command', id: 'mail:signature' }),
        },
      ],
    },
    {
      label: labels.sync,
      submenu: [
        {
          label: state.isSyncing ? labels.syncing : labels.syncNow,
          enabled: !state.isSyncing && hasAccount,
          click: () => sendMailAction({ type: 'command', id: 'sync:now' }),
        },
        {
          label: labels.historicalSync,
          enabled: !state.isSyncing && hasAccount,
          click: () => sendMailAction({ type: 'command', id: 'sync:historical' }),
        },
      ],
    },
    {
      label: labels.sidebarControl,
      submenu: [
        {
          label: labels.sidebarExpanded,
          type: 'radio',
          checked: state.sidebarMode === 'expanded',
          click: () => sendMailAction({ type: 'command', id: 'sidebar:expanded' }),
        },
        {
          label: labels.sidebarCollapsed,
          type: 'radio',
          checked: state.sidebarMode === 'collapsed',
          click: () => sendMailAction({ type: 'command', id: 'sidebar:collapsed' }),
        },
        {
          label: labels.sidebarHover,
          type: 'radio',
          checked: state.sidebarMode === 'hover',
          click: () => sendMailAction({ type: 'command', id: 'sidebar:hover' }),
        },
      ],
    },
  ]
}

/**
 * Builds native Folio menus (Scope / optional Groups / Folio).
 * Scope is Personal | Group only. Privileged accounts in group mode get a
 * separate Groups menu (Team / Map pattern) so macOS radio groups stay exclusive.
 * @param labels - Translated Folio item labels.
 * @param view - Live radios and enablement.
 * @returns Menu template fragments.
 */
function buildFolioMenus(
  labels: FolioMenuLabels,
  view: FolioMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_FOLIO_VIEW
  const menus: MenuItemConstructorOptions[] = [
    {
      label: labels.scope,
      submenu: [
        {
          label: labels.personal,
          type: 'radio',
          checked: state.mode === 'personal',
          click: () => sendFolioAction({ type: 'command', id: 'scope:personal' }),
        },
        {
          label: labels.group,
          type: 'radio',
          checked: state.mode === 'group',
          click: () => sendFolioAction({ type: 'command', id: 'scope:group' }),
        },
      ],
    },
  ]
  if (state.mode === 'group' && state.canSwitchGroups && state.groups.length > 0) {
    menus.push({
      label: labels.groupsMenu,
      submenu: state.groups.map((group) => ({
        label: group.label,
        type: 'radio' as const,
        checked: group.id === state.selectedGroupId,
        click: () => sendFolioAction({ type: 'select-group', groupId: group.id }),
      })),
    })
  }
  menus.push({
    label: labels.folio,
    submenu: [
      {
        label: labels.newPage,
        enabled: state.canCreate,
        click: () => sendFolioAction({ type: 'command', id: 'page:new' }),
      },
      {
        label: labels.moveToGroup,
        enabled: state.hasSelection && state.canMoveToGroup,
        click: () => sendFolioAction({ type: 'command', id: 'page:move-to-group' }),
      },
      {
        label: labels.copyToPersonal,
        enabled: state.hasSelection && state.canCopyToPersonal,
        click: () => sendFolioAction({ type: 'command', id: 'page:copy-to-personal' }),
      },
      {
        label: labels.deletePage,
        enabled: state.hasSelection && state.canDelete,
        click: () => sendFolioAction({ type: 'command', id: 'page:delete' }),
      },
    ],
  })
  return menus
}

/**
 * Builds native Office menus (Scope / optional Groups / Office feature).
 * Scope is Personal | Group only. Privileged accounts in group mode get a
 * separate Groups menu so macOS radio groups stay exclusive.
 * @param labels - Translated Office item labels.
 * @param view - Live radios and enablement.
 * @returns Menu template fragments.
 */
function buildOfficeMenus(
  labels: OfficeMenuLabels,
  view: OfficeMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_OFFICE_VIEW
  const menus: MenuItemConstructorOptions[] = [
    {
      label: labels.scope,
      submenu: [
        {
          label: labels.personal,
          type: 'radio',
          checked: state.mode === 'personal',
          click: () => sendOfficeAction({ type: 'command', id: 'scope:personal' }),
        },
        {
          label: labels.group,
          type: 'radio',
          checked: state.mode === 'group',
          click: () => sendOfficeAction({ type: 'command', id: 'scope:group' }),
        },
      ],
    },
  ]
  if (state.mode === 'group' && state.canSwitchGroups && state.groups.length > 0) {
    menus.push({
      label: labels.groupsMenu,
      submenu: state.groups.map((group) => ({
        label: group.label,
        type: 'radio' as const,
        checked: group.id === state.selectedGroupId,
        click: () => sendOfficeAction({ type: 'select-group', groupId: group.id }),
      })),
    })
  }
  menus.push({
    label: labels.office,
    submenu: [
      {
        label: labels.sidebarControl,
        submenu: [
          {
            label: labels.sidebarExpanded,
            type: 'radio',
            checked: state.sidebarMode === 'expanded',
            click: () => sendOfficeAction({ type: 'command', id: 'sidebar:expanded' }),
          },
          {
            label: labels.sidebarCollapsed,
            type: 'radio',
            checked: state.sidebarMode === 'collapsed',
            click: () => sendOfficeAction({ type: 'command', id: 'sidebar:collapsed' }),
          },
          {
            label: labels.sidebarHover,
            type: 'radio',
            checked: state.sidebarMode === 'hover',
            click: () => sendOfficeAction({ type: 'command', id: 'sidebar:hover' }),
          },
          {
            label: labels.sidebarHidden,
            type: 'radio',
            checked: state.sidebarMode === 'hidden',
            click: () => sendOfficeAction({ type: 'command', id: 'sidebar:hidden' }),
          },
        ],
      },
      { type: 'separator' },
      {
        label: labels.newFile,
        enabled: state.canCreate,
        click: () => sendOfficeAction({ type: 'command', id: 'file:new' }),
      },
      {
        label: labels.moveToGroup,
        enabled: state.hasSelection && state.canMoveToGroup,
        click: () => sendOfficeAction({ type: 'command', id: 'file:move-to-group' }),
      },
      {
        label: labels.copyToPersonal,
        enabled: state.hasSelection && state.canCopyToPersonal,
        click: () => sendOfficeAction({ type: 'command', id: 'file:copy-to-personal' }),
      },
      {
        label: labels.deleteFile,
        enabled: state.hasSelection && state.canDelete,
        click: () => sendOfficeAction({ type: 'command', id: 'file:delete' }),
      },
    ],
  })
  return menus
}

/**
 * Builds the always-on Edit menu so macOS delivers Cmd/Ctrl+Z/X/C/V/A to inputs.
 * Aura keeps custom undo/redo (editor history) plus Find / Replace.
 * @param labels - Desktop Edit labels.
 * @param aura - Aura labels when the Editor tab is active.
 * @returns Edit menu template.
 */
function buildEditMenu(
  labels: ApplicationMenuLabels,
  aura: AuraMenuLabels | undefined,
): MenuItemConstructorOptions {
  const undoRedo: MenuItemConstructorOptions[] = aura
    ? [
        {
          label: aura.undo,
          accelerator: 'CommandOrControl+Z',
          registerAccelerator: false,
          click: () => sendAuraAction('edit:undo'),
        },
        {
          label: aura.redo,
          accelerator: 'CommandOrControl+Y',
          registerAccelerator: false,
          click: () => sendAuraAction('edit:redo'),
        },
      ]
    : [
        { role: 'undo', label: labels.undo },
        { role: 'redo', label: labels.redo },
      ]

  const submenu: MenuItemConstructorOptions[] = [
    ...undoRedo,
    { type: 'separator' },
    { role: 'cut', label: aura?.cut ?? labels.cut },
    { role: 'copy', label: aura?.copy ?? labels.copy },
    { role: 'paste', label: aura?.paste ?? labels.paste },
    { role: 'selectAll', label: aura?.selectAll ?? labels.selectAll },
  ]

  if (aura) {
    submenu.push(
      { type: 'separator' },
      {
        label: aura.find,
        accelerator: 'CommandOrControl+F',
        registerAccelerator: false,
        click: () => sendAuraAction('edit:find'),
      },
      {
        label: aura.replace,
        accelerator: 'CommandOrControl+H',
        registerAccelerator: false,
        click: () => sendAuraAction('edit:replace'),
      },
    )
  }

  return { label: labels.edit, submenu }
}

/**
 * Builds native Aura menus (Scope / optional Groups / Library).
 * Scope is Personal | Group only. Privileged accounts in group mode get a
 * separate Groups menu so macOS radio groups stay exclusive (Folio/Office
 * pattern). File > New / Open / Save stay in the File menu; Library only
 * holds actions that need the active scope (move / copy / delete).
 * @param labels - Translated Aura Scope/Library item labels.
 * @param view - Live radios and enablement.
 * @returns Menu template fragments.
 */
function buildAuraLibraryMenus(
  labels: AuraLibraryMenuLabels,
  view: AuraLibraryMenuViewState | undefined,
): MenuItemConstructorOptions[] {
  const state = view ?? DEFAULT_AURA_LIBRARY_VIEW
  const menus: MenuItemConstructorOptions[] = [
    {
      label: labels.scope,
      submenu: [
        {
          label: labels.personal,
          type: 'radio',
          checked: state.mode === 'personal',
          click: () => sendAuraLibraryAction({ type: 'command', id: 'scope:personal' }),
        },
        {
          label: labels.group,
          type: 'radio',
          checked: state.mode === 'group',
          click: () => sendAuraLibraryAction({ type: 'command', id: 'scope:group' }),
        },
      ],
    },
  ]
  if (state.mode === 'group' && state.canSwitchGroups && state.groups.length > 0) {
    menus.push({
      label: labels.groupsMenu,
      submenu: state.groups.map((group) => ({
        label: group.label,
        type: 'radio' as const,
        checked: group.id === state.selectedGroupId,
        click: () => sendAuraLibraryAction({ type: 'select-group', groupId: group.id }),
      })),
    })
  }
  menus.push({
    label: labels.library,
    submenu: [
      {
        label: labels.moveToGroup,
        enabled: state.hasSelection && state.canMoveToGroup,
        click: () => sendAuraLibraryAction({ type: 'command', id: 'library:move-to-group' }),
      },
      {
        label: labels.copyToPersonal,
        enabled: state.hasSelection && state.canCopyToPersonal,
        click: () => sendAuraLibraryAction({ type: 'command', id: 'library:copy-to-personal' }),
      },
      {
        label: labels.deleteFile,
        enabled: state.hasSelection && state.canDelete,
        click: () => sendAuraLibraryAction({ type: 'command', id: 'library:delete' }),
      },
    ],
  })
  return menus
}

/**
 * Builds Aura Format / View menus (only while the Editor tab is active).
 * @param aura - Translated Aura labels.
 * @param view - Sidebar / source / focus checkbox state.
 * @returns Menu template fragments.
 */
function buildAuraMenus(
  aura: AuraMenuLabels,
  view: AuraViewState | undefined,
): MenuItemConstructorOptions[] {
  const item = (
    label: string,
    action: AuraMenuAction,
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => sendAuraAction(action),
  })

  const sidebarEnabled = Boolean(view?.outlineCollapsible && !view.sourceMode)
  const sidebarVisible = Boolean(view && !view.sidebarCollapsed && !view.sourceMode)

  return [
    {
      label: aura.format,
      submenu: [
        item(aura.bold, 'format:bold', 'CommandOrControl+B'),
        item(aura.italic, 'format:italic', 'CommandOrControl+I'),
        item(aura.strike, 'format:strike'),
        { type: 'separator' },
        item(aura.h1, 'format:h1'),
        item(aura.h2, 'format:h2'),
        item(aura.h3, 'format:h3'),
      ],
    },
    {
      label: aura.view,
      submenu: [
        {
          label: aura.toggleSidebar,
          type: 'checkbox',
          checked: sidebarVisible,
          enabled: sidebarEnabled,
          click: () => sendAuraAction('view:toggle-sidebar'),
        },
        item(aura.filesPanel, 'view:sidebar-files'),
        item(aura.outline, 'view:sidebar-outline'),
        { type: 'separator' },
        {
          label: aura.sourceMode,
          type: 'checkbox',
          checked: Boolean(view?.sourceMode),
          accelerator: 'Control+.',
          registerAccelerator: false,
          click: () => sendAuraAction('view:toggle-source'),
        },
        {
          label: aura.focusMode,
          type: 'checkbox',
          checked: Boolean(view?.focusMode),
          enabled: !view?.sourceMode,
          click: () => sendAuraAction('view:toggle-focus'),
        },
      ],
    },
  ]
}

/**
 * Builds the Aura word-count menu (read-only stats).
 * @param wordCount - Translated metric labels.
 * @returns Menu template fragment.
 */
function buildAuraWordCountMenu(
  wordCount: AuraWordCountLabels,
): MenuItemConstructorOptions {
  return {
    label: wordCount.menu,
    submenu: [
      { label: wordCount.readingTime, enabled: false },
      { label: wordCount.lines, enabled: false },
      { label: wordCount.words, enabled: false },
      { label: wordCount.characters, enabled: false },
    ],
  }
}

/**
 * Builds one Go-menu item for a feature page.
 * @param id - Feature id.
 * @param labels - Translated labels.
 * @param signedIn - Whether navigation is allowed.
 * @param screen - Current title-bar screen.
 * @returns Menu item.
 */
function goFeatureItem(
  id: MenuFeatureId,
  labels: ApplicationMenuLabels,
  signedIn: boolean,
  screen: string,
): MenuItemConstructorOptions {
  return {
    label: labels[id],
    type: 'checkbox',
    checked: screen === id,
    enabled: signedIn,
    click: () => sendNavigate(id),
  }
}

/**
 * Builds the darwin application menu template.
 * @param state - Current screen, entitlements, and labels.
 * @returns Electron menu template.
 */
function buildDarwinTemplate(state: ApplicationMenuState): MenuItemConstructorOptions[] {
  const {
    signedIn,
    screen,
    canCloseTab,
    canOpenSave,
    language,
    labels,
    auraLabels,
    auraView,
    auraWordCount,
    auraLibraryLabels,
    auraLibraryView,
    mapLabels,
    mapView,
    mailLabels,
    mailView,
    folioLabels,
    folioView,
    officeLabels,
    officeView,
    chatLabels,
    chatView,
    clashLabels,
    clashView,
    ordersLabels,
    ordersView,
    calendarLabels,
    calendarView,
    teamLabels,
    teamView,
  } = state
  const auraActive = screen === 'aura' && Boolean(auraLabels)
  const mapActive = screen === 'map' && Boolean(mapLabels)
  const mailActive = screen === 'mail' && Boolean(mailLabels)
  const folioActive = isFolioScreen(screen) && Boolean(folioLabels)
  const officeActive = isOfficeScreen(screen) && Boolean(officeLabels)
  const chatActive = screen === 'chat' && Boolean(chatLabels)
  const clashActive = isSidebarControlScreen(screen) && Boolean(clashLabels)
  const ordersActive = screen === 'orders' && Boolean(ordersLabels)
  const calendarActive = screen === 'calendar' && Boolean(calendarLabels)
  const teamActive = screen === 'team' && Boolean(teamLabels)

  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: labels.closeTab,
      accelerator: CLOSE_TAB_ACCELERATOR,
      enabled: signedIn && canCloseTab,
      click: () => sendFileAction('close-tab'),
    },
    { type: 'separator' },
  ]

  if (auraActive && auraLabels) {
    fileSubmenu.push(
      {
        label: auraLabels.new,
        accelerator: 'CommandOrControl+N',
        registerAccelerator: false,
        click: () => sendAuraAction('file:new'),
      },
      {
        label: labels.open,
        accelerator: 'CommandOrControl+O',
        registerAccelerator: false,
        click: () => sendAuraAction('file:open'),
      },
      {
        label: labels.save,
        accelerator: 'CommandOrControl+S',
        registerAccelerator: false,
        click: () => sendAuraAction('file:save'),
      },
      { type: 'separator' },
      {
        label: auraLabels.exportMarkdown,
        click: () => sendAuraAction('export:markdown'),
      },
      {
        label: auraLabels.exportHtml,
        click: () => sendAuraAction('export:html'),
      },
    )
  } else {
    fileSubmenu.push(
      {
        label: labels.open,
        accelerator: 'CommandOrControl+O',
        enabled: signedIn && canOpenSave,
        click: () => sendFileAction('open'),
      },
      {
        label: labels.save,
        accelerator: 'CommandOrControl+S',
        enabled: signedIn && canOpenSave,
        click: () => sendFileAction('save'),
      },
    )
  }

  return [
    {
      label: APP_DISPLAY_NAME,
      submenu: [
        { role: 'about', label: labels.about },
        { type: 'separator' },
        {
          label: labels.language,
          submenu: [
            {
              label: labels.languageEn,
              type: 'radio',
              checked: language === 'en',
              click: () => sendLanguage('en'),
            },
            {
              label: labels.languageZhTw,
              type: 'radio',
              checked: language === 'zh-TW',
              click: () => sendLanguage('zh-TW'),
            },
            {
              label: labels.languageZhCn,
              type: 'radio',
              checked: language === 'zh-CN',
              click: () => sendLanguage('zh-CN'),
            },
          ],
        },
        {
          label: labels.settings,
          accelerator: SETTINGS_ACCELERATOR,
          enabled: signedIn,
          click: () => sendNavigate('settings'),
        },
        {
          label: labels.signOut,
          enabled: signedIn,
          click: () => sendSignOut(),
        },
        { type: 'separator' },
        { role: 'hide', label: labels.hide },
        { role: 'hideOthers', label: labels.hideOthers },
        { role: 'unhide', label: labels.showAll },
        { type: 'separator' },
        { role: 'quit', label: labels.quit, accelerator: QUIT_ACCELERATOR },
        { role: 'minimize', visible: false },
        { role: 'togglefullscreen', visible: false },
      ],
    },
    {
      label: labels.file,
      submenu: fileSubmenu,
    },
    buildEditMenu(labels, auraActive ? auraLabels : undefined),
    ...(auraActive && auraLibraryLabels
      ? buildAuraLibraryMenus(auraLibraryLabels, auraLibraryView)
      : []),
    ...(auraActive && auraLabels ? buildAuraMenus(auraLabels, auraView) : []),
    ...(auraActive && auraWordCount ? [buildAuraWordCountMenu(auraWordCount)] : []),
    ...(mapActive && mapLabels
      ? buildMapMenus('Map', mapLabels, mapView)
      : []),
    ...(mailActive && mailLabels ? buildMailMenus(mailLabels, mailView) : []),
    ...(folioActive && folioLabels ? buildFolioMenus(folioLabels, folioView) : []),
    ...(officeActive && officeLabels ? buildOfficeMenus(officeLabels, officeView) : []),
    ...(calendarActive && calendarLabels ? buildCalendarMenus(calendarLabels, calendarView) : []),
    ...(teamActive && teamLabels ? buildTeamMenus(teamLabels, teamView) : []),
    ...(chatActive && chatLabels ? buildChatMenus(chatLabels, chatView) : []),
    ...(clashActive && clashLabels ? buildClashMenus(clashLabels, clashView) : []),
    ...(ordersActive && ordersLabels ? buildOrdersMenus(ordersLabels, ordersView) : []),
    {
      label: labels.go,
      submenu: [
        {
          label: labels.spotlight,
          accelerator: SPOTLIGHT_ACCELERATOR,
          registerAccelerator: false,
          enabled: signedIn,
          click: () => {
            void toggleSpotlight()
          },
        },
        {
          label: labels.agentOverlay,
          accelerator: AGENT_OVERLAY_ACCELERATOR,
          registerAccelerator: false,
          enabled: signedIn,
          click: () => {
            void toggleAgentOverlay()
          },
        },
        { type: 'separator' },
        {
          label: labels.home,
          type: 'checkbox',
          checked: screen === 'home',
          enabled: signedIn,
          accelerator: 'CommandOrControl+Shift+H',
          click: () => sendNavigate('home'),
        },
        { type: 'separator' },
        ...MENU_FEATURE_IDS.filter((id) =>
          (state.allowedGoFeatures ?? []).includes(id),
        ).map((id) => goFeatureItem(id, labels, signedIn, screen)),
      ],
    },
  ]
}

/**
 * Quits the app, bypassing Windows close-to-tray when needed.
 * @returns Nothing.
 */
function quitApplication(): void {
  if (process.platform === 'win32') {
    quitWindowsApp()
    return
  }
  app.quit()
}

/**
 * Builds a hidden Windows / Linux application menu that still registers
 * Settings / Close Tab / Quit accelerators (menu bar stays invisible).
 * @param state - Current screen, entitlements, and labels.
 * @returns Menu template.
 */
function buildNonDarwinTemplate(state: ApplicationMenuState): MenuItemConstructorOptions[] {
  const { signedIn, canCloseTab, labels } = state
  return [
    {
      label: APP_DISPLAY_NAME,
      submenu: [
        {
          label: labels.settings,
          accelerator: SETTINGS_ACCELERATOR,
          enabled: signedIn,
          click: () => sendNavigate('settings'),
        },
        {
          label: labels.signOut,
          enabled: signedIn,
          click: () => sendSignOut(),
        },
        { type: 'separator' },
        {
          label: labels.quit,
          accelerator: QUIT_ACCELERATOR,
          click: () => quitApplication(),
        },
      ],
    },
    {
      label: labels.file,
      submenu: [
        {
          label: labels.agentOverlay,
          accelerator: AGENT_OVERLAY_ACCELERATOR,
          registerAccelerator: false,
          enabled: signedIn,
          click: () => {
            void toggleAgentOverlay()
          },
        },
        {
          label: labels.closeTab,
          accelerator: CLOSE_TAB_ACCELERATOR,
          enabled: signedIn && canCloseTab,
          click: () => sendFileAction('close-tab'),
        },
      ],
    },
    ...buildHiddenEditTemplate(labels),
  ]
}

/**
 * Hides the native menu bar on Windows / Linux so custom chrome stays alone,
 * while Edit accelerators from the application menu still fire.
 * @param win - Target window.
 * @returns Nothing.
 */
export function hideNonDarwinMenuBar(win: BrowserWindow): void {
  if (process.platform === 'darwin' || win.isDestroyed()) {
    return
  }
  win.setAutoHideMenuBar(true)
  win.setMenuBarVisibility(false)
}

/**
 * Builds a hidden Edit menu so Windows / Linux Ctrl+X/C/V/A reach inputs.
 * Undo / Redo stay unregistered so Aura's in-page keymap keeps Ctrl+Z/Y.
 * @param labels - Translated Edit labels.
 * @returns Menu template.
 */
function buildHiddenEditTemplate(
  labels: ApplicationMenuLabels,
): MenuItemConstructorOptions[] {
  return [
    {
      label: labels.edit,
      submenu: [
        { role: 'cut', label: labels.cut },
        { role: 'copy', label: labels.copy },
        { role: 'paste', label: labels.paste },
        { role: 'selectAll', label: labels.selectAll },
      ],
    },
  ]
}

/**
 * Rebuilds and installs the application menu for the current platform.
 * @returns Nothing.
 */
function applyApplicationMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildDarwinTemplate(menuState)))
    return
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildNonDarwinTemplate(menuState)))
  for (const win of BrowserWindow.getAllWindows()) {
    hideNonDarwinMenuBar(win)
  }
}

/**
 * Installs the native application menu (visible on macOS; hidden Edit on Windows / Linux).
 * @param getWindow - Resolves the main BrowserWindow.
 * @returns Nothing.
 */
export function setupApplicationMenu(getWindow: () => BrowserWindow | null): void {
  getMainWindow = getWindow
  applyApplicationMenu()
}

/**
 * Current renderer-reported UI language, for main-process text that cannot
 * reach the renderer's i18next instance (e.g. native OS notifications).
 * @returns The last language sent via {@link updateApplicationMenuState}.
 */
export function getActiveMenuLanguage(): AppMenuLanguage {
  return menuState.language
}

/**
 * Stable fingerprint so Leaflet/map re-renders do not rebuild the native menu.
 * @param state - Sanitized menu state.
 * @returns JSON key.
 */
function applicationMenuFingerprint(state: ApplicationMenuState): string {
  return JSON.stringify({
    signedIn: state.signedIn,
    screen: state.screen,
    canCloseTab: state.canCloseTab,
    canOpenSave: state.canOpenSave,
    language: state.language,
    allowedGoFeatures: state.allowedGoFeatures ?? [],
    labels: state.labels,
    auraLabels: state.auraLabels,
    auraView: state.auraView,
    auraWordCount: state.auraWordCount,
    auraLibraryLabels: state.auraLibraryLabels,
    auraLibraryView: state.auraLibraryView,
    mapLabels: state.mapLabels,
    mapView: state.mapView,
    mailLabels: state.mailLabels,
    mailView: state.mailView,
    folioLabels: state.folioLabels,
    folioView: state.folioView,
    officeLabels: state.officeLabels,
    officeView: state.officeView,
    chatLabels: state.chatLabels,
    chatView: state.chatView,
    clashLabels: state.clashLabels,
    clashView: state.clashView,
    ordersLabels: state.ordersLabels,
    ordersView: state.ordersView,
    calendarLabels: state.calendarLabels,
    calendarView: state.calendarView,
    teamLabels: state.teamLabels,
    teamView: state.teamView,
  })
}

/**
 * Updates checkmarks and File enablement from the renderer.
 * @param next - Latest menu state.
 * @returns Nothing.
 */
export function updateApplicationMenuState(next: ApplicationMenuState): void {
  const allowedGoFeatures = Array.isArray(next.allowedGoFeatures)
    ? next.allowedGoFeatures.filter((id): id is MenuFeatureId =>
        (MENU_FEATURE_IDS as readonly string[]).includes(id),
      )
    : []
  menuState = {
    signedIn: Boolean(next.signedIn),
    screen: typeof next.screen === 'string' ? next.screen : 'home',
    canCloseTab: Boolean(next.canCloseTab),
    canOpenSave: Boolean(next.canOpenSave),
    language: isAppMenuLanguage(next.language) ? next.language : 'en',
    allowedGoFeatures,
    labels: {
      ...DEFAULT_LABELS,
      ...next.labels,
    },
    auraLabels:
      next.screen === 'aura'
        ? { ...DEFAULT_AURA_LABELS, ...next.auraLabels }
        : undefined,
    auraView: next.screen === 'aura' ? next.auraView : undefined,
    auraWordCount:
      next.screen === 'aura'
        ? { ...DEFAULT_AURA_WORD_COUNT, ...next.auraWordCount }
        : undefined,
    auraLibraryLabels:
      next.screen === 'aura' ? sanitizeAuraLibraryLabels(next.auraLibraryLabels) : undefined,
    auraLibraryView:
      next.screen === 'aura' ? sanitizeAuraLibraryView(next.auraLibraryView) : undefined,
    mapLabels: next.screen === 'map' ? sanitizeMapLabels(next.mapLabels) : undefined,
    mapView: next.screen === 'map' ? sanitizeMapView(next.mapView) : undefined,
    mailLabels: next.screen === 'mail' ? sanitizeMailLabels(next.mailLabels) : undefined,
    mailView: next.screen === 'mail' ? sanitizeMailView(next.mailView) : undefined,
    folioLabels: isFolioScreen(next.screen)
      ? sanitizeFolioLabels(next.folioLabels)
      : undefined,
    folioView: isFolioScreen(next.screen) ? sanitizeFolioView(next.folioView) : undefined,
    officeLabels: isOfficeScreen(next.screen)
      ? sanitizeOfficeLabels(next.officeLabels)
      : undefined,
    officeView: isOfficeScreen(next.screen) ? sanitizeOfficeView(next.officeView) : undefined,
    chatLabels: next.screen === 'chat' ? sanitizeChatLabels(next.chatLabels) : undefined,
    chatView: next.screen === 'chat' ? sanitizeChatView(next.chatView) : undefined,
    clashLabels: isSidebarControlScreen(next.screen)
      ? sanitizeClashLabels(next.clashLabels)
      : undefined,
    clashView: isSidebarControlScreen(next.screen)
      ? sanitizeClashView(next.clashView)
      : undefined,
    ordersLabels: next.screen === 'orders' ? sanitizeOrdersLabels(next.ordersLabels) : undefined,
    ordersView: next.screen === 'orders' ? sanitizeOrdersView(next.ordersView) : undefined,
    calendarLabels:
      next.screen === 'calendar' ? sanitizeCalendarLabels(next.calendarLabels) : undefined,
    calendarView: next.screen === 'calendar' ? sanitizeCalendarView(next.calendarView) : undefined,
    teamLabels: next.screen === 'team' ? sanitizeTeamLabels(next.teamLabels) : undefined,
    teamView: next.screen === 'team' ? sanitizeTeamView(next.teamView) : undefined,
  }
  const fingerprint = applicationMenuFingerprint(menuState)
  if (fingerprint === lastMenuFingerprint) {
    return
  }
  lastMenuFingerprint = fingerprint
  applyApplicationMenu()
  if (process.platform === 'darwin') {
    updateDarwinTrayMenu({ signedIn: menuState.signedIn, labels: menuState.labels })
  } else if (process.platform === 'win32') {
    updateWindowsTrayMenu({ signedIn: menuState.signedIn, labels: menuState.labels })
  }
}
