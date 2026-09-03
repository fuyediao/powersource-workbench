export type StartupAction = 'new' | 'last'
export type DefaultExtension = 'md' | 'markdown' | 'txt'
export type DropAction = 'open' | 'ignore' | 'import'
export type EditorModePref = 'wysiwyg' | 'sv'
export type ExportFormatPref = 'markdown' | 'html'
export type PrefCategory =
  | 'files'
  | 'editor'
  | 'images'
  | 'markdown'
  | 'export'
  | 'general'

export interface Preferences {
  startupAction: StartupAction
  outlineCollapsible: boolean
  defaultExtension: DefaultExtension
  autoSave: boolean
  autoSaveOnSwitch: boolean
  restoreDrafts: boolean
  rememberRecent: boolean
  dropFolderAction: DropAction
  dropMarkdownAction: DropAction
  dropImportableAction: DropAction
  defaultEditorMode: EditorModePref
  defaultExportFormat: ExportFormatPref
  language: string
}

const STORAGE_KEY = 'aura-preferences'

/** Default preference values aligned with Aura's current behavior. */
export const DEFAULT_PREFERENCES: Preferences = {
  startupAction: 'new',
  outlineCollapsible: true,
  defaultExtension: 'md',
  autoSave: false,
  autoSaveOnSwitch: false,
  restoreDrafts: true,
  rememberRecent: true,
  dropFolderAction: 'open',
  dropMarkdownAction: 'open',
  dropImportableAction: 'import',
  defaultEditorMode: 'wysiwyg',
  defaultExportFormat: 'markdown',
  language: 'en',
}

type Listener = () => void

const prefListeners = new Set<Listener>()

/**
 * Read preferences from localStorage, falling back to defaults.
 *
 * @returns Parsed preferences object.
 */
function loadPreferences(): Preferences {
  const defaults: Preferences = { ...DEFAULT_PREFERENCES }
  const savedLang = localStorage.getItem('aura-lang')
  if (savedLang === 'zh-TW' || savedLang === 'en') {
    defaults.language = savedLang
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaults
    }
    const parsed = JSON.parse(raw) as Partial<Preferences> & {
      contentTheme?: unknown
    }
    // Drop legacy Aura day/night content-theme key if present.
    const { contentTheme: _legacyContentTheme, ...rest } = parsed
    void _legacyContentTheme
    const merged: Preferences = { ...defaults, ...rest }
    // Migrate removed "open welcome document" startup option.
    if ((merged.startupAction as string) === 'welcome') {
      merged.startupAction = 'new'
    }
    if (merged.startupAction !== 'new' && merged.startupAction !== 'last') {
      merged.startupAction = defaults.startupAction
    }
    if (
      merged.defaultEditorMode !== 'wysiwyg' &&
      merged.defaultEditorMode !== 'sv'
    ) {
      merged.defaultEditorMode = 'wysiwyg'
    }
    if (
      merged.defaultExportFormat !== 'markdown' &&
      merged.defaultExportFormat !== 'html'
    ) {
      merged.defaultExportFormat = 'markdown'
    }
    if (typeof merged.restoreDrafts !== 'boolean') {
      merged.restoreDrafts = defaults.restoreDrafts
    }
    return merged
  } catch {
    return defaults
  }
}

let preferences: Preferences = loadPreferences()

/** Persist the in-memory preferences snapshot. */
function persist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
}

/** Notify preference subscribers. */
function emitPrefs(): void {
  prefListeners.forEach((listener) => listener())
}

/** Current preferences snapshot. */
export function getPreferences(): Preferences {
  return preferences
}

/**
 * Patch preferences, persist, and notify subscribers.
 *
 * @param patch - Partial preference updates.
 */
export function updatePreferences(patch: Partial<Preferences>): void {
  preferences = { ...preferences, ...patch }
  persist()
  emitPrefs()
}

/**
 * Subscribe to preference value changes.
 *
 * @param listener - Callback invoked on change.
 * @returns Unsubscribe function.
 */
export function subscribePreferences(listener: Listener): () => void {
  prefListeners.add(listener)
  return () => {
    prefListeners.delete(listener)
  }
}
