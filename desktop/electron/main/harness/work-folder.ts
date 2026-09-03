/**
 * Default Harness working directory: the user's Documents/Harness folder.
 *
 * Turns never use the CRM git tree, `process.cwd()`, or the app install path
 * unless the user explicitly picks that folder.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { BrowserWindow, dialog, type WebContents, app } from 'electron'
import { HARNESS_ATTACHMENT_DIALOG_EXTENSIONS } from '../../shared/harness-attachments'
import type {
  HarnessReviewSnapshot,
  HarnessWorkspaceEntry,
  HarnessWorkspaceFile,
} from '../../shared/harness'

const MAX_DIRECTORY_ENTRIES = 500
const MAX_FILE_PREVIEW_BYTES = 512 * 1024
const MAX_CANVAS_EDIT_BYTES = 2 * 1024 * 1024
const MAX_PROCESS_OUTPUT = 1024 * 1024

/** Workspace-relative folder for Canvas HTML and Markdown files. */
export const HARNESS_CANVAS_FOLDER = 'canvas'

/** Per-conversation Canvas copies stored under `canvas/.sessions/<historyId>/`. */
export const HARNESS_CANVAS_SESSIONS_FOLDER = '.sessions'

interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Returns the default Harness work folder (`Documents/Harness`).
 * @returns Absolute path.
 */
export function defaultHarnessWorkFolder(): string {
  return path.join(app.getPath('documents'), 'Harness')
}

/**
 * Resolves the thread cwd and creates it when missing.
 * @param cwd - User-chosen folder, or empty to use Documents/Harness.
 * @returns Absolute existing directory.
 */
export function resolveHarnessWorkFolder(cwd?: string | null): string {
  const resolved = cwd?.trim() || defaultHarnessWorkFolder()
  fs.mkdirSync(resolved, { recursive: true })
  return resolved
}

/**
 * Creates the workspace `canvas/` folder used for HTML and Markdown previews.
 * @param cwd - User-selected Harness workspace.
 * @returns Absolute canvas directory path.
 */
export function ensureHarnessCanvasFolder(cwd?: string | null): string {
  const directory = path.join(resolveHarnessWorkFolder(cwd), HARNESS_CANVAS_FOLDER)
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

/**
 * Accepts a history row id as a Canvas session folder name.
 * @param historyId - Supabase history id.
 * @returns Safe folder name, or null when rejected.
 */
function canvasSessionId(historyId: string): string | null {
  const trimmed = historyId.trim()
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(trimmed)) return null
  return trimmed
}

/**
 * Lists `canvas/` children excluding the per-conversation archive folder.
 * @param directory - Absolute canvas directory.
 * @returns Live Canvas entries.
 */
function liveCanvasEntries(directory: string): fs.Dirent[] {
  return fs.readdirSync(directory, { withFileTypes: true }).filter(
    (entry) => entry.name !== HARNESS_CANVAS_SESSIONS_FOLDER,
  )
}

/**
 * Deletes live Canvas files while keeping `canvas/.sessions/`.
 * @param directory - Absolute canvas directory.
 * @returns Nothing.
 */
function clearLiveCanvasEntries(directory: string): void {
  for (const entry of liveCanvasEntries(directory)) {
    fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true })
  }
}

/**
 * Reports whether the live Canvas folder has an HTML or Markdown preview file.
 * @param directory - Absolute canvas directory.
 * @returns True when a previewable file exists.
 */
function liveCanvasHasPreview(directory: string): boolean {
  return liveCanvasEntries(directory).some((entry) => {
    if (!entry.isFile()) return false
    const extension = path.extname(entry.name).toLowerCase()
    return ['.html', '.htm', '.md', '.markdown'].includes(extension)
  })
}

/**
 * Copies live Canvas files into `canvas/.sessions/<historyId>/` without clearing them.
 * @param cwd - User-selected Harness workspace.
 * @param historyId - Conversation history id.
 * @returns Nothing.
 */
export function snapshotHarnessCanvasSession(cwd: string | null | undefined, historyId: string): void {
  const id = canvasSessionId(historyId)
  if (!id) return
  const live = ensureHarnessCanvasFolder(cwd)
  const entries = liveCanvasEntries(live)
  if (entries.length === 0) return
  const dest = path.join(live, HARNESS_CANVAS_SESSIONS_FOLDER, id)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of entries) {
    fs.cpSync(path.join(live, entry.name), path.join(dest, entry.name), { recursive: true })
  }
}

/**
 * Archives the current conversation Canvas, then clears the live `canvas/` folder.
 * @param cwd - User-selected Harness workspace.
 * @param historyId - Conversation to archive, or null when there is no history row yet.
 * @returns Nothing.
 */
export function parkHarnessCanvasFolder(cwd?: string | null, historyId?: string | null): void {
  if (historyId?.trim()) snapshotHarnessCanvasSession(cwd, historyId)
  clearLiveCanvasEntries(ensureHarnessCanvasFolder(cwd))
}

/**
 * Restores archived Canvas files for one conversation, or keeps live files when none exist.
 * @param cwd - User-selected Harness workspace.
 * @param historyId - Conversation history id.
 * @returns True when previewable files are available after restore.
 */
export function restoreHarnessCanvasSession(
  cwd: string | null | undefined,
  historyId: string,
): boolean {
  const live = ensureHarnessCanvasFolder(cwd)
  const id = canvasSessionId(historyId)
  if (!id) return liveCanvasHasPreview(live)
  const source = path.join(live, HARNESS_CANVAS_SESSIONS_FOLDER, id)
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    return liveCanvasHasPreview(live)
  }
  clearLiveCanvasEntries(live)
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    fs.cpSync(path.join(source, entry.name), path.join(live, entry.name), { recursive: true })
  }
  return liveCanvasHasPreview(live)
}

/**
 * Appends process output without exceeding the renderer response limit.
 * @param current - Text already collected.
 * @param chunk - Newly emitted text.
 * @returns Bounded output text.
 */
function appendProcessOutput(current: string, chunk: string): string {
  if (current.length >= MAX_PROCESS_OUTPUT) return current
  return `${current}${chunk}`.slice(0, MAX_PROCESS_OUTPUT)
}

/**
 * Runs one executable with bounded output and a fixed timeout.
 * @param executable - Program to launch.
 * @param args - Process arguments.
 * @param cwd - Existing working directory.
 * @returns Exit code and captured output.
 */
function runProcess(executable: string, args: string[], cwd: string): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
    }, 60_000)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout = appendProcessOutput(stdout, chunk)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr = appendProcessOutput(stderr, chunk)
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })
  })
}

/**
 * Resolves a workspace-relative path and rejects traversal or symlink escapes.
 * @param cwd - User-selected Harness workspace.
 * @param relativePath - Renderer-supplied relative path.
 * @returns Safe absolute path inside the workspace, or null when missing.
 */
function resolveWorkspacePathIfExists(
  cwd: string | null | undefined,
  relativePath: string,
): string | null {
  const root = fs.realpathSync(resolveHarnessWorkFolder(cwd))
  const candidate = path.resolve(root, relativePath.trim())
  const relation = path.relative(root, candidate)
  if (relation.startsWith('..') || path.isAbsolute(relation)) {
    throw new Error('The workspace path is outside the selected folder.')
  }
  if (!fs.existsSync(candidate)) return null
  const resolved = fs.realpathSync(candidate)
  const resolvedRelation = path.relative(root, resolved)
  if (resolvedRelation.startsWith('..') || path.isAbsolute(resolvedRelation)) {
    throw new Error('The workspace path is outside the selected folder.')
  }
  return resolved
}

/**
 * Resolves a workspace-relative path and rejects traversal or symlink escapes.
 * @param cwd - User-selected Harness workspace.
 * @param relativePath - Renderer-supplied relative path.
 * @returns Safe absolute path inside the workspace.
 */
function resolveWorkspacePath(cwd: string | null | undefined, relativePath: string): string {
  const resolved = resolveWorkspacePathIfExists(cwd, relativePath)
  if (!resolved) throw new Error('The workspace path does not exist.')
  return resolved
}

/**
 * Lists one directory for the embedded Harness file browser.
 * Missing folders return an empty list so preview polling does not throw.
 * @param cwd - User-selected Harness workspace.
 * @param relativePath - Directory path relative to the workspace root.
 * @returns Sorted direct children, limited to a safe renderer payload.
 */
export function listHarnessWorkspace(
  cwd?: string | null,
  relativePath = '',
): HarnessWorkspaceEntry[] {
  const trimmed = relativePath.trim().split(/[\\/]/).filter(Boolean).join('/')
  if (trimmed === HARNESS_CANVAS_FOLDER) {
    ensureHarnessCanvasFolder(cwd)
  }
  const root = fs.realpathSync(resolveHarnessWorkFolder(cwd))
  const directory = resolveWorkspacePathIfExists(cwd, relativePath)
  if (!directory) return []
  if (!fs.statSync(directory).isDirectory()) throw new Error('The workspace path is not a directory.')
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => {
      return !(trimmed === HARNESS_CANVAS_FOLDER && entry.name === HARNESS_CANVAS_SESSIONS_FOLDER)
    })
    .map((entry): HarnessWorkspaceEntry => {
      const absolutePath = path.join(directory, entry.name)
      const relative = path.relative(root, absolutePath).split(path.sep).join('/')
      let size = 0
      if (entry.isFile()) {
        try {
          size = fs.statSync(absolutePath).size
        } catch {
          size = 0
        }
      }
      return {
        name: entry.name,
        relativePath: relative,
        kind: entry.isDirectory() ? 'directory' : 'file',
        size,
      }
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })
    .slice(0, MAX_DIRECTORY_ENTRIES)
}

/**
 * Reads a bounded text preview from one workspace file.
 * @param cwd - User-selected Harness workspace.
 * @param relativePath - File path relative to the workspace root.
 * @returns Text, binary detection, and truncation state.
 */
export function readHarnessWorkspaceFile(
  cwd: string | null | undefined,
  relativePath: string,
): HarnessWorkspaceFile {
  const absolutePath = resolveWorkspacePath(cwd, relativePath)
  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) throw new Error('The workspace path is not a file.')
  const length = Math.min(stat.size, MAX_FILE_PREVIEW_BYTES)
  const buffer = Buffer.alloc(length)
  const descriptor = fs.openSync(absolutePath, 'r')
  try {
    fs.readSync(descriptor, buffer, 0, length, 0)
  } finally {
    fs.closeSync(descriptor)
  }
  const binary = buffer.includes(0)
  return {
    relativePath: relativePath.split(path.sep).join('/'),
    content: binary ? '' : buffer.toString('utf8'),
    binary,
    truncated: stat.size > MAX_FILE_PREVIEW_BYTES,
  }
}

/**
 * Saves an editable HTML or Markdown file inside the workspace Canvas folder.
 * @param cwd - User-selected Harness workspace.
 * @param relativePath - Existing Canvas file path relative to the workspace root.
 * @param content - Complete UTF-8 document contents.
 * @returns Updated text preview.
 */
export function writeHarnessCanvasFile(
  cwd: string | null | undefined,
  relativePath: string,
  content: string,
): HarnessWorkspaceFile {
  const normalized = relativePath.trim().split(/[\\/]/).filter(Boolean).join('/')
  const extension = path.extname(normalized).toLowerCase()
  if (
    !normalized.startsWith(`${HARNESS_CANVAS_FOLDER}/`) ||
    normalized.startsWith(`${HARNESS_CANVAS_FOLDER}/${HARNESS_CANVAS_SESSIONS_FOLDER}/`) ||
    !['.html', '.htm', '.md', '.markdown'].includes(extension)
  ) {
    throw new Error('Only HTML and Markdown files inside the Canvas folder can be edited.')
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_CANVAS_EDIT_BYTES) {
    throw new Error('The Canvas document exceeds the 2 MB editing limit.')
  }
  const absolutePath = resolveWorkspacePath(cwd, normalized)
  if (!fs.statSync(absolutePath).isFile()) {
    throw new Error('The Canvas path is not a file.')
  }
  fs.writeFileSync(absolutePath, content, 'utf8')
  return readHarnessWorkspaceFile(cwd, normalized)
}

/**
 * Reads Git status and diffs for the embedded Review page.
 * @param cwd - User-selected Harness workspace.
 * @returns Working-tree snapshot, or a non-repository state.
 */
export async function readHarnessReview(cwd?: string | null): Promise<HarnessReviewSnapshot> {
  const folder = resolveHarnessWorkFolder(cwd)
  try {
    const repository = await runProcess('git', ['rev-parse', '--show-toplevel'], folder)
    if (repository.exitCode !== 0) {
      return { repository: false, status: '', summary: '', diff: '' }
    }
    const [status, summary, unstaged, staged] = await Promise.all([
      runProcess('git', ['status', '--short'], folder),
      runProcess('git', ['diff', '--stat', 'HEAD'], folder),
      runProcess('git', ['diff', '--no-ext-diff', '--unified=3'], folder),
      runProcess('git', ['diff', '--cached', '--no-ext-diff', '--unified=3'], folder),
    ])
    const sections = [
      unstaged.stdout.trim() ? `Unstaged changes\n\n${unstaged.stdout.trim()}` : '',
      staged.stdout.trim() ? `Staged changes\n\n${staged.stdout.trim()}` : '',
    ].filter(Boolean)
    return {
      repository: true,
      status: status.stdout.trim(),
      summary: summary.stdout.trim(),
      diff: sections.join('\n\n'),
    }
  } catch {
    return { repository: false, status: '', summary: '', diff: '' }
  }
}

/**
 * Opens a native directory picker for the Harness work folder.
 * @param sender - Renderer that requested the picker.
 * @returns Selected path, or null when cancelled.
 */
export async function pickHarnessWorkFolder(sender: WebContents): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(sender)
  const options = {
    title: 'Harness work folder',
    properties: ['openDirectory' as const, 'createDirectory' as const],
    defaultPath: defaultHarnessWorkFolder(),
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0] ?? null
}

/**
 * Opens a native multi-file picker for composer attachments.
 * @param sender - Renderer that requested the picker.
 * @returns Selected absolute paths, or an empty list when cancelled.
 */
export async function pickHarnessFiles(sender: WebContents): Promise<string[]> {
  const window = BrowserWindow.fromWebContents(sender)
  const options = {
    title: 'Add files to Harness',
    properties: ['openFile' as const, 'multiSelections' as const],
    filters: [
      { name: 'Documents, Office, and images', extensions: HARNESS_ATTACHMENT_DIALOG_EXTENSIONS },
      { name: 'All files', extensions: ['*'] },
    ],
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? [] : result.filePaths
}

/**
 * Opens a native folder picker for one composer attachment.
 * @param sender - Renderer that requested the picker.
 * @returns Selected absolute path, or null when cancelled.
 */
export async function pickHarnessAttachmentFolder(sender: WebContents): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(sender)
  const options = {
    title: 'Add folder to Harness',
    properties: ['openDirectory' as const],
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}
