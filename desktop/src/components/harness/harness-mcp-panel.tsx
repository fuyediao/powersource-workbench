/** Third-party MCP server and connector management for Harness. */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, SettingsIcon, TrashIcon } from '@/icons/AllIcons'
import { HarnessMcpDialog } from '@/components/harness/harness-mcp-dialog'
import type { HarnessAppConnector, HarnessMcpServerStatus } from '@/types/harness'
import {
  loadHarnessMcpServers,
  saveHarnessMcpServers,
  type HarnessMcpServer,
} from '@/utils/settings/harness-prefs'

/** OpenAI Responses API connectors shown as official OAuth-backed presets. */
export const OPENAI_CONNECTORS = [
  'Dropbox', 'Gmail', 'Google Calendar', 'Google Drive', 'Microsoft Teams',
  'Outlook Calendar', 'Outlook Email', 'SharePoint',
] as const

interface HarnessMcpPanelProps {
  connectors: HarnessAppConnector[]
  statuses: HarnessMcpServerStatus[]
  onRefresh: (forceRefetch?: boolean) => Promise<void>
  onInstall: (connectorId: string, installUrl: string) => Promise<void>
  onLogin: (name: string) => void
  onConfigurationChange: () => void
}

/**
 * Returns the app-server status for one configured MCP server.
 * @param statuses - Runtime states reported by Codex.
 * @param name - Configured server name.
 * @returns Matching runtime status or undefined.
 */
function findServerStatus(statuses: HarnessMcpServerStatus[], name: string): HarnessMcpServerStatus | undefined {
  return statuses.find((status) => status.name.toLowerCase() === name.toLowerCase())
}

/**
 * Lists and edits local third-party MCP server profiles.
 * @param props - Runtime states, connectors, and action handlers.
 * @returns MCP management panel.
 */
export function HarnessMcpPanel({
  connectors, statuses, onRefresh, onInstall, onLogin, onConfigurationChange,
}: HarnessMcpPanelProps) {
  const { t } = useTranslation()
  const [servers, setServers] = useState<HarnessMcpServer[]>(() => loadHarnessMcpServers())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<HarnessMcpServer | null>(null)

  /**
   * Persists a complete MCP server array and reloads the Harness runtime.
   * @param next - Replacement MCP server list.
   * @returns Nothing.
   */
  function persist(next: HarnessMcpServer[]): void {
    setServers(next)
    saveHarnessMcpServers(next)
    setDialogOpen(false)
    setEditingServer(null)
    onConfigurationChange()
  }

  /**
   * Adds or replaces one MCP profile.
   * @param profile - Valid profile from the guided dialog.
   * @returns Nothing.
   */
  function saveProfile(profile: HarnessMcpServer): void {
    persist([...servers.filter((server) => server.name !== profile.name), profile])
  }

  /**
   * Removes one configured MCP profile.
   * @param name - Server config key.
   * @returns Nothing.
   */
  function removeServer(name: string): void {
    persist(servers.filter((server) => server.name !== name))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-ink">{t('harness.library.mcp.manageTitle')}</h2>
          <p className="mt-0.5 text-xs font-medium text-muted">{t('harness.library.mcp.manageHint')}</p>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg shadow-lg shadow-brand/20" onClick={() => { setEditingServer(null); setDialogOpen(true) }}>
          <PlusIcon className="size-4" aria-hidden />
          {t('harness.library.mcp.add')}
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-950/15 bg-white/35 px-5 py-8 text-center dark:border-white/15 dark:bg-white/5">
          <p className="text-sm font-bold text-ink">{t('harness.library.mcp.emptyTitle')}</p>
          <p className="mt-1 text-xs text-muted">{t('harness.library.mcp.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {servers.map((server) => {
            const status = findServerStatus(statuses, server.name)
            const needsLogin = server.transport === 'streamableHttp' && server.auth === 'oauth' && !/ready|authenticated|connected/i.test(status?.authStatus ?? '')
            return (
              <article key={server.name} className={`rounded-3xl border bg-white/65 p-4 dark:bg-zinc-950/45 ${server.enabled === false ? 'border-zinc-950/5 opacity-55 dark:border-white/5' : 'border-zinc-950/10 dark:border-white/10'}`}>
                <div className="flex items-start gap-3">
                  {server.iconDataUrl ? <img src={server.iconDataUrl} alt="" className="size-10 rounded-xl object-cover" /> : <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-sm font-black text-brand">{(server.displayName || server.name).slice(0, 1).toUpperCase()}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{server.displayName || server.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted">{server.transport === 'stdio' ? [server.command, ...(server.args ?? [])].filter(Boolean).join(' ') : server.url}</p>
                  </div>
                  <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-brand/10 hover:text-brand" aria-label={t('harness.library.edit')} onClick={() => { setEditingServer(server); setDialogOpen(true) }}><SettingsIcon className="size-4" aria-hidden /></button>
                  <button type="button" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-500" aria-label={t('harness.library.mcp.remove')} onClick={() => removeServer(server.name)}><TrashIcon className="size-4" aria-hidden /></button>
                </div>
                {server.description ? <p className="mt-3 line-clamp-2 text-xs text-muted">{server.description}</p> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-brand/10 px-2 py-1 text-[10px] font-bold text-brand">{t(`harness.library.mcp.transport.${server.transport}`)}</span>
                  {server.transport === 'streamableHttp' ? <span className="rounded-full bg-zinc-950/5 px-2 py-1 text-[10px] font-bold text-muted dark:bg-white/5">{t(`harness.library.mcp.dialog.auth.${server.auth ?? 'oauth'}`)}</span> : null}
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${status ? 'bg-emerald-500/10 text-emerald-600' : 'bg-zinc-950/5 text-muted dark:bg-white/5'}`}>{status?.runtimeStatus || t('harness.library.mcp.restartRequired')}</span>
                  {needsLogin ? <button type="button" className="ml-auto rounded-xl bg-brand px-3 py-1.5 text-[10px] font-bold text-brand-fg" onClick={() => onLogin(server.name)}>{t('harness.library.mcp.authenticate')}</button> : null}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <section className="rounded-3xl border border-zinc-950/10 bg-white/45 p-4 dark:border-white/10 dark:bg-zinc-950/30">
        <p className="text-sm font-bold text-ink">{t('harness.library.mcp.openAiConnectors')}</p>
        <p className="mt-1 text-xs font-medium text-muted">{t('harness.library.mcp.openAiConnectorsHint')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(connectors.length > 0 ? connectors : OPENAI_CONNECTORS.map((name) => ({ id: name, name, description: '', iconUrl: '', installUrl: '', accessible: false, enabled: false, installed: false, callable: false, toolNames: [] }))).map((connector) => (
            <article key={connector.id} className="flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-white/70 p-3 dark:border-white/10 dark:bg-zinc-900/70">
              {connector.iconUrl ? <img src={connector.iconUrl} alt="" className="size-8 rounded-lg object-cover" /> : <span className="grid size-8 place-items-center rounded-lg bg-brand/10 text-xs font-black text-brand">{connector.name.slice(0, 1)}</span>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink">{connector.name}</p>
                <p className={`text-[10px] font-bold ${connector.callable ? 'text-emerald-600' : 'text-muted'}`}>{connector.callable ? t('harness.library.mcp.callable') : connector.installed ? t('harness.library.mcp.installed') : t('harness.library.mcp.oauthRequired')}</p>
              </div>
              {!connector.installed && connector.installUrl ? <button type="button" className="rounded-lg bg-brand/10 px-2.5 py-1.5 text-[10px] font-bold text-brand" onClick={() => void onInstall(connector.id, connector.installUrl).then(() => onRefresh(true))}>{t('harness.library.mcp.install')}</button> : null}
            </article>
          ))}
        </div>
        <button type="button" className="mt-3 rounded-xl px-3 py-2 text-xs font-bold text-brand hover:bg-brand/10" onClick={() => void onRefresh(true)}>{t('harness.library.mcp.refreshConnectors')}</button>
      </section>

      {dialogOpen ? <HarnessMcpDialog servers={servers} initialServer={editingServer} onClose={() => { setDialogOpen(false); setEditingServer(null) }} onSaveProfile={saveProfile} onSaveJson={persist} /> : null}
    </div>
  )
}
