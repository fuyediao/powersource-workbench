import { useMemo, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDownIcon,
  CloseIcon,
  CodeIcon,
  ImagePlusIcon,
  LucideServerIcon,
  ShieldIcon,
} from '@/icons/AllIcons'
import {
  isAllowedMcpServerName,
  parseHarnessCommandLine,
  parseHarnessMcpJson,
  serializeHarnessMcpJson,
  type HarnessMcpServer,
} from '@/utils/settings/harness-prefs'

const inputClass =
  'w-full rounded-xl border border-zinc-950/15 bg-white/75 px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand/60 dark:border-white/15 dark:bg-zinc-950/60'

const DEFAULT_PROFILE: HarnessMcpServer = {
  name: '',
  transport: 'streamableHttp',
  auth: 'oauth',
  enabled: true,
  required: false,
  approvalMode: 'writes',
  startupTimeoutSec: 10,
  toolTimeoutSec: 60,
  riskAcknowledged: false,
}

interface HarnessMcpDialogProps {
  servers: HarnessMcpServer[]
  initialServer: HarnessMcpServer | null
  onClose: () => void
  onSaveProfile: (profile: HarnessMcpServer) => void
  onSaveJson: (profiles: HarnessMcpServer[]) => void
}

interface McpSelectOption<TValue extends string> {
  value: TValue
  label: string
}

interface McpSelectProps<TValue extends string> {
  value: TValue
  options: McpSelectOption<TValue>[]
  onChange: (value: TValue) => void
}

/**
 * Renders a project-styled single-select menu without a native popup.
 * @param props - Current value, choices, and change callback.
 * @returns Styled menu control.
 */
function McpSelect<TValue extends string>({
  value,
  options,
  onChange,
}: McpSelectProps<TValue>) {
  const activeLabel = options.find((option) => option.value === value)?.label ?? value
  return (
    <details className="group relative mt-1.5">
      <summary className={`${inputClass} flex cursor-pointer list-none items-center justify-between`}>
        <span>{activeLabel}</span>
        <ChevronDownIcon className="size-4 text-muted transition group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-zinc-950/10 bg-white p-1 shadow-2xl dark:border-white/15 dark:bg-zinc-900">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            className={`flex w-full rounded-lg px-3 py-2 text-left text-sm transition ${
              option.value === value
                ? 'bg-brand text-brand-fg'
                : 'text-ink hover:bg-zinc-950/5 dark:hover:bg-white/10'
            }`}
            onClick={(event) => {
              onChange(option.value)
              event.currentTarget.closest('details')?.removeAttribute('open')
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </details>
  )
}

/**
 * Splits one tool list into normalized names.
 * @param value - Comma or newline separated tool names.
 * @returns Unique non-empty tool names.
 */
function parseToolList(value: string): string[] | undefined {
  const values = [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))]
  return values.length > 0 ? values : undefined
}

/**
 * Formats one optional tool list for a text field.
 * @param value - Tool name array.
 * @returns Comma-separated tool list.
 */
function formatToolList(value: string[] | undefined): string {
  return value?.join(', ') ?? ''
}

/**
 * Reads a numeric form field as a positive number.
 * @param value - Raw input value.
 * @returns Positive number or undefined.
 */
function readPositiveNumber(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

/**
 * Reads a numeric form field as a valid TCP port.
 * @param value - Raw input value.
 * @returns Port number or undefined.
 */
function readPort(value: string): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : undefined
}

/**
 * Creates a complete MCP profile from the guided form.
 * @param draft - Current guided form values.
 * @param commandLine - Local command entered by the user.
 * @param enabledTools - Allow-list editor value.
 * @param disabledTools - Deny-list editor value.
 * @returns Normalized MCP profile.
 */
function buildProfile(
  draft: HarnessMcpServer,
  commandLine: string,
  enabledTools: string,
  disabledTools: string,
): HarnessMcpServer {
  const [command = '', ...args] = parseHarnessCommandLine(commandLine)
  return {
    ...draft,
    name: draft.name.trim().toLowerCase(),
    displayName: draft.displayName?.trim() || undefined,
    description: draft.description?.trim() || undefined,
    command: draft.transport === 'stdio' ? command : undefined,
    args: draft.transport === 'stdio' ? args : undefined,
    url: draft.transport === 'streamableHttp' ? draft.url?.trim() : undefined,
    bearerTokenEnvVar:
      draft.transport === 'streamableHttp' && draft.auth === 'bearer'
        ? draft.bearerTokenEnvVar?.trim()
        : undefined,
    enabledTools: parseToolList(enabledTools),
    disabledTools: parseToolList(disabledTools),
  }
}

/**
 * OpenAI-style MCP profile dialog with guided and JSON editing modes.
 * @param props - Current profiles and save handlers.
 * @returns Modal MCP editor.
 */
export function HarnessMcpDialog({
  servers,
  initialServer,
  onClose,
  onSaveProfile,
  onSaveJson,
}: HarnessMcpDialogProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'guided' | 'json'>('guided')
  const [draft, setDraft] = useState<HarnessMcpServer>(() => ({
    ...DEFAULT_PROFILE,
    ...initialServer,
  }))
  const [commandLine, setCommandLine] = useState(() =>
    initialServer?.transport === 'stdio'
      ? [initialServer.command, ...(initialServer.args ?? [])].filter(Boolean).join(' ')
      : '',
  )
  const [enabledTools, setEnabledTools] = useState(() => formatToolList(initialServer?.enabledTools))
  const [disabledTools, setDisabledTools] = useState(() => formatToolList(initialServer?.disabledTools))
  const [jsonSource, setJsonSource] = useState(() => serializeHarnessMcpJson(servers))
  const [jsonError, setJsonError] = useState('')
  const [jsonRiskAcknowledged, setJsonRiskAcknowledged] = useState(false)
  const [iconError, setIconError] = useState(false)

  const isValid = useMemo(() => {
    if (!isAllowedMcpServerName(draft.name)) return false
    if (draft.transport === 'stdio') return Boolean(parseHarnessCommandLine(commandLine)[0])
    if (!/^https:\/\//i.test(draft.url?.trim() ?? '') || !draft.riskAcknowledged) return false
    return draft.auth !== 'bearer' || Boolean(draft.bearerTokenEnvVar?.trim())
  }, [commandLine, draft])

  /**
   * Reads and validates an optional PNG icon.
   * @param event - File input change event.
   * @returns Nothing.
   */
  function handleIconChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.type !== 'image/png' || file.size > 10 * 1024) {
      setIconError(true)
      return
    }
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        setDraft((current) => ({ ...current, iconDataUrl: reader.result as string }))
        setIconError(false)
      }
    })
    reader.readAsDataURL(file)
  }

  /**
   * Validates and saves the advanced JSON document.
   * @returns Nothing.
   */
  function saveJson(): void {
    try {
      const profiles = parseHarnessMcpJson(jsonSource).map((profile) => ({
        ...profile,
        riskAcknowledged:
          profile.transport === 'streamableHttp' ? jsonRiskAcknowledged : true,
      }))
      if (profiles.some((profile) => profile.transport === 'streamableHttp') && !jsonRiskAcknowledged) {
        setJsonError(t('harness.library.mcp.dialog.riskRequired'))
        return
      }
      onSaveJson(profiles)
    } catch {
      setJsonError(t('harness.library.mcp.dialog.jsonInvalid'))
    }
  }

  return (
    <div className="fixed inset-0 z-[240] grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="harness-mcp-dialog-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-950/10 bg-white/95 text-ink shadow-2xl dark:border-white/10 dark:bg-[#202020]"
      >
        <header className="flex items-center justify-between border-b border-zinc-950/10 px-6 py-4 dark:border-white/10">
          <div>
            <h2 id="harness-mcp-dialog-title" className="text-lg font-bold">
              {t(initialServer ? 'harness.library.mcp.dialog.editTitle' : 'harness.library.mcp.dialog.createTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{t('harness.library.mcp.dialog.subtitle')}</p>
          </div>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10"
            aria-label={t('harness.library.cancel')}
            onClick={onClose}
          >
            <CloseIcon className="size-4" aria-hidden />
          </button>
        </header>

        <div className="flex gap-1 border-b border-zinc-950/10 px-6 py-3 dark:border-white/10">
          {(['guided', 'json'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                mode === value
                  ? 'bg-brand text-brand-fg'
                  : 'text-muted hover:bg-zinc-950/5 dark:hover:bg-white/5'
              }`}
              onClick={() => setMode(value)}
            >
              {value === 'guided' ? <LucideServerIcon className="size-4" aria-hidden /> : <CodeIcon className="size-4" aria-hidden />}
              {t(`harness.library.mcp.dialog.mode.${value}`)}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {mode === 'guided' ? (
            <div className="flex flex-col gap-4">
              <label className="flex cursor-pointer items-center gap-3">
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-zinc-950/20 bg-zinc-950/5 dark:border-white/25 dark:bg-white/5">
                  {draft.iconDataUrl ? (
                    <img src={draft.iconDataUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <ImagePlusIcon className="size-6 text-muted" aria-hidden />
                  )}
                </span>
                <span className="text-xs text-muted">
                  <strong className="block text-sm text-ink">{t('harness.library.mcp.dialog.icon')}</strong>
                  {t('harness.library.mcp.dialog.iconHint')}
                  {iconError ? <em className="mt-1 block not-italic text-red-400">{t('harness.library.mcp.dialog.iconInvalid')}</em> : null}
                </span>
                <input type="file" accept="image/png" className="sr-only" onChange={handleIconChange} />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-ink/75">
                  {t('harness.library.mcp.dialog.name')}
                  <input
                    type="text"
                    value={draft.name}
                    disabled={Boolean(initialServer)}
                    className={`${inputClass} mt-1.5`}
                    placeholder="github"
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label className="text-xs font-semibold text-ink/75">
                  {t('harness.library.mcp.dialog.displayName')}
                  <input
                    type="text"
                    value={draft.displayName ?? ''}
                    className={`${inputClass} mt-1.5`}
                    onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
                  />
                </label>
              </div>

              <label className="text-xs font-semibold text-ink/75">
                {t('harness.library.mcp.dialog.description')}
                <textarea
                  rows={2}
                  value={draft.description ?? ''}
                  className={`${inputClass} mt-1.5 resize-none`}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </label>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-ink/75">{t('harness.library.mcp.dialog.connection')}</p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-950/5 p-1 dark:bg-black/25">
                  {(['streamableHttp', 'stdio'] as const).map((transport) => (
                    <button
                      key={transport}
                      type="button"
                      className={`rounded-lg px-3 py-2 text-xs font-bold ${draft.transport === transport ? 'bg-brand text-brand-fg' : 'text-muted'}`}
                      onClick={() => setDraft((current) => ({ ...current, transport }))}
                    >
                      {t(`harness.library.mcp.transport.${transport}`)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="text-xs font-semibold text-ink/75">
                {t(draft.transport === 'stdio' ? 'harness.library.mcp.dialog.command' : 'harness.library.mcp.dialog.serverUrl')}
                <input
                  type="text"
                  value={draft.transport === 'stdio' ? commandLine : draft.url ?? ''}
                  className={`${inputClass} mt-1.5 font-mono text-xs`}
                  placeholder={draft.transport === 'stdio' ? 'npx -y @example/mcp' : 'https://server.example/mcp'}
                  onChange={(event) => {
                    if (draft.transport === 'stdio') setCommandLine(event.target.value)
                    else setDraft((current) => ({ ...current, url: event.target.value }))
                  }}
                />
              </label>

              {draft.transport === 'streamableHttp' ? (
                <>
                  <label className="text-xs font-semibold text-ink/75">
                    {t('harness.library.mcp.dialog.authentication')}
                    <McpSelect
                      value={draft.auth ?? 'oauth'}
                      options={(['oauth', 'bearer', 'none'] as const).map((value) => ({
                        value,
                        label: t(`harness.library.mcp.dialog.auth.${value}`),
                      }))}
                      onChange={(auth) => setDraft((current) => ({ ...current, auth }))}
                    />
                  </label>
                  {draft.auth === 'bearer' ? (
                    <label className="text-xs font-semibold text-ink/75">
                      {t('harness.library.mcp.dialog.tokenEnv')}
                      <input
                        type="text"
                        value={draft.bearerTokenEnvVar ?? ''}
                        className={`${inputClass} mt-1.5 font-mono text-xs`}
                        placeholder="MY_MCP_TOKEN"
                        onChange={(event) => setDraft((current) => ({ ...current, bearerTokenEnvVar: event.target.value }))}
                      />
                    </label>
                  ) : null}
                </>
              ) : null}

              <details className="group rounded-2xl border border-zinc-950/10 bg-zinc-950/3 p-4 dark:border-white/10 dark:bg-black/15">
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold">
                  {t('harness.library.mcp.dialog.advanced')}
                  <ChevronDownIcon className="size-4 transition group-open:rotate-180" aria-hidden />
                </summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-ink/75">
                    {t('harness.library.mcp.dialog.approval')}
                    <McpSelect
                      value={draft.approvalMode ?? 'writes'}
                      options={(['prompt', 'writes', 'auto', 'approve'] as const).map((value) => ({
                        value,
                        label: t(`harness.library.mcp.dialog.approvalMode.${value}`),
                      }))}
                      onChange={(approvalMode) => setDraft((current) => ({ ...current, approvalMode }))}
                    />
                  </label>
                  <label className="text-xs font-semibold text-ink/75">
                    {t('harness.library.mcp.dialog.startupTimeout')}
                    <input type="number" min="1" value={draft.startupTimeoutSec ?? ''} className={`${inputClass} mt-1.5`} onChange={(event) => setDraft((current) => ({ ...current, startupTimeoutSec: readPositiveNumber(event.target.value) }))} />
                  </label>
                  <label className="text-xs font-semibold text-ink/75">
                    {t('harness.library.mcp.dialog.toolTimeout')}
                    <input type="number" min="1" value={draft.toolTimeoutSec ?? ''} className={`${inputClass} mt-1.5`} onChange={(event) => setDraft((current) => ({ ...current, toolTimeoutSec: readPositiveNumber(event.target.value) }))} />
                  </label>
                  <label className="text-xs font-semibold text-ink/75">
                    {t('harness.library.mcp.dialog.enabledTools')}
                    <input type="text" value={enabledTools} className={`${inputClass} mt-1.5`} onChange={(event) => setEnabledTools(event.target.value)} />
                  </label>
                  <label className="text-xs font-semibold text-ink/75">
                    {t('harness.library.mcp.dialog.disabledTools')}
                    <input type="text" value={disabledTools} className={`${inputClass} mt-1.5`} onChange={(event) => setDisabledTools(event.target.value)} />
                  </label>
                  {draft.auth === 'oauth' && draft.transport === 'streamableHttp' ? (
                    <>
                      <label className="text-xs font-semibold text-ink/75">
                        {t('harness.library.mcp.dialog.callbackUrl')}
                        <input type="url" value={draft.oauthCallbackUrl ?? ''} className={`${inputClass} mt-1.5`} placeholder="https://host.example/callback" onChange={(event) => setDraft((current) => ({ ...current, oauthCallbackUrl: event.target.value }))} />
                      </label>
                      <label className="text-xs font-semibold text-ink/75">
                        {t('harness.library.mcp.dialog.callbackPort')}
                        <input type="number" min="1" max="65535" value={draft.oauthCallbackPort ?? ''} className={`${inputClass} mt-1.5`} placeholder="1455" onChange={(event) => setDraft((current) => ({ ...current, oauthCallbackPort: readPort(event.target.value) }))} />
                      </label>
                      <p className="text-xs text-muted sm:col-span-2">{t('harness.library.mcp.dialog.oauthDiscoveryHint')}</p>
                    </>
                  ) : null}
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink/75">
                    <input type="checkbox" checked={draft.enabled !== false} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />
                    {t('harness.library.mcp.dialog.enabled')}
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-ink/75">
                    <input type="checkbox" checked={draft.required === true} onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))} />
                    {t('harness.library.mcp.dialog.required')}
                  </label>
                </div>
              </details>

              {draft.transport === 'streamableHttp' ? (
                <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 bg-amber-700/35 px-4 py-3 text-sm font-bold text-amber-200">
                    <ShieldIcon className="size-4" aria-hidden />
                    {t('harness.library.mcp.dialog.riskTitle')}
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-4 text-xs leading-5 text-ink/75">
                    <input type="checkbox" className="mt-1" checked={draft.riskAcknowledged === true} onChange={(event) => setDraft((current) => ({ ...current, riskAcknowledged: event.target.checked }))} />
                    <span><strong className="block text-sm text-ink">{t('harness.library.mcp.dialog.riskConfirm')}</strong>{t('harness.library.mcp.dialog.riskBody')}</span>
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-ink/75">{t('harness.library.mcp.dialog.jsonHint')}</p>
              <textarea
                rows={18}
                spellCheck={false}
                value={jsonSource}
                className="w-full resize-none rounded-2xl border border-zinc-950/10 bg-zinc-950/3 p-4 font-mono text-xs leading-5 text-ink outline-none focus:border-brand dark:border-white/15 dark:bg-black/60"
                aria-label={t('harness.library.mcp.dialog.jsonLabel')}
                onChange={(event) => {
                  setJsonSource(event.target.value)
                  setJsonError('')
                }}
              />
              <label className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-50 p-4 text-xs leading-5 text-ink/75 dark:bg-amber-950/30">
                <input type="checkbox" className="mt-1" checked={jsonRiskAcknowledged} onChange={(event) => setJsonRiskAcknowledged(event.target.checked)} />
                <span><strong className="block text-sm text-ink">{t('harness.library.mcp.dialog.riskConfirm')}</strong>{t('harness.library.mcp.dialog.riskBody')}</span>
              </label>
              {jsonError ? <p role="alert" className="text-xs font-semibold text-red-400">{jsonError}</p> : null}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-zinc-950/10 px-6 py-4 dark:border-white/10">
          <a href="https://developers.openai.com/codex/mcp" target="_blank" rel="noreferrer" className="text-xs font-semibold text-muted hover:text-ink">
            {t('harness.library.mcp.dialog.guide')}
          </a>
          <div className="flex gap-2">
            <button type="button" className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/5" onClick={onClose}>{t('harness.library.cancel')}</button>
            <button
              type="button"
              disabled={mode === 'guided' ? !isValid : !jsonSource.trim()}
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:cursor-not-allowed disabled:opacity-35"
              onClick={() => {
                if (mode === 'json') saveJson()
                else onSaveProfile(buildProfile(draft, commandLine, enabledTools, disabledTools))
              }}
            >
              {t(initialServer ? 'harness.library.save' : 'harness.library.mcp.dialog.create')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
