import fs from 'node:fs'
import path from 'node:path'

/**
 * Loads KEY=VALUE pairs from a .env file into process.env when unset.
 * Does not override variables already present in the environment.
 * @param filePath - Absolute path to a dotenv file.
 * @returns Nothing.
 */
export function loadDotEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return
  }
  const text = fs.readFileSync(filePath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = line.slice(0, eq).trim()
    if (!key || process.env[key] !== undefined) {
      continue
    }
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

/**
 * Loads package-root `.env` for the Electron main process (so
 * `VITE_DEPLOYMENT_DOMAIN` is available outside the Vite renderer).
 * Packaged builds also copy `.env` to `process.resourcesPath`.
 * @param appRoot - Absolute package directory (contains `.env` in dev).
 * @returns Nothing.
 */
export function loadMainProcessEnv(appRoot: string): void {
  loadDotEnvFile(path.join(appRoot, '.env'))
  if (process.resourcesPath) {
    loadDotEnvFile(path.join(process.resourcesPath, '.env'))
  }
}
