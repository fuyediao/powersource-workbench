import type { AppItem, Category } from '@/types/library'

/** Virtual rail category for built-in Workbench features (not stored in SQLite). */
export const FUNCTIONS_CATEGORY_ID = 'functions'

/** Persisted rail category for user websites (local SQLite). */
export const WEBSITES_CATEGORY_ID = 'websites'

/** Rail entry for Functions (frontend-only). */
export const FUNCTIONS_CATEGORY: Category = {
  id: FUNCTIONS_CATEGORY_ID,
  position: 0,
}

/**
 * Returns whether the category is the virtual Functions rail tab.
 * @param categoryId - Category id.
 * @returns True when Functions.
 */
export function isFunctionsCategory(categoryId: string): boolean {
  return categoryId === FUNCTIONS_CATEGORY_ID
}

/**
 * Manual Beta badge switches for built-in Functions (feature tiles only).
 * Set `true` to show the badge; `false` to hide it.
 * Site tiles (OA / ERP / NEXTORCH) are not included.
 */
export const FUNCTION_BETA_FLAGS = {
  'function-ask': false,
  'function-mail': false,
  'function-calendar': false,
  'function-harness': true,
  'function-settings': false,
} as const satisfies Record<string, boolean>

/**
 * Applies {@link FUNCTION_BETA_FLAGS} onto a built-in feature tile.
 * @param app - Feature app definition.
 * @returns App with `beta` set from the flags map.
 */
function withBetaFlag(app: AppItem): AppItem {
  const beta = FUNCTION_BETA_FLAGS[app.id as keyof typeof FUNCTION_BETA_FLAGS] === true
  return beta ? { ...app, beta: true } : { ...app, beta: false }
}

/**
 * Built-in Workbench feature tiles shown above the Functions panel divider.
 */
export const FUNCTION_FEATURE_APPS: AppItem[] = [
  {
    id: 'function-ask',
    categoryId: FUNCTIONS_CATEGORY_ID,
    position: 0,
    url: 'workbench://artificial-intelligence',
    name: 'functions.apps.ask',
  },
  {
    id: 'function-harness',
    categoryId: FUNCTIONS_CATEGORY_ID,
    position: 1,
    url: 'workbench://harness',
    name: 'functions.apps.harness',
  },
  {
    id: 'function-mail',
    categoryId: FUNCTIONS_CATEGORY_ID,
    position: 2,
    url: 'workbench://mail',
    name: 'functions.apps.mail',
  },
  {
    id: 'function-calendar',
    categoryId: FUNCTIONS_CATEGORY_ID,
    position: 3,
    url: 'workbench://calendar',
    name: 'functions.apps.calendar',
  },
  {
    id: 'function-settings',
    categoryId: FUNCTIONS_CATEGORY_ID,
    position: 4,
    url: 'workbench://settings',
    name: 'functions.apps.settings',
  },
].map(withBetaFlag)

/**
 * Built-in external site tiles (OA / ERP / NEXTORCH).
 * Shown below the Functions panel divider.
 */
export const FUNCTION_SITE_APPS: AppItem[] = [
  {
    id: 'function-oa',
    categoryId: FUNCTIONS_CATEGORY_ID,
    position: 0,
    url: 'workbench://oa',
    name: 'functions.apps.oa',
  },
  {
    id: 'function-erp',
    categoryId: FUNCTIONS_CATEGORY_ID,
    position: 1,
    url: 'workbench://erp',
    name: 'functions.apps.erp',
  },
  {
    id: 'function-nextorch',
    categoryId: FUNCTIONS_CATEGORY_ID,
    position: 2,
    url: 'https://www.nextorch.com/',
    name: 'functions.apps.nextorch',
  },
]

/**
 * External site tiles for the Functions panel.
 * @returns Site app list for the lower Functions grid.
 */
export function getFunctionSiteApps(): AppItem[] {
  return FUNCTION_SITE_APPS
}

/**
 * All built-in Function tiles (features then sites).
 * Feature tiles can be reordered per user in local SQLite; they cannot be
 * deleted. Site tiles stay in catalog order.
 * `name` is an i18n key under `functions.apps.*`.
 */
export const FUNCTION_APPS: AppItem[] = [...FUNCTION_FEATURE_APPS, ...FUNCTION_SITE_APPS]
