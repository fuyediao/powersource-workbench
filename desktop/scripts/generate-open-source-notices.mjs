import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJsonPath = path.join(electronRoot, 'package.json')
const nodeModules = path.join(electronRoot, 'node_modules')
const outPath = path.join(electronRoot, 'src', 'utils', 'settings', 'open-source-npm.json')

/**
 * @typedef {{ name: string, license: string, homepage: string }} NpmNotice
 */

/**
 * Reads a package.json file.
 * @param {string} filePath - Absolute path.
 * @returns {Record<string, unknown> | null}
 */
function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Resolves a license string from a package.json object.
 * @param {Record<string, unknown>} pkg - Parsed package.json.
 * @returns {string}
 */
function licenseOf(pkg) {
  if (typeof pkg.license === 'string' && pkg.license.trim()) {
    return pkg.license.trim()
  }
  if (Array.isArray(pkg.licenses)) {
    const parts = pkg.licenses
      .map((entry) => {
        if (entry && typeof entry === 'object' && typeof entry.type === 'string') {
          return entry.type
        }
        return ''
      })
      .filter(Boolean)
    if (parts.length > 0) {
      return parts.join(', ')
    }
  }
  return 'SEE PACKAGE'
}

/**
 * Resolves a homepage or repository URL.
 * @param {Record<string, unknown>} pkg - Parsed package.json.
 * @returns {string}
 */
function homepageOf(pkg) {
  if (typeof pkg.homepage === 'string' && pkg.homepage.trim()) {
    return pkg.homepage.trim()
  }
  const repository = pkg.repository
  let raw = ''
  if (typeof repository === 'string') {
    raw = repository
  } else if (repository && typeof repository === 'object' && typeof repository.url === 'string') {
    raw = repository.url
  }
  if (!raw) {
    return ''
  }
  return raw
    .replace(/^git\+/, '')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git$/, '')
}

/**
 * Loads the installed package.json for a dependency name.
 * @param {string} name - npm package name.
 * @returns {Record<string, unknown> | null}
 */
function readInstalled(name) {
  return readJson(path.join(nodeModules, ...name.split('/'), 'package.json'))
}

const rootPkg = readJson(packageJsonPath)
if (!rootPkg || typeof rootPkg !== 'object' || !rootPkg.dependencies) {
  throw new Error('package.json dependencies are missing')
}

const names = Object.keys(rootPkg.dependencies).sort((a, b) => a.localeCompare(b))
/** @type {NpmNotice[]} */
const notices = []
for (const name of names) {
  const installed = readInstalled(name)
  const license = installed ? licenseOf(installed) : 'SEE PACKAGE'
  const homepage = installed ? homepageOf(installed) : ''
  notices.push({ name, license, homepage })
}

writeFileSync(outPath, `${JSON.stringify(notices, null, 2)}\n`, 'utf8')
console.log(`Wrote ${notices.length} npm notices -> ${path.relative(electronRoot, outPath)}`)
