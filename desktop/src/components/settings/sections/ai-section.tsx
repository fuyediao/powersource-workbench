import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useAiKeys } from '@/hooks/use-ai-keys'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { AiModelAllowlistBlock } from '@/components/settings/sections/ai-model-allowlist-block'
import {
  FOCUS_RING_SHELL,
  FocusRingFrame,
} from '@/components/ui/focus-ring-frame'
import { LOCAL_AI_PROVIDERS, isLocalAiProviderId } from '@/constants/local-ai-providers'
import {
  AI_PROVIDER_ICONS,
  BotIcon,
  ChatGptIcon,
  ChevronDownIcon,
  ClaudeIcon,
  GeminiIcon,
  GlobeIcon,
  GrokIcon,
  SearchIcon,
} from '@/icons/AllIcons'
import {
  AiApiError,
  listAiProviders,
  postAiSettingsConnectivity,
  type AiProviderDto,
} from '@/services/ai-api'
import {
  connectivityCellClass,
  connectivityCellMark,
  runDualPathIpCheck,
  type DualPathIpCheckResult,
} from '@/utils/settings/ai-connectivity'
import {
  defaultLocalAiBaseUrl,
  readLocalAiBaseUrls,
  resolveLocalAiBaseUrl,
  writeLocalAiBaseUrls,
  type LocalAiBaseUrlState,
} from '@/utils/settings/local-ai-prefs'
import type { LocalAiProviderId } from '@/constants/local-ai-providers'

interface AiSectionProps {
  userId: string
}

/** First-party brand icons used by Ask AI + AI Settings. */
const LEGACY_PROVIDER_ICONS = {
  openai: ChatGptIcon,
  anthropic: ClaudeIcon,
  gemini: GeminiIcon,
  grok: GrokIcon,
} as const

/**
 * Renders a provider brand / placeholder icon (same display size via className).
 * @param providerId - Provider key.
 * @param className - Icon size/color classes (e.g. size-7).
 * @returns Icon element.
 */
function ProviderIcon({
  providerId,
  className,
}: {
  providerId: string
  className?: string
}): ReactNode {
  const Legacy = LEGACY_PROVIDER_ICONS[providerId as keyof typeof LEGACY_PROVIDER_ICONS]
  if (Legacy) {
    return <Legacy className={className} />
  }
  const Extra = AI_PROVIDER_ICONS[providerId]
  if (Extra) {
    return <Extra className={className} />
  }
  return <BotIcon className={className} />
}

/**
 * Placeholder hint for the API key field.
 * @param providerId - Provider id.
 * @returns Placeholder string.
 */
function keyPlaceholder(providerId: string): string {
  switch (providerId) {
    case 'anthropic':
      return 'sk-ant-...'
    case 'gemini':
      return 'AIza...'
    case 'grok':
      return 'xai-...'
    case 'openai':
      return 'sk-...'
    case 'ollama':
    case 'lmstudio':
    case 'llamacpp':
      return 'optional'
    default:
      return 'API key'
  }
}

/**
 * AI API keys settings: pick a vendor, edit that vendor's key, run IP/API check.
 * Specific chat models are chosen on the AI (chat) page, not here.
 * @param props - Signed-in user id.
 * @returns AI settings UI.
 */
export function AiSection({ userId }: AiSectionProps) {
  const { t, i18n } = useTranslation()
  const ai = useAiKeys(userId)
  const [catalog, setCatalog] = useState<AiProviderDto[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('openai')
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [isCheckingIp, setIsCheckingIp] = useState(false)
  const [ipResult, setIpResult] = useState<DualPathIpCheckResult | null>(null)
  const [ipError, setIpError] = useState<string | null>(null)
  const [localBaseUrls, setLocalBaseUrls] = useState<LocalAiBaseUrlState>(() =>
    readLocalAiBaseUrls(),
  )
  const [baseUrlDraft, setBaseUrlDraft] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const menuPresence = useDialogPresence(menuOpen, 180)
  const feedback = useDialogPresence(ai.saveSuccess || Boolean(ai.saveError), 220)
  const confirmPresence = useDialogPresence(confirmClear, 180)
  const ipPresence = useDialogPresence(Boolean(ipResult) || Boolean(ipError), 220)

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    setCatalogError(null)
    void (async () => {
      try {
        const cloud = await listAiProviders()
        if (cancelled) {
          return
        }
        const rows: AiProviderDto[] = [...LOCAL_AI_PROVIDERS, ...cloud]
        setCatalog(rows)
        if (rows.length > 0 && !rows.some((r) => r.id === selectedId)) {
          setSelectedId(rows[0].id)
        }
      } catch (err) {
        if (cancelled) {
          return
        }
        // Cloud catalog failed — still show local runtimes.
        setCatalog([...LOCAL_AI_PROVIDERS])
        setCatalogError(
          err instanceof AiApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : t('settings.ai.catalog.loadError'),
        )
      } finally {
        if (!cancelled) {
          setCatalogLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // selectedId intentionally omitted — only seed once when catalog arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount load
  }, [t])

  const selected = catalog.find((p) => p.id === selectedId) ?? null
  const selectedIsLocal = Boolean(
    selected?.isLocal || isLocalAiProviderId(selectedId),
  )
  const configured = selectedIsLocal
    ? Boolean(resolveLocalAiBaseUrl(selectedId, localBaseUrls))
    : ai.isConfigured(selectedId)

  useEffect(() => {
    if (!selectedIsLocal) {
      setBaseUrlDraft('')
      return
    }
    setBaseUrlDraft(resolveLocalAiBaseUrl(selectedId, localBaseUrls))
  }, [selectedId, selectedIsLocal, localBaseUrls])

  /**
   * Resolves a localised display name for a provider.
   * @param provider - Catalog row.
   * @returns Display label.
   */
  function resolveLabel(provider: AiProviderDto): string {
    const key = `settings.ai.providers.${provider.id}`
    if (i18n.exists(key)) {
      return t(key)
    }
    return provider.nameEn || provider.id
  }

  /**
   * Persists the base URL draft for the selected local provider.
   * @returns Nothing.
   */
  function commitLocalBaseUrl(): void {
    if (!isLocalAiProviderId(selectedId)) {
      return
    }
    const id = selectedId as LocalAiProviderId
    const trimmed = baseUrlDraft.trim().replace(/\/+$/, '')
    const next: LocalAiBaseUrlState = { ...localBaseUrls }
    if (!trimmed || trimmed === defaultLocalAiBaseUrl(id)) {
      delete next[id]
    } else {
      next[id] = trimmed
    }
    writeLocalAiBaseUrls(next)
    setLocalBaseUrls(next)
    setBaseUrlDraft(resolveLocalAiBaseUrl(id, next))
  }

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase()
    const ranked = [...catalog].sort((a, b) => {
      const aLocal = a.isLocal || isLocalAiProviderId(a.id) ? 0 : 1
      const bLocal = b.isLocal || isLocalAiProviderId(b.id) ? 0 : 1
      if (aLocal !== bLocal) {
        return aLocal - bLocal
      }
      const aOk = (a.isLocal || isLocalAiProviderId(a.id)
        ? Boolean(resolveLocalAiBaseUrl(a.id, localBaseUrls))
        : ai.isConfigured(a.id))
        ? 0
        : 1
      const bOk = (b.isLocal || isLocalAiProviderId(b.id)
        ? Boolean(resolveLocalAiBaseUrl(b.id, localBaseUrls))
        : ai.isConfigured(b.id))
        ? 0
        : 1
      if (aOk !== bOk) {
        return aOk - bOk
      }
      return resolveLabel(a).localeCompare(resolveLabel(b), i18n.language)
    })
    if (!q) {
      return ranked
    }
    return ranked.filter((p) => {
      const label = resolveLabel(p).toLowerCase()
      return label.includes(q) || p.id.toLowerCase().includes(q) || p.nameEn.toLowerCase().includes(q)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveLabel uses t/i18n
  }, [catalog, search, ai.keys, ai, i18n.language, t, localBaseUrls])

  /**
   * Closes the provider menu and clears the search query.
   * @returns Nothing.
   */
  function closeProviderMenu(): void {
    setMenuOpen(false)
    setSearch('')
  }

  useEffect(() => {
    if (!menuOpen) {
      return
    }
    window.requestAnimationFrame(() => {
      searchRef.current?.focus()
    })
    /**
     * Closes the provider menu on outside pointer press.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function handlePointerDown(event: MouseEvent): void {
      if (!menuRef.current?.contains(event.target as Node)) {
        closeProviderMenu()
      }
    }
    /**
     * Closes the provider menu on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        closeProviderMenu()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    setShowKey(false)
    setIpResult(null)
    setIpError(null)
  }, [selectedId])

  /**
   * Runs browser + server egress IP lookup and GET /models key probes.
   * @returns Nothing.
   */
  async function handleIpCheck(): Promise<void> {
    setIsCheckingIp(true)
    setIpError(null)
    setIpResult(null)
    try {
      setIpResult(
        await runDualPathIpCheck(
          ai.keys,
          catalog,
          postAiSettingsConnectivity,
          t,
          resolveLabel,
          localBaseUrls,
        ),
      )
    } catch (err) {
      setIpError(
        err instanceof AiApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('settings.ai.ipCheck.error'),
      )
    } finally {
      setIsCheckingIp(false)
    }
  }

  /**
   * Status line under a provider row.
   * @param provider - Catalog row.
   * @returns Localised status.
   */
  function providerStatusLabel(provider: AiProviderDto): string {
    if (provider.isLocal || isLocalAiProviderId(provider.id)) {
      return t('settings.ai.config.status.localReady')
    }
    return ai.isConfigured(provider.id)
      ? t('settings.ai.config.status.configured')
      : t('settings.ai.config.status.notConfigured')
  }

  return (
    <div className="space-y-5">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.ai')}</p>

      {catalogLoading ? (
        <p className="text-sm text-muted">{t('settings.ai.catalog.loading')}</p>
      ) : (
        <div className="space-y-2">
          {catalogError && catalog.length === LOCAL_AI_PROVIDERS.length ? (
            <p className="text-xs text-muted">{catalogError}</p>
          ) : null}
          <p className="text-xs font-semibold text-muted">{t('settings.ai.providerSelection.title')}</p>
          <div className="relative" ref={menuRef}>
            <FocusRingFrame
              active={menuOpen}
              shellClassName={`${FOCUS_RING_SHELL} overflow-hidden`}
            >
              {menuOpen ? (
                <div className="flex w-full items-center gap-3 py-3 pr-3 pl-4">
                  <SearchIcon className="size-4 shrink-0 text-muted" aria-hidden />
                  <input
                    ref={searchRef}
                    type="search"
                    autoComplete="off"
                    aria-expanded
                    aria-label={t('settings.ai.providerSelection.search')}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-brand outline-none placeholder:font-medium placeholder:text-muted"
                    placeholder={t('settings.ai.providerSelection.search')}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        closeProviderMenu()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-lg p-0.5 text-brand transition hover:bg-zinc-950/5 dark:hover:bg-white/10"
                    aria-label={t('common.inlineSearchComboboxClose')}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      closeProviderMenu()
                    }}
                  >
                    <ChevronDownIcon className="size-4 rotate-180" aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-3 pr-3 pl-4 text-left text-sm font-semibold text-brand outline-none transition hover:bg-zinc-950/5 dark:hover:bg-white/10"
                  aria-expanded={false}
                  aria-haspopup="listbox"
                  onClick={() => setMenuOpen(true)}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center text-brand">
                      <ProviderIcon providerId={selectedId} className="size-7" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">
                        {selected ? resolveLabel(selected) : selectedId}
                      </span>
                      <span className="block truncate text-xs font-medium text-muted">
                        {selected
                          ? providerStatusLabel(selected)
                          : configured
                            ? t('settings.ai.config.status.configured')
                            : t('settings.ai.config.status.notConfigured')}
                      </span>
                    </span>
                  </span>
                  <ChevronDownIcon className="size-4 shrink-0" aria-hidden />
                </button>
              )}
            </FocusRingFrame>
            {menuPresence.mounted ? (
              <div
                className={`absolute z-30 mt-2 w-full origin-top overflow-hidden rounded-2xl border border-zinc-950/10 bg-white shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
                  menuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
                }`}
              >
                <ul className="max-h-72 overflow-y-auto py-1" role="listbox">
                  {filteredCatalog.length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-muted">
                      {t('settings.ai.providerSelection.empty')}
                    </li>
                  ) : (
                    filteredCatalog.map((provider) => {
                      const selectedRow = provider.id === selectedId
                      return (
                        <li key={provider.id} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={selectedRow}
                            className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-semibold transition ${
                              selectedRow
                                ? 'bg-brand/15 text-brand'
                                : 'text-brand hover:bg-brand/10 dark:hover:bg-brand/15'
                            }`}
                            onClick={() => {
                              setSelectedId(provider.id)
                              closeProviderMenu()
                            }}
                          >
                            <span className="grid size-8 shrink-0 place-items-center text-brand">
                              <ProviderIcon providerId={provider.id} className="size-7" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate">{resolveLabel(provider)}</span>
                              <span className="block truncate text-xs font-medium text-muted">
                                {providerStatusLabel(provider)}
                              </span>
                            </span>
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted">
            {t('settings.ai.config.title', {
              provider: selected ? resolveLabel(selected) : selectedId,
            })}
          </p>
          {configured ? (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand">
              {selectedIsLocal
                ? t('settings.ai.config.status.localReady')
                : t('settings.ai.config.status.configured')}
            </span>
          ) : (
            <span className="rounded-full bg-zinc-950/5 px-2 py-0.5 text-[10px] font-bold text-muted dark:bg-white/10">
              {t('settings.ai.config.status.notConfigured')}
            </span>
          )}
        </div>

        {selectedIsLocal ? (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted" htmlFor="ai-local-base-url">
              {t('settings.ai.local.baseUrl')}
            </label>
            <input
              id="ai-local-base-url"
              type="url"
              autoComplete="off"
              className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 font-mono text-sm text-brand outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-950/40"
              value={baseUrlDraft}
              placeholder={
                isLocalAiProviderId(selectedId)
                  ? defaultLocalAiBaseUrl(selectedId as LocalAiProviderId)
                  : ''
              }
              onChange={(event) => setBaseUrlDraft(event.target.value)}
              onBlur={() => {
                commitLocalBaseUrl()
              }}
              disabled={catalogLoading}
            />
            <p className="text-xs text-muted">
              {selectedId === 'llamacpp'
                ? t('settings.ai.local.llamacppHint')
                : t('settings.ai.local.hint')}
            </p>
          </div>
        ) : null}

        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 py-2.5 pr-16 pl-4 font-mono text-sm text-brand outline-none focus:border-brand dark:border-white/10 dark:bg-zinc-950/40"
            value={ai.keys[selectedId] ?? ''}
            placeholder={
              selectedIsLocal
                ? t('settings.ai.local.keyOptional')
                : keyPlaceholder(selectedId)
            }
            onChange={(event) => ai.setKey(selectedId, event.target.value)}
            disabled={catalogLoading}
          />
          <button
            type="button"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-brand transition hover:bg-brand/10"
            onClick={() => setShowKey((value) => !value)}
          >
            {showKey ? t('settings.ai.hideKey') : t('settings.ai.showKey')}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-brand px-4 text-xs font-bold text-brand-fg transition hover:opacity-90 disabled:opacity-50"
            disabled={ai.isSaving || isCheckingIp || catalogLoading}
            onClick={() => {
              if (selectedIsLocal) {
                commitLocalBaseUrl()
              }
              void ai.saveAll()
            }}
          >
            {ai.isSaving ? t('settings.ai.save.saving') : t('settings.ai.save.button')}
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-2xl bg-brand/10 px-4 text-xs font-bold text-brand transition hover:bg-brand/15 disabled:opacity-50"
            disabled={ai.isSaving || isCheckingIp}
            onClick={() => setConfirmClear(true)}
          >
            {t('settings.ai.clear.button')}
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-brand/10 px-4 text-xs font-bold text-brand transition hover:bg-brand/15 disabled:opacity-50"
            disabled={isCheckingIp || ai.isSaving || catalogLoading || catalog.length === 0}
            onClick={() => {
              void handleIpCheck()
            }}
          >
            <GlobeIcon className="size-3.5 shrink-0" />
            {isCheckingIp ? t('settings.ai.ipCheck.checking') : t('settings.ai.ipCheck.button')}
          </button>
        </div>
      </div>

      {ipPresence.mounted ? (
        <div
          className={`rounded-2xl border border-zinc-950/10 bg-white/60 p-3 dark:border-white/10 dark:bg-zinc-950/40 ${
            ipPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
        >
          {ipError ? (
            <p className="text-sm font-semibold text-red-500">{ipError}</p>
          ) : ipResult && ipResult.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <p className="mb-2 text-sm font-semibold text-brand">
                {t('settings.ai.ipCheck.apiTest')}
              </p>
              <p className="mb-2 text-xs text-muted">{t('settings.ai.ipCheck.egressHint')}</p>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-950/10 text-left text-muted dark:border-white/10">
                    <th className="py-1.5 pr-3 font-medium">
                      {t('settings.ai.ipCheck.colModel')}
                    </th>
                    <th className="whitespace-nowrap py-1.5 pr-3 font-medium">
                      {t('settings.ai.ipCheck.browserHop')}
                      {ipResult.browserIp ? (
                        <span className="ml-1 font-normal">({ipResult.browserIp})</span>
                      ) : null}
                    </th>
                    <th className="whitespace-nowrap py-1.5 font-medium">
                      {t('settings.ai.ipCheck.serverHop')}
                      {ipResult.serverIp ? (
                        <span className="ml-1 font-normal">({ipResult.serverIp})</span>
                      ) : null}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ipResult.rows.map((row) => (
                    <tr
                      key={row.model}
                      className="border-b border-zinc-950/5 align-top last:border-0 dark:border-white/5"
                    >
                      <td className="whitespace-nowrap py-2 pr-3 font-semibold text-brand">
                        {row.label}
                      </td>
                      <td className={`py-2 pr-3 ${connectivityCellClass(row.browser.status)}`}>
                        {connectivityCellMark(row.browser.status)} {row.browser.message}
                      </td>
                      <td className={`py-2 ${connectivityCellClass(row.server.status)}`}>
                        {connectivityCellMark(row.server.status)} {row.server.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : ipResult ? (
            <p className="text-sm text-muted">{t('settings.ai.ipCheck.notTested')}</p>
          ) : null}
        </div>
      ) : null}

      {feedback.mounted ? (
        <p
          className={`text-sm font-semibold ${ai.saveError ? 'text-red-500' : 'text-brand'} ${
            feedback.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
        >
          {ai.saveError ? t('settings.ai.save.error') : t('settings.ai.save.success')}
        </p>
      ) : null}

      {confirmPresence.mounted ? (
        <div
          className={`rounded-2xl border border-zinc-950/10 bg-white/80 p-4 dark:border-white/10 dark:bg-zinc-950/60 ${
            confirmPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
          }`}
        >
          <p className="text-sm font-semibold text-brand">{t('settings.ai.clear.confirm.title')}</p>
          <p className="mt-1 text-sm text-muted">{t('settings.ai.clear.confirm.message')}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-2xl bg-brand px-3 py-2 text-xs font-bold text-brand-fg"
              onClick={() => {
                void ai.clearAll()
                setConfirmClear(false)
              }}
            >
              {t('settings.ai.clear.confirm.confirm')}
            </button>
            <button
              type="button"
              className="rounded-2xl bg-brand/10 px-3 py-2 text-xs font-bold text-brand"
              onClick={() => setConfirmClear(false)}
            >
              {t('settings.ai.clear.confirm.cancel')}
            </button>
          </div>
        </div>
      ) : null}

      <div className="border-t border-zinc-950/10 pt-5 dark:border-white/10">
        <AiModelAllowlistBlock apiKeys={ai.keys} />
      </div>
    </div>
  )
}
