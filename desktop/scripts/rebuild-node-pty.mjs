/**
 * Rebuilds `node-pty` against the bundled Electron ABI.
 *
 * Visual Studio 18 enables Spectre mitigation by default (MSB8040 without
 * extra libraries) and node-gyp often misses the MSVC `lib\\x64` directory
 * (LNK1181 delayimp.lib). This script writes Directory.Build files that turn
 * Spectre off and point the linker at delayimp.lib, then invokes
 * @electron/rebuild from a 64-bit vcvars shell.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ptyRoot = path.join(electronRoot, 'node_modules', 'node-pty')
const optional = process.argv.includes('--optional')

const VCVARS_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat',
  'C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat',
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat',
  'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat',
]

const MSVC_ROOTS = [
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Tools\\MSVC',
  'C:\\Program Files\\Microsoft Visual Studio\\18\\Community\\VC\\Tools\\MSVC',
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\VC\\Tools\\MSVC',
  'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Tools\\MSVC',
]

/**
 * Logs a rebuild status line.
 * @param {string} message - Message.
 * @returns {void}
 */
function log(message) {
  console.log(`[rebuild:native] ${message}`)
}

/**
 * Finds the MSVC x64 library directory that contains delayimp.lib.
 * @returns {string | null} Absolute lib\\x64 directory, or null when missing.
 */
function findMsvcLibX64() {
  for (const root of MSVC_ROOTS) {
    if (!fs.existsSync(root)) continue
    const versions = fs.readdirSync(root)
    versions.sort()
    for (let index = versions.length - 1; index >= 0; index -= 1) {
      const libDir = path.join(root, versions[index], 'lib', 'x64')
      if (fs.existsSync(path.join(libDir, 'delayimp.lib'))) return libDir
    }
  }
  return null
}

/**
 * Writes Spectre-off MSBuild imports and an explicit delayimp.lib search path.
 * Windows only: Unix node-gyp ignores these files.
 * @returns {void}
 */
function writeSpectreOverrides() {
  if (process.platform !== 'win32') return
  if (!fs.existsSync(ptyRoot)) {
    throw new Error(`node-pty is not installed at ${ptyRoot}`)
  }
  const libDir = findMsvcLibX64()
  if (!libDir) {
    throw new Error('delayimp.lib was not found under Visual Studio MSVC lib\\x64.')
  }
  const xml = `<Project>
  <PropertyGroup>
    <SpectreMitigation>false</SpectreMitigation>
  </PropertyGroup>
  <ItemDefinitionGroup>
    <Link>
      <AdditionalLibraryDirectories>${libDir};%(AdditionalLibraryDirectories)</AdditionalLibraryDirectories>
    </Link>
  </ItemDefinitionGroup>
</Project>
`
  fs.writeFileSync(path.join(ptyRoot, 'Directory.Build.props'), xml)
  fs.writeFileSync(path.join(ptyRoot, 'Directory.Build.targets'), xml)
  log(`linker lib path ${libDir}`)
}

/**
 * Drops the legacy winpty `pty` target so Windows only builds ConPTY addons.
 * @returns {void}
 */
function skipWinptyTarget() {
  if (process.platform !== 'win32') return
  const gypPath = path.join(ptyRoot, 'binding.gyp')
  const source = fs.readFileSync(gypPath, 'utf8')
  if (source.includes('geocrm_skip_winpty')) return
  const next = source.replace(
    /\n        \{\n          'target_name': 'pty',[\s\S]*?'libraries': \[\n            '-lshlwapi'\n          \],\n        \}/,
    "\n        {\n          'target_name': 'geocrm_skip_winpty',\n          'type': 'none'\n        }",
  )
  if (next === source) {
    log('could not skip the winpty target; building every Windows target')
    return
  }
  fs.writeFileSync(gypPath, next)
  log('skipped legacy winpty target (ConPTY only)')
}

/**
 * Rebuilds node-pty for the local Electron version.
 * @returns {void}
 */
function rebuild() {
  if (!fs.existsSync(ptyRoot)) {
    throw new Error(`node-pty is not installed at ${ptyRoot}`)
  }
  writeSpectreOverrides()
  skipWinptyTarget()
  if (process.platform === 'win32') {
    log('rebuilding node-pty for Electron (win32 / ConPTY)')
    const vcvars = VCVARS_CANDIDATES.find((candidate) => fs.existsSync(candidate))
    if (!vcvars) {
      throw new Error('A Visual Studio vcvars64.bat was not found.')
    }
    const result = spawnSync(
      `call "${vcvars}" && npx electron-rebuild -f -w node-pty`,
      { cwd: electronRoot, stdio: 'inherit', shell: true },
    )
    if (result.error) throw new Error(result.error.message)
    if (result.status !== 0) {
      throw new Error(`electron-rebuild exited with code ${result.status ?? 'unknown'}`)
    }
    return
  }
  log(`rebuilding node-pty for Electron (${process.platform} / Unix PTY)`)
  const result = spawnSync('npx', ['electron-rebuild', '-f', '-w', 'node-pty'], {
    cwd: electronRoot,
    stdio: 'inherit',
  })
  if (result.error) throw new Error(result.error.message)
  if (result.status !== 0) {
    throw new Error(`electron-rebuild exited with code ${result.status ?? 'unknown'}`)
  }
}

try {
  rebuild()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (optional) {
    console.warn(`[rebuild:native] ${message}`)
    process.exit(0)
  }
  console.error(`[rebuild:native] ${message}`)
  process.exit(1)
}
