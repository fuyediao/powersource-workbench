/**
 * Settings → Model Context Protocol: a master on/off switch, up to 5
 * independently enabled/disabled/deleted personal keys for Bearer-header
 * agents (Codex, Cursor, Claude Desktop), and an OAuth connector panel for
 * clients that cannot send a raw key (ChatGPT, Gemini, and others).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, CloseIcon, CopyIcon, KeyIcon, PlusIcon, TrashIcon } from '@/icons/AllIcons'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import {
  MCP_KEY_PLACEHOLDER,
  buildMcpBearerJson,
  createMcpKey,
  deleteMcpKey,
  disableMcpMaster,
  enableMcpMaster,
  fetchMcpSettings,
  fetchMcpSetupPrompt,
  isMcpApiConfigured,
  setMcpKeyEnabled,
  type McpKey,
  type McpSettings,
} from '@/services/mcp-api'
import { copyTextToClipboard } from '@/utils/clipboard'

/** How long a copy confirmation stays visible. */
const COPY_FEEDBACK_MS = 1800
/** How long an armed delete stays confirmable before reverting. */
const DELETE_CONFIRM_MS = 3000

/**
 * Model Context Protocol settings body.
 * @returns MCP settings section.
 */
export function McpSection() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<McpSettings | null>(null)
  const [revealed, setRevealed] = useState<{ keyId: string; plaintext: string } | null>(null)
  const [setupPrompt, setSetupPrompt] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [addingKey, setAddingKey] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)
  const deleteTimerRef = useRef<number | null>(null)

  const configured = isMcpApiConfigured()
  const enabled = settings?.enabled ?? false
  const endpoint = settings?.endpoint ?? ''
  const keys = settings?.keys ?? []
  const maxKeys = settings?.maxKeys ?? 5
  const jsonConfig = endpoint
    ? buildMcpBearerJson(endpoint, revealed?.plaintext ?? MCP_KEY_PLACEHOLDER)
    : ''

  useEffect(() => {
    if (!configured) {
      setIsLoading(false)
      return
    }
    const controller = new AbortController()
    void (async () => {
      try {
        const next = await fetchMcpSettings(controller.signal)
        setSettings(next)
        if (next.enabled) {
          // Prompt text carries no secret, so it can be shown before any key exists.
          const prompt = await fetchMcpSetupPrompt(controller.signal)
          setSetupPrompt(prompt.prompt)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setErrorMessage(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    })()
    return () => controller.abort()
  }, [configured])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current)
      }
    }
  }, [])

  /**
   * Copies text and shows a short confirmation on the originating control.
   * @param target - Which control was used.
   * @param value - Text to place on the clipboard.
   * @returns Nothing.
   */
  const copyValue = useCallback(
    async (target: string, value: string): Promise<void> => {
      if (!value) {
        return
      }
      try {
        await copyTextToClipboard(value)
      } catch {
        setErrorMessage(t('settings.mcp.copyFailed'))
        return
      }
      setErrorMessage('')
      setCopied(target)
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => setCopied(null), COPY_FEEDBACK_MS)
    },
    [t],
  )

  /**
   * Applies a settings response, tracking a freshly minted key's plaintext.
   * @param next - Server response.
   * @returns Nothing.
   */
  function applyResponse(next: McpSettings): void {
    setSettings(next)
    if (next.newKey) {
      const lastKey = next.keys[next.keys.length - 1]
      if (lastKey) {
        setRevealed({ keyId: lastKey.id, plaintext: next.newKey })
      }
    }
    if (next.setupPrompt) {
      setSetupPrompt(next.setupPrompt)
    }
  }

  /**
   * Runs a settings mutation with shared busy and error handling.
   * @param action - Mutation to run.
   * @param keyId - Key id to mark busy, when the action targets one row.
   * @returns Nothing.
   */
  async function runAction(action: () => Promise<McpSettings>, keyId?: string): Promise<void> {
    if (keyId) {
      setBusyKeyId(keyId)
    } else {
      setIsBusy(true)
    }
    setErrorMessage('')
    try {
      applyResponse(await action())
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      if (keyId) {
        setBusyKeyId(null)
      } else {
        setIsBusy(false)
      }
    }
  }

  /**
   * Copies the setup prompt, fetching it first when it is not yet loaded.
   * @returns Nothing.
   */
  async function handleCopySetupPrompt(): Promise<void> {
    let prompt = setupPrompt
    if (!prompt) {
      setIsBusy(true)
      setErrorMessage('')
      try {
        const next = await fetchMcpSetupPrompt()
        prompt = next.prompt
        setSetupPrompt(prompt)
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err))
        return
      } finally {
        setIsBusy(false)
      }
    }
    await copyValue('prompt', prompt)
  }

  /**
   * Toggles the master MCP switch for this account.
   * @param next - Requested state.
   * @returns Nothing.
   */
  function handleToggleMaster(next: boolean): void {
    if (!next) {
      setRevealed(null)
      setAddingKey(false)
    }
    void runAction(next ? enableMcpMaster : disableMcpMaster)
  }

  /**
   * Creates a new key with the current draft label, then resets the form.
   * @returns Nothing.
   */
  async function handleCreateKey(): Promise<void> {
    const label = newKeyLabel.trim()
    await runAction(() => createMcpKey(label))
    setAddingKey(false)
    setNewKeyLabel('')
  }

  /**
   * Arms or executes a key deletion. The first click arms a short confirm
   * window; a second click within that window deletes the key.
   * @param keyId - Key id to delete.
   * @returns Nothing.
   */
  function handleDeleteKey(keyId: string): void {
    if (confirmDeleteId !== keyId) {
      setConfirmDeleteId(keyId)
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current)
      }
      deleteTimerRef.current = window.setTimeout(() => setConfirmDeleteId(null), DELETE_CONFIRM_MS)
      return
    }
    setConfirmDeleteId(null)
    if (revealed?.keyId === keyId) {
      setRevealed(null)
    }
    void runAction(() => deleteMcpKey(keyId), keyId)
  }

  if (!configured) {
    return (
      <div className="space-y-5">
        <p className="text-sm font-semibold text-brand">{t('settings.sections.mcp')}</p>
        <div className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-5 dark:border-white/10 dark:bg-white/5">
          <p className="text-sm font-semibold text-brand">{t('settings.mcp.unavailableTitle')}</p>
          <p className="mt-1 text-sm font-medium text-muted">{t('settings.mcp.unavailableBody')}</p>
        </div>
      </div>
    )
  }

  const detailsClass = enabled ? 'space-y-5' : 'space-y-5 opacity-50'
  const canAddKey = keys.length < maxKeys

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.mcp')}</p>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 dark:border-white/10 dark:bg-white/5">
        <p className="min-w-0 text-sm font-semibold text-brand">{t('settings.mcp.enableLabel')}</p>
        <SettingsSwitch
          checked={enabled}
          disabled={isLoading || isBusy}
          aria-label={t('settings.mcp.enableLabel')}
          onChange={handleToggleMaster}
        />
      </div>

      {errorMessage ? (
        <p className="text-sm font-semibold text-red-500">{errorMessage}</p>
      ) : null}

      <div className={detailsClass}>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">{t('settings.mcp.endpointLabel')}</p>
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <code className="min-w-0 flex-1 truncate font-mono text-sm text-brand">
              {endpoint || '—'}
            </code>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold text-brand transition hover:bg-zinc-950/10 disabled:opacity-50 dark:hover:bg-white/10"
              disabled={!enabled || !endpoint}
              onClick={() => {
                void copyValue('endpoint', endpoint)
              }}
            >
              {copied === 'endpoint' ? (
                <CheckIcon className="size-3.5" aria-hidden />
              ) : (
                <CopyIcon className="size-3.5" aria-hidden />
              )}
              {copied === 'endpoint' ? t('settings.mcp.copied') : t('settings.mcp.copy')}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted">
              {t('settings.mcp.keysLabel')} ({keys.length}/{maxKeys})
            </p>
            <button
              type="button"
              className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold text-brand transition hover:bg-zinc-950/10 disabled:opacity-50 dark:hover:bg-white/10"
              disabled={!enabled || isBusy || !canAddKey || addingKey}
              onClick={() => setAddingKey(true)}
            >
              <PlusIcon className="size-3.5" aria-hidden />
              {t('settings.mcp.addKey')}
            </button>
          </div>

          {!canAddKey && enabled ? (
            <p className="text-xs font-medium text-muted">{t('settings.mcp.maxKeysReached')}</p>
          ) : null}

          {addingKey ? (
            <div className="flex items-center gap-2 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-3 py-2 dark:border-white/10 dark:bg-white/5">
              <input
                type="text"
                autoFocus
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleCreateKey()
                  } else if (e.key === 'Escape') {
                    setAddingKey(false)
                    setNewKeyLabel('')
                  }
                }}
                placeholder={t('settings.mcp.labelPlaceholder')}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-brand outline-none placeholder:text-muted"
              />
              <button
                type="button"
                className="shrink-0 rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-brand-fg disabled:opacity-50"
                disabled={isBusy}
                onClick={() => {
                  void handleCreateKey()
                }}
              >
                {t('settings.mcp.create')}
              </button>
              <button
                type="button"
                className="shrink-0 rounded-xl p-1.5 text-muted transition hover:bg-zinc-950/10 dark:hover:bg-white/10"
                onClick={() => {
                  setAddingKey(false)
                  setNewKeyLabel('')
                }}
              >
                <CloseIcon className="size-3.5" aria-hidden />
              </button>
            </div>
          ) : null}

          {keys.length === 0 && !addingKey ? (
            <p className="text-xs font-medium text-muted">{t('settings.mcp.noKeys')}</p>
          ) : null}

          <div className="space-y-2">
            {keys.map((key) => (
              <McpKeyRow
                key={key.id}
                keyRow={key}
                plaintext={revealed?.keyId === key.id ? revealed.plaintext : null}
                busy={busyKeyId === key.id}
                confirmingDelete={confirmDeleteId === key.id}
                copied={copied === `key:${key.id}`}
                disabled={!enabled}
                onToggle={(next) => {
                  void runAction(() => setMcpKeyEnabled(key.id, next), key.id)
                }}
                onDelete={() => handleDeleteKey(key.id)}
                onCopy={(value) => {
                  void copyValue(`key:${key.id}`, value)
                }}
                t={t}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">{t('settings.mcp.setupPromptLabel')}</p>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-brand-fg transition disabled:opacity-50"
            disabled={!enabled || isBusy}
            onClick={() => {
              void handleCopySetupPrompt()
            }}
          >
            {copied === 'prompt' ? (
              <CheckIcon className="size-4 shrink-0" aria-hidden />
            ) : (
              <CopyIcon className="size-4 shrink-0" aria-hidden />
            )}
            {copied === 'prompt'
              ? t('settings.mcp.copied')
              : t('settings.mcp.copySetupPrompt')}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">{t('settings.mcp.jsonConfigLabel')}</p>
          <div className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 dark:border-white/10 dark:bg-white/5">
            <pre className="max-h-48 overflow-auto font-mono text-xs leading-5 text-brand whitespace-pre">
              {jsonConfig || '—'}
            </pre>
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-brand-fg transition disabled:opacity-50"
            disabled={!enabled || isBusy || !jsonConfig}
            onClick={() => {
              void copyValue('json', jsonConfig)
            }}
          >
            {copied === 'json' ? (
              <CheckIcon className="size-4 shrink-0" aria-hidden />
            ) : (
              <CopyIcon className="size-4 shrink-0" aria-hidden />
            )}
            {copied === 'json' ? t('settings.mcp.copied') : t('settings.mcp.copyJsonConfig')}
          </button>
          <p className="text-xs font-medium text-muted">{t('settings.mcp.jsonConfigHint')}</p>
        </div>

        {settings?.oauth ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">{t('settings.mcp.oauthTitle')}</p>
            <div className="space-y-1.5 rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 dark:border-white/10 dark:bg-white/5">
              <McpCopyField
                label={t('settings.mcp.endpointLabel')}
                value={endpoint}
                target="oauthEndpoint"
                copied={copied}
                onCopy={copyValue}
                t={t}
              />
              <McpCopyField
                label={t('settings.mcp.authorizeUrlLabel')}
                value={settings.oauth.authorizeUrl}
                target="authorizeUrl"
                copied={copied}
                onCopy={copyValue}
                t={t}
              />
              <McpCopyField
                label={t('settings.mcp.tokenUrlLabel')}
                value={settings.oauth.tokenUrl}
                target="tokenUrl"
                copied={copied}
                onCopy={copyValue}
                t={t}
              />
              <McpCopyField
                label={t('settings.mcp.clientIdLabel')}
                value={settings.oauth.clientId}
                target="clientId"
                copied={copied}
                onCopy={copyValue}
                t={t}
              />
              <McpCopyField
                label={t('settings.mcp.clientSecretLabel')}
                value={settings.oauth.clientSecret}
                target="clientSecret"
                copied={copied}
                onCopy={copyValue}
                t={t}
              />
            </div>
            <p className="text-xs font-medium text-muted">{t('settings.mcp.oauthHint')}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Translator function type shared by the small presentational helpers below. */
type Translate = ReturnType<typeof useTranslation>['t']

/**
 * One row in the key list: prefix or freshly revealed plaintext, optional
 * label, an enable switch, and a two-click delete.
 * @param props - Row data and callbacks.
 * @returns Key row.
 */
function McpKeyRow({
  keyRow,
  plaintext,
  busy,
  confirmingDelete,
  copied,
  disabled,
  onToggle,
  onDelete,
  onCopy,
  t,
}: {
  keyRow: McpKey
  plaintext: string | null
  busy: boolean
  confirmingDelete: boolean
  copied: boolean
  disabled: boolean
  onToggle: (next: boolean) => void
  onDelete: () => void
  onCopy: (value: string) => void
  t: Translate
}) {
  return (
    <div className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-2">
        <KeyIcon className="size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <code className="block truncate font-mono text-sm text-brand">
            {plaintext ?? `${keyRow.keyPrefix}…`}
          </code>
          {keyRow.label ? (
            <p className="truncate text-xs font-medium text-muted">{keyRow.label}</p>
          ) : null}
        </div>
        {plaintext ? (
          <button
            type="button"
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1 text-xs font-bold text-brand transition hover:bg-zinc-950/10 dark:hover:bg-white/10"
            onClick={() => onCopy(plaintext)}
          >
            {copied ? (
              <CheckIcon className="size-3.5" aria-hidden />
            ) : (
              <CopyIcon className="size-3.5" aria-hidden />
            )}
          </button>
        ) : null}
        <SettingsSwitch
          checked={keyRow.enabled}
          disabled={disabled || busy}
          aria-label={t('settings.mcp.enableLabel')}
          onChange={onToggle}
        />
        <button
          type="button"
          className={`flex shrink-0 items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
            confirmingDelete
              ? 'bg-red-500/10 text-red-500'
              : 'text-muted hover:bg-zinc-950/10 dark:hover:bg-white/10'
          }`}
          disabled={disabled || busy}
          onClick={onDelete}
        >
          <TrashIcon className="size-3.5" aria-hidden />
          {confirmingDelete ? t('settings.mcp.deleteKeyConfirm') : null}
        </button>
      </div>
      {plaintext ? (
        <p className="mt-2 text-xs font-medium text-muted">{t('settings.mcp.keyRevealHint')}</p>
      ) : null}
    </div>
  )
}

/**
 * Labeled value row with a copy button, used for the OAuth connector fields.
 * @param props - Field data and copy callback.
 * @returns Copy field row.
 */
function McpCopyField({
  label,
  value,
  target,
  copied,
  onCopy,
  t,
}: {
  label: string
  value: string
  target: string
  copied: string | null
  onCopy: (target: string, value: string) => void
  t: Translate
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-muted">{label}</p>
        <code className="block truncate font-mono text-xs text-brand">{value}</code>
      </div>
      <button
        type="button"
        className="flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold text-brand transition hover:bg-zinc-950/10 dark:hover:bg-white/10"
        onClick={() => onCopy(target, value)}
      >
        {copied === target ? (
          <CheckIcon className="size-3.5" aria-hidden />
        ) : (
          <CopyIcon className="size-3.5" aria-hidden />
        )}
        {copied === target ? t('settings.mcp.copied') : t('settings.mcp.copy')}
      </button>
    </div>
  )
}
