/** Closable title-bar tabs for Workbench feature pages (like Settings). */
export const FEATURE_TAB_IDS = [
  'chat',
  'harness',
  'mail',
  'calendar',
] as const

/** Title-bar / deep-link id for a Workbench feature page. */
export type FeatureTabId = (typeof FEATURE_TAB_IDS)[number]

/**
 * Maps a lowercase `workbench://` host segment to a feature tab id.
 * Artificial Intelligence accepts product hosts (`artificial-intelligence`, `chat`, `ask`, `ai`).
 * Harness accepts `harness` and the legacy `agent` host.
 * @param id - Lowercased deep-link host.
 * @returns Feature tab id, or null.
 */
function featureTabFromDeepLinkId(id: string): FeatureTabId | null {
  if (
    id === 'artificial-intelligence' ||
    id === 'artificialintelligence' ||
    id === 'ai' ||
    id === 'chat' ||
    id === 'ask'
  ) {
    return 'chat'
  }
  if (id === 'agent') {
    return 'harness'
  }
  return isFeatureTabId(id) ? id : null
}

/**
 * Returns whether a title-bar tab id is a Workbench feature page.
 * @param tabId - Title-bar tab id.
 * @returns True for known feature ids.
 */
export function isFeatureTabId(tabId: string): tabId is FeatureTabId {
  return (FEATURE_TAB_IDS as readonly string[]).includes(tabId as FeatureTabId)
}

/**
 * Parses the first path segment of a `workbench://` deep link.
 * @param url - App tile URL.
 * @returns Segment or empty string.
 */
function workbenchDeepLinkId(url: string): string {
  const match = /^workbench:\s*\/\/\s*(.*)$/i.exec(url.trim())
  if (!match) {
    return ''
  }
  return ((match[1] ?? '').split(/[/?#]/)[0] ?? '').trim().toLowerCase()
}

/**
 * Returns whether text is a `workbench://` deep-link query.
 * @param text - Search input.
 * @returns True when the scheme is `workbench://`.
 */
export function isWorkbenchSchemeQuery(text: string): boolean {
  return /^workbench:\s*\/\//i.test(text.trim())
}

/** In-app page a Home / Spotlight `workbench://` query can open. */
export type WorkbenchSearchTarget =
  | { kind: 'home' }
  | { kind: 'settings' }
  | { kind: 'feature'; id: FeatureTabId }

/**
 * Resolves a search query to an in-app page when it is a known `workbench://` link.
 * Unknown hosts return null so the caller can fall back to web search.
 * @param text - Search input.
 * @returns Target, or null.
 */
export function parseWorkbenchSearchTarget(text: string): WorkbenchSearchTarget | null {
  if (!isWorkbenchSchemeQuery(text)) {
    return null
  }
  const id = workbenchDeepLinkId(text)
  if (!id) {
    return null
  }
  if (id === 'home') {
    return { kind: 'home' }
  }
  if (id === 'settings') {
    return { kind: 'settings' }
  }
  const featureId = featureTabFromDeepLinkId(id)
  if (featureId) {
    return { kind: 'feature', id: featureId }
  }
  return null
}

/**
 * i18n key for a resolved `workbench://` search target label.
 * @param target - Parsed target.
 * @returns Translation key.
 */
export function workbenchSearchTargetLabelKey(target: WorkbenchSearchTarget): string {
  if (target.kind === 'home') {
    return 'nav.home'
  }
  if (target.kind === 'settings') {
    return 'functions.apps.settings'
  }
  return FEATURE_TAB_LABEL_KEY[target.id]
}

/**
 * Returns whether a Function tile URL opens Settings.
 * @param url - App tile URL.
 * @returns True for `workbench://settings`.
 */
export function isSettingsDeepLink(url: string): boolean {
  return workbenchDeepLinkId(url) === 'settings'
}

/**
 * Returns whether a Function tile opens the POWERSOURCE OA region picker.
 * @param url - App tile URL.
 * @returns True for `workbench://oa`.
 */
export function isOaDeepLink(url: string): boolean {
  return workbenchDeepLinkId(url) === 'oa'
}

/**
 * Returns whether a Function tile opens the POWERSOURCE ERP region picker.
 * @param url - App tile URL.
 * @returns True for `workbench://erp`.
 */
export function isErpDeepLink(url: string): boolean {
  return workbenchDeepLinkId(url) === 'erp'
}

/**
 * Maps a `workbench://` Function tile URL to a feature tab id.
 * @param url - App tile URL.
 * @returns Feature id, or null when not a feature deep link.
 */
export function featureTabFromUrl(url: string): FeatureTabId | null {
  return featureTabFromDeepLinkId(workbenchDeepLinkId(url))
}

/** i18n key for each feature tab title (reuses Functions tile labels). */
export const FEATURE_TAB_LABEL_KEY: Record<FeatureTabId, string> = {
  chat: 'functions.apps.ask',
  harness: 'functions.apps.harness',
  mail: 'functions.apps.mail',
  calendar: 'functions.apps.calendar',
}
