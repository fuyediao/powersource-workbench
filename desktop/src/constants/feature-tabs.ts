/** Closable title-bar tabs for GeoCRM feature pages (like Settings). */
export const FEATURE_TAB_IDS = [
  'chat',
  'harness',
  'mail',
  'calendar',
  'aura',
  'folio',
  'docs',
  'sheets',
  'slides',
] as const

/** Title-bar / deep-link id for a GeoCRM feature page. */
export type FeatureTabId = (typeof FEATURE_TAB_IDS)[number]

/**
 * Maps a lowercase `geocrm://` host segment to a feature tab id.
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
 * Returns whether a title-bar tab id is a GeoCRM feature page.
 * @param tabId - Title-bar tab id.
 * @returns True for known feature ids.
 */
export function isFeatureTabId(tabId: string): tabId is FeatureTabId {
  return (FEATURE_TAB_IDS as readonly string[]).includes(tabId as FeatureTabId)
}

/**
 * Parses the first path segment of a `geocrm://` deep link.
 * @param url - App tile URL.
 * @returns Segment or empty string.
 */
function geocrmDeepLinkId(url: string): string {
  const match = /^geocrm:\s*\/\/\s*(.*)$/i.exec(url.trim())
  if (!match) {
    return ''
  }
  return ((match[1] ?? '').split(/[/?#]/)[0] ?? '').trim().toLowerCase()
}

/**
 * Returns whether text is a `geocrm://` deep-link query.
 * @param text - Search input.
 * @returns True when the scheme is `geocrm://`.
 */
export function isGeocrmSchemeQuery(text: string): boolean {
  return /^geocrm:\s*\/\//i.test(text.trim())
}

/** In-app page a Home / Spotlight `geocrm://` query can open. */
export type GeocrmSearchTarget =
  | { kind: 'home' }
  | { kind: 'settings' }
  | { kind: 'feature'; id: FeatureTabId }
  | { kind: 'folio-page'; pageId: string }

/**
 * Resolves a search query to an in-app page when it is a known `geocrm://` link.
 * Unknown hosts return null so the caller can fall back to web search.
 * @param text - Search input.
 * @returns Target, or null.
 */
export function parseGeocrmSearchTarget(text: string): GeocrmSearchTarget | null {
  if (!isGeocrmSchemeQuery(text)) {
    return null
  }
  const id = geocrmDeepLinkId(text)
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
    if (featureId === 'folio') {
      const pageMatch = /^geocrm:\s*\/\/\s*folio\/([^/?#]+)/i.exec(text.trim())
      const pageId = pageMatch?.[1]?.trim()
      if (pageId) return { kind: 'folio-page', pageId }
    }
    return { kind: 'feature', id: featureId }
  }
  return null
}

/**
 * i18n key for a resolved `geocrm://` search target label.
 * @param target - Parsed target.
 * @returns Translation key.
 */
export function geocrmSearchTargetLabelKey(target: GeocrmSearchTarget): string {
  if (target.kind === 'home') {
    return 'nav.home'
  }
  if (target.kind === 'settings') {
    return 'functions.apps.settings'
  }
  if (target.kind === 'folio-page') return FEATURE_TAB_LABEL_KEY.folio
  return FEATURE_TAB_LABEL_KEY[target.id]
}

/** Returns whether a title tab addresses one Folio page. */
export function isFolioPageTabId(tabId: string): boolean {
  return tabId.startsWith('folio:') && tabId.length > 'folio:'.length
}

/** Extract a page id from a dynamic Folio tab id. */
export function folioPageIdFromTab(tabId: string): string | null {
  return isFolioPageTabId(tabId) ? tabId.slice('folio:'.length) : null
}

/**
 * Returns whether a Function tile URL opens Settings.
 * @param url - App tile URL.
 * @returns True for `geocrm://settings`.
 */
export function isSettingsDeepLink(url: string): boolean {
  return geocrmDeepLinkId(url) === 'settings'
}

/**
 * Returns whether a Function tile opens the NEXTORCH T&E access picker.
 * @param url - App tile URL.
 * @returns True for `geocrm://te`.
 */
export function isTeDeepLink(url: string): boolean {
  return geocrmDeepLinkId(url) === 'te'
}

/**
 * Returns whether a Function tile opens the POWERSOURCE OA region picker.
 * @param url - App tile URL.
 * @returns True for `geocrm://oa`.
 */
export function isOaDeepLink(url: string): boolean {
  return geocrmDeepLinkId(url) === 'oa'
}

/**
 * Returns whether a Function tile opens the POWERSOURCE ERP region picker.
 * @param url - App tile URL.
 * @returns True for `geocrm://erp`.
 */
export function isErpDeepLink(url: string): boolean {
  return geocrmDeepLinkId(url) === 'erp'
}

/**
 * Maps a `geocrm://` Function tile URL to a feature tab id.
 * @param url - App tile URL.
 * @returns Feature id, or null when not a feature deep link.
 */
export function featureTabFromUrl(url: string): FeatureTabId | null {
  return featureTabFromDeepLinkId(geocrmDeepLinkId(url))
}

/** i18n key for each feature tab title (reuses Functions tile labels). */
export const FEATURE_TAB_LABEL_KEY: Record<FeatureTabId, string> = {
  chat: 'functions.apps.ask',
  harness: 'functions.apps.harness',
  mail: 'functions.apps.mail',
  calendar: 'functions.apps.calendar',
  aura: 'functions.apps.aura',
  folio: 'functions.apps.folio',
  docs: 'functions.apps.docs',
  sheets: 'functions.apps.sheets',
  slides: 'functions.apps.slides',
}
