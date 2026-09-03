import fs from 'node:fs'
import { dump as dumpYaml, load as loadYaml } from 'js-yaml'

import { dnsConfigPath } from './enhance'
import type { ClashValidationOutcome } from './types'

/**
 * Whether a persisted DNS overlay file exists (`check_dns_config_exists`).
 * @returns True when `dns_config.yaml` exists.
 */
export function dnsConfigExists(): boolean {
  return fs.existsSync(dnsConfigPath())
}

/**
 * Reads the persisted DNS overlay file as raw YAML (`get_dns_config_content`).
 * @returns YAML text, or an empty string when missing.
 */
export function readDnsConfigContent(): string {
  const path = dnsConfigPath()
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : ''
}

/**
 * Persists a DNS config object (`{ dns, hosts }`) as YAML (`save_dns_config`).
 * @param config - Parsed config object from the DNS editor.
 */
export function saveDnsConfig(config: unknown): void {
  const text = dumpYaml(config ?? {}, { forceQuotes: false, lineWidth: -1 })
  fs.writeFileSync(dnsConfigPath(), text, 'utf8')
}

/**
 * Validates the persisted DNS overlay by parsing it as YAML and checking the shape Mihomo
 * expects (`validate_dns_config`). Actual Mihomo validation happens implicitly the next
 * time `enhance` runs and the sidecar restarts.
 * @returns Validation outcome for the DNS editor dialog.
 */
export function validateDnsConfig(): ClashValidationOutcome {
  const path = dnsConfigPath()
  if (!fs.existsSync(path)) {
    return { status: 'skipped', reason: 'No DNS config file saved yet' }
  }
  try {
    const parsed = loadYaml(fs.readFileSync(path, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { status: 'invalid', kind: 'yaml', message: 'DNS config must be a YAML mapping' }
    }
    return { status: 'valid' }
  } catch (err) {
    return {
      status: 'invalid',
      kind: 'yaml',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
