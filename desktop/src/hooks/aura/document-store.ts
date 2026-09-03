/**
 * Aura (Markdown editor) document session: cloud library on the VPS
 * (`public.aura_files` metadata + the private `aura-files` Storage bucket),
 * personal XOR group scope like Office / Folio. `filePath` is the
 * `aura_files.id` of the open row (or null for an unsaved document).
 * localStorage keeps only a lightweight crash-recovery draft (never the
 * source of truth) plus the recent-files list.
 */
import { getPreferences } from '@/hooks/aura/preferences-store'
import { UNTITLED_DOCUMENT } from '@/constants/aura'
import i18n from '@/i18n'
import { AURA_DRAFT_STORAGE_KEY } from '@/utils/aura/draft'
import { showToast } from '@/hooks/aura/toast-store'
import {
  copyAuraFileToPersonal as copyFileToPersonal,
  createAuraFile,
  deleteAuraFile,
  downloadAuraFileMarkdown,
  getAuraFile,
  listAuraFiles,
  moveAuraFileToGroup,
  renameAuraFile,
  setAuraFileColor,
  uploadAuraFileMarkdown,
  type AuraFile,
} from '@/services/aura-files-api'

type Listener = () => void

export interface FolderEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
  /** Sidebar color tag (null = none). */
  color: string | null
}

export interface DocumentSession {
  /** Open `aura_files.id`, or null for an unsaved document. */
  filePath: string | null
  /** Display title (file name). */
  title: string
  /** Unused for the cloud library (kept for API compatibility). */
  folderPath: string | null
  /** Cloud library rows for the currently browsed personal/group scope. */
  folderEntries: FolderEntry[]
  dirty: boolean
  recentFiles: string[]
}

/** Personal owner id or a single group id — mirrors the Office/Folio scope shape. */
export type LibraryScope = { ownerUserId: string } | { groupId: string } | null

/** Write flags for Files sidebar context actions (set by useAuraLibrary). */
export interface LibraryCapabilities {
  canEdit: boolean
  canDelete: boolean
}

const RECENT_KEY = 'aura-recent-files'
const DRAFT_KEY = 'aura-draft'

let session: DocumentSession = {
  filePath: null,
  title: UNTITLED_DOCUMENT,
  folderPath: null,
  folderEntries: [],
  dirty: false,
  recentFiles: loadRecent(),
}

/** Scope currently browsed in the Files sidebar (set by useAuraLibrary). */
let currentScope: LibraryScope = null
/** RBAC flags for rename / color / delete in the Files sidebar. */
let libraryCapabilities: LibraryCapabilities = { canEdit: true, canDelete: true }
/** Cached row for the open cloud file; avoids a refetch on every save. */
let activeFile: AuraFile | null = null
/** Basename of an imported/dropped file, used once as the create name on first Save. */
let pendingCreateName: string | null = null

const listeners = new Set<Listener>()

/** Notify document-session subscribers. */
function emit(): void {
  listeners.forEach((listener) => listener())
}

/**
 * Load recent file ids from localStorage.
 * @returns Id list (newest first).
 */
function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

/** Persist recent files when the preference allows it. */
function persistRecent(): void {
  if (!getPreferences().rememberRecent) {
    localStorage.removeItem(RECENT_KEY)
    return
  }
  localStorage.setItem(RECENT_KEY, JSON.stringify(session.recentFiles.slice(0, 20)))
}

/**
 * Remember a file id in the recent list.
 * @param fileId - Aura file id.
 */
function pushRecent(fileId: string): void {
  if (!getPreferences().rememberRecent) {
    return
  }
  session.recentFiles = [
    fileId,
    ...session.recentFiles.filter((id) => id !== fileId),
  ].slice(0, 20)
  persistRecent()
}

/**
 * Basename for display; kept for API compatibility with earlier callers.
 * @param filePath - Aura file id.
 * @returns Same id (display name comes from the loaded row instead).
 */
export function pathBasename(filePath: string): string {
  return filePath
}

/**
 * Current document session snapshot.
 * @returns Session state.
 */
export function getDocumentSession(): DocumentSession {
  return session
}

/**
 * Current Files sidebar write flags.
 * @returns Whether rename/color and delete are allowed in this scope.
 */
export function getLibraryCapabilities(): LibraryCapabilities {
  return libraryCapabilities
}

/**
 * Stores Files sidebar write flags from the Aura library hook.
 * @param next - Edit / delete flags for the active scope.
 * @returns Nothing.
 */
export function setLibraryCapabilities(next: LibraryCapabilities): void {
  if (
    libraryCapabilities.canEdit === next.canEdit &&
    libraryCapabilities.canDelete === next.canDelete
  ) {
    return
  }
  libraryCapabilities = next
  emit()
}

/**
 * Mark the document dirty or clean.
 * @param dirty - Dirty when true.
 */
export function setDocumentDirty(dirty: boolean): void {
  if (session.dirty === dirty) {
    return
  }
  session = { ...session, dirty }
  emit()
}

/**
 * Clear the recent-files list.
 */
export function clearRecentFiles(): void {
  session = { ...session, recentFiles: [] }
  localStorage.removeItem(RECENT_KEY)
  emit()
}

/**
 * Subscribe to document-session changes.
 * @param listener - Callback on change.
 * @returns Unsubscribe function.
 */
export function subscribeDocumentSession(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Reads the local crash-recovery draft (content-only cache, not the library
 * source of truth).
 * @returns Draft fields, or null when absent / unreadable.
 */
function readDraft(): { markdown: string; title: string; filePath: string | null } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as {
      markdown?: string
      title?: string
      filePath?: string | null
    }
    return {
      markdown: typeof parsed.markdown === 'string' ? parsed.markdown : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      filePath: typeof parsed.filePath === 'string' ? parsed.filePath : null,
    }
  } catch {
    return null
  }
}

/**
 * Resolves startup markdown: `new` always starts blank; `last` re-downloads
 * the cloud file behind the last draft when it still exists / is visible,
 * otherwise falls back to the cached draft text as an unsaved buffer.
 *
 * @returns Initial markdown and session metadata.
 */
export async function resolveStartupDocument(): Promise<{
  markdown: string
  title: string
  filePath: string | null
}> {
  const prefs = getPreferences()
  const untitled = i18n.t('aura.shell.untitled')

  if (prefs.startupAction === 'new') {
    return { markdown: '', title: untitled, filePath: null }
  }

  // startupAction === 'last'
  if (prefs.restoreDrafts) {
    const draft = readDraft()
    if (draft?.filePath) {
      try {
        const file = await getAuraFile(draft.filePath)
        if (file) {
          const markdown = await downloadAuraFileMarkdown(file)
          activeFile = file
          return { markdown, title: file.name || untitled, filePath: file.id }
        }
      } catch (error) {
        console.error('[document-store] restore cloud draft:', error)
      }
    }
    if (draft && draft.markdown.length > 0) {
      return { markdown: draft.markdown, title: draft.title || untitled, filePath: null }
    }
    try {
      const workbenchDraft = localStorage.getItem(AURA_DRAFT_STORAGE_KEY)
      if (workbenchDraft != null && workbenchDraft.length > 0) {
        return { markdown: workbenchDraft, title: untitled, filePath: null }
      }
    } catch {
      // Ignore.
    }
  }

  return { markdown: '', title: untitled, filePath: null }
}

/**
 * Persists an unsaved-content crash-recovery draft when restoreDrafts is
 * enabled. Also remembers the open cloud file id (if any) so startup can
 * re-download fresh content instead of trusting the cached text.
 * @param markdown - Document text.
 * @param title - Display title.
 */
export function saveDraft(markdown: string, title: string): void {
  if (!getPreferences().restoreDrafts) {
    return
  }
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ markdown, title, filePath: session.filePath, updatedAt: Date.now() }),
  )
  try {
    localStorage.setItem(AURA_DRAFT_STORAGE_KEY, markdown)
  } catch {
    // ignore
  }
}

/** Remove the local draft cache. */
export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY)
  try {
    localStorage.removeItem(AURA_DRAFT_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Apply an opened or new document to the session.
 * @param next - Session fields to update.
 */
export function setOpenDocument(next: {
  filePath: string | null
  title: string
  dirty?: boolean
  folderEntries?: FolderEntry[]
}): void {
  session = {
    ...session,
    filePath: next.filePath,
    title: next.title,
    dirty: next.dirty ?? false,
    folderEntries:
      next.folderEntries !== undefined ? next.folderEntries : session.folderEntries,
  }
  if (next.filePath) {
    pushRecent(next.filePath)
    clearDraft()
  }
  emit()
}

/**
 * Reset the session to a fresh unsaved document (File > New).
 * @returns Nothing.
 */
export function newDocument(): void {
  activeFile = null
  pendingCreateName = null
  clearDraft()
  setOpenDocument({ filePath: null, title: i18n.t('aura.shell.untitled'), dirty: false })
}

/**
 * Reloads the Files sidebar listing for the currently browsed scope.
 * @returns Nothing.
 */
async function refreshFolderEntries(): Promise<void> {
  if (!currentScope) {
    session = { ...session, folderEntries: [] }
    emit()
    return
  }
  try {
    const rows = await listAuraFiles(currentScope)
    session = {
      ...session,
      folderEntries: rows.map((row) => ({
        name: row.name || i18n.t('aura.shell.untitled'),
        path: row.id,
        kind: 'file' as const,
        color: row.color,
      })),
    }
  } catch (error) {
    console.error('[document-store] list:', error)
    session = { ...session, folderEntries: [] }
  }
  emit()
}

/**
 * Sets the personal/group scope browsed in the Files sidebar and reloads its
 * listing. Does not touch the currently open document.
 * @param scope - Personal owner id, a group id, or null (no scope resolved yet).
 * @returns Nothing.
 */
export function setLibraryScope(scope: LibraryScope): void {
  currentScope = scope
  void refreshFolderEntries()
}

/**
 * Manually refreshes the Files sidebar listing (e.g. after create / delete /
 * move / copy).
 * @returns Nothing.
 */
export async function reloadLibrary(): Promise<void> {
  await refreshFolderEntries()
}

/**
 * Renames a library file. Updates the open document title when that file is
 * currently open.
 * @param id - Aura file id.
 * @param requestedName - New display name.
 * @returns Nothing.
 */
export async function renameLibraryFile(id: string, requestedName: string): Promise<void> {
  const trimmed = requestedName.trim()
  if (!trimmed) {
    throw new Error(i18n.t('aura.sidebar.renameFailed'))
  }
  const duplicate = session.folderEntries.some(
    (entry) =>
      entry.path !== id &&
      entry.name.toLocaleLowerCase('en-US') === trimmed.toLocaleLowerCase('en-US'),
  )
  if (duplicate) {
    throw new Error(i18n.t('aura.sidebar.renameDuplicate', { name: trimmed }))
  }
  const updated = await renameAuraFile(id, trimmed)
  if (!updated) {
    throw new Error(i18n.t('aura.sidebar.renameFailed'))
  }
  if (activeFile?.id === id) {
    activeFile = updated
    session = { ...session, title: updated.name }
  }
  await refreshFolderEntries()
}

/**
 * Sets (or clears) a library file's sidebar color tag.
 * @param id - Aura file id.
 * @param color - Hex color, or null to clear.
 * @returns Nothing.
 */
export async function setLibraryFileColor(id: string, color: string | null): Promise<void> {
  const previous = session.folderEntries
  session = {
    ...session,
    folderEntries: previous.map((entry) =>
      entry.path === id ? { ...entry, color } : entry,
    ),
  }
  emit()
  try {
    const updated = await setAuraFileColor(id, color)
    if (!updated) {
      session = { ...session, folderEntries: previous }
      emit()
      showToast(i18n.t('aura.errors.colorFailed'))
      return
    }
    if (activeFile?.id === id) {
      activeFile = updated
    }
    await refreshFolderEntries()
  } catch (error) {
    session = { ...session, folderEntries: previous }
    emit()
    console.error('[document-store] color:', error)
    showToast(i18n.t('aura.errors.colorFailed'))
  }
}

/**
 * Deletes a library file. When it is the open document, the caller should
 * reset the editor buffer (File > New).
 * @param id - Aura file id.
 * @returns True when the deleted file was the open document.
 */
export async function deleteLibraryFile(id: string): Promise<boolean> {
  const wasActive = session.filePath === id
  try {
    const file = activeFile?.id === id ? activeFile : await getAuraFile(id)
    if (!file) {
      throw new Error('file_not_found')
    }
    await deleteAuraFile(file)
    if (wasActive) {
      activeFile = null
      pendingCreateName = null
    }
    await refreshFolderEntries()
    return wasActive
  } catch (error) {
    console.error('[document-store] delete:', error)
    showToast(i18n.t('aura.errors.deleteFailed'))
    return false
  }
}

/**
 * Refresh the Files sidebar listing (compatibility wrapper for the sidebar's
 * directory-entry click handler; the cloud library is flat).
 * @param _folderPath - Ignored.
 * @returns Nothing.
 */
export async function loadFolderListing(_folderPath: string): Promise<void> {
  await refreshFolderEntries()
}

/**
 * Open a markdown file via the browser file picker. The picked file becomes
 * an unsaved buffer (not yet a cloud row); the next Save creates one using
 * the picked file's name.
 * @returns Markdown and path, or null when cancelled.
 */
export async function pickAndReadMarkdownFile(): Promise<{
  markdown: string
  filePath: string | null
  title: string
} | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const markdown = String(reader.result ?? '')
        activeFile = null
        pendingCreateName = file.name
        setOpenDocument({ filePath: null, title: file.name, dirty: false })
        resolve({ markdown, filePath: null, title: file.name })
      }
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.click()
  })
}

/**
 * Saves markdown to the cloud library: uploads bytes for an already-open
 * file, or creates a new row (in the currently browsed scope) the first time
 * an unsaved document is saved.
 * @param markdown - Document text.
 * @param _forceSaveAs - Unused; the cloud library has no local Save As.
 * @returns True when saved.
 */
export async function saveMarkdownDocument(
  markdown: string,
  _forceSaveAs = false,
): Promise<boolean> {
  try {
    if (session.filePath) {
      const file =
        activeFile?.id === session.filePath ? activeFile : await getAuraFile(session.filePath)
      if (!file) {
        throw new Error('file_not_found')
      }
      activeFile = file
      await uploadAuraFileMarkdown(file, markdown)
    } else {
      if (!currentScope) {
        showToast(i18n.t('aura.errors.noScope'))
        return false
      }
      const created = await createAuraFile(pendingCreateName || 'Untitled', currentScope, markdown)
      activeFile = created
      pendingCreateName = null
      setOpenDocument({ filePath: created.id, title: created.name, dirty: false })
      void refreshFolderEntries()
    }
    setDocumentDirty(false)
    clearDraft()
    return true
  } catch (error) {
    console.error('[document-store] save:', error)
    showToast(i18n.t('aura.errors.saveFailed'))
    return false
  }
}

/**
 * Open a known cloud file (sidebar click / restored session).
 * @param filePath - Aura file id.
 * @returns Markdown text, or null on failure.
 */
export async function openMarkdownAtPath(filePath: string): Promise<string | null> {
  try {
    const file = await getAuraFile(filePath)
    if (!file) {
      showToast(i18n.t('aura.errors.openFailed'))
      return null
    }
    const markdown = await downloadAuraFileMarkdown(file)
    activeFile = file
    pendingCreateName = null
    setOpenDocument({
      filePath: file.id,
      title: file.name || i18n.t('aura.shell.untitled'),
      dirty: false,
    })
    return markdown
  } catch (error) {
    console.error('[document-store] open:', error)
    showToast(i18n.t('aura.errors.openFailed'))
    return null
  }
}

/**
 * Returns whether a file name is Markdown (or plain text) for the Aura library.
 * @param fileName - OS file name.
 * @returns True for `.md` / `.markdown` / `.txt`.
 */
export function isAuraMarkdownFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')
}

/**
 * Returns whether an in-flight OS drag should upload into the Aura library.
 * Image drags are ignored so they still insert into the editor.
 * @param dataTransfer - Drag payload.
 * @returns True when the overlay should appear.
 */
export function isAuraMarkdownDrag(dataTransfer: DataTransfer): boolean {
  const named = Array.from(dataTransfer.files)
  if (named.some((file) => isAuraMarkdownFileName(file.name))) {
    return true
  }
  const items = Array.from(dataTransfer.items).filter((item) => item.kind === 'file')
  if (items.length === 0) {
    return named.length === 0
  }
  return items.some((item) => {
    const mime = item.type.toLowerCase()
    if (mime.startsWith('image/')) {
      return false
    }
    return mime === '' || mime === 'application/octet-stream' || mime.startsWith('text/')
  })
}

/**
 * Uploads dropped Markdown files into the current cloud library and opens the
 * last successful row.
 * @param files - Dropped files (already filtered to Markdown when possible).
 * @returns Markdown to load into the editor, or null when ignored.
 */
export async function uploadDroppedMarkdownFiles(
  files: File[],
): Promise<{ markdown: string; title: string } | null> {
  const prefs = getPreferences()
  if (prefs.dropMarkdownAction === 'ignore') {
    return null
  }
  const markdownFiles = files.filter((file) => isAuraMarkdownFileName(file.name))
  if (markdownFiles.length === 0) {
    showToast(i18n.t('aura.errors.unsupportedType'))
    return null
  }
  if (!currentScope) {
    showToast(i18n.t('aura.errors.noScope'))
    return null
  }
  let last: { markdown: string; title: string } | null = null
  for (const file of markdownFiles) {
    try {
      const markdown = await file.text()
      const created = await createAuraFile(file.name, currentScope, markdown)
      activeFile = created
      pendingCreateName = null
      setOpenDocument({ filePath: created.id, title: created.name, dirty: false })
      last = { markdown, title: created.name }
    } catch (error) {
      console.error('[document-store] drop:', error)
      showToast(i18n.t('aura.errors.uploadFailed'))
    }
  }
  if (last) {
    void refreshFolderEntries()
  }
  return last
}

/**
 * Handle files dropped onto the editor shell. Matching Markdown is uploaded
 * to the current personal or group library immediately.
 * @param _paths - Ignored (no Electron paths).
 * @param files - Web FileList.
 * @returns Markdown to load, or null when ignored.
 */
export async function handleDroppedPaths(
  _paths: string[],
  files?: FileList | null,
): Promise<{ markdown: string; title: string } | null> {
  return uploadDroppedMarkdownFiles(Array.from(files ?? []))
}

/**
 * Moves the currently open file into a group. The open buffer is unaffected
 * (same row id); only its scope changes.
 * @param groupId - Destination group id.
 * @returns Nothing.
 */
export async function moveActiveFileToGroup(groupId: string): Promise<void> {
  const id = session.filePath
  if (!id) {
    return
  }
  try {
    const file = activeFile?.id === id ? activeFile : await getAuraFile(id)
    if (!file) {
      throw new Error('file_not_found')
    }
    const updated = await moveAuraFileToGroup(file.id, groupId)
    if (updated) {
      activeFile = updated
    }
    await refreshFolderEntries()
  } catch (error) {
    console.error('[document-store] moveToGroup:', error)
    showToast(i18n.t('aura.errors.moveFailed'))
  }
}

/**
 * Copies the currently open (personal or group) file into the caller's
 * personal library and switches the open buffer to the new copy.
 * @param ownerUserId - Caller's user id.
 * @returns Nothing.
 */
export async function copyActiveFileToPersonal(ownerUserId: string): Promise<void> {
  const id = session.filePath
  if (!id) {
    return
  }
  try {
    const file = activeFile?.id === id ? activeFile : await getAuraFile(id)
    if (!file) {
      throw new Error('file_not_found')
    }
    const copy = await copyFileToPersonal(file, ownerUserId)
    activeFile = copy
    pendingCreateName = null
    setOpenDocument({ filePath: copy.id, title: copy.name, dirty: false })
    await refreshFolderEntries()
  } catch (error) {
    console.error('[document-store] copyToPersonal:', error)
    showToast(i18n.t('aura.errors.copyFailed'))
  }
}

/**
 * Deletes the currently open file from the cloud library. Does not reset the
 * session; call {@link newDocument} afterwards to clear the buffer.
 * @returns True when deleted.
 */
export async function removeActiveFile(): Promise<boolean> {
  const id = session.filePath
  if (!id) {
    return false
  }
  try {
    const file = activeFile?.id === id ? activeFile : await getAuraFile(id)
    if (!file) {
      throw new Error('file_not_found')
    }
    await deleteAuraFile(file)
    activeFile = null
    pendingCreateName = null
    await refreshFolderEntries()
    return true
  } catch (error) {
    console.error('[document-store] delete:', error)
    showToast(i18n.t('aura.errors.deleteFailed'))
    return false
  }
}
