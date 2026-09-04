/**
 * Harness feature page: local workflow transcript plus scheduled tasks.
 *
 * This surface is independent from Ask. It never calls `POST /ai/aichat`;
 * turns come from the local Codex host, and missing hosts fail explicitly,
 * and scheduled jobs live on the user's VPS Hermes profile.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClockIcon, FolderIcon, GridIcon, HistoryIcon, PlusIcon, ToolIcon } from '@/icons/AllIcons'
import { StatusLoading } from '@/components/common/status-loading'
import { HarnessApprovalBar } from '@/components/harness/harness-approval-bar'
import { HarnessComposer } from '@/components/harness/harness-composer'
import { HarnessLibraryPanel } from '@/components/harness/harness-library-panel'
import { HarnessMenuBar } from '@/components/harness/harness-menu-bar'
import { HarnessHistoryPanel } from '@/components/harness/harness-history-panel'
import { HarnessOverlayCaption } from '@/components/harness/harness-overlay-caption'
import { HarnessScheduledPanel } from '@/components/harness/harness-scheduled-panel'
import { HarnessTranscript } from '@/components/harness/harness-transcript'
import { HarnessUtilitySidebar, type HarnessUtilityPage } from '@/components/harness/harness-utility-sidebar'
import { HarnessToolsPanel } from '@/components/harness/harness-tools-panel'
import {
  harnessItemsFromHistory,
  historyContinuationInstructions,
  useHarnessHistory,
} from '@/hooks/use-harness-history'
import { useHarnessHost } from '@/hooks/use-harness-host'
import { useHarnessMemoryReview } from '@/hooks/use-harness-memory-review'
import { useHarnessSchedule } from '@/hooks/use-harness-schedule'
import { useHarnessSession } from '@/hooks/use-harness-session'
import { useHarnessWakeQueue } from '@/hooks/use-harness-wake-queue'
import { createHarnessRuntime } from '@/utils/harness/create-runtime'
import {
  ELECTRON_FALLBACK_MODELS,
  loadElectronAiModelSelection,
  providerKeyAliases,
  resolveElectronAiSelection,
  saveElectronAiModelSelection,
  type AiCatalogModel,
  type ElectronAiModelSelection,
} from '@/chat/ai-model-catalog'
import { withCatalogReasoning } from '@/utils/harness/reasoning-effort'
import { resolveHarnessUtilityWidth, HARNESS_MIDDLE_CONTENT_WIDTH } from '@/utils/harness/utility-layout'
import { listAiModels } from '@/services/ai-api'
import { useAiKeys } from '@/hooks/use-ai-keys'
import { useAiModelAllowlist } from '@/hooks/use-ai-model-allowlist'
import { filterEnabledAiModels } from '@/utils/settings/ai-model-allowlist'
import { probeAllLocalAiModels } from '@/services/local-ai-models'
import { readLocalAiBaseUrls } from '@/utils/settings/local-ai-prefs'
import { LOCAL_AI_PROVIDER_IDS, isLocalAiProviderId } from '@/constants/local-ai-providers'
import { HARNESS_PRESENTATION_INSTRUCTIONS } from '@/prompts/harness-presentation'
import type { HistoryRecord } from '@/types/chat'
import type {
  HarnessAppConnector,
  HarnessComputerTarget,
  HarnessDeliberationConfig,
  HarnessScheduledJob,
  HarnessStartTurnExtras,
} from '@/types/harness'
import type {
  SalesAssistantProfile,
} from '@/constants/harness-sales-assistants'
import {
  loadHarnessComputerUseEnabled,
  loadHarnessWebSearchEnabled,
  loadHarnessComputerUseTarget,
  loadHarnessApprovalMode,
  loadHarnessSidebarVisible,
  loadHarnessUtilitySidebarVisible,
  loadHarnessUtilitySidebarWidth,
  saveHarnessApprovalMode,
  saveHarnessWorkFolder,
  saveHarnessComputerUseEnabled,
  saveHarnessWebSearchEnabled,
  saveHarnessComputerUseTarget,
  saveHarnessSidebarVisible,
  saveHarnessUtilitySidebarVisible,
  saveHarnessUtilitySidebarWidth,
} from '@/utils/settings/harness-prefs'

/** Which workspace the main pane shows. */
type HarnessView = 'task' | 'tools' | 'scheduled' | 'library' | 'history'

interface HarnessPageProps {
  /** Signed-in user id, used to read the provider key from Settings → AI. */
  userId?: string
  /** Compact always-on-top overlay (Chrome Gemini-style); hides rails and utility. */
  overlay?: boolean
}

interface HarnessWorkspaceProps {
  userId: string | null
  apiKey: string | null
  hostAvailable: boolean
  developerInstructions: string | null
  accessToken: string | null
  apiBaseUrl: string | null
  cwd: string | null
  retryHost: () => void
  overlay: boolean
}

/**
 * Returns the final segment of a local project path.
 * @param value - Absolute local directory path.
 * @returns Display name for the sidebar.
 */
function workFolderName(value: string | null): string {
  return value?.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Harness'
}

/**
 * Keeps the current model when eligible, then prefers another eligible model from the same provider.
 * @param models - Configured models eligible for the active mode.
 * @param current - Current shared Harness model selection.
 * @returns Eligible selection, or null when no configured model is available.
 */
function resolveAvailableSelection(
  models: AiCatalogModel[],
  current: ElectronAiModelSelection,
): ElectronAiModelSelection | null {
  const exact = models.find(
    (model) => model.provider === current.provider && model.id === current.modelId,
  )
  if (exact) return { provider: exact.provider, modelId: exact.id }
  const sameProvider = models.find((model) => model.provider === current.provider)
  if (sameProvider) return { provider: sameProvider.provider, modelId: sameProvider.id }
  return models.length > 0 ? resolveElectronAiSelection(models, null) : null
}

/**
 * Harness workspace once the workflow host has been probed.
 * @param props - Session inputs, host availability, and memory snapshot.
 * @returns Workspace element.
 */
function HarnessWorkspace({
  userId,
  apiKey,
  hostAvailable,
  developerInstructions,
  accessToken,
  apiBaseUrl,
  cwd,
  retryHost,
  overlay,
}: HarnessWorkspaceProps) {
  const { t } = useTranslation()
  const { keys: aiKeys } = useAiKeys(userId)
  const { overrides: modelOverrides } = useAiModelAllowlist()
  const [localCatalogModels, setLocalCatalogModels] = useState<AiCatalogModel[]>([])
  const [view, setView] = useState<HarnessView>('task')
  const [workFolder, setWorkFolder] = useState(cwd)
  const [runtimeEpoch, setRuntimeEpoch] = useState(0)
  const [canvasEpoch, setCanvasEpoch] = useState(0)
  const [canvasRevision, setCanvasRevision] = useState(0)
  const [resumeThreadId, setResumeThreadId] = useState<string | null>(null)
  const [continuationInstructions, setContinuationInstructions] = useState<string | null>(null)
  const [activeAssistant, setActiveAssistant] = useState<SalesAssistantProfile | null>(null)
  const [composerDraft, setComposerDraft] = useState('')
  const [taskTitle, setTaskTitle] = useState<string | null>(null)
  const latestThreadIdRef = useRef<string | null>(null)
  const [catalogModels, setCatalogModels] = useState<AiCatalogModel[]>(() =>
    ELECTRON_FALLBACK_MODELS.map(withCatalogReasoning),
  )
  const [selection, setSelection] = useState(() =>
    resolveElectronAiSelection(
      ELECTRON_FALLBACK_MODELS.map(withCatalogReasoning),
      loadElectronAiModelSelection('agent'),
    ),
  )
  const [computerUseEnabled, setComputerUseEnabled] = useState(loadHarnessComputerUseEnabled)
  const [webSearchEnabled, setWebSearchEnabled] = useState(loadHarnessWebSearchEnabled)
  const [approvalMode, setApprovalMode] = useState(loadHarnessApprovalMode)
  const [sidebarVisible, setSidebarVisible] = useState(loadHarnessSidebarVisible)
  const [utilitySidebarVisible, setUtilitySidebarVisible] = useState(
    loadHarnessUtilitySidebarVisible,
  )
  const [preferredUtilityWidth, setPreferredUtilityWidth] = useState(
    loadHarnessUtilitySidebarWidth,
  )
  const [utilityManualWidth, setUtilityManualWidth] = useState(false)
  const [harnessContainerWidth, setHarnessContainerWidth] = useState(0)
  const harnessRootRef = useRef<HTMLDivElement | null>(null)
  const [utilityFocus, setUtilityFocus] = useState<{
    page: HarnessUtilityPage
    nonce: number
  } | null>(null)
  const [computerUseTarget, setComputerUseTarget] = useState<HarnessComputerTarget | null>(
    loadHarnessComputerUseTarget,
  )
  const [computerUseTargets, setComputerUseTargets] = useState<HarnessComputerTarget[]>([])
  const [connectors, setConnectors] = useState<HarnessAppConnector[]>([])
  const mergedCatalogModels = useMemo(
    () => [...catalogModels, ...localCatalogModels],
    [catalogModels, localCatalogModels],
  )
  const allowlistedCatalogModels = useMemo(
    () => filterEnabledAiModels(mergedCatalogModels, modelOverrides),
    [mergedCatalogModels, modelOverrides],
  )
  const computerUseModels = useMemo(
    () => allowlistedCatalogModels.filter((model) => model.vision && model.computerUse),
    [allowlistedCatalogModels],
  )
  const configuredProviders = useMemo(() => {
    const providers = new Set<string>()
    for (const model of allowlistedCatalogModels) {
      if (isLocalAiProviderId(model.provider)) {
        // Local models only reach this list after a successful reachability probe.
        providers.add(model.provider)
        continue
      }
      if (providerKeyAliases(model.provider).some((id) => Boolean(aiKeys[id]?.trim()))) {
        providers.add(model.provider)
      }
    }
    return providers
  }, [aiKeys, allowlistedCatalogModels])
  const availableModels = useMemo(
    () => allowlistedCatalogModels.filter((model) => configuredProviders.has(model.provider)),
    [allowlistedCatalogModels, configuredProviders],
  )
  const availableComputerUseModels = useMemo(
    () => computerUseModels.filter((model) => configuredProviders.has(model.provider)),
    [computerUseModels, configuredProviders],
  )
  const activeComputerUseEnabled = computerUseEnabled && availableComputerUseModels.length > 0
  const workflowDeveloperInstructions = useMemo(
    () =>
      [
        developerInstructions,
        HARNESS_PRESENTATION_INSTRUCTIONS,
        activeAssistant
          ? [
              '# Active tool profile',
              `Profile id: ${activeAssistant.id}`,
              `Executor tool: ${activeAssistant.executorName}`,
              `Call ${activeAssistant.executorName} exactly once before executing this specialist workflow.`,
              `Allowed first-party tools: ${activeAssistant.allowedTools.join(', ')}`,
              `Required connectors: ${activeAssistant.requiredConnectors.join(', ') || 'none'}`,
              `Output mode: ${activeAssistant.outputMode}`,
              activeAssistant.instructions,
            ].join('\n\n')
          : null,
      ]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n\n'),
    [activeAssistant, developerInstructions],
  )

  useEffect(() => {
    const selectableModels = activeComputerUseEnabled
      ? availableComputerUseModels
      : availableModels
    const next = resolveAvailableSelection(selectableModels, selection)
    if (next && (next.provider !== selection.provider || next.modelId !== selection.modelId)) {
      setSelection(next)
      saveElectronAiModelSelection(next, 'agent')
    }
  }, [activeComputerUseEnabled, availableComputerUseModels, availableModels, selection])

  useEffect(() => {
    let cancelled = false
    void listAiModels('electron')
      .then((rows) => {
        const models = rows
          .filter((row) => row.provider.trim() && row.id.trim())
          .map((row) => {
            const fallback = ELECTRON_FALLBACK_MODELS.find(
              (model) => model.provider === row.provider && model.id === row.id,
            )
            return withCatalogReasoning({
              id: row.id,
              provider: row.provider,
              labelEn: row.labelEn,
              default: row.default,
              vision: row.vision ?? fallback?.vision,
              computerUse: row.computerUse ?? fallback?.computerUse,
              reasoningEfforts: row.reasoningEfforts,
              defaultReasoningEffort: row.defaultReasoningEffort,
            })
          })
        if (!cancelled && models.length > 0) {
          setCatalogModels(models)
          setSelection(resolveElectronAiSelection(models, loadElectronAiModelSelection('agent')))
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const anyLocalEnabled = LOCAL_AI_PROVIDER_IDS.some((providerId) =>
      Array.from(modelOverrides.entries()).some(
        ([key, enabled]) => enabled && key.startsWith(`${providerId}:`),
      ),
    )
    if (!anyLocalEnabled) {
      setLocalCatalogModels([])
      return
    }
    let cancelled = false
    void probeAllLocalAiModels(readLocalAiBaseUrls())
      .then((models) => {
        if (!cancelled) {
          setLocalCatalogModels(models)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [modelOverrides])

  const runtimeFactory = useMemo(
    () => () =>
      createHarnessRuntime({
        apiKey,
        cwd: workFolder,
        resumeThreadId: resumeThreadId ?? latestThreadIdRef.current,
        continuationInstructions,
        hostAvailable,
        developerInstructions: workflowDeveloperInstructions,
        accessToken,
        apiBaseUrl,
        provider: selection.provider,
        modelId: selection.modelId,
        approvalMode,
        computerUseProvider: selection.provider,
        computerUseModel: selection.modelId,
        computerUseEnabled: activeComputerUseEnabled,
        webSearchEnabled,
        computerUseTarget,
        allowedTools: activeAssistant ? [...activeAssistant.allowedTools] : null,
        activeExpert: activeAssistant ? {
          id: activeAssistant.id,
          executorName: activeAssistant.executorName,
          name: activeAssistant.name,
          instructions: activeAssistant.instructions,
          outputMode: activeAssistant.outputMode,
          requiredConnectors: [...activeAssistant.requiredConnectors],
        } : null,
      }),
    [
      apiKey,
      apiBaseUrl,
      accessToken,
      activeAssistant,
      activeComputerUseEnabled,
      webSearchEnabled,
      approvalMode,
      computerUseTarget,
      continuationInstructions,
      hostAvailable,
      resumeThreadId,
      runtimeEpoch,
      selection,
      workFolder,
      workflowDeveloperInstructions,
    ],
  )
  const session = useHarnessSession(runtimeFactory)
  const schedule = useHarnessSchedule()
  const history = useHarnessHistory(
    userId,
    session.items,
    session.turnStatus,
    session.isLive,
    session.threadId,
  )

  latestThreadIdRef.current = session.threadId

  useEffect(() => {
    let cancelled = false
    void session.listComputerTargets().then((targets) => {
      if (cancelled) return
      setComputerUseTargets(targets)
      setComputerUseTarget((current) => {
        if (!current || targets.some((target) => target.id === current.id)) return current
        saveHarnessComputerUseTarget(null)
        return null
      })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [session.listComputerTargets])

  /**
   * Refreshes the hosted connector directory and runtime state.
   * @param forceRefetch - Whether Codex should bypass connector caches.
   * @returns Nothing.
   */
  const refreshConnectors = useCallback(async (forceRefetch = false): Promise<void> => {
    setConnectors(await session.listConnectors(forceRefetch))
  }, [session.listConnectors])

  const isBusy = session.turnStatus === 'running'

  useHarnessMemoryReview(
    session.turnStatus,
    session.items,
    session.isLive,
    selection.provider,
    selection.modelId,
  )
  useHarnessWakeQueue(session.isLive && !isBusy, session.submit, session.turnStatus, session.isLive)

  /**
   * Shows the right workspace and opens one utility page.
   * @param page - Utility page to focus.
   * @returns Nothing.
   */
  const openUtilityPage = useCallback((page: HarnessUtilityPage): void => {
    if (overlay) {
      return
    }
    if (!utilitySidebarVisible) {
      setUtilitySidebarVisible(true)
      saveHarnessUtilitySidebarVisible(true)
      setUtilityManualWidth(false)
    }
    setUtilityFocus((current) => ({ page, nonce: (current?.nonce ?? 0) + 1 }))
  }, [overlay, utilitySidebarVisible])

  useEffect(() => {
    if (overlay) {
      return
    }
    const root = harnessRootRef.current
    if (!root || typeof ResizeObserver === 'undefined') {
      return
    }
    const apply = (width: number): void => {
      setHarnessContainerWidth(Math.round(width))
    }
    apply(root.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      apply(entry.contentRect.width)
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [overlay])

  const utilityLayout = useMemo(
    () =>
      resolveHarnessUtilityWidth({
        containerWidth:
          harnessContainerWidth > 0
            ? harnessContainerWidth
            : preferredUtilityWidth + HARNESS_MIDDLE_CONTENT_WIDTH + (sidebarVisible ? 240 : 0),
        leftSidebarVisible: sidebarVisible,
        preferredWidth: preferredUtilityWidth,
        preferManualWidth: utilityManualWidth,
      }),
    [
      harnessContainerWidth,
      preferredUtilityWidth,
      sidebarVisible,
      utilityManualWidth,
    ],
  )

  /**
   * Archives the current conversation Canvas, clears the live folder, and closes Canvas tabs.
   * @param historyId - Conversation to keep, or null when the live folder has no history row.
   * @returns Nothing.
   */
  const parkCanvasWorkspace = useCallback((historyId: string | null): void => {
    setCanvasEpoch((value) => value + 1)
    setCanvasRevision((value) => value + 1)
    void window.workbench?.harness?.parkCanvas?.(workFolder, historyId)
  }, [workFolder])

  useEffect(() => {
    if (session.turnStatus !== 'idle') return
    const historyId = history.activeHistoryId
    if (!historyId) return
    void window.workbench?.harness?.snapshotCanvas?.(workFolder, historyId)
  }, [history.activeHistoryId, session.turnStatus, workFolder])

  /**
   * Starts a blank Harness task without leftover transcript or Canvas preview.
   * @returns Nothing.
   */
  const handleNewTask = useCallback(() => {
    const historyId = history.activeHistoryId
    history.beginNew()
    latestThreadIdRef.current = null
    setResumeThreadId(null)
    setContinuationInstructions(null)
    setActiveAssistant(null)
    setComposerDraft('')
    setTaskTitle(null)
    parkCanvasWorkspace(historyId)
    setRuntimeEpoch((value) => value + 1)
    session.reset()
    setView('task')
  }, [history, parkCanvasWorkspace, session])

  /**
   * Selects the active local project and starts a clean task in that folder.
   * @returns Nothing.
   */
  const handleChooseProject = useCallback(async (): Promise<void> => {
    const picked = await window.workbench?.harness?.pickWorkFolder()
    if (!picked || picked === workFolder) return
    saveHarnessWorkFolder(picked)
    setWorkFolder(picked)
    history.beginNew()
    latestThreadIdRef.current = null
    setResumeThreadId(null)
    setContinuationInstructions(null)
    setActiveAssistant(null)
    setTaskTitle(null)
    setCanvasEpoch((value) => value + 1)
    setRuntimeEpoch((value) => value + 1)
    session.reset()
    setView('task')
  }, [history, session, workFolder])

  /**
   * Opens a stored conversation and prepares exact local resume with a cloud fallback.
   * @param record - History row selected by the user.
   * @returns Nothing.
   */
  const handleOpenHistory = useCallback(
    (record: HistoryRecord): void => {
      const previousHistoryId = history.activeHistoryId
      history.select(record)
      latestThreadIdRef.current = record.harnessThreadId ?? null
      setResumeThreadId(record.harnessThreadId ?? null)
      setContinuationInstructions(historyContinuationInstructions(record))
      setActiveAssistant(null)
      setTaskTitle(record.query)
      setRuntimeEpoch((value) => value + 1)
      session.restore(harnessItemsFromHistory(record))
      setView('task')
      void (async (): Promise<void> => {
        const bridge = window.workbench?.harness
        if (previousHistoryId && previousHistoryId !== record.id) {
          await bridge?.parkCanvas?.(workFolder, previousHistoryId)
        }
        const restored = (await bridge?.restoreCanvas?.(workFolder, record.id)) === true
        if (restored) {
          await bridge?.snapshotCanvas?.(workFolder, record.id)
          setCanvasRevision((value) => value + 1)
          openUtilityPage('canvas')
          return
        }
        setCanvasRevision((value) => value + 1)
        setCanvasEpoch((value) => value + 1)
      })()
    },
    [history, openUtilityPage, session, workFolder],
  )

  /**
   * Opens the latest result of a server schedule as a continuable task.
   * @param job - Scheduled job with a persisted digest.
   * @returns Nothing.
   */
  const handleContinueSchedule = useCallback(
    (job: HarnessScheduledJob): void => {
      if (!job.lastDigest) return
      history.beginNew()
      latestThreadIdRef.current = null
      setResumeThreadId(null)
      setActiveAssistant(null)
      setTaskTitle(job.prompt)
      setContinuationInstructions(
        `Continue from this scheduled task result.\n\nTask:\n${job.prompt}\n\nResult:\n${job.lastDigest}`,
      )
      setRuntimeEpoch((value) => value + 1)
      session.restore([
        { id: crypto.randomUUID(), type: 'userMessage', text: job.prompt },
        { id: crypto.randomUUID(), type: 'agentMessage', text: job.lastDigest },
      ])
      setView('task')
    },
    [history, session],
  )

  /**
   * Starts a clean Harness thread with one tool's behavior.
   * @param assistant - Tool selected from the discovery page.
   * @returns Nothing.
   */
  const handleStartAssistant = useCallback(
    (assistant: SalesAssistantProfile): void => {
      const historyId = history.activeHistoryId
      history.beginNew()
      latestThreadIdRef.current = null
      setResumeThreadId(null)
      setContinuationInstructions(assistant.instructions)
      setActiveAssistant(assistant)
      setComposerDraft('')
      setTaskTitle(null)
      parkCanvasWorkspace(historyId)
      setRuntimeEpoch((value) => value + 1)
      session.reset()
      setView('task')
    },
    [history, parkCanvasWorkspace, session],
  )

  /**
   * Submits a task and immediately promotes its first prompt to the menu bar title.
   * @param text - Task text submitted by the composer.
   * @param extras - Optional attachments, goal, planning mode, and Canvas mode.
   * @returns Nothing.
   */
  const handleSubmit = useCallback(
    (text: string, extras?: HarnessStartTurnExtras): void => {
      const title = text.trim()
      if (!taskTitle && title) setTaskTitle(title)
      session.submit(text, extras)
    },
    [session.submit, taskTitle],
  )

  /** Submits one private multi-model deliberation and promotes its prompt to the title. */
  const handleDeliberate = useCallback(
    (text: string, config: HarnessDeliberationConfig): void => {
      const title = text.trim()
      if (!taskTitle && title) setTaskTitle(title)
      session.deliberate(text, config)
    },
    [session.deliberate, taskTitle],
  )

  const navItems: Array<{
    id: HarnessView
    label: string
    Icon: (props: { className?: string; 'aria-hidden'?: boolean }) => React.ReactElement
  }> = [
    { id: 'task', label: t('harness.nav.newTask'), Icon: PlusIcon },
    { id: 'tools', label: t('harness.nav.tools'), Icon: ToolIcon },
    { id: 'scheduled', label: t('harness.nav.scheduled'), Icon: ClockIcon },
    { id: 'library', label: t('harness.nav.library'), Icon: GridIcon },
    { id: 'history', label: t('harness.nav.history'), Icon: HistoryIcon },
  ]

  /**
   * Renders the workspace switcher used by both the rail and the narrow bar.
   * @returns Nav buttons.
   */
  const renderNavButtons = (): React.ReactNode =>
    navItems.map(({ id, label, Icon }) => (
      <button
        key={id}
        type="button"
        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
          view === id ? 'bg-brand/15 text-brand' : 'text-brand hover:bg-brand/10'
        }`}
        onClick={() => {
          if (id === 'task') {
            handleNewTask()
            return
          }
          setView(id)
        }}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </button>
    ))

  const activeViewLabel =
    view === 'task'
      ? taskTitle?.trim() || navItems[0].label
      : navItems.find((item) => item.id === view)?.label ?? navItems[0].label

  return (
    <div
      ref={harnessRootRef}
      className="harness-page flex h-full max-h-full min-h-0 overflow-hidden text-ink"
    >
      {overlay ? null : (
      <aside
        data-testid="harness-sidebar"
        aria-hidden={!sidebarVisible}
        className={`hidden shrink-0 overflow-hidden transition-[width,opacity,transform,border-color,border-width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none lg:flex ${
          sidebarVisible
            ? 'w-[240px] translate-x-0 border-r border-zinc-950/10 opacity-100 dark:border-white/10'
            : 'pointer-events-none w-0 -translate-x-4 border-r-0 border-transparent opacity-0'
        }`}
      >
        <div className="flex h-full w-[240px] shrink-0 flex-col px-3 py-4">
        <nav className="flex flex-col gap-1" aria-label={t('functions.apps.harness')}>
          {renderNavButtons()}
        </nav>

        <div className="mt-5 border-t border-zinc-950/10 pt-4 dark:border-white/10">
          <p className="mb-2 px-2 text-[11px] font-bold tracking-wide text-muted uppercase">
            {t('harness.nav.projects')}
          </p>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-brand/10"
            title={workFolder ?? undefined}
            onClick={() => void handleChooseProject()}
          >
            <FolderIcon className="size-4 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
              {workFolderName(workFolder)}
            </span>
          </button>
        </div>

        {history.records.length > 0 ? (
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-zinc-950/10 pt-4 dark:border-white/10">
            <p className="mb-2 px-2 text-[11px] font-bold tracking-wide text-muted uppercase">
              {t('harness.history.title')}
            </p>
            <div className="flex flex-col gap-0.5">
              {history.records.slice(0, 5).map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className={`truncate rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${
                    history.activeHistoryId === record.id
                      ? 'bg-brand/15 text-brand'
                      : 'text-muted hover:bg-brand/10 hover:text-brand'
                  }`}
                  title={record.query}
                  onClick={() => handleOpenHistory(record)}
                >
                  {record.query}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!session.isLive ? (
          <div className="mt-auto shrink-0 px-2 pt-3 text-xs font-medium text-muted">
            <p>{t('harness.nav.hostUnavailable')}</p>
            <button type="button" className="mt-2 rounded-lg bg-brand/10 px-2.5 py-1.5 font-bold text-brand hover:bg-brand/15" onClick={retryHost}>
              {t('harness.nav.retryHost')}
            </button>
          </div>
        ) : null}
        </div>
      </aside>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {overlay ? (
          <HarnessOverlayCaption />
        ) : (
          <>
        <HarnessMenuBar
          sidebarVisible={sidebarVisible}
          utilitySidebarVisible={utilitySidebarVisible}
          activeViewLabel={activeViewLabel}
          onToggleSidebar={() => {
            const next = !sidebarVisible
            setSidebarVisible(next)
            saveHarnessSidebarVisible(next)
          }}
          onToggleUtilitySidebar={() => {
            const next = !utilitySidebarVisible
            setUtilitySidebarVisible(next)
            saveHarnessUtilitySidebarVisible(next)
            if (next) {
              setUtilityManualWidth(false)
            }
          }}
        />
        <div className="flex shrink-0 gap-1 border-b border-zinc-950/10 px-4 py-2 lg:hidden dark:border-white/10">
          {renderNavButtons()}
        </div>
          </>
        )}

        {overlay && !session.isLive ? (
          <div className="shrink-0 px-4 pt-3 text-xs font-medium text-muted">
            <p>{t('harness.nav.hostUnavailable')}</p>
            <button type="button" className="mt-2 rounded-lg bg-brand/10 px-2.5 py-1.5 font-bold text-brand hover:bg-brand/15" onClick={retryHost}>
              {t('harness.nav.retryHost')}
            </button>
          </div>
        ) : null}

        {!overlay && view === 'tools' ? (
          <HarnessToolsPanel
            onStartAssistant={handleStartAssistant}
            selection={selection}
            canGenerate={configuredProviders.has(selection.provider)}
          />
        ) : !overlay && view === 'scheduled' ? (
          <HarnessScheduledPanel state={schedule} onContinue={handleContinueSchedule} />
        ) : !overlay && view === 'library' ? (
          <HarnessLibraryPanel
            models={allowlistedCatalogModels}
            selection={selection}
            configuredProviders={configuredProviders}
            onSelectionChange={(next) => {
              setSelection(next)
              saveElectronAiModelSelection(next, 'agent')
            }}
            connectors={connectors}
            onRefreshConnectors={refreshConnectors}
            onInstallConnector={session.installConnector}
            mcpServers={session.mcpServers}
            onMcpLogin={session.loginMcp}
            onMcpConfigurationChange={() => setRuntimeEpoch((value) => value + 1)}
          />
        ) : !overlay && view === 'history' ? (
          <HarnessHistoryPanel state={history} onOpen={handleOpenHistory} />
        ) : (
          <>
            {activeAssistant ? (
              <div className="shrink-0 px-5 pt-4">
                <div className="mx-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-brand-fg">
                    <ToolIcon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold tracking-wide text-muted uppercase">
                      {t('harness.tools.activeAssistant')}
                    </p>
                    <p className="truncate text-sm font-extrabold text-ink">{activeAssistant.name}</p>
                  </div>
                  {overlay ? null : (
                  <button
                    type="button"
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-brand transition hover:bg-brand/10"
                    onClick={() => setView('tools')}
                  >
                    {t('harness.tools.changeAssistant')}
                  </button>
                  )}
                </div>
              </div>
            ) : null}
            <HarnessTranscript items={session.items} turnStatus={session.turnStatus} />
            <div className="shrink-0 space-y-3 px-5 pt-2 pb-5">
              {session.approval ? (
                <HarnessApprovalBar request={session.approval} onDecide={session.respond} />
              ) : null}
              <HarnessComposer
                initialValue={composerDraft}
                isBusy={isBusy}
                models={allowlistedCatalogModels}
                selection={selection}
                configuredProviders={configuredProviders}
                onSelectionChange={(next) => {
                  setSelection(next)
                  saveElectronAiModelSelection(next, 'agent')
                }}
                approvalMode={approvalMode}
                onApprovalModeChange={(mode) => {
                  setApprovalMode(mode)
                  saveHarnessApprovalMode(mode)
                }}
                computerUseModels={computerUseModels}
                computerUseEnabled={activeComputerUseEnabled}
                webSearchEnabled={webSearchEnabled}
                computerUseTargets={computerUseTargets}
                computerUseTarget={computerUseTarget}
                onComputerUseEnabledChange={(enabled) => {
                  if (enabled) {
                    const next = resolveAvailableSelection(availableComputerUseModels, selection)
                    if (!next) return
                    setSelection(next)
                    saveElectronAiModelSelection(next, 'agent')
                  }
                  setComputerUseEnabled(enabled)
                  saveHarnessComputerUseEnabled(enabled)
                }}
                onWebSearchEnabledChange={(enabled) => {
                  setWebSearchEnabled(enabled)
                  saveHarnessWebSearchEnabled(enabled)
                }}
                onComputerUseTargetChange={(target) => {
                  setComputerUseTarget(target)
                  saveHarnessComputerUseTarget(target)
                }}
                onSubmit={handleSubmit}
                onDeliberate={handleDeliberate}
                onOpenLibrary={overlay ? () => undefined : () => setView('library')}
                onOpenCanvas={overlay ? () => undefined : () => openUtilityPage('canvas')}
                mcpServers={session.mcpServers}
                connectors={connectors}
                onMcpLogin={session.loginMcp}
                onInterrupt={session.interrupt}
                overlay={overlay}
              />
            </div>
          </>
        )}
      </div>
      {overlay ? null : (
      <HarnessUtilitySidebar
        visible={utilitySidebarVisible}
        width={utilityLayout.width}
        maxWidth={utilityLayout.maxWidth}
        cwd={workFolder}
        userId={userId}
        canvasEpoch={canvasEpoch}
        canvasRevision={canvasRevision}
        focusPage={utilityFocus}
        onWidthChange={(next) => {
          setUtilityManualWidth(true)
          setPreferredUtilityWidth(next)
        }}
        onWidthCommit={(next) => {
          setUtilityManualWidth(true)
          setPreferredUtilityWidth(next)
          saveHarnessUtilitySidebarWidth(next)
        }}
      />
      )}
    </div>
  )
}

/**
 * Harness feature page shell; waits for the workflow host probe.
 * @param props - Signed-in user id and optional compact overlay mode.
 * @returns Harness page element.
 */
export function HarnessPage({ userId, overlay = false }: HarnessPageProps) {
  const host = useHarnessHost(userId ?? null)

  if (!host.isReady) {
    return (
      <div className="harness-page h-full max-h-full">
        <StatusLoading />
      </div>
    )
  }

  return (
    <HarnessWorkspace
      userId={userId ?? null}
      apiKey={host.apiKey}
      hostAvailable={host.hostAvailable}
      developerInstructions={host.developerInstructions}
      accessToken={host.accessToken}
      apiBaseUrl={host.apiBaseUrl}
      cwd={host.cwd}
      retryHost={host.retry}
      overlay={overlay}
    />
  )
}
