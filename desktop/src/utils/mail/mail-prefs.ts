export type MailTemplate = {
  id: string
  name: string
  body: string
}

const SIGNATURE_KEY = 'geocrm-electron-mail-signature'
const TEMPLATES_KEY = 'geocrm-electron-mail-templates'
const REMOTE_IMAGES_KEY = 'geocrm-electron-mail-load-remote-images'
const LIST_WIDTH_KEY = 'geocrm-electron-mail-list-width'
const ACCOUNT_SELECTION_KEY = 'geocrm-electron-mail-account-selection'

/** Persisted mailbox switcher selection (unified inbox or a specific account). */
export type MailAccountSelectionPref = {
  mode: 'unified' | 'account'
  accountId: string | null
}

export const MAIL_LIST_WIDTH_DEFAULT = 340
export const MAIL_LIST_WIDTH_MIN = 240
export const MAIL_LIST_WIDTH_MAX = 560

/**
 * Loads the saved HTML signature.
 * @returns Signature HTML, or empty string.
 */
export function loadMailSignature(): string {
  try {
    return localStorage.getItem(SIGNATURE_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Persists the HTML signature.
 * @param html - Signature markup.
 */
export function saveMailSignature(html: string): void {
  try {
    localStorage.setItem(SIGNATURE_KEY, html)
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Loads canned response templates.
 * @returns Templates.
 */
export function loadMailTemplates(): MailTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isMailTemplate)
  } catch {
    return []
  }
}

/**
 * Persists canned response templates.
 * @param templates - Templates.
 */
export function saveMailTemplates(templates: MailTemplate[]): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Type guard for a stored template row.
 * @param value - Unknown JSON value.
 * @returns True when the row is a template.
 */
/**
 * Whether remote images should load by default in the reader.
 * @returns True when remote images are allowed.
 */
export function loadMailRemoteImagesPref(): boolean {
  try {
    return localStorage.getItem(REMOTE_IMAGES_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Persists the remote-image default.
 * @param load - Whether to load remote images.
 */
export function saveMailRemoteImagesPref(load: boolean): void {
  try {
    localStorage.setItem(REMOTE_IMAGES_KEY, load ? '1' : '0')
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Loads the persisted thread-list width.
 * @returns Width in pixels.
 */
export function loadMailListWidth(): number {
  try {
    const raw = Number(localStorage.getItem(LIST_WIDTH_KEY))
    if (!Number.isFinite(raw)) {
      return MAIL_LIST_WIDTH_DEFAULT
    }
    return Math.min(MAIL_LIST_WIDTH_MAX, Math.max(MAIL_LIST_WIDTH_MIN, Math.round(raw)))
  } catch {
    return MAIL_LIST_WIDTH_DEFAULT
  }
}

/**
 * Persists the thread-list width.
 * @param width - Width in pixels.
 */
export function saveMailListWidth(width: number): void {
  try {
    localStorage.setItem(LIST_WIDTH_KEY, String(Math.round(width)))
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Loads the last mailbox selection (unified inbox or account id).
 * @returns Selection preference.
 */
export function loadMailAccountSelectionPref(): MailAccountSelectionPref {
  try {
    const raw = localStorage.getItem(ACCOUNT_SELECTION_KEY)
    if (!raw) {
      return { mode: 'account', accountId: null }
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { mode: 'account', accountId: null }
    }
    const row = parsed as Record<string, unknown>
    const mode = row.mode === 'unified' ? 'unified' : 'account'
    const accountId = typeof row.accountId === 'string' ? row.accountId : null
    return { mode, accountId }
  } catch {
    return { mode: 'account', accountId: null }
  }
}

/**
 * Persists the mailbox switcher selection.
 * @param pref - Unified or account selection.
 */
export function saveMailAccountSelectionPref(pref: MailAccountSelectionPref): void {
  try {
    localStorage.setItem(
      ACCOUNT_SELECTION_KEY,
      JSON.stringify({
        mode: pref.mode === 'unified' ? 'unified' : 'account',
        accountId: pref.accountId,
      } satisfies MailAccountSelectionPref),
    )
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Clears every persisted Mail preference (`geocrm-electron-mail-*` keys).
 * Call on sign-out so a different user signing in on the same machine never
 * inherits the previous user's signature, templates, or mailbox selection.
 */
export function clearMailPrefs(): void {
  for (const key of [
    SIGNATURE_KEY,
    TEMPLATES_KEY,
    REMOTE_IMAGES_KEY,
    LIST_WIDTH_KEY,
    ACCOUNT_SELECTION_KEY,
  ]) {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore quota / private mode
    }
  }
}

/**
 * Type guard for a stored template row.
 * @param value - Unknown JSON value.
 * @returns True when the row is a template.
 */
function isMailTemplate(value: unknown): value is MailTemplate {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as Record<string, unknown>
  return typeof row.id === 'string' && typeof row.name === 'string' && typeof row.body === 'string'
}
