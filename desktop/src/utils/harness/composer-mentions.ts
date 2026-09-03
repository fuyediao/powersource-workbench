/**
 * ChatGPT-style `@` mentions for Harness composer plugins and connectors.
 */

import type { HarnessAppConnector, HarnessComposerMention, HarnessMcpServerStatus } from '@/types/harness'
import type { HarnessMcpServer } from '@/utils/settings/harness-prefs'

/** One row in the composer `@` picker. */
export interface ComposerMentionOption {
  id: string
  name: string
  /** Codex mention path (`app://…`), or empty when the turn only needs the `@` token. */
  path: string
  kind: 'workbench' | 'mcp' | 'connector'
  callable: boolean
  needsOauth: boolean
  /** MCP config key used for OAuth login. */
  mcpLoginName?: string
}

/** Active `@query` span in the composer. */
export interface ComposerMentionQuery {
  start: number
  query: string
}

/**
 * Builds the `@` token inserted for a plugin display name.
 * @param name - Visible plugin name.
 * @returns Token without the leading `@`.
 */
export function mentionToken(name: string): string {
  return name.replace(/[^\p{L}\p{N}]+/gu, '')
}

/**
 * Returns the `@query` span at the caret, when the user is mentioning a plugin.
 * @param text - Composer value.
 * @param caret - Caret offset.
 * @returns Query span, or null when `@` is not active.
 */
export function mentionQueryAt(text: string, caret: number): ComposerMentionQuery | null {
  const index = Math.max(0, Math.min(caret, text.length))
  const before = text.slice(0, index)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(before[at - 1] ?? '')) return null
  const query = before.slice(at + 1)
  if (/[\s@]/.test(query)) return null
  return { start: at, query }
}

/**
 * Replaces the active `@query` with a selected plugin token.
 * @param text - Composer value.
 * @param caret - Caret offset.
 * @param name - Selected plugin name.
 * @returns Updated text and caret after the inserted token.
 */
export function insertMentionToken(
  text: string,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const span = mentionQueryAt(text, caret)
  if (!span) {
    const token = `@${mentionToken(name)} `
    return { text: `${text}${token}`, caret: text.length + token.length }
  }
  const token = `@${mentionToken(name)} `
  const next = `${text.slice(0, span.start)}${token}${text.slice(caret)}`
  return { text: next, caret: span.start + token.length }
}

/**
 * Returns whether `text` still contains one plugin `@` token.
 * @param text - Composer value.
 * @param name - Plugin display name.
 * @returns True when the token is present as a standalone mention.
 */
export function textHasMentionToken(text: string, name: string): boolean {
  const token = mentionToken(name)
  if (!token) return false
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`@${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text)
}

/**
 * Filters picker rows by the text after `@`.
 * @param items - Full catalog.
 * @param query - Text after `@`.
 * @returns Matching rows.
 */
export function filterMentionOptions(
  items: ComposerMentionOption[],
  query: string,
): ComposerMentionOption[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return items
  return items.filter((item) => {
    const token = mentionToken(item.name).toLowerCase()
    return item.name.toLowerCase().includes(needle) || token.includes(needle)
  })
}

/**
 * Collects structured mentions still present in the composer text.
 * @param text - Composer value.
 * @param catalog - Picker catalog.
 * @returns Mentions to send with the turn.
 */
export function mentionsInText(
  text: string,
  catalog: ComposerMentionOption[],
): HarnessComposerMention[] {
  return catalog
    .filter((item) => textHasMentionToken(text, item.name))
    .map((item) => ({ name: item.name, path: item.path }))
}

/**
 * Builds the `@` picker catalog: Workbench, local MCP, then hosted connectors.
 * @param mcpServers - Configured MCP profiles.
 * @param mcpStatus - Runtime status for those profiles.
 * @param connectors - Hosted connectors from Codex.
 * @param fallbackConnectors - Names shown when the directory is empty.
 * @returns Picker rows.
 */
export function buildMentionCatalog(
  mcpServers: HarnessMcpServer[],
  mcpStatus: HarnessMcpServerStatus[],
  connectors: HarnessAppConnector[],
  fallbackConnectors: readonly string[],
): ComposerMentionOption[] {
  const rows: ComposerMentionOption[] = [
    {
      id: 'workbench',
      name: 'Workbench',
      path: '',
      kind: 'workbench',
      callable: true,
      needsOauth: false,
    },
  ]
  for (const server of mcpServers) {
    const status = mcpStatus.find(
      (item) => item.name.toLowerCase() === server.name.toLowerCase(),
    )
    const connected = status?.runtimeStatus === 'connected'
    const needsOauth =
      server.transport === 'streamableHttp' &&
      status?.authStatus !== 'oAuth' &&
      status?.authStatus !== 'bearerToken'
    rows.push({
      id: `mcp:${server.name}`,
      name: server.displayName?.trim() || server.name,
      path: '',
      kind: 'mcp',
      callable: connected && !needsOauth,
      needsOauth,
      mcpLoginName: server.name,
    })
  }
  const connectorRows =
    connectors.length > 0
      ? connectors.map((connector) => ({
          id: `app:${connector.id}`,
          name: connector.name,
          path: `app://${connector.id}`,
          kind: 'connector' as const,
          callable: connector.callable,
          needsOauth: !connector.callable && !connector.installed,
        }))
      : fallbackConnectors.map((name) => ({
          id: `fallback:${name}`,
          name,
          path: '',
          kind: 'connector' as const,
          callable: false,
          needsOauth: true,
        }))
  return [...rows, ...connectorRows]
}
