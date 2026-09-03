/**
 * Locates the pinned Codex `app-server` binary for the Harness workflow.
 *
 * Resolution order: explicit override, packaged resources, in-tree
 * `src/lib/codex` build, then a local `codex-main` checkout during
 * development. The npm `@openai/codex` CLI is never used as the product entry.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

/** Environment variable that pins the workflow binary. */
const BINARY_ENV_VAR = 'GEOCRM_CODEX_BIN'

/** Source checkout consulted in development builds. */
const DEV_CHECKOUT_ENV_VAR = 'GEOCRM_CODEX_SOURCE'

/**
 * Executable names to try for this platform.
 * @returns `codex-app-server` first (in-tree), then the upstream `codex` CLI.
 */
function binaryNames(): string[] {
  if (process.platform === 'win32') {
    return ['codex-app-server.exe', 'codex.exe']
  }
  return ['codex-app-server', 'codex']
}

/**
 * Returns the path when it points at an existing file.
 * @param candidate - Absolute path to test.
 * @returns The path, or empty string.
 */
function existingFile(candidate: string): string {
  try {
    return fs.statSync(candidate).isFile() ? candidate : ''
  } catch {
    return ''
  }
}

/**
 * In-tree `src/lib/codex` roots (dev checkout and packaged app path).
 * @returns Absolute directories that may contain `bin/` or `target/`.
 */
function inTreeRoots(): string[] {
  const rel = path.join('src', 'lib', 'codex')
  return [
    path.join(process.env.APP_ROOT ?? app.getAppPath(), rel),
    path.join(app.getAppPath(), rel),
  ]
}

/**
 * Candidate binary locations, most specific first.
 * @returns Absolute paths to test.
 */
function candidatePaths(): string[] {
  const names = binaryNames()
  const candidates: string[] = []

  const override = process.env[BINARY_ENV_VAR]?.trim()
  if (override) {
    candidates.push(override)
  }

  if (app.isPackaged) {
    for (const name of names) {
      candidates.push(path.join(process.resourcesPath, 'codex', name))
    }
  }

  for (const root of inTreeRoots()) {
    for (const name of names) {
      candidates.push(path.join(root, 'bin', name))
      candidates.push(path.join(root, 'target', 'release', name))
      candidates.push(path.join(root, 'target', 'debug', name))
    }
  }

  const checkout = process.env[DEV_CHECKOUT_ENV_VAR]?.trim()
  const devRoots = checkout ? [checkout] : []
  for (const root of devRoots) {
    for (const name of names) {
      candidates.push(path.join(root, 'codex-rs', 'target', 'release', name))
      candidates.push(path.join(root, 'codex-rs', 'target', 'debug', name))
    }
  }

  for (const name of names) {
    candidates.push(path.join(os.homedir(), '.cargo', 'bin', name))
  }
  return candidates
}

/**
 * CLI arguments that start `app-server` on stdio for this binary.
 *
 * The in-tree crate is `codex-app-server` (listen URL). The upstream `codex`
 * CLI still uses the `app-server` subcommand.
 *
 * @param binary - Resolved executable path.
 * @returns argv after the program name.
 */
export function workflowSpawnArgs(binary: string): string[] {
  const base = path.basename(binary).replace(/\.exe$/i, '').toLowerCase()
  const rest = ['--listen', 'stdio://', '--session-source', 'app-server']
  if (base === 'codex' || base === 'codex-cli') {
    return ['app-server', ...rest]
  }
  return rest
}

/**
 * Resolves the workflow binary for this machine.
 * @returns Absolute path, or empty string when none is installed.
 */
export function resolveCodexBinary(): string {
  if (process.env.GEOCRM_DISABLE_CODEX_HOST === '1') return ''
  for (const candidate of candidatePaths()) {
    const found = existingFile(candidate)
    if (found) {
      return found
    }
  }
  return ''
}
