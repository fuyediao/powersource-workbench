/**
 * Canonical Admin / feature module keys shared with Supabase
 * `group_module_access` / `global_leader_module_access` (RBAC rewrite).
 *
 * Keep in sync with the `module_key` CHECK constraints (incl. `folio` /
 * `calendar`). Electron Function sidebars ({@link ADMIN_CRM_NAV_GROUPS} and
 * Orders / Products / NEXDOT / T&E groups) are subsets: Dashboard, Mail,
 * Communication, Messages, and Team stay grantable here but are not Admin CRM
 * nav rows (other desktop features). Map list/views (`favorites`,
 * `customer_map`, `crm_map`, competitor map) are Settings-only for now
 * (`competitor_map` also gates competitor list in the sidebar).
 */
export const ADMIN_MODULE_KEYS = [
  'dashboard',
  'sales_board',
  'customers',
  'contacts',
  'leads',
  'visit_log',
  'opportunities',
  'follow_ups',
  'mail',
  'communication',
  'communication_inbox',
  'kol',
  'agent',
  'obm',
  'obm_users',
  'media',
  'orders_crm',
  'orders_obm',
  'orders_te',
  'product_catalog',
  'obm_products',
  'te_products',
  'te',
  'te_users',
  'te_community',
  'favorites',
  'customer_map',
  'crm_map',
  'competitor_map',
  'team',
  'folio',
  'calendar',
] as const

export type AdminModuleKey = (typeof ADMIN_MODULE_KEYS)[number]

/**
 * Sidebar modules that never take a per-member create / edit / delete grant.
 * Mail is driven by `/mail/*` and does not use `canWriteModule`.
 * Sales Board is a read-only aggregate view.
 */
export const ADMIN_MODULES_WITHOUT_MEMBER_WRITES = [
  'mail',
  'sales_board',
] as const satisfies readonly AdminModuleKey[]

/**
 * Whether a sidebar module may appear in the member write-grant editor.
 * @param key - Admin module key.
 * @returns False for visibility-only modules.
 */
export function isMemberWriteGrantableModule(key: AdminModuleKey): boolean {
  return !(ADMIN_MODULES_WITHOUT_MEMBER_WRITES as readonly AdminModuleKey[]).includes(key)
}

/** Mutation kinds a member write grant can cover. */
export const MODULE_WRITE_ACTIONS = ['insert', 'update', 'delete'] as const

export type ModuleWriteAction = (typeof MODULE_WRITE_ACTIONS)[number]

/** Composite `module:action` key used by the write-grant editor. */
export type ModuleWriteGrantKey = `${AdminModuleKey}:${ModuleWriteAction}`

/** i18n label key for each write action. */
export const MODULE_WRITE_ACTION_LABEL_KEYS: Record<ModuleWriteAction, string> = {
  insert: 'settings.group.admin.memberWrites.actionInsert',
  update: 'settings.group.admin.memberWrites.actionUpdate',
  delete: 'settings.group.admin.memberWrites.actionDelete',
}

/**
 * Build the composite grant key for a module + action pair.
 * @param moduleKey - Admin module key.
 * @param action - Write action.
 * @returns Stable `module:action` composite key.
 */
export function moduleWriteGrantKey(
  moduleKey: AdminModuleKey,
  action: ModuleWriteAction,
): ModuleWriteGrantKey {
  return `${moduleKey}:${action}`
}

/**
 * Electron i18n label keys for admin modules (under `settings.adminModules.*`).
 */
export const ADMIN_MODULE_LABEL_KEYS: Record<AdminModuleKey, string> = {
  dashboard: 'settings.adminModules.dashboard',
  sales_board: 'settings.adminModules.salesBoard',
  customers: 'settings.adminModules.customers',
  contacts: 'settings.adminModules.contacts',
  leads: 'settings.adminModules.leads',
  visit_log: 'settings.adminModules.visitLog',
  opportunities: 'settings.adminModules.opportunities',
  follow_ups: 'settings.adminModules.followUps',
  mail: 'settings.adminModules.mail',
  communication: 'settings.adminModules.communication',
  communication_inbox: 'settings.adminModules.communicationInbox',
  kol: 'settings.adminModules.kol',
  agent: 'settings.adminModules.agent',
  obm: 'settings.adminModules.obm',
  obm_users: 'settings.adminModules.obmUsers',
  media: 'settings.adminModules.media',
  orders_crm: 'settings.adminModules.ordersCrm',
  orders_obm: 'settings.adminModules.ordersObm',
  orders_te: 'settings.adminModules.ordersTe',
  product_catalog: 'settings.adminModules.productCatalog',
  obm_products: 'settings.adminModules.obmProducts',
  te_products: 'settings.adminModules.teProducts',
  te: 'settings.adminModules.te',
  te_users: 'settings.adminModules.teUsers',
  te_community: 'settings.adminModules.teCommunity',
  favorites: 'settings.adminModules.favorites',
  customer_map: 'settings.adminModules.customerMap',
  crm_map: 'settings.adminModules.crmMap',
  competitor_map: 'settings.adminModules.competitorMap',
  team: 'settings.adminModules.team',
  folio: 'settings.adminModules.folio',
  calendar: 'settings.adminModules.calendar',
}

/**
 * Type guard for known admin module keys.
 * @param value - Raw module_key string.
 * @returns Whether the value is a known {@link AdminModuleKey}.
 */
export function isAdminModuleKey(value: string): value is AdminModuleKey {
  return (ADMIN_MODULE_KEYS as readonly string[]).includes(value)
}

/**
 * One entry in the Electron Admin CRM sidebar.
 */
export type AdminNavItem = {
  path: string
  moduleKey: AdminModuleKey
  labelKey: string
}

/**
 * Path → module key for Function-app gating (flat kebab-case; Electron-only,
 * not workbench-web routes). CRM stays under `/admin/...`; Orders / Products /
 * NEXDOT / T&E Admin use their own prefixes. DB `module_key` values may still
 * use the legacy `obm*` names.
 */
export const ADMIN_MODULE_PATH_MAP: Record<string, AdminModuleKey> = {
  '/admin/customers': 'customers',
  '/admin/contacts': 'contacts',
  '/admin/leads': 'leads',
  '/admin/visit-log': 'visit_log',
  '/admin/opportunities-list': 'opportunities',
  '/admin/follow-ups': 'follow_ups',
  '/kanban/workbench': 'dashboard',
  '/kanban/opportunities': 'opportunities',
  '/kanban/sales': 'sales_board',
  '/admin/kol': 'kol',
  '/admin/agent': 'agent',
  '/admin/competitor-list': 'competitor_map',
  '/orders/crm': 'orders_crm',
  '/orders/nexdot': 'orders_obm',
  '/orders/te': 'orders_te',
  '/products/catalog': 'product_catalog',
  '/products/nexdot': 'obm_products',
  '/products/te': 'te_products',
  '/nexdot': 'obm',
  '/nexdot/users': 'obm_users',
  '/te-admin': 'te',
  '/te-admin/users': 'te_users',
  '/te-admin/community': 'te_community',
  '/te-admin/marketing': 'te',
  '/te-admin/partner-departments': 'te',
  '/te-admin/media': 'media',
}

/**
 * Resolves a Function sidebar path to a whitelist module key.
 * @param path - Absolute module path (or prefix).
 * @returns Module key, or null when unmapped.
 */
export function resolveAdminModuleKey(path: string): AdminModuleKey | null {
  const withoutQuery = (path.split('#')[0] ?? path).split('?')[0] ?? path
  const normalized = withoutQuery.toLowerCase().replace(/\/+$/, '') || '/'
  if (ADMIN_MODULE_PATH_MAP[normalized]) {
    return ADMIN_MODULE_PATH_MAP[normalized]
  }
  let best: string | null = null
  for (const candidate of Object.keys(ADMIN_MODULE_PATH_MAP)) {
    if (normalized.startsWith(`${candidate}/`) && (!best || candidate.length > best.length)) {
      best = candidate
    }
  }
  return best ? (ADMIN_MODULE_PATH_MAP[best] ?? null) : null
}

/**
 * Grouped CRM sidebar nav for Electron Admin (Settings-only `folio` /
 * `calendar` / map keys are not listed here). Classic CRM only — Orders /
 * Products / NEXDOT / T&E live in their own Home Function apps.
 */
export const ADMIN_CRM_NAV_GROUPS: AdminNavItem[][] = [
  [
    { path: '/admin/customers', moduleKey: 'customers', labelKey: 'admin.sidebar.customers' },
    { path: '/admin/contacts', moduleKey: 'contacts', labelKey: 'admin.sidebar.contacts' },
  ],
  [
    { path: '/admin/leads', moduleKey: 'leads', labelKey: 'admin.sidebar.leadsTable' },
    { path: '/admin/visit-log', moduleKey: 'visit_log', labelKey: 'admin.sidebar.visitLog' },
    {
      path: '/admin/opportunities-list',
      moduleKey: 'opportunities',
      labelKey: 'admin.sidebar.opportunitiesList',
    },
    { path: '/admin/follow-ups', moduleKey: 'follow_ups', labelKey: 'admin.sidebar.followUps' },
  ],
  [
    { path: '/admin/kol', moduleKey: 'kol', labelKey: 'admin.sidebar.kol' },
    { path: '/admin/agent', moduleKey: 'agent', labelKey: 'admin.sidebar.agent' },
    { path: '/admin/competitor-list', moduleKey: 'competitor_map', labelKey: 'admin.sidebar.competitorList' },
  ],
]

/**
 * Kanban (看板) Home Function sidebar: workbench + opportunity board + sales board.
 * Visibility is filtered per `moduleKey` via `group_module_access`.
 */
export const KANBAN_NAV_GROUPS: AdminNavItem[][] = [
  [
    {
      path: '/kanban/workbench',
      moduleKey: 'dashboard',
      labelKey: 'kanban.sidebar.workbench',
    },
    {
      path: '/kanban/opportunities',
      moduleKey: 'opportunities',
      labelKey: 'kanban.sidebar.opportunities',
    },
    {
      path: '/kanban/sales',
      moduleKey: 'sales_board',
      labelKey: 'kanban.sidebar.sales',
    },
  ],
]

/** Orders Home Function sidebar. */
export const ORDERS_NAV_GROUPS: AdminNavItem[][] = [
  [
    { path: '/orders/crm', moduleKey: 'orders_crm', labelKey: 'admin.sidebar.ordersCrm' },
    { path: '/orders/nexdot', moduleKey: 'orders_obm', labelKey: 'admin.sidebar.ordersObm' },
    { path: '/orders/te', moduleKey: 'orders_te', labelKey: 'admin.sidebar.ordersTe' },
  ],
]

/** Products Home Function sidebar. */
export const PRODUCTS_NAV_GROUPS: AdminNavItem[][] = [
  [
    { path: '/products/catalog', moduleKey: 'product_catalog', labelKey: 'admin.sidebar.productCatalog' },
    { path: '/products/nexdot', moduleKey: 'obm_products', labelKey: 'admin.sidebar.obmProducts' },
    { path: '/products/te', moduleKey: 'te_products', labelKey: 'admin.sidebar.teProducts' },
  ],
]

/** NEXDOT Home Function sidebar (legacy module keys remain `obm` / `obm_users`). */
export const NEXDOT_NAV_GROUPS: AdminNavItem[][] = [
  [
    { path: '/nexdot', moduleKey: 'obm', labelKey: 'admin.sidebar.obm' },
    { path: '/nexdot/users', moduleKey: 'obm_users', labelKey: 'admin.sidebar.obmUsers' },
  ],
]

/** T&E Admin Home Function sidebar (`workbench://te-admin`). */
export const TE_ADMIN_NAV_GROUPS: AdminNavItem[][] = [
  [
    { path: '/te-admin', moduleKey: 'te', labelKey: 'admin.sidebar.te' },
    { path: '/te-admin/users', moduleKey: 'te_users', labelKey: 'admin.sidebar.teUsers' },
    { path: '/te-admin/community', moduleKey: 'te_community', labelKey: 'admin.sidebar.teCommunity' },
    { path: '/te-admin/marketing', moduleKey: 'te', labelKey: 'admin.sidebar.teMarketing' },
    { path: '/te-admin/partner-departments', moduleKey: 'te', labelKey: 'admin.sidebar.tePartnerDepartments' },
    { path: '/te-admin/media', moduleKey: 'media', labelKey: 'admin.sidebar.sharedMedia' },
  ],
]

/**
 * @deprecated Prefer {@link NEXDOT_NAV_GROUPS}.
 */
export const OBM_NAV_GROUPS: AdminNavItem[][] = NEXDOT_NAV_GROUPS

/**
 * @deprecated Prefer {@link ADMIN_CRM_NAV_GROUPS}; alias kept for callers.
 */
export const ADMIN_NAV_GROUPS: AdminNavItem[][] = ADMIN_CRM_NAV_GROUPS
