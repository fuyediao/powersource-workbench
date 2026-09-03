import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cargoBin = path.join(process.env.CARGO_HOME || path.join(os.homedir(), '.cargo'), 'bin')
if (fs.existsSync(cargoBin)) {
  process.env.PATH = `${cargoBin}${path.delimiter}${process.env.PATH ?? ''}`
}

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const codexRoot = path.join(electronRoot, 'src/lib/codex')
const binDir = path.join(codexRoot, 'bin')
const outName = process.platform === 'win32' ? 'codex-app-server.exe' : 'codex-app-server'
const outPath = path.join(binDir, outName)
const force = process.argv.includes('--force') || process.argv.includes('-f')
const optional = process.argv.includes('--optional')

/**
 * Logs a prebuild status line.
 * @param message - Message.
 * @returns Nothing.
 */
function log(message) {
  console.log(`[harness:prebuild] ${message}`)
}

/**
 * Reads `--arch=` or `GOARCH` / `CARGO_BUILD_TARGET` for packaging.
 * Matches the Clash flow (`GOARCH=arm64` / `amd64`).
 * @returns Cargo target triple, or null to use the host default.
 */
function resolveCargoTarget() {
  const fromArg = process.argv.find((item) => item.startsWith('--arch='))
  const raw = (
    fromArg ? fromArg.slice('--arch='.length) : process.env.CARGO_BUILD_TARGET || process.env.GOARCH || ''
  ).trim()
  const normalized = raw.toLowerCase()
  if (
    normalized === 'aarch64-apple-darwin' ||
    normalized === 'arm64' ||
    normalized === 'aarch64'
  ) {
    return 'aarch64-apple-darwin'
  }
  if (
    normalized === 'x86_64-apple-darwin' ||
    normalized === 'amd64' ||
    normalized === 'x64' ||
    normalized === 'x86_64'
  ) {
    return 'x86_64-apple-darwin'
  }
  if (process.platform !== 'darwin') {
    return null
  }
  return process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
}

/**
 * Returns `file(1)` output for a Mach-O / PE binary.
 * @param filePath - Absolute path.
 * @returns Description, or empty string.
 */
function describeBinary(filePath) {
  const result = spawnSync('file', ['-b', filePath], { encoding: 'utf8' })
  return (result.stdout ?? '').trim()
}

/**
 * Returns whether `filePath` is a thin binary for `target`.
 * @param filePath - Existing `codex-app-server`.
 * @param target - Cargo triple, or null for host.
 * @returns True when the on-disk arch matches.
 */
function binaryMatchesTarget(filePath, target) {
  if (!fs.existsSync(filePath)) {
    return false
  }
  const info = describeBinary(filePath)
  if (target === 'aarch64-apple-darwin') {
    return /arm64|aarch64/i.test(info) && !/x86_64/i.test(info)
  }
  if (target === 'x86_64-apple-darwin') {
    return /x86_64/i.test(info) && !/arm64|aarch64/i.test(info)
  }
  return true
}

/**
 * Compiles in-tree Codex `app-server` (`src/lib/codex`) into `bin/`.
 * @returns Nothing.
 */
function buildCodex() {
  const cargoTarget = resolveCargoTarget()
  if (!force && binaryMatchesTarget(outPath, cargoTarget)) {
    log(`using ${outPath} (${describeBinary(outPath)})`)
    return
  }
  if (optional && !force) {
    log('skipping cargo (optional); run npm run harness:prebuild for a real Harness kernel')
    return
  }
  if (!fs.existsSync(path.join(codexRoot, 'Cargo.toml'))) {
    throw new Error(`Missing in-tree Codex workspace at ${codexRoot}`)
  }
  fs.mkdirSync(binDir, { recursive: true })
  const cargoArgs = [
    'build',
    '--release',
    '-p',
    'codex-app-server',
    '--bin',
    'codex-app-server',
  ]
  if (cargoTarget) {
    cargoArgs.push('--target', cargoTarget)
  }
  log(`cargo ${cargoArgs.join(' ')}`)
  let result = spawnSync('cargo', [...cargoArgs, '--locked'], {
    cwd: codexRoot,
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    log('cargo --locked failed; retrying without --locked')
    result = spawnSync('cargo', cargoArgs, {
      cwd: codexRoot,
      stdio: 'inherit',
      env: process.env,
    })
  }
  if (result.error) {
    throw new Error(
      `Rust is required to build in-tree Codex (${result.error.message}).`,
    )
  }
  if (result.status !== 0) {
    throw new Error(`cargo build exited with code ${result.status ?? 'unknown'}`)
  }
  const builtName = process.platform === 'win32' ? 'codex-app-server.exe' : 'codex-app-server'
  const builtPath = cargoTarget
    ? path.join(codexRoot, 'target', cargoTarget, 'release', builtName)
    : path.join(codexRoot, 'target', 'release', builtName)
  if (!fs.existsSync(builtPath)) {
    throw new Error(`cargo build did not write ${builtPath}`)
  }
  fs.copyFileSync(builtPath, outPath)
  fs.chmodSync(outPath, 0o755)
  const info = describeBinary(outPath)
  if (cargoTarget && !binaryMatchesTarget(outPath, cargoTarget)) {
    throw new Error(`Codex binary arch mismatch: wanted ${cargoTarget}, got ${info || 'unknown'}`)
  }
  log(`wrote ${outPath} (${info})`)
}

try {
  buildCodex()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (optional) {
    console.warn(`[harness:prebuild] ${message}`)
    process.exit(0)
  }
  console.error(`[harness:prebuild] ${message}`)
  process.exit(1)
}
