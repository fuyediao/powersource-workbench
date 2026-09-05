import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsSwitch } from '@/components/settings/settings-switch'
import { FOCUS_RING_SHELL, FocusRingFrame } from '@/components/ui/focus-ring-frame'
import { useDialogPresence } from '@/hooks/use-dialog-presence'
import { useAiModelAllowlist } from '@/hooks/use-ai-model-allowlist'
import {
  ELECTRON_FALLBACK_MODELS,
  chatProviderIcon,
  modelLabelKey,
  providerDisplayName,
  providerKeyAliases,
  providerLabelKey,
  type AiCatalogModel,
} from '@/chat/ai-model-catalog'
import { withCatalogReasoning } from '@/utils/settings/ai-catalog-reasoning'
import { listAiModels } from '@/services/ai-api'
import { probeAllLocalAiModels } from '@/services/local-ai-models'
import { getAiKey, type AiKeysState } from '@/services/ai-keys-api'
import { readLocalAiBaseUrls } from '@/utils/settings/local-ai-prefs'
import { LOCAL_AI_PROVIDER_IDS, isLocalAiProviderId } from '@/constants/local-ai-providers'
import { aiModelAllowlistKey, isAiModelEnabled } from '@/utils/settings/ai-model-allowlist'
import { ChevronDownIcon, FilterIcon, RefreshIcon, SearchIcon } from '@/icons/AllIcons'

/** One row in the Models list, cloud or local, possibly offline. */
interface AiAllowlistModelRow extends AiCatalogModel {
  /** True when the model has a persisted "enabled" override but no longer appears in a live probe. */
  offline?: boolean
}

const VENDOR_FILTER_ALL = 'all'

interface AiModelAllowlistBlockProps {
  /** Live BYOK bag; cloud rows without a key render muted. */
  apiKeys: AiKeysState
}

/**
 * Settings → AI → Models: search, vendor-filter dropdown, refresh, and
 * per-model enable/disable toggles backed by local SQLite. The heading matches AI Settings.
 * Rows use the same combined label as composer pickers (`OpenAI · GPT-5.6 Sol`)
 * with a vendor icon. Cloud models without an API key are muted and show
 * a Not Configured hint to the right of the name. The list is un-capped;
 * collapsed it shows enabled models, with View all models to expand the
 * catalog. Enabled rows stay above disabled rows using a snapshot taken on
 * load / Refresh (toggles do not re-sort).
 * @param props - API-key bag from Settings → AI.
 * @returns Models block element.
 */
export function AiModelAllowlistBlock({ apiKeys }: AiModelAllowlistBlockProps) {
  const { t, i18n } = useTranslation()
  const { overrides, setEnabled, refresh: refreshAllowlist } = useAiModelAllowlist()
  const [cloudModels, setCloudModels] = useState<AiCatalogModel[]>(() =>
    ELECTRON_FALLBACK_MODELS.map(withCatalogReasoning),
  )
  const [localModels, setLocalModels] = useState<AiCatalogModel[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [vendorFilter, setVendorFilter] = useState(VENDOR_FILTER_ALL)
  const [vendorMenuOpen, setVendorMenuOpen] = useState(false)
  const vendorMenuRef = useRef<HTMLDivElement>(null)
  const vendorMenuPresence = useDialogPresence(vendorMenuOpen, 180)
  const [viewAll, setViewAll] = useState(false)
  const [layoutGeneration, setLayoutGeneration] = useState(0)
  const [pinnedForGeneration, setPinnedForGeneration] = useState(0)
  const [pinnedEnabledKeys, setPinnedEnabledKeys] = useState<ReadonlySet<string>>(() => new Set())

  const loadCloudCatalog = useCallback(async (signal?: AbortSignal) => {
    try {
      const rows = await listAiModels('electron', signal)
      const models = rows
        .filter((row) => row.provider.trim() && row.id.trim())
        .map((row) => withCatalogReasoning(row))
      if (models.length > 0) {
        setCloudModels(models)
      }
    } catch {
      // Keep the last known catalog (or the offline fallback) on failure.
    }
  }, [])

  const loadLocalCatalog = useCallback(async (signal?: AbortSignal) => {
    try {
      const rows = await probeAllLocalAiModels(readLocalAiBaseUrls(), signal)
      setLocalModels(rows)
    } catch {
      setLocalModels([])
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      setLoading(true)
      await Promise.all([
        loadCloudCatalog(controller.signal),
        loadLocalCatalog(controller.signal),
        refreshAllowlist(),
      ])
      if (!controller.signal.aborted) {
        setLoading(false)
        setLayoutGeneration((generation) => generation + 1)
      }
    })()
    return () => controller.abort()
  }, [loadCloudCatalog, loadLocalCatalog, refreshAllowlist])

  /**
   * Reloads the cloud catalog, re-probes local runtimes, and reloads the allowlist.
   * @returns Nothing.
   */
  async function handleRefresh(): Promise<void> {
    setRefreshing(true)
    try {
      await Promise.all([loadCloudCatalog(), loadLocalCatalog(), refreshAllowlist()])
      setLayoutGeneration((generation) => generation + 1)
    } finally {
      setRefreshing(false)
    }
  }

  const liveModels = useMemo(
    () => [...cloudModels, ...localModels],
    [cloudModels, localModels],
  )

  const rows = useMemo<AiAllowlistModelRow[]>(() => {
    const present = new Set(liveModels.map((m) => aiModelAllowlistKey(m.provider, m.id)))
    const offlineRows: AiAllowlistModelRow[] = []
    overrides.forEach((enabled, key) => {
      if (!enabled || present.has(key)) {
        return
      }
      const separator = key.indexOf(':')
      if (separator < 0) {
        return
      }
      const provider = key.slice(0, separator)
      const id = key.slice(separator + 1)
      if (!isLocalAiProviderId(provider)) {
        // Only local models can go offline between probes; a cloud id missing
        // from the catalog means the vendor removed/renamed it.
        return
      }
      offlineRows.push({ id, provider, labelEn: id, offline: true })
    })
    return [...liveModels, ...offlineRows]
  }, [liveModels, overrides])

  const vendors = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const row of rows) {
      if (!seen.has(row.provider)) {
        seen.add(row.provider)
        list.push(row.provider)
      }
    }
    for (const localId of LOCAL_AI_PROVIDER_IDS) {
      if (!seen.has(localId)) {
        seen.add(localId)
        list.push(localId)
      }
    }
    return list
  }, [rows])

  useEffect(() => {
    if (!vendorMenuOpen) {
      return
    }
    /**
     * Closes the vendor menu on outside click.
     * @param event - Pointer event.
     * @returns Nothing.
     */
    function onPointerDown(event: MouseEvent): void {
      if (!vendorMenuRef.current?.contains(event.target as Node)) {
        setVendorMenuOpen(false)
      }
    }
    /**
     * Closes the vendor menu on Escape.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setVendorMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [vendorMenuOpen])

  if (layoutGeneration > 0 && pinnedForGeneration !== layoutGeneration) {
    const keys = new Set<string>()
    for (const row of rows) {
      if (isAiModelEnabled(row.provider, row.id, overrides)) {
        keys.add(aiModelAllowlistKey(row.provider, row.id))
      }
    }
    setPinnedEnabledKeys(keys)
    setPinnedForGeneration(layoutGeneration)
  }

  /**
   * Resolves a localised vendor label (OpenAI / Anthropic / …).
   * @param provider - Catalog provider id.
   * @returns Display label.
   */
  function vendorLabel(provider: string): string {
    const key = providerLabelKey(provider)
    if (i18n.exists(key)) {
      return t(key)
    }
    return providerDisplayName(provider)
  }

  /**
   * Resolves a localised display label for one model row.
   * @param row - Catalog or offline row.
   * @returns Display label.
   */
  function modelLabel(row: AiAllowlistModelRow): string {
    const key = modelLabelKey(row.id)
    if (i18n.exists(key)) {
      return t(key)
    }
    return row.labelEn || row.id
  }

  /**
   * Combined picker-style label, e.g. `OpenAI · GPT-5.6 Sol`.
   * @param row - Catalog or offline row.
   * @returns Combined display label.
   */
  function combinedLabel(row: AiAllowlistModelRow): string {
    return t('chat.modelSelector.combinedLabel', {
      provider: vendorLabel(row.provider),
      model: modelLabel(row),
    })
  }

  /**
   * Whether this catalog row can actually be called (cloud key or live local probe).
   * @param row - Catalog or offline row.
   * @returns True when a key or reachable local runtime is present.
   */
  function isRowConfigured(row: AiAllowlistModelRow): boolean {
    if (isLocalAiProviderId(row.provider)) {
      return !row.offline
    }
    return providerKeyAliases(row.provider).some((id) => Boolean(getAiKey(apiKeys, id)))
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (vendorFilter !== VENDOR_FILTER_ALL && row.provider !== vendorFilter) {
        return false
      }
      if (!q) {
        return true
      }
      const label = combinedLabel(row).toLowerCase()
      return (
        row.id.toLowerCase().includes(q) ||
        row.labelEn.toLowerCase().includes(q) ||
        row.provider.toLowerCase().includes(q) ||
        label.includes(q)
      )
    })
  }, [i18n.language, rows, search, t, vendorFilter])

  const hasActiveFilter = search.trim().length > 0 || vendorFilter !== VENDOR_FILTER_ALL
  const visibleRows = useMemo(() => {
    if (viewAll || hasActiveFilter) {
      return filteredRows
    }
    return filteredRows.filter((row) =>
      pinnedEnabledKeys.has(aiModelAllowlistKey(row.provider, row.id)),
    )
  }, [filteredRows, hasActiveFilter, pinnedEnabledKeys, viewAll])
  const orderedRows = useMemo(() => {
    return [...visibleRows].sort((left, right) => {
      const leftOn = pinnedEnabledKeys.has(aiModelAllowlistKey(left.provider, left.id)) ? 0 : 1
      const rightOn = pinnedEnabledKeys.has(aiModelAllowlistKey(right.provider, right.id)) ? 0 : 1
      return leftOn - rightOn
    })
  }, [pinnedEnabledKeys, visibleRows])
  const canToggleViewAll = !hasActiveFilter && filteredRows.length > visibleRows.length
  const canCollapse = viewAll && !hasActiveFilter
  const VendorFilterButtonIcon =
    vendorFilter === VENDOR_FILTER_ALL ? FilterIcon : chatProviderIcon(vendorFilter)

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-brand">{t('settings.sections.models')}</p>

      <div className="flex h-11 items-stretch gap-2">
        <FocusRingFrame
          active={false}
          className="min-w-0 flex-1"
          shellClassName={`${FOCUS_RING_SHELL} h-full overflow-hidden`}
        >
          <div className="flex h-full w-full items-center gap-3 pr-3 pl-4">
            <SearchIcon className="size-4 shrink-0 text-muted" aria-hidden />
            <input
              type="search"
              autoComplete="off"
              aria-label={t('settings.ai.modelAllowlist.search')}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-brand outline-none placeholder:font-medium placeholder:text-muted"
              placeholder={t('settings.ai.modelAllowlist.search')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </FocusRingFrame>
        <div className="relative shrink-0 self-stretch" ref={vendorMenuRef}>
          <FocusRingFrame
            active={vendorMenuOpen}
            className="h-full"
            shellClassName={`${FOCUS_RING_SHELL} h-full overflow-hidden`}
          >
            <button
              type="button"
              className="flex h-full items-center gap-1 px-3 text-brand outline-none"
              aria-expanded={vendorMenuOpen}
              aria-haspopup="listbox"
              aria-label={
                vendorFilter === VENDOR_FILTER_ALL
                  ? t('settings.ai.modelAllowlist.vendorFilterAria')
                  : `${t('settings.ai.modelAllowlist.vendorFilterAria')}: ${vendorLabel(vendorFilter)}`
              }
              title={
                vendorFilter === VENDOR_FILTER_ALL
                  ? t('settings.ai.modelAllowlist.allVendors')
                  : vendorLabel(vendorFilter)
              }
              onClick={() => setVendorMenuOpen((open) => !open)}
            >
              <VendorFilterButtonIcon className="size-4 shrink-0" aria-hidden />
              <ChevronDownIcon
                className={`size-3.5 shrink-0 transition ${vendorMenuOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          </FocusRingFrame>
          {vendorMenuPresence.mounted ? (
            <ul
              className={`absolute right-0 z-30 mt-2 max-h-72 min-w-44 origin-top overflow-y-auto rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-zinc-900 ${
                vendorMenuPresence.leaving ? 'animate-dropdown-out' : 'animate-dropdown-in'
              }`}
              role="listbox"
            >
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={vendorFilter === VENDOR_FILTER_ALL}
                  className={`flex w-full px-4 py-2.5 text-left text-sm font-semibold transition ${
                    vendorFilter === VENDOR_FILTER_ALL
                      ? 'bg-brand/15 text-brand'
                      : 'text-brand hover:bg-brand/10 dark:hover:bg-brand/15'
                  }`}
                  onClick={() => {
                    setVendorFilter(VENDOR_FILTER_ALL)
                    setVendorMenuOpen(false)
                  }}
                >
                  {t('settings.ai.modelAllowlist.allVendors')}
                </button>
              </li>
              {vendors.map((vendor) => {
                const selected = vendorFilter === vendor
                const Icon = chatProviderIcon(vendor)
                return (
                  <li key={vendor}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold transition ${
                        selected
                          ? 'bg-brand/15 text-brand'
                          : 'text-brand hover:bg-brand/10 dark:hover:bg-brand/15'
                      }`}
                      onClick={() => {
                        setVendorFilter(vendor)
                        setVendorMenuOpen(false)
                      }}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate">{vendorLabel(vendor)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
        <FocusRingFrame
          active={false}
          className="size-11 shrink-0"
          shellClassName={`${FOCUS_RING_SHELL} size-full overflow-hidden`}
        >
          <button
            type="button"
            className="flex size-full items-center justify-center text-brand outline-none transition hover:bg-brand/10 disabled:opacity-50 dark:hover:bg-brand/15"
            disabled={loading || refreshing}
            aria-label={
              refreshing
                ? t('settings.ai.modelAllowlist.refreshing')
                : t('settings.ai.modelAllowlist.refresh')
            }
            title={
              refreshing
                ? t('settings.ai.modelAllowlist.refreshing')
                : t('settings.ai.modelAllowlist.refresh')
            }
            onClick={() => {
              void handleRefresh()
            }}
          >
            <RefreshIcon
              className={`size-4 shrink-0 ${refreshing ? 'animate-spin' : ''}`}
              aria-hidden
            />
          </button>
        </FocusRingFrame>
      </div>

      <div className="space-y-1 rounded-2xl border border-zinc-950/10 bg-white/40 p-3 dark:border-white/10 dark:bg-zinc-950/20">
        {loading ? (
          <p className="py-4 text-center text-sm text-muted">{t('settings.ai.modelAllowlist.loading')}</p>
        ) : filteredRows.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">{t('settings.ai.modelAllowlist.empty')}</p>
        ) : (
          orderedRows.map((row) => {
            const enabled = isAiModelEnabled(row.provider, row.id, overrides)
            const label = combinedLabel(row)
            const configured = isRowConfigured(row)
            const Icon = chatProviderIcon(row.provider)
            return (
              <div
                key={aiModelAllowlistKey(row.provider, row.id)}
                className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 dark:bg-zinc-900/50"
              >
                <div
                  className={`flex min-w-0 items-center gap-2 ${
                    configured ? 'text-ink' : 'text-muted'
                  }`}
                >
                  <Icon
                    className={`size-4 shrink-0 ${configured ? '' : 'grayscale'}`}
                    aria-hidden
                  />
                  <p className="min-w-0 truncate text-sm font-semibold">{label}</p>
                  {!configured ? (
                    <span className="shrink-0 text-xs font-medium text-muted">
                      {row.offline
                        ? t('settings.ai.modelAllowlist.offline')
                        : t('settings.ai.config.status.notConfigured')}
                    </span>
                  ) : null}
                </div>
                <SettingsSwitch
                  checked={enabled}
                  onChange={(next) => {
                    void setEnabled(row.provider, row.id, next)
                  }}
                  aria-label={t('settings.ai.modelAllowlist.toggleAria', {
                    model: label,
                  })}
                />
              </div>
            )
          })
        )}
        {canToggleViewAll ? (
          <button
            type="button"
            className="px-1 pt-1 text-xs font-bold text-brand transition hover:underline"
            onClick={() => setViewAll(true)}
          >
            {t('settings.ai.modelAllowlist.viewAll')}
          </button>
        ) : null}
        {canCollapse ? (
          <button
            type="button"
            className="px-1 pt-1 text-xs font-bold text-brand transition hover:underline"
            onClick={() => setViewAll(false)}
          >
            {t('settings.ai.modelAllowlist.showLess')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
