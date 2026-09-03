/**
 * Settings sidebar section ids.
 */
export type SettingsSection =
  | 'profile'
  | 'preferences'
  | 'oaErp'
  | 'ai'
  | 'mcp'
  | 'privacy'
  | 'theme'
  | 'page'
  | 'widgets'
  | 'background'
  | 'feedback'
  | 'openSource'
  | 'groupManagement'
  | 'userManagement'
  | 'globalLeaders'
  | 'groupAdmin'
  | 'groupInfo'

/**
 * Canonical sidebar order used for section-slide direction.
 * Account → preferences → tooling → appearance → home → feedback → admin.
 */
export const SECTION_ORDER: SettingsSection[] = [
  'profile',
  'preferences',
  'privacy',
  'ai',
  'mcp',
  'theme',
  'background',
  'page',
  'widgets',
  'oaErp',
  'feedback',
  'openSource',
  'groupManagement',
  'userManagement',
  'globalLeaders',
  'groupAdmin',
  'groupInfo',
]

/**
 * Sections always shown before role-gated admin entries are wired.
 */
export const DEFAULT_VISIBLE_SECTIONS: SettingsSection[] = [
  'profile',
  'preferences',
  'privacy',
  'ai',
  'mcp',
  'theme',
  'background',
  'page',
  'widgets',
  'oaErp',
  'feedback',
  'openSource',
]

/** Role-gated admin entries shown below a Settings rail separator. */
export const ADMIN_SETTINGS_SECTIONS: readonly SettingsSection[] = [
  'groupManagement',
  'userManagement',
  'globalLeaders',
  'groupAdmin',
  'groupInfo',
]

const ADMIN_SETTINGS_SECTION_SET = new Set<SettingsSection>(ADMIN_SETTINGS_SECTIONS)

/**
 * Splits visible Settings sections into base vs role-gated admin groups.
 * @param visibleSections - Role-filtered section ids in canonical order.
 * @returns Non-empty groups for the Settings rail.
 */
export function groupVisibleSettingsSections(
  visibleSections: SettingsSection[],
): SettingsSection[][] {
  const base: SettingsSection[] = []
  const admin: SettingsSection[] = []
  for (const id of visibleSections) {
    if (ADMIN_SETTINGS_SECTION_SET.has(id)) {
      admin.push(id)
    } else {
      base.push(id)
    }
  }
  return [base, admin].filter((group) => group.length > 0)
}

/** sessionStorage key for the last selected Settings sidebar section. */
export const SETTINGS_SECTION_SESSION_KEY = 'workbench.electron.settingsSection.v1'

/**
 * Whether a value is a known Settings section id.
 * @param value - Candidate string.
 * @returns Type predicate for {@link SettingsSection}.
 */
export function isSettingsSection(value: string): value is SettingsSection {
  return (SECTION_ORDER as readonly string[]).includes(value)
}

/**
 * Maps a persisted (possibly legacy) section id to a current {@link SettingsSection}.
 * @param value - Raw session value.
 * @returns Normalized section, or null when unknown.
 */
function normalizePersistedSection(value: string): SettingsSection | null {
  if (value === 'language') {
    return 'preferences'
  }
  if (value === 'harness') {
    return 'ai'
  }
  if (value === 'deskPet') {
    return 'profile'
  }
  if (value === 'clash' || value === 'desktopAccess' || value === 'desktopWrites') {
    return 'profile'
  }
  if (value === 'aura') {
    return 'profile'
  }
  return isSettingsSection(value) ? value : null
}

/**
 * Reads the last selected Settings sidebar section from sessionStorage.
 * @returns Persisted section, or `profile` when missing / invalid.
 */
export function loadPersistedSettingsSection(): SettingsSection {
  try {
    const raw = sessionStorage.getItem(SETTINGS_SECTION_SESSION_KEY)
    if (raw) {
      return normalizePersistedSection(raw) ?? 'profile'
    }
  } catch {
    // Ignore quota / private-mode failures.
  }
  return 'profile'
}

/**
 * Writes the active Settings sidebar section to sessionStorage.
 * @param section - Section to remember for this browser session.
 * @returns Nothing.
 */
export function persistSettingsSection(section: SettingsSection): void {
  try {
    sessionStorage.setItem(SETTINGS_SECTION_SESSION_KEY, section)
  } catch {
    // Ignore quota / private-mode failures.
  }
}
