/**
 * Harness library: the Cursor-class catalog in our own UI.
 *
 * Skills and editable resources live in the user's VPS profile. Third-party
 * MCP servers are configured locally because their credentials belong to this device.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiCatalogModel, ElectronAiModelSelection } from '@/chat/ai-model-catalog'
import { HarnessModelPicker } from '@/components/harness/harness-composer'
import { HarnessMcpPanel } from '@/components/harness/harness-mcp-panel'
import type { HarnessAppConnector, HarnessMcpServerStatus } from '@/types/harness'
import { PlusIcon, SearchIcon, SparklesIcon, TrashIcon, UploadIcon } from '@/icons/AllIcons'
import {
  deleteSkill,
  deleteLibraryEntry,
  fetchSkill,
  fetchSkillIndex,
  fetchLibraryEntries,
  fetchLibraryEntry,
  isHarnessLibraryApiConfigured,
  requestSkillPublish,
  saveSkill,
  saveLibraryEntry,
  type HarnessLibraryEntry,
  type HarnessLibraryKind,
  type HarnessSkill,
} from '@/services/harness-library-api'
import {
  generateHarnessLibraryDraft,
  type HarnessGeneratableKind,
  type HarnessLibraryDraft,
} from '@/services/harness-library-generator'

/** Catalog kinds mirrored from the Cursor-class basics. */
const LIBRARY_KINDS = [
  'skills',
  'commands',
  'rules',
  'hooks',
  'subagents',
  'mcps',
  'plugins',
] as const

type LibraryKind = (typeof LIBRARY_KINDS)[number]

interface HarnessLibraryPanelProps {
  /** Models available from the shared backend catalog. */
  models: AiCatalogModel[]
  /** Provider and model used for AI draft generation. */
  selection: ElectronAiModelSelection
  /** Providers with a configured API credential. */
  configuredProviders: ReadonlySet<string>
  /** Updates the shared Harness model selection. */
  onSelectionChange: (selection: ElectronAiModelSelection) => void
  /** Hosted connector directory and runtime state. */
  connectors: HarnessAppConnector[]
  /** Refreshes the hosted connector directory. */
  onRefreshConnectors: (forceRefetch?: boolean) => Promise<void>
  /** Opens a provider-owned connector install flow. */
  onInstallConnector: (connectorId: string, installUrl: string) => Promise<void>
  /** Runtime states for configured MCP servers. */
  mcpServers: HarnessMcpServerStatus[]
  /** Starts OAuth for one configured MCP server. */
  onMcpLogin: (name: string) => void
  /** Recreates the local runtime after MCP configuration changes. */
  onMcpConfigurationChange: () => void
}

type HarnessGenerationModelProps = Pick<
  HarnessLibraryPanelProps,
  'models' | 'selection' | 'configuredProviders' | 'onSelectionChange'
>

interface HarnessLibraryGeneratorProps extends HarnessGenerationModelProps {
  /** Resource category to generate. */
  kind: HarnessGeneratableKind
  /** Receives a generated draft for human review. */
  onGenerated: (draft: HarnessLibraryDraft) => void
  /** Closes the generator without saving. */
  onCancel: () => void
}

/**
 * AI draft form shared by every editable text resource category.
 * @param props - Generation kind, model controls, and result handlers.
 * @returns Review-first resource generator.
 */
function HarnessLibraryGenerator({
  kind,
  models,
  selection,
  configuredProviders,
  onSelectionChange,
  onGenerated,
  onCancel,
}: HarnessLibraryGeneratorProps) {
  const { t } = useTranslation()
  const [requirement, setRequirement] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      controllerRef.current?.abort()
    },
    [],
  )

  /**
   * Generates one draft with the selected provider and model.
   * @returns Nothing.
   */
  async function handleGenerate(): Promise<void> {
    const prompt = requirement.trim()
    if (!prompt || !configuredProviders.has(selection.provider)) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setError(false)
    setIsGenerating(true)
    try {
      const draft = await generateHarnessLibraryDraft(kind, prompt, selection, controller.signal)
      onGenerated(draft)
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === 'AbortError')) {
        setError(true)
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null
        setIsGenerating(false)
      }
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-3xl border border-brand/20 bg-brand/5 p-4"
      aria-busy={isGenerating}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">{t('harness.library.generator.title')}</p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {t('harness.library.generator.hint')}
          </p>
        </div>
        <HarnessModelPicker
          models={models}
          selection={selection}
          configuredProviders={configuredProviders}
          disabled={isGenerating}
          onChange={onSelectionChange}
        />
      </div>
      <textarea
        rows={4}
        name="harnessLibraryRequirement"
        value={requirement}
        placeholder={t('harness.library.generator.placeholder')}
        aria-label={t('harness.library.generator.placeholder')}
        className="w-full resize-none rounded-2xl border border-zinc-950/10 bg-white/70 px-4 py-3 text-sm text-ink outline-none placeholder:text-muted focus:border-brand/50 dark:border-white/10 dark:bg-zinc-950/40"
        disabled={isGenerating}
        onChange={(event) => setRequirement(event.target.value)}
      />
      {error ? (
        <p role="alert" className="text-xs font-semibold text-red-500">
          {t('harness.library.generator.failed')}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
          disabled={
            !requirement.trim() ||
            isGenerating ||
            !configuredProviders.has(selection.provider)
          }
          onClick={() => void handleGenerate()}
        >
          <SparklesIcon className="size-4" aria-hidden />
          {isGenerating
            ? t('harness.library.generator.generating')
            : t('harness.library.generator.generate')}
        </button>
        <button
          type="button"
          className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-zinc-950/10 dark:bg-white/5 dark:hover:bg-white/10"
          disabled={isGenerating}
          onClick={onCancel}
        >
          {t('harness.library.cancel')}
        </button>
      </div>
    </div>
  )
}

/**
 * Editor for one personal skill.
 * @param props - Draft state and save / cancel handlers.
 * @returns Skill editor element.
 */
function SkillEditor({
  initialName,
  initialBody,
  onSave,
  onCancel,
}: {
  initialName: string
  initialBody: string
  onSave: (name: string, body: string) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [body, setBody] = useState(initialBody)
  const [isSaving, setIsSaving] = useState(false)

  const fieldClass =
    'w-full rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-brand/50 dark:border-white/10 dark:bg-zinc-950/40'

  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-zinc-950/10 bg-white/60 p-4 dark:border-white/10 dark:bg-zinc-950/40">
      <input
        type="text"
        name="harnessSkillName"
        className={fieldClass}
        value={name}
        placeholder={t('harness.library.skillName')}
        aria-label={t('harness.library.skillName')}
        readOnly={Boolean(initialName)}
        onChange={(event) => setName(event.target.value)}
      />
      <textarea
        rows={10}
        name="harnessSkillBody"
        className={`${fieldClass} resize-none font-mono text-xs`}
        value={body}
        placeholder={t('harness.library.skillBody')}
        aria-label={t('harness.library.skillBody')}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg disabled:opacity-50"
          disabled={!name.trim() || !body.trim() || isSaving}
          onClick={() => {
            setIsSaving(true)
            void onSave(name.trim(), body).finally(() => setIsSaving(false))
          }}
        >
          {t('harness.library.save')}
        </button>
        <button
          type="button"
          className="rounded-2xl bg-zinc-950/5 px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-zinc-950/10 dark:bg-white/5 dark:hover:bg-white/10"
          onClick={onCancel}
        >
          {t('harness.library.cancel')}
        </button>
      </div>
    </div>
  )
}

/**
 * CRUD list for commands, rules, hooks, subagents, and plugin manifests.
 * @param props - Active library category.
 * @returns Editable personal library panel.
 */
function PersonalLibraryPanel({
  kind,
  models,
  selection,
  configuredProviders,
  onSelectionChange,
}: { kind: HarnessLibraryKind } & HarnessGenerationModelProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<HarnessLibraryEntry[]>([])
  const [editing, setEditing] = useState<{ name: string; body: string } | null>(null)
  const [showGenerator, setShowGenerator] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      setEntries(await fetchLibraryEntries(kind))
    } catch {
      setEntries([])
    } finally {
      setIsLoading(false)
    }
  }, [kind])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted">{t(`harness.library.description.${kind}`)}</p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-2xl bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50"
            disabled={configuredProviders.size === 0}
            onClick={() => {
              setEditing(null)
              setShowGenerator(true)
            }}
          >
            <SparklesIcon className="size-4" aria-hidden />
            {t('harness.library.generateWithAi')}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg"
            onClick={() => {
              setShowGenerator(false)
              setEditing({ name: '', body: `# New ${kind.slice(0, -1)}\n\n` })
            }}
          >
            <PlusIcon className="size-4" aria-hidden />
            {t('harness.library.newEntry')}
          </button>
        </div>
      </div>
      {showGenerator ? (
        <HarnessLibraryGenerator
          kind={kind}
          models={models}
          selection={selection}
          configuredProviders={configuredProviders}
          onSelectionChange={onSelectionChange}
          onCancel={() => setShowGenerator(false)}
          onGenerated={(draft) => {
            setShowGenerator(false)
            setEditing(draft)
          }}
        />
      ) : null}
      {editing ? (
        <SkillEditor
          initialName={editing.name}
          initialBody={editing.body}
          onCancel={() => setEditing(null)}
          onSave={async (name, body) => {
            await saveLibraryEntry(kind, name, body)
            setEditing(null)
            await refresh()
          }}
        />
      ) : null}
      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted">{t('status.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('harness.library.emptyEntries')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div
              key={entry.name}
              className="flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink">{entry.name}</p>
                <p className="truncate text-xs font-medium text-muted">{entry.summary}</p>
              </div>
              <button
                type="button"
                className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand hover:bg-brand/10"
                onClick={() => {
                  void fetchLibraryEntry(kind, entry.name).then((item) =>
                    setEditing({ name: item.name, body: item.body ?? '' }),
                  )
                }}
              >
                {t('harness.library.edit')}
              </button>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-lg text-muted hover:bg-red-500/10 hover:text-red-500"
                aria-label={t('harness.library.delete')}
                onClick={() => {
                  void deleteLibraryEntry(kind, entry.name).then(refresh)
                }}
              >
                <TrashIcon className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Library workspace for Harness.
 * @returns Library view element.
 */
export function HarnessLibraryPanel({
  models,
  selection,
  configuredProviders,
  onSelectionChange,
  connectors,
  onRefreshConnectors,
  onInstallConnector,
  mcpServers,
  onMcpLogin,
  onMcpConfigurationChange,
}: HarnessLibraryPanelProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<LibraryKind>('skills')
  const [query, setQuery] = useState('')
  const [skills, setSkills] = useState<HarnessSkill[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editing, setEditing] = useState<{ name: string; body: string } | null>(null)
  const [showGenerator, setShowGenerator] = useState(false)

  const configured = isHarnessLibraryApiConfigured()

  const refresh = useCallback(async (): Promise<void> => {
    if (!configured) {
      setSkills([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const index = await fetchSkillIndex()
      setSkills([...index.org, ...index.personal])
    } catch {
      setSkills([])
    } finally {
      setIsLoading(false)
    }
  }, [configured])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (kind === 'mcps' && connectors.length === 0) {
      void onRefreshConnectors(false).catch(() => undefined)
    }
  }, [connectors.length, kind, onRefreshConnectors])

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return skills
    }
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(term) || skill.summary.toLowerCase().includes(term),
    )
  }, [query, skills])

  /**
   * Saves one personal skill and refreshes the list.
   * @param name - Skill folder name.
   * @param body - Markdown body.
   * @returns Nothing.
   */
  const handleSave = useCallback(
    async (name: string, body: string): Promise<void> => {
      await saveSkill(name, body)
      setEditing(null)
      await refresh()
    },
    [refresh],
  )

  /**
   * Opens one personal skill in the editor.
   * @param name - Skill folder name.
   * @returns Nothing.
   */
  const handleEdit = useCallback(async (name: string): Promise<void> => {
    const skill = await fetchSkill(name)
    setEditing({ name: skill.name, body: skill.body ?? '' })
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-brand">
            {t('harness.library.title')}
          </h1>
          <p className="mt-1 text-sm font-medium text-muted">{t('harness.library.subtitle')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {LIBRARY_KINDS.map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={kind === entry}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                kind === entry
                  ? 'bg-brand text-brand-fg'
                  : 'bg-zinc-950/5 text-brand hover:bg-brand/10 dark:bg-white/5'
              }`}
              onClick={() => setKind(entry)}
            >
              {t(`harness.library.kind.${entry}`)}
            </button>
          ))}
        </div>

        {kind === 'skills' ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block flex-1">
                <SearchIcon
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
                  aria-hidden
                />
                <input
                  type="search"
                  name="harnessSkillSearch"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('harness.library.searchPlaceholder')}
                  aria-label={t('harness.library.searchPlaceholder')}
                  className="w-full rounded-2xl border border-zinc-950/10 bg-white/60 py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-brand/50 dark:border-white/10 dark:bg-zinc-950/40"
                />
              </label>
              <button
                type="button"
                className="flex items-center gap-2 rounded-2xl bg-brand/10 px-4 py-2.5 text-sm font-bold text-brand transition hover:bg-brand/15 disabled:opacity-50"
                disabled={!configured || configuredProviders.size === 0}
                onClick={() => {
                  setEditing(null)
                  setShowGenerator(true)
                }}
              >
                <SparklesIcon className="size-4" aria-hidden />
                {t('harness.library.generateWithAi')}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-fg shadow-lg shadow-brand/25 transition hover:opacity-90 disabled:opacity-50"
                disabled={!configured}
                onClick={() => {
                  setShowGenerator(false)
                  setEditing({ name: '', body: '# New skill\n\n' })
                }}
              >
                <PlusIcon className="size-4" aria-hidden />
                {t('harness.library.newSkill')}
              </button>
            </div>

            {!configured ? (
              <p className="rounded-2xl border border-zinc-950/10 bg-zinc-950/5 px-4 py-3 text-xs font-medium text-muted dark:border-white/10 dark:bg-white/5">
                {t('harness.library.unavailable')}
              </p>
            ) : null}

            {showGenerator ? (
              <HarnessLibraryGenerator
                kind="skills"
                models={models}
                selection={selection}
                configuredProviders={configuredProviders}
                onSelectionChange={onSelectionChange}
                onCancel={() => setShowGenerator(false)}
                onGenerated={(draft) => {
                  setShowGenerator(false)
                  setEditing(draft)
                }}
              />
            ) : null}

            {editing ? (
              <SkillEditor
                initialName={editing.name}
                initialBody={editing.body}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            ) : null}

            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted">{t('status.loading')}</p>
            ) : visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{t('harness.library.empty')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {visible.map((skill) => (
                  <div
                    key={`${skill.scope}-${skill.name}`}
                    className="flex items-start gap-3 rounded-2xl border border-zinc-950/10 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-zinc-950/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-ink">{skill.name}</p>
                        <span className="rounded-full bg-zinc-950/5 px-2 py-0.5 text-[11px] font-semibold text-muted dark:bg-white/5">
                          {t(`harness.library.scope.${skill.scope}`)}
                        </span>
                        {skill.publishRequested ? (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                            {t('harness.library.publishPending')}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs font-medium text-muted">
                        {skill.summary}
                      </p>
                    </div>

                    {skill.scope === 'personal' ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand transition hover:bg-brand/10"
                          onClick={() => {
                            void handleEdit(skill.name)
                          }}
                        >
                          {t('harness.library.edit')}
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-brand transition hover:bg-brand/10"
                          title={t('harness.library.publish')}
                          aria-label={t('harness.library.publish')}
                          onClick={() => {
                            void requestSkillPublish(skill.name).then(refresh)
                          }}
                        >
                          <UploadIcon className="size-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-red-500/10 hover:text-red-500"
                          title={t('harness.library.delete')}
                          aria-label={t('harness.library.delete')}
                          onClick={() => {
                            void deleteSkill(skill.name).then(refresh)
                          }}
                        >
                          <TrashIcon className="size-4" aria-hidden />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : kind === 'mcps' ? (
          <HarnessMcpPanel
            connectors={connectors}
            statuses={mcpServers}
            onRefresh={onRefreshConnectors}
            onInstall={onInstallConnector}
            onLogin={onMcpLogin}
            onConfigurationChange={onMcpConfigurationChange}
          />
        ) : (
          <PersonalLibraryPanel
            kind={kind}
            models={models}
            selection={selection}
            configuredProviders={configuredProviders}
            onSelectionChange={onSelectionChange}
          />
        )}
      </div>
    </div>
  )
}
