/**
 * Interactive system-shell PTYs for the Harness utility Terminal tab.
 *
 * One session per renderer tab. Windows uses PowerShell, macOS uses zsh,
 * and Linux uses $SHELL (bash when unset). Sessions are ConPTY / Unix PTY
 * processes, not one-shot command spawns.
 */

import { createRequire } from 'node:module'
import path from 'node:path'
import type { IPty } from 'node-pty'
import type { WebContents } from 'electron'
import { HARNESS_PTY_DATA_EVENT, HARNESS_PTY_EXIT_EVENT } from '../../shared/harness'
import { resolveHarnessWorkFolder } from './work-folder'

const SESSION_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,80}$/
const MAX_WRITE_BYTES = 64 * 1024
const MIN_COLS = 2
const MAX_COLS = 500
const MIN_ROWS = 2
const MAX_ROWS = 200

interface PtySession {
  pty: IPty
  sender: WebContents
  sessionId: string
}

const sessions = new Map<string, PtySession>()
const destroyListeners = new Set<number>()

let ptyModule: typeof import('node-pty') | null = null

/**
 * Loads the CJS `node-pty` native module.
 * @returns node-pty exports.
 */
function loadNodePty(): typeof import('node-pty') {
  if (ptyModule) return ptyModule
  const require = createRequire(import.meta.url)
  try {
    ptyModule = require('node-pty') as typeof import('node-pty')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `The system terminal native module is unavailable (${detail}). Run npm run rebuild:native.`,
    )
  }
  return ptyModule
}

/**
 * Builds a map key for one renderer terminal tab.
 * @param webContentsId - Renderer webContents.id.
 * @param sessionId - Tab session id from the renderer.
 * @returns Combined session key.
 */
function sessionKey(webContentsId: number, sessionId: string): string {
  return `${webContentsId}:${sessionId}`
}

/**
 * Clamps a PTY dimension to a supported range.
 * @param value - Requested size.
 * @param min - Inclusive minimum.
 * @param max - Inclusive maximum.
 * @param fallback - Value used when the request is not a finite number.
 * @returns Integer size.
 */
function clampDimension(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Returns the login shell and argv for the current OS.
 * @returns Executable path and arguments.
 */
function resolveSystemShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot?.trim() || 'C:\\Windows'
    return {
      file: path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
      args: ['-NoLogo'],
    }
  }
  if (process.platform === 'darwin') {
    return { file: '/bin/zsh', args: ['-l'] }
  }
  const shell = process.env.SHELL?.trim() || '/bin/bash'
  return { file: shell, args: ['-l'] }
}

/**
 * Copies process environment and sets terminal identity variables.
 * @returns Environment block for the child shell.
 */
function buildShellEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'Workbench'
  return env
}

/**
 * Stops one PTY session if it is still tracked.
 * @param key - Combined session key.
 * @returns Nothing.
 */
function disposeSession(key: string): void {
  const session = sessions.get(key)
  if (!session) return
  sessions.delete(key)
  try {
    session.pty.kill()
  } catch {
    // The child may already have exited.
  }
}

/**
 * Disposes every PTY owned by one renderer.
 * @param webContentsId - Renderer webContents.id.
 * @returns Nothing.
 */
export function disposeHarnessPtysFor(webContentsId: number): void {
  const prefix = `${webContentsId}:`
  for (const key of Array.from(sessions.keys())) {
    if (key.startsWith(prefix)) disposeSession(key)
  }
}

/**
 * Disposes every Harness PTY (app shutdown).
 * @returns Nothing.
 */
export function disposeAllHarnessPtys(): void {
  for (const key of Array.from(sessions.keys())) disposeSession(key)
}

/**
 * Rekeys live terminal sessions when a Harness tab moves to another renderer.
 * @param sourceId - Previous renderer id.
 * @param target - Destination renderer.
 * @returns Nothing.
 */
export function transferHarnessPtys(sourceId: number, target: WebContents): void {
  const prefix = `${sourceId}:`
  disposeHarnessPtysFor(target.id)
  for (const [key, session] of Array.from(sessions.entries())) {
    if (!key.startsWith(prefix)) continue
    sessions.delete(key)
    session.sender = target
    sessions.set(sessionKey(target.id, session.sessionId), session)
  }
  watchRenderer(target)
}

/**
 * Registers a one-shot destroy listener so PTYs die with the window.
 * @param sender - Renderer web contents.
 * @returns Nothing.
 */
function watchRenderer(sender: WebContents): void {
  if (destroyListeners.has(sender.id) || sender.isDestroyed()) return
  destroyListeners.add(sender.id)
  sender.once('destroyed', () => {
    destroyListeners.delete(sender.id)
    disposeHarnessPtysFor(sender.id)
  })
}

/**
 * Spawns (or replaces) an interactive system shell for one terminal tab.
 * @param sender - Renderer that owns the tab.
 * @param sessionId - Tab session id.
 * @param cwd - Harness work folder, or empty for Documents/Harness.
 * @param cols - Initial columns.
 * @param rows - Initial rows.
 * @returns Nothing.
 */
export function spawnHarnessPty(
  sender: WebContents,
  sessionId: string,
  cwd: string | null,
  cols: unknown,
  rows: unknown,
): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('The terminal session id is invalid.')
  }
  const ptyApi = loadNodePty()
  const key = sessionKey(sender.id, sessionId)
  disposeSession(key)
  watchRenderer(sender)
  const folder = resolveHarnessWorkFolder(cwd)
  const shell = resolveSystemShell()
  const options = {
    name: 'xterm-256color',
    cols: clampDimension(cols, MIN_COLS, MAX_COLS, 80),
    rows: clampDimension(rows, MIN_ROWS, MAX_ROWS, 24),
    cwd: folder,
    env: buildShellEnv(),
    encoding: 'utf8' as const,
  }
  const pty = process.platform === 'win32'
    ? ptyApi.spawn(shell.file, shell.args, { ...options, useConpty: true })
    : ptyApi.spawn(shell.file, shell.args, options)
  const session = { pty, sender, sessionId }
  sessions.set(key, session)
  pty.onData((data) => {
    if (session.sender.isDestroyed()) return
    session.sender.send(HARNESS_PTY_DATA_EVENT, { sessionId, data })
  })
  pty.onExit(({ exitCode }) => {
    sessions.delete(key)
    if (session.sender.isDestroyed()) return
    session.sender.send(HARNESS_PTY_EXIT_EVENT, { sessionId, exitCode })
  })
}

/**
 * Writes UTF-8 input into an existing PTY.
 * @param webContentsId - Renderer webContents.id.
 * @param sessionId - Tab session id.
 * @param data - Raw keystrokes or pasted text.
 * @returns Nothing.
 */
export function writeHarnessPty(webContentsId: number, sessionId: string, data: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId) || typeof data !== 'string' || data.length === 0) {
    return
  }
  if (Buffer.byteLength(data, 'utf8') > MAX_WRITE_BYTES) {
    throw new Error('The terminal write is too large.')
  }
  const session = sessions.get(sessionKey(webContentsId, sessionId))
  if (!session) return
  session.pty.write(data)
}

/**
 * Resizes an existing PTY to match the xterm grid.
 * @param webContentsId - Renderer webContents.id.
 * @param sessionId - Tab session id.
 * @param cols - Columns.
 * @param rows - Rows.
 * @returns Nothing.
 */
export function resizeHarnessPty(
  webContentsId: number,
  sessionId: string,
  cols: unknown,
  rows: unknown,
): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) return
  const session = sessions.get(sessionKey(webContentsId, sessionId))
  if (!session) return
  session.pty.resize(
    clampDimension(cols, MIN_COLS, MAX_COLS, 80),
    clampDimension(rows, MIN_ROWS, MAX_ROWS, 24),
  )
}

/**
 * Kills one terminal tab's PTY.
 * @param webContentsId - Renderer webContents.id.
 * @param sessionId - Tab session id.
 * @returns Nothing.
 */
export function disposeHarnessPty(webContentsId: number, sessionId: string): void {
  if (!SESSION_ID_PATTERN.test(sessionId)) return
  disposeSession(sessionKey(webContentsId, sessionId))
}
