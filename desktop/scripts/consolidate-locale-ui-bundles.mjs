/**
 * Consolidates string-leaf locale JSON files into a flat `ui.json` bundle
 * per namespace (merged into the parent by load-locales). Skips `mail`
 * (already thematic) and leaves existing object files untouched.
 *
 * Run from geocrm-electron: `node scripts/consolidate-locale-ui-bundles.mjs`
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALES_ROOT = path.resolve(__dirname, '../src/i18n/locales')
const LOCALES = ['en-us', 'zh-tw', 'zh-cn']
const SKIP_NAMESPACES = new Set(['mail'])

/**
 * Converts kebab-case stem to camelCase key.
 * @param stem - File basename without .json.
 * @returns Camel-case key.
 */
function toCamel(stem) {
  return stem.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Lists JSON files directly under a directory (non-recursive).
 * Nested object trees (e.g. folio/actions.json) stay as-is; only root leaves
 * are consolidated into ui.json.
 * @param dir - Directory path.
 * @returns Filenames ending in .json.
 */
function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) {
    return []
  }
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((ent) => ent.isFile() && ent.name.endsWith('.json'))
    .map((ent) => ent.name)
}

/**
 * Consolidates string leaves for one namespace across locales using en-us
 * as the key inventory (zh-* may miss a leaf; fall back to en-us text).
 * @param namespace - Folder under locales/{lang}/.
 */
function consolidateNamespace(namespace) {
  const enDir = path.join(LOCALES_ROOT, 'en-us', namespace)
  const enFiles = listJsonFiles(enDir)
  const stringStems = []
  for (const file of enFiles) {
    if (file === 'ui.json') {
      continue
    }
    const raw = fs.readFileSync(path.join(enDir, file), 'utf8').trim()
    if (!raw.startsWith('{') && !raw.startsWith('[')) {
      stringStems.push(file.replace(/\.json$/, ''))
    }
  }
  if (stringStems.length === 0) {
    return
  }

  for (const locale of LOCALES) {
    const dir = path.join(LOCALES_ROOT, locale, namespace)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const bundle = {}
    for (const stem of stringStems) {
      const filePath = path.join(dir, `${stem}.json`)
      let value
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8').trim()
        if (raw.startsWith('{') || raw.startsWith('[')) {
          throw new Error(`[${locale}/${namespace}] expected string leaf: ${stem}.json`)
        }
        value = JSON.parse(raw)
      } else {
        const enPath = path.join(enDir, `${stem}.json`)
        value = JSON.parse(fs.readFileSync(enPath, 'utf8').trim())
        console.warn(`missing ${locale}/${namespace}/${stem}.json — copied en-us`)
      }
      bundle[toCamel(stem)] = value
    }
    const keys = Object.keys(bundle).sort((a, b) => a.localeCompare(b))
    const sorted = {}
    for (const key of keys) {
      sorted[key] = bundle[key]
    }
    fs.writeFileSync(path.join(dir, 'ui.json'), `${JSON.stringify(sorted, null, 2)}\n`, 'utf8')
    for (const stem of stringStems) {
      const leaf = path.join(dir, `${stem}.json`)
      if (fs.existsSync(leaf)) {
        fs.unlinkSync(leaf)
      }
    }
    console.log(`wrote ${locale}/${namespace}/ui.json (${keys.length} keys)`)
  }
}

/**
 * Discovers namespaces under en-us that still have string leaves.
 * @returns Namespace folder names.
 */
function namespacesWithStringLeaves() {
  const root = path.join(LOCALES_ROOT, 'en-us')
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((ent) => ent.isDirectory() && !SKIP_NAMESPACES.has(ent.name))
    .map((ent) => ent.name)
    .filter((namespace) => {
      const dir = path.join(root, namespace)
      return listJsonFiles(dir).some((file) => {
        if (file === 'ui.json') {
          return false
        }
        const raw = fs.readFileSync(path.join(dir, file), 'utf8').trim()
        return !raw.startsWith('{') && !raw.startsWith('[')
      })
    })
    .sort()
}

const namespaces = namespacesWithStringLeaves()
console.log('consolidating:', namespaces.join(', '))
for (const namespace of namespaces) {
  consolidateNamespace(namespace)
}
console.log('done')
