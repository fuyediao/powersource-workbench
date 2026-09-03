/**
 * Desktop (Electron) entry keys and domain write resources.
 * Independent of web `group_module_access` / `group_member_module_writes`.
 * Keep in sync with desktop module-key CHECK constraints
 * (`20260812_desktop_module_access.sql`, `20260815_desktop_clash.sql`,
 * `20260826_desktop_kanban_boards.sql`, `20260831_desktop_agent.sql`).
 */

import type { FeatureTabId } from '@/constants/feature-tabs'
import type { ModuleWriteAction } from '@/constants/admin-modules'

/** Home Function entry keys (Settings has no key). */
export const DESKTOP_FUNCTION_KEYS = [
  'desktop_chat',
  'desktop_messages',
  'desktop_mail',
  'desktop_calendar',
  'desktop_kanban',
  'desktop_map',
  'desktop_admin',
  'desktop_orders',
  'desktop_products',
  'desktop_nexdot',
  'desktop_te_admin',
  'desktop_team',
  'desktop_aura',
  'desktop_folio',
  'desktop_docs',
  'desktop_sheets',
  'desktop_slides',
  'desktop_clash',
  'desktop_agent',
] as const

export type DesktopFunctionKey = (typeof DESKTOP_FUNCTION_KEYS)[number]

/** Map layer keys (require `desktop_map` to enter the Map app). */
export const DESKTOP_MAP_LAYER_KEYS = [
  'desktop_map_favorites',
  'desktop_map_customers',
  'desktop_map_leads',
  'desktop_map_competitors',
] as const

export type DesktopMapLayerKey = (typeof DESKTOP_MAP_LAYER_KEYS)[number]

/**
 * Kanban board keys (require `desktop_kanban` to enter the Kanban app).
 * Same pattern as map layers: Function entry + per-board toggles.
 */
export const DESKTOP_KANBAN_BOARD_KEYS = [
  'desktop_kanban_workbench',
  'desktop_kanban_opportunities',
  'desktop_kanban_sales',
] as const

export type DesktopKanbanBoardKey = (typeof DESKTOP_KANBAN_BOARD_KEYS)[number]

/** All desktop entry keys (Functions + map layers + Kanban boards). */
export const DESKTOP_MODULE_KEYS = [
  ...DESKTOP_FUNCTION_KEYS,
  ...DESKTOP_MAP_LAYER_KEYS,
  ...DESKTOP_KANBAN_BOARD_KEYS,
] as const

export type DesktopModuleKey = (typeof DESKTOP_MODULE_KEYS)[number]

/**
 * Whether a string is a known desktop entry key.
 * @param value - Candidate key.
 * @returns Type predicate.
 */
export function isDesktopModuleKey(value: string): value is DesktopModuleKey {
  return (DESKTOP_MODULE_KEYS as readonly string[]).includes(value)
}

/**
 * Whether a string is a Home Function entry key (not a map layer).
 * @param value - Candidate key.
 * @returns Type predicate.
 */
export function isDesktopFunctionKey(value: string): value is DesktopFunctionKey {
  return (DESKTOP_FUNCTION_KEYS as readonly string[]).includes(value)
}

/**
 * Whether a string is a desktop map layer key.
 * @param value - Candidate key.
 * @returns Type predicate.
 */
export function isDesktopMapLayerKey(value: string): value is DesktopMapLayerKey {
  return (DESKTOP_MAP_LAYER_KEYS as readonly string[]).includes(value)
}

/**
 * Whether a string is a Kanban board entry key.
 * @param value - Candidate key.
 * @returns Type predicate.
 */
export function isDesktopKanbanBoardKey(value: string): value is DesktopKanbanBoardKey {
  return (DESKTOP_KANBAN_BOARD_KEYS as readonly string[]).includes(value)
}

/** Feature tab id → desktop Function entry key. */
export const FEATURE_TO_DESKTOP_ENTRY: Record<FeatureTabId, DesktopFunctionKey> = {
  chat: 'desktop_chat',
  mail: 'desktop_mail',
  calendar: 'desktop_calendar',
  aura: 'desktop_aura',
  harness: 'desktop_agent',
}

/** Home Function app tile id → desktop entry key (Settings omitted). */
export const FUNCTION_APP_TO_DESKTOP_ENTRY: Record<string, DesktopFunctionKey> = {
  'function-ask': 'desktop_chat',
  'function-mail': 'desktop_mail',
  'function-calendar': 'desktop_calendar',
  'function-aura': 'desktop_aura',
  'function-harness': 'desktop_agent',
}

/** Go-menu feature id → desktop entry key. */
export const GO_MENU_TO_DESKTOP_ENTRY: Record<string, DesktopFunctionKey> = {
  chat: 'desktop_chat',
  mail: 'desktop_mail',
  calendar: 'desktop_calendar',
  aura: 'desktop_aura',
  harness: 'desktop_agent',
}

/** Map sidebar source → desktop layer key (`map` explore has no layer key). */
export const MAP_SOURCE_TO_DESKTOP_LAYER: Record<
  'customer_map' | 'crm_map' | 'competitor_map' | 'favorites',
  DesktopMapLayerKey
> = {
  favorites: 'desktop_map_favorites',
  customer_map: 'desktop_map_customers',
  crm_map: 'desktop_map_leads',
  competitor_map: 'desktop_map_competitors',
}

/** Kanban sidebar path → desktop board key. */
export const KANBAN_PATH_TO_DESKTOP_BOARD: Record<string, DesktopKanbanBoardKey> = {
  '/kanban/workbench': 'desktop_kanban_workbench',
  '/kanban/opportunities': 'desktop_kanban_opportunities',
  '/kanban/sales': 'desktop_kanban_sales',
}

/**
 * Resolves a Kanban sidebar path to its desktop board entry key.
 * @param path - Absolute Kanban path (or nested under a board path).
 * @returns Board key, or null when unmapped.
 */
export function resolveKanbanDesktopBoardKey(path: string): DesktopKanbanBoardKey | null {
  const withoutQuery = (path.split('#')[0] ?? path).split('?')[0] ?? path
  const normalized = withoutQuery.toLowerCase().replace(/\/+$/, '') || '/'
  if (KANBAN_PATH_TO_DESKTOP_BOARD[normalized]) {
    return KANBAN_PATH_TO_DESKTOP_BOARD[normalized]
  }
  let best: string | null = null
  for (const candidate of Object.keys(KANBAN_PATH_TO_DESKTOP_BOARD)) {
    if (normalized.startsWith(`${candidate}/`) && (!best || candidate.length > best.length)) {
      best = candidate
    }
  }
  return best ? (KANBAN_PATH_TO_DESKTOP_BOARD[best] ?? null) : null
}

/** Desktop write domains (table suffix). */
export const DESKTOP_WRITE_DOMAINS = [
  'admin',
  'orders',
  'products',
  'nexdot',
  'te',
  'team',
  'folio',
  'aura',
  'calendar',
  'office',
] as const

export type DesktopWriteDomain = (typeof DESKTOP_WRITE_DOMAINS)[number]

/**
 * Domain → Function entry key(s) required before showing write grants. A
 * domain is open once at least one of its entry keys is granted (`office`
 * spans the three Docs/Sheets/Slides entries).
 */
export const DESKTOP_WRITE_DOMAIN_ENTRY: Record<DesktopWriteDomain, readonly DesktopFunctionKey[]> = {
  admin: ['desktop_admin'],
  orders: ['desktop_orders'],
  products: ['desktop_products'],
  nexdot: ['desktop_nexdot'],
  te: ['desktop_te_admin'],
  team: ['desktop_team'],
  folio: ['desktop_folio'],
  aura: ['desktop_aura'],
  calendar: ['desktop_calendar'],
  office: ['desktop_docs', 'desktop_sheets', 'desktop_slides'],
}

/** Supabase table name per write domain. */
export const DESKTOP_WRITE_TABLE: Record<DesktopWriteDomain, string> = {
  admin: 'group_desktop_writes_admin',
  orders: 'group_desktop_writes_orders',
  products: 'group_desktop_writes_products',
  nexdot: 'group_desktop_writes_nexdot',
  te: 'group_desktop_writes_te',
  team: 'group_desktop_writes_team',
  folio: 'group_desktop_writes_folio',
  aura: 'group_desktop_writes_aura',
  calendar: 'group_desktop_writes_calendar',
  office: 'group_desktop_writes_office',
}

/** Locked resource keys per write domain. */
export const DESKTOP_WRITE_RESOURCES: Record<DesktopWriteDomain, readonly string[]> = {
  admin: [
    'customers',
    'contacts',
    'leads',
    'visit_log',
    'opportunities',
    'follow_ups',
    'kol',
    'agent',
    'competitors',
  ],
  orders: ['crm', 'nexdot', 'te'],
  products: ['catalog', 'nexdot', 'te'],
  nexdot: ['management', 'users'],
  te: ['applications', 'users', 'community', 'media', 'departments'],
  team: ['boards'],
  folio: ['pages', 'databases'],
  aura: ['files'],
  calendar: ['calendars', 'events'],
  office: ['docs', 'sheets', 'slides'],
}

/** Composite grant key `domain:resource:action`. */
export type DesktopWriteGrantKey = `${DesktopWriteDomain}:${string}:${ModuleWriteAction}`

/**
 * Build a desktop write grant composite key.
 * @param domain - Write domain.
 * @param resourceKey - Resource within the domain.
 * @param action - Insert / update / delete.
 * @returns Composite key.
 */
export function desktopWriteGrantKey(
  domain: DesktopWriteDomain,
  resourceKey: string,
  action: ModuleWriteAction,
): DesktopWriteGrantKey {
  return `${domain}:${resourceKey}:${action}`
}

/**
 * Parse a desktop write grant composite key.
 * @param grant - Composite key.
 * @returns Parts, or null when invalid.
 */
export function parseDesktopWriteGrantKey(
  grant: string,
): { domain: DesktopWriteDomain; resourceKey: string; action: ModuleWriteAction } | null {
  const parts = grant.split(':')
  if (parts.length !== 3) {
    return null
  }
  const [domain, resourceKey, action] = parts
  if (
    !(DESKTOP_WRITE_DOMAINS as readonly string[]).includes(domain) ||
    (action !== 'insert' && action !== 'update' && action !== 'delete') ||
    !resourceKey
  ) {
    return null
  }
  const resources = DESKTOP_WRITE_RESOURCES[domain as DesktopWriteDomain]
  if (!resources.includes(resourceKey)) {
    return null
  }
  return {
    domain: domain as DesktopWriteDomain,
    resourceKey,
    action,
  }
}

/** i18n label keys for desktop Function / layer entry keys. */
export const DESKTOP_MODULE_LABEL_KEYS: Record<DesktopModuleKey, string> = {
  desktop_chat: 'settings.desktopModules.chat',
  desktop_messages: 'settings.desktopModules.messages',
  desktop_mail: 'settings.desktopModules.mail',
  desktop_calendar: 'settings.desktopModules.calendar',
  desktop_kanban: 'settings.desktopModules.kanban',
  desktop_map: 'settings.desktopModules.map',
  desktop_admin: 'settings.desktopModules.admin',
  desktop_orders: 'settings.desktopModules.orders',
  desktop_products: 'settings.desktopModules.products',
  desktop_nexdot: 'settings.desktopModules.nexdot',
  desktop_te_admin: 'settings.desktopModules.teAdmin',
  desktop_team: 'settings.desktopModules.team',
  desktop_aura: 'settings.desktopModules.aura',
  desktop_folio: 'settings.desktopModules.folio',
  desktop_docs: 'settings.desktopModules.docs',
  desktop_sheets: 'settings.desktopModules.sheets',
  desktop_slides: 'settings.desktopModules.slides',
  desktop_clash: 'settings.desktopModules.clash',
  desktop_agent: 'settings.desktopModules.harness',
  desktop_map_favorites: 'settings.desktopModules.mapFavorites',
  desktop_map_customers: 'settings.desktopModules.mapCustomers',
  desktop_map_leads: 'settings.desktopModules.mapLeads',
  desktop_map_competitors: 'settings.desktopModules.mapCompetitors',
  desktop_kanban_workbench: 'settings.desktopModules.kanbanWorkbench',
  desktop_kanban_opportunities: 'settings.desktopModules.kanbanOpportunities',
  desktop_kanban_sales: 'settings.desktopModules.kanbanSales',
}

/** i18n label keys for write domains. */
export const DESKTOP_WRITE_DOMAIN_LABEL_KEYS: Record<DesktopWriteDomain, string> = {
  admin: 'settings.desktopWrites.domains.admin',
  orders: 'settings.desktopWrites.domains.orders',
  products: 'settings.desktopWrites.domains.products',
  nexdot: 'settings.desktopWrites.domains.nexdot',
  te: 'settings.desktopWrites.domains.te',
  team: 'settings.desktopWrites.domains.team',
  folio: 'settings.desktopWrites.domains.folio',
  aura: 'settings.desktopWrites.domains.aura',
  calendar: 'settings.desktopWrites.domains.calendar',
  office: 'settings.desktopWrites.domains.office',
}

/** i18n label keys for write resources (`settings.desktopWrites.resources.*`). */
export const DESKTOP_WRITE_RESOURCE_LABEL_KEYS: Record<string, string> = {
  customers: 'settings.desktopWrites.resources.customers',
  contacts: 'settings.desktopWrites.resources.contacts',
  leads: 'settings.desktopWrites.resources.leads',
  visit_log: 'settings.desktopWrites.resources.visitLog',
  opportunities: 'settings.desktopWrites.resources.opportunities',
  follow_ups: 'settings.desktopWrites.resources.followUps',
  kol: 'settings.desktopWrites.resources.kol',
  agent: 'settings.desktopWrites.resources.agent',
  competitors: 'settings.desktopWrites.resources.competitors',
  crm: 'settings.desktopWrites.resources.crm',
  nexdot: 'settings.desktopWrites.resources.nexdot',
  te: 'settings.desktopWrites.resources.te',
  catalog: 'settings.desktopWrites.resources.catalog',
  management: 'settings.desktopWrites.resources.management',
  users: 'settings.desktopWrites.resources.users',
  applications: 'settings.desktopWrites.resources.applications',
  community: 'settings.desktopWrites.resources.community',
  media: 'settings.desktopWrites.resources.media',
  departments: 'settings.desktopWrites.resources.departments',
  boards: 'settings.desktopWrites.resources.boards',
  files: 'settings.desktopWrites.resources.files',
  pages: 'settings.desktopWrites.resources.pages',
  databases: 'settings.desktopWrites.resources.databases',
  calendars: 'settings.desktopWrites.resources.calendars',
  events: 'settings.desktopWrites.resources.events',
  docs: 'settings.desktopWrites.resources.docs',
  sheets: 'settings.desktopWrites.resources.sheets',
  slides: 'settings.desktopWrites.resources.slides',
}
