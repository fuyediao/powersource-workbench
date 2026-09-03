/**
 * Harness task composer with AI-style provider/model controls and send/stop actions.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CanvasIcon,
  BrainIcon,
  CloseIcon,
  CpuIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  ImageIcon,
  LucideTargetIcon,
  MinusIcon,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  ShieldIcon,
  SparklesIcon,
  StopIcon,
} from '@/icons/AllIcons'
import { OPENAI_CONNECTORS } from '@/components/harness/harness-mcp-panel'
import { HarnessMentionMenu } from '@/components/harness/harness-mention-menu'
import { HarnessReasoningSlider } from '@/components/harness/harness-reasoning-slider'
import { AiCombinedModelPicker } from '@/components/chat/ai-combined-model-picker'
import { CrmFilterSelect } from '@/components/common/crm-filter-select'
import {
  providerDisplayName,
  type AiCatalogModel,
  type ElectronAiModelSelection,
} from '@/chat/ai-model-catalog'
import type {
  HarnessComposerAttachment,
  HarnessAppConnector,
  HarnessComputerTarget,
  HarnessDeliberationConfig,
  HarnessDeliberationModel,
  HarnessMcpServerStatus,
  HarnessStartTurnExtras,
} from '@/types/harness'
import {
  HARNESS_APPROVAL_MODES,
  isHarnessApprovalMode,
  loadHarnessMcpServers,
  type HarnessApprovalMode,
} from '@/utils/settings/harness-prefs'
import {
  isHarnessAttachmentImageName,
  isHarnessAttachmentOfficeName,
} from '@/utils/harness/harness-attachments'
import {
  useComposerAttachmentDrop,
  type ComposerDropItem,
} from '@/utils/harness/composer-drop'
import {
  buildMentionCatalog,
  filterMentionOptions,
  insertMentionToken,
  mentionQueryAt,
  mentionsInText,
  type ComposerMentionOption,
  type ComposerMentionQuery,
} from '@/utils/harness/composer-mentions'
import {
  isHarnessReasoningEffort,
  loadHarnessReasoningEffort,
  resolveHarnessReasoningEffort,
  saveHarnessReasoningEffort,
  showHarnessReasoningPicker,
  type HarnessReasoningEffort,
} from '@/utils/harness/reasoning-effort'

interface ComposerAttachment extends HarnessComposerAttachment {
  previewUrl?: string
}

interface DeliberationSeat {
  id: string
  provider: string
  modelId: string
  effort: string
}

/**
 * Builds a stable catalog key for one provider/model pair.
 * @param model - Catalog model identity.
 * @returns Composite model key.
 */
function deliberationModelKey(model: Pick<AiCatalogModel, 'provider' | 'id'>): string {
  return `${model.provider}:${model.id}`
}

/**
 * Creates an editable council seat from one catalog model.
 * @param model - Initial model for the seat.
 * @returns New council seat.
 */
function createDeliberationSeat(model: AiCatalogModel): DeliberationSeat {
  return {
    id: crypto.randomUUID(),
    provider: model.provider,
    modelId: model.id,
    effort: model.defaultReasoningEffort ?? '',
  }
}

/**
 * Builds a file:// URL for a local image thumbnail.
 * @param filePath - Absolute path.
 * @returns Encoded file URL.
 */
function localFileUrl(filePath: string): string {
  const unix = filePath.replace(/\\/g, '/')
  if (/^[A-Za-z]:/.test(unix)) return encodeURI(`file:///${unix}`)
  return encodeURI(`file://${unix.startsWith('/') ? unix : `/${unix}`}`)
}

/**
 * Releases a blob thumbnail when an attachment is removed.
 * @param item - Composer attachment.
 * @returns Nothing.
 */
function revokePreview(item: ComposerAttachment): void {
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
}

interface ComposerModeChipProps {
  /** Leading icon for the enabled mode. */
  icon: typeof CanvasIcon
  /** Visible chip label. */
  label: string
  /** Accessible name for the close control. */
  closeLabel: string
  /** Optional test id for the chip. */
  testId?: string
  /** Turns the mode off. */
  onClose: () => void
}

/**
 * Renders an enabled composer mode chip with an on-chip close control.
 * @param props - Chip label, icon, and close handler.
 * @returns Chip element.
 */
function ComposerModeChip({ icon: Icon, label, closeLabel, testId, onClose }: ComposerModeChipProps) {
  return (
    <div
      data-testid={testId}
      className="flex items-center rounded-lg bg-brand/10 py-0.5 pl-2 pr-0.5 text-[11px] font-semibold text-brand"
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="px-1">{label}</span>
      <button
        type="button"
        className="grid size-5 shrink-0 place-items-center rounded-md text-brand transition hover:bg-brand/20"
        title={closeLabel}
        aria-label={closeLabel}
        onClick={onClose}
      >
        <CloseIcon className="size-3" aria-hidden />
      </button>
    </div>
  )
}

interface HarnessComposerProps {
  /** Initial task draft supplied by a capability workflow. */
  initialValue?: string
  /** Disables sending while a turn is in flight. */
  isBusy: boolean
  /** Models available from the shared backend catalog. */
  models: AiCatalogModel[]
  /** Model used when the next thread starts. */
  selection: ElectronAiModelSelection
  /** Providers with a configured API credential. */
  configuredProviders: ReadonlySet<string>
  /** Updates the model for the next thread. */
  onSelectionChange: (selection: ElectronAiModelSelection) => void
  /** Approval profile used by the next workflow thread. */
  approvalMode: HarnessApprovalMode
  /** Updates the approval profile for the next workflow thread. */
  onApprovalModeChange: (mode: HarnessApprovalMode) => void
  /** Vision-capable models available for local desktop control. */
  computerUseModels: AiCatalogModel[]
  /** Whether visual desktop control is available to the next thread. */
  computerUseEnabled: boolean
  /** Whether first-party web search is available to the next thread. */
  webSearchEnabled: boolean
  /** Displays and native windows available for visual control. */
  computerUseTargets: HarnessComputerTarget[]
  /** Selected visual-control target, or null for the primary display. */
  computerUseTarget: HarnessComputerTarget | null
  /** Updates the visual-control target. */
  onComputerUseTargetChange: (target: HarnessComputerTarget | null) => void
  /** Enables or disables visual desktop control. */
  onComputerUseEnabledChange: (enabled: boolean) => void
  /** Enables or disables first-party web search. */
  onWebSearchEnabledChange: (enabled: boolean) => void
  /** Submits the task text. */
  onSubmit: (text: string, extras?: HarnessStartTurnExtras) => void
  /** Runs a configured multi-model deliberation. */
  onDeliberate: (text: string, config: HarnessDeliberationConfig) => void
  /** Opens the Library plugin and MCP settings. */
  onOpenLibrary: () => void
  /** Opens the Canvas page in the right utility workspace. */
  onOpenCanvas: () => void
  /** Runtime status for configured MCP servers. */
  mcpServers: HarnessMcpServerStatus[]
  /** Hosted connectors and their actual runtime availability. */
  connectors: HarnessAppConnector[]
  /** Starts OAuth for one configured MCP server. */
  onMcpLogin: (name: string) => void
  /** Cancels the running turn. */
  onInterrupt: () => void
  /**
   * Compact Ask Agent overlay. Hides the approval picker and any action that
   * opens Harness sidebars (Canvas / Library); those stay on the main page.
   */
  overlay?: boolean
}

/** Maximum composer height before it scrolls. */
const MAX_ROWS_PX = 180

/** Ghost trigger styles for the in-composer approval and Computer Use chips. */
const COMPOSER_SELECT_TRIGGER =
  'h-7 w-auto max-w-[13rem] gap-1 rounded-lg border-0 bg-transparent px-1.5 text-[11px] font-semibold shadow-none ring-0 hover:border-transparent hover:bg-zinc-950/5 focus-visible:border-transparent dark:border-transparent dark:bg-transparent dark:hover:bg-white/10'

/**
 * Returns the final path segment for a compact attachment label.
 * @param value - Absolute local path.
 * @returns File or folder name.
 */
function pathLabel(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value
}

/**
 * Combined vendor + model picker for Harness (composer and library).
 * @param props - Catalog selection, optional exclusive open state, and disabled state.
 * @returns Single combined model control.
 */
export function HarnessModelPicker({
  models,
  selection,
  configuredProviders,
  disabled,
  open: openProp,
  onOpenChange,
  onChange,
}: {
  models: AiCatalogModel[]
  selection: ElectronAiModelSelection
  configuredProviders: ReadonlySet<string>
  disabled: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onChange: (selection: ElectronAiModelSelection) => void
}) {
  const { t } = useTranslation()
  return (
    <AiCombinedModelPicker
      models={models}
      provider={selection.provider}
      modelId={selection.modelId}
      isConfigured={(provider) => configuredProviders.has(provider)}
      disabled={disabled}
      density="compact"
      menuAlign="right"
      open={openProp}
      onOpenChange={onOpenChange}
      aria-label={t('harness.composer.model')}
      onSelect={(provider, modelId) => onChange({ provider, modelId })}
    />
  )
}

/**
 * Task input for the Harness workflow.
 * @param props - Busy state and submit / interrupt handlers.
 * @returns Composer element.
 */
export function HarnessComposer({
  initialValue = '',
  isBusy,
  models,
  selection,
  configuredProviders,
  onSelectionChange,
  approvalMode,
  onApprovalModeChange,
  computerUseModels,
  computerUseEnabled,
  webSearchEnabled,
  computerUseTargets,
  computerUseTarget,
  onComputerUseTargetChange,
  onComputerUseEnabledChange,
  onWebSearchEnabledChange,
  onSubmit,
  onDeliberate,
  onOpenLibrary,
  onOpenCanvas,
  mcpServers,
  connectors,
  onMcpLogin,
  onInterrupt,
  overlay = false,
}: HarnessComposerProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(initialValue)
  const [openMenu, setOpenMenu] = useState<'add' | 'reasoning' | 'model' | null>(null)
  const [goalEditorOpen, setGoalEditorOpen] = useState(false)
  const [goal, setGoal] = useState('')
  const [planMode, setPlanMode] = useState(false)
  const [canvasMode, setCanvasMode] = useState(false)
  const [deliberationEnabled, setDeliberationEnabled] = useState(false)
  const [deliberationSeats, setDeliberationSeats] = useState<DeliberationSeat[]>([])
  const pickerModels = computerUseEnabled ? computerUseModels : models
  const selectedModel = useMemo(
    () => pickerModels.find((model) => model.provider === selection.provider && model.id === selection.modelId),
    [pickerModels, selection.modelId, selection.provider],
  )
  const reasoningLevels = (selectedModel?.reasoningEfforts ?? []).filter(isHarnessReasoningEffort)
  const showReasoning = showHarnessReasoningPicker(selectedModel)
  const configuredDeliberationModels = useMemo(
    () => models.filter((model) => configuredProviders.has(model.provider)),
    [configuredProviders, models],
  )
  const selectedDeliberationModels = useMemo((): HarnessDeliberationModel[] =>
    deliberationSeats.flatMap((seat) => {
      const model = configuredDeliberationModels.find((candidate) =>
        candidate.provider === seat.provider && candidate.id === seat.modelId)
      if (!model) return []
      return [{
        provider: model.provider,
        modelId: model.id,
        label: `${providerDisplayName(model.provider)} · ${model.labelEn}`,
        effort: seat.effort || null,
      }]
    }), [configuredDeliberationModels, deliberationSeats])
  const selectedDeliberationKeys = useMemo(
    () => new Set(deliberationSeats.map((seat) => deliberationModelKey({ provider: seat.provider, id: seat.modelId }))),
    [deliberationSeats],
  )
  const nextDeliberationModel = configuredDeliberationModels.find(
    (model) => !selectedDeliberationKeys.has(deliberationModelKey(model)),
  )
  const [effort, setEffort] = useState<HarnessReasoningEffort | ''>(() =>
    resolveHarnessReasoningEffort(
      selectedModel,
      loadHarnessReasoningEffort(selection.provider, selection.modelId),
    ),
  )
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [dropError, setDropError] = useState('')
  const configuredPlugins = useMemo(() => loadHarnessMcpServers(), [])
  const mentionCatalog = useMemo(
    () => buildMentionCatalog(configuredPlugins, mcpServers, connectors, OPENAI_CONNECTORS),
    [configuredPlugins, connectors, mcpServers],
  )
  const [mentionQuery, setMentionQuery] = useState<ComposerMentionQuery | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionItems = useMemo(
    () => (mentionQuery ? filterMentionOptions(mentionCatalog, mentionQuery.query) : []),
    [mentionCatalog, mentionQuery],
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)

  /**
   * Opens or closes the reasoning slider without leaving another composer menu open.
   * @param next - Whether the slider should be visible
   * @returns Nothing
   */
  const setReasoningOpen = useCallback((next: boolean): void => {
    setOpenMenu(next ? 'reasoning' : null)
  }, [])

  /**
   * Opens or closes the model picker without leaving another composer menu open.
   * @param next - Whether the picker should be visible
   * @returns Nothing
   */
  const setPickerOpen = useCallback((next: boolean): void => {
    setOpenMenu(next ? 'model' : null)
  }, [])

  useEffect(() => {
    setEffort(
      resolveHarnessReasoningEffort(
        selectedModel,
        loadHarnessReasoningEffort(selection.provider, selection.modelId),
      ),
    )
  }, [selectedModel, selection.modelId, selection.provider])

  useEffect(() => {
    const close = (event: MouseEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-crm-filter-select-panel]')) {
        return
      }
      if (!menuRef.current?.contains(target as Node)) {
        setOpenMenu((current) => (current === 'add' ? null : current))
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  /**
   * Grows the textarea with its content up to a fixed cap.
   * @returns Nothing.
   */
  const resize = useCallback((): void => {
    const node = textareaRef.current
    if (!node) {
      return
    }
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, MAX_ROWS_PX)}px`
  }, [])

  /**
   * Sends the current task text.
   * @returns Nothing.
   */
  const send = useCallback((): void => {
    const trimmed = value.trim()
    if (
      (!trimmed && attachments.length === 0 && !goal.trim()) ||
      isBusy ||
      !configuredProviders.has(selection.provider) ||
      (deliberationEnabled && selectedDeliberationModels.length < 2)
    ) {
      return
    }
    const taskText =
      trimmed ||
      (attachments.length > 0
        ? 'Review the attached files and folders.'
        : 'Work toward the configured goal.')
    const extras: HarnessStartTurnExtras = {
      attachments: attachments.map(({ path, kind }) => ({ path, kind })),
      mentions: mentionsInText(taskText, mentionCatalog),
      goal: goal.trim() || null,
      planMode,
      canvasMode,
      ...(effort ? { effort } : {}),
    }
    if (deliberationEnabled) {
      if (selectedModel) {
        onDeliberate(taskText, {
          participants: selectedDeliberationModels,
          finalizer: {
            provider: selectedModel.provider,
            modelId: selectedModel.id,
            label: `${providerDisplayName(selectedModel.provider)} · ${selectedModel.labelEn}`,
            effort: effort || null,
          },
        })
      } else {
        onSubmit(taskText, extras)
      }
    } else {
      onSubmit(taskText, extras)
    }
    if (canvasMode && !overlay) onOpenCanvas()
    setValue('')
    setMentionQuery(null)
    attachments.forEach(revokePreview)
    setAttachments([])
    setDropError('')
    const node = textareaRef.current
    if (node) {
      node.style.height = 'auto'
    }
  }, [attachments, canvasMode, configuredProviders, deliberationEnabled, effort, goal, isBusy, mentionCatalog, onDeliberate, onOpenCanvas, onSubmit, overlay, planMode, selectedDeliberationModels, selectedModel, selection.provider, value])

  /**
   * Adds selected files without duplicate paths.
   * @returns Nothing.
   */
  const addFiles = useCallback(async (): Promise<void> => {
    const paths = (await window.geocrm?.harness?.pickFiles()) ?? []
    setDropError('')
    setAttachments((current) => {
      const known = new Set(current.map((item) => item.path))
      return [
        ...current,
        ...paths.filter((item) => !known.has(item)).map((item) => ({ path: item, kind: 'file' as const })),
      ]
    })
    setOpenMenu(null)
  }, [])

  /**
   * Adds one selected folder without duplicate paths.
   * @returns Nothing.
   */
  const addFolder = useCallback(async (): Promise<void> => {
    const folder = await window.geocrm?.harness?.pickAttachmentFolder()
    if (folder) {
      setDropError('')
      setAttachments((current) =>
        current.some((item) => item.path === folder)
          ? current
          : [...current, { path: folder, kind: 'folder' }],
      )
    }
    setOpenMenu(null)
  }, [])

  /**
   * Appends dropped or picked attachments without duplicate paths.
   * @param incoming - New attachments to merge.
   * @returns Nothing.
   */
  const mergeAttachments = useCallback((incoming: ComposerDropItem[]): void => {
    setDropError('')
    setAttachments((current) => {
      const known = new Set(current.map((item) => item.path))
      const next: ComposerAttachment[] = []
      for (const item of incoming) {
        if (known.has(item.path)) {
          revokePreview(item)
          continue
        }
        known.add(item.path)
        next.push(item)
      }
      return [...current, ...next]
    })
  }, [])

  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  const isDragging = useComposerAttachmentDrop(
    !isBusy,
    mergeAttachments,
    () => setDropError(t('harness.composer.dropUnsupported')),
  )

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach(revokePreview)
    }
  }, [])

  /**
   * Syncs the `@` picker with the current caret.
   * @param nextValue - Composer text.
   * @param caret - Caret offset.
   * @returns Nothing.
   */
  function syncMentionQuery(nextValue: string, caret: number): void {
    const next = mentionQueryAt(nextValue, caret)
    setMentionQuery(next)
    if (!next) setMentionIndex(0)
  }

  /**
   * Inserts one plugin `@` token at the caret.
   * @param item - Selected picker row.
   * @returns Nothing.
   */
  function pickMention(item: ComposerMentionOption): void {
    const node = textareaRef.current
    const caret = node?.selectionStart ?? value.length
    const next = insertMentionToken(value, caret, item.name)
    setValue(next.text)
    setMentionQuery(null)
    setMentionIndex(0)
    requestAnimationFrame(() => {
      const field = textareaRef.current
      if (!field) return
      field.focus()
      field.setSelectionRange(next.caret, next.caret)
      field.style.height = 'auto'
      field.style.height = `${Math.min(field.scrollHeight, MAX_ROWS_PX)}px`
    })
  }

  /**
   * Sends on Enter and inserts a newline on Shift+Enter.
   * IME candidate confirmation (CJK Enter / keyCode 229) does not send.
   * @param event - Keyboard event from the textarea.
   * @returns Nothing.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }
    if (mentionQuery) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionIndex((index) => (mentionItems.length === 0 ? 0 : (index + 1) % mentionItems.length))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionIndex((index) =>
          mentionItems.length === 0
            ? 0
            : (index - 1 + mentionItems.length) % mentionItems.length,
        )
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionQuery(null)
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const selected = mentionItems[mentionIndex]
        if (selected) pickMention(selected)
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="relative rounded-3xl border border-zinc-950/10 bg-white/70 px-3 pt-3 pb-2 shadow-sm dark:border-white/10 dark:bg-zinc-950/50">
        {isDragging ? (
          <div
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-white/45 dark:bg-zinc-950/55"
            data-testid="harness-drop-to-attach"
            aria-live="polite"
          >
            <p className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10">
              {t('harness.composer.dropToAttach')}
            </p>
          </div>
        ) : null}
        {attachments.length > 0 || goal.trim() || planMode || canvasMode || computerUseEnabled || webSearchEnabled || deliberationEnabled ? (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {attachments.map((attachment) => {
              const isImage = isHarnessAttachmentImageName(attachment.path)
              const previewSrc = attachment.previewUrl ?? (isImage ? localFileUrl(attachment.path) : '')
              const AttachmentGlyph = attachment.kind === 'folder'
                ? FolderIcon
                : isImage
                  ? ImageIcon
                  : isHarnessAttachmentOfficeName(attachment.path)
                    ? FileTextIcon
                    : PaperclipIcon
              return (
                <button
                  key={attachment.path}
                  type="button"
                  title={attachment.path}
                  className="flex max-w-52 items-center gap-1.5 rounded-lg bg-zinc-950/5 py-1 pr-2 pl-1 text-[11px] font-semibold text-ink hover:bg-zinc-950/10 dark:bg-white/5 dark:hover:bg-white/10"
                  onClick={() =>
                    setAttachments((current) => {
                      const removed = current.find((item) => item.path === attachment.path)
                      if (removed) revokePreview(removed)
                      return current.filter((item) => item.path !== attachment.path)
                    })
                  }
                >
                  {previewSrc ? (
                    <img
                      src={previewSrc}
                      alt=""
                      className="size-8 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <AttachmentGlyph className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{pathLabel(attachment.path)}</span>
                  <span aria-hidden>×</span>
                </button>
              )
            })}
            {goal.trim() ? (
              <button
                type="button"
                className="flex max-w-56 items-center gap-1 rounded-lg bg-brand/10 px-2 py-1 text-[11px] font-semibold text-brand"
                title={goal}
                onClick={() => setGoalEditorOpen(true)}
              >
                <LucideTargetIcon className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{goal}</span>
              </button>
            ) : null}
            {planMode ? (
              <ComposerModeChip
                icon={SparklesIcon}
                label={t('harness.composer.menu.planMode')}
                closeLabel={t('harness.composer.chipOff', { name: t('harness.composer.menu.planMode') })}
                onClose={() => setPlanMode(false)}
              />
            ) : null}
            {canvasMode && !overlay ? (
              <ComposerModeChip
                icon={CanvasIcon}
                label={t('harness.composer.menu.canvas')}
                closeLabel={t('harness.composer.chipOff', { name: t('harness.composer.menu.canvas') })}
                onClose={() => setCanvasMode(false)}
              />
            ) : null}
            {computerUseEnabled ? (
              <>
                <ComposerModeChip
                  icon={CpuIcon}
                  label={t('harness.composer.computerUseModel')}
                  closeLabel={t('harness.composer.chipOff', {
                    name: t('harness.composer.computerUseModel'),
                  })}
                  testId="harness-computer-use-chip"
                  onClose={() => onComputerUseEnabledChange(false)}
                />
                <CrmFilterSelect
                  value={computerUseTarget?.id ?? ''}
                  options={[
                    { value: '', label: t('harness.composer.computerUsePrimaryDisplay') },
                    ...computerUseTargets.map((target) => ({
                      value: target.id,
                      label: `${target.kind === 'window' ? t('harness.composer.computerUseWindow') : t('harness.composer.computerUseDisplay')}: ${target.label}`,
                    })),
                  ]}
                  size="xs"
                  className="w-auto max-w-56 shrink-0"
                  triggerClassName={COMPOSER_SELECT_TRIGGER}
                  ariaLabel={t('harness.composer.computerUseTarget')}
                  menuPlacement="top"
                  menuMinWidth={320}
                  disabled={isBusy}
                  onChange={(value) =>
                    onComputerUseTargetChange(
                      computerUseTargets.find((target) => target.id === value) ?? null,
                    )
                  }
                />
              </>
            ) : null}
            {webSearchEnabled ? (
              <ComposerModeChip
                icon={GlobeIcon}
                label={t('harness.composer.menu.webSearch')}
                closeLabel={t('harness.composer.chipOff', { name: t('harness.composer.menu.webSearch') })}
                onClose={() => onWebSearchEnabledChange(false)}
              />
            ) : null}
            {deliberationEnabled ? (
              <ComposerModeChip
                icon={BrainIcon}
                label={t('harness.composer.menu.deliberationCount', { count: selectedDeliberationModels.length })}
                closeLabel={t('harness.composer.chipOff', { name: t('harness.composer.menu.deliberation') })}
                onClose={() => setDeliberationEnabled(false)}
              />
            ) : null}
          </div>
        ) : null}
        <div className="relative">
          {mentionQuery ? (
            <HarnessMentionMenu
              items={mentionItems}
              activeIndex={mentionItems.length === 0 ? 0 : mentionIndex % mentionItems.length}
              onActiveIndexChange={setMentionIndex}
              onPick={pickMention}
              onManage={() => {
                setMentionQuery(null)
                onOpenLibrary()
              }}
              onConnect={onMcpLogin}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            rows={1}
            name="harnessTask"
            value={value}
            placeholder={t('harness.composer.placeholder')}
            aria-label={t('harness.composer.placeholder')}
            className="max-h-[180px] min-h-12 w-full resize-none bg-transparent px-1 py-1.5 text-sm leading-5 text-ink outline-none placeholder:text-muted"
            onChange={(event) => {
              setValue(event.target.value)
              syncMentionQuery(event.target.value, event.target.selectionStart)
              resize()
            }}
            onClick={(event) => syncMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart)}
            onKeyUp={(event) => syncMentionQuery(event.currentTarget.value, event.currentTarget.selectionStart)}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={() => {
              window.setTimeout(() => {
                composingRef.current = false
              }, 0)
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-0.5">
          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              disabled={isBusy}
              data-testid="harness-composer-add"
              className="grid size-8 place-items-center rounded-full text-muted transition hover:bg-zinc-950/5 hover:text-ink disabled:opacity-40 dark:hover:bg-white/10"
              title={t('harness.composer.menu.add')}
              aria-label={t('harness.composer.menu.add')}
              onClick={(event) => {
                event.stopPropagation()
                setOpenMenu((current) => (current === 'add' ? null : 'add'))
              }}
            >
              <PlusIcon className="size-4" aria-hidden />
            </button>
            {openMenu === 'add' ? (
              <div className="absolute bottom-full left-0 z-50 mb-2 w-[440px] max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border border-zinc-950/10 bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-zinc-900">
                <p className="px-2 py-1 text-[11px] font-bold tracking-wide text-muted uppercase">
                  {t('harness.composer.menu.add')}
                </p>
                <button
                  type="button"
                  data-testid="harness-composer-upload-files"
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5"
                  onClick={() => void addFiles()}
                >
                  <PaperclipIcon className="size-4 shrink-0 text-muted" aria-hidden />
                  {t('harness.composer.menu.files')}
                </button>
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5" onClick={() => void addFolder()}>
                  <FolderIcon className="size-4 text-muted" aria-hidden />
                  {t('harness.composer.menu.folder')}
                </button>
                <button type="button" className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-ink hover:bg-zinc-950/5 dark:hover:bg-white/5" onClick={() => setGoalEditorOpen((open) => !open)}>
                  <LucideTargetIcon className="size-4 text-muted" aria-hidden />
                  <span className="flex-1">{t('harness.composer.menu.goal')}</span>
                  {goal.trim() ? <span className="size-2 rounded-full bg-emerald-500" aria-hidden /> : null}
                </button>
                {goalEditorOpen ? (
                  <div className="flex gap-2 px-2 pb-2">
                    <input
                      type="text"
                      name="harnessGoal"
                      value={goal}
                      className="min-w-0 flex-1 rounded-xl border border-zinc-950/10 bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-brand/50 dark:border-white/10"
                      placeholder={t('harness.composer.menu.goalPlaceholder')}
                      onChange={(event) => setGoal(event.target.value)}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  role="switch"
                  aria-checked={planMode}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold hover:bg-zinc-950/5 dark:hover:bg-white/5 ${planMode ? 'text-brand' : 'text-ink'}`}
                  onClick={() => setPlanMode((enabled) => !enabled)}
                >
                  <SparklesIcon className="size-4 text-muted" aria-hidden />
                  <span className="flex-1">{t('harness.composer.menu.planMode')}</span>
                  <span className={`h-4 w-7 rounded-full p-0.5 transition ${planMode ? 'bg-brand' : 'bg-zinc-400/50'}`} aria-hidden>
                    <span className={`block size-3 rounded-full bg-white transition ${planMode ? 'translate-x-3' : ''}`} />
                  </span>
                </button>
                {overlay ? null : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={canvasMode}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold hover:bg-zinc-950/5 dark:hover:bg-white/5 ${canvasMode ? 'text-brand' : 'text-ink'}`}
                  onClick={() => {
                    const next = !canvasMode
                    setCanvasMode(next)
                    if (next) {
                      setOpenMenu(null)
                      onOpenCanvas()
                    }
                  }}
                >
                  <CanvasIcon className="size-4 text-muted" aria-hidden />
                  <span className="flex-1">{t('harness.composer.menu.canvas')}</span>
                  <span className={`h-4 w-7 rounded-full p-0.5 transition ${canvasMode ? 'bg-brand' : 'bg-zinc-400/50'}`} aria-hidden>
                    <span className={`block size-3 rounded-full bg-white transition ${canvasMode ? 'translate-x-3' : ''}`} />
                  </span>
                </button>
                )}
                <button
                  type="button"
                  data-testid="harness-web-search-toggle"
                  role="switch"
                  aria-checked={webSearchEnabled}
                  disabled={isBusy}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold hover:bg-zinc-950/5 dark:hover:bg-white/5 disabled:opacity-40 ${webSearchEnabled ? 'text-brand' : 'text-ink'}`}
                  onClick={() => onWebSearchEnabledChange(!webSearchEnabled)}
                >
                  <GlobeIcon className="size-4 text-muted" aria-hidden />
                  <span className="flex-1">{t('harness.composer.menu.webSearch')}</span>
                  <span className={`h-4 w-7 rounded-full p-0.5 transition ${webSearchEnabled ? 'bg-brand' : 'bg-zinc-400/50'}`} aria-hidden>
                    <span className={`block size-3 rounded-full bg-white transition ${webSearchEnabled ? 'translate-x-3' : ''}`} />
                  </span>
                </button>
                <button
                  type="button"
                  data-testid="harness-deliberation-toggle"
                  role="switch"
                  aria-checked={deliberationEnabled}
                  disabled={isBusy || configuredDeliberationModels.length < 2}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold hover:bg-zinc-950/5 disabled:opacity-40 dark:hover:bg-white/5 ${deliberationEnabled ? 'text-brand' : 'text-ink'}`}
                  onClick={() => {
                    const next = !deliberationEnabled
                    setDeliberationEnabled(next)
                    if (next && selectedDeliberationModels.length < 2) {
                      const currentModel = configuredDeliberationModels.find((model) =>
                        model.provider === selection.provider && model.id === selection.modelId)
                      const defaults = [
                        ...(currentModel ? [currentModel] : []),
                        ...configuredDeliberationModels.filter((model) => model !== currentModel),
                      ].slice(0, 2)
                      setDeliberationSeats(defaults.map(createDeliberationSeat))
                    }
                  }}
                >
                  <BrainIcon className="size-4 text-muted" aria-hidden />
                  <span className="flex-1">{t('harness.composer.menu.deliberation')}</span>
                  <span className={`h-4 w-7 rounded-full p-0.5 transition ${deliberationEnabled ? 'bg-brand' : 'bg-zinc-400/50'}`} aria-hidden>
                    <span className={`block size-3 rounded-full bg-white transition ${deliberationEnabled ? 'translate-x-3' : ''}`} />
                  </span>
                </button>
                {deliberationEnabled ? (
                  <div data-testid="harness-deliberation-config" className="mx-1 mb-1 space-y-2 rounded-xl bg-zinc-950/4 p-2 dark:bg-white/5">
                    <p className="px-1 text-[10px] font-bold tracking-wide text-muted uppercase">
                      {t('harness.composer.deliberation.participants')}
                    </p>
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {deliberationSeats.map((seat, index) => {
                        const seatModel = configuredDeliberationModels.find((model) =>
                          model.provider === seat.provider && model.id === seat.modelId)
                        if (!seatModel) return null
                        const availableModels = configuredDeliberationModels.filter((model) => {
                          const key = deliberationModelKey(model)
                          return key === deliberationModelKey(seatModel) || !selectedDeliberationKeys.has(key)
                        })
                        return (
                          <div
                            key={seat.id}
                            data-testid="harness-deliberation-seat"
                            className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,0.8fr)_2rem] items-center gap-1.5 rounded-lg bg-white/70 px-2 py-1.5 dark:bg-zinc-900/60"
                          >
                            <CrmFilterSelect
                              value={deliberationModelKey(seatModel)}
                              options={availableModels.map((model) => ({
                                value: deliberationModelKey(model),
                                label: `${providerDisplayName(model.provider)} · ${model.labelEn}`,
                              }))}
                              size="xs"
                              menuPlacement="top"
                              menuMinWidth={230}
                              ariaLabel={t('harness.composer.deliberation.modelSeat', { index: index + 1 })}
                              onChange={(value) => {
                                const model = configuredDeliberationModels.find((candidate) =>
                                  deliberationModelKey(candidate) === value)
                                if (!model) return
                                setDeliberationSeats((current) => current.map((candidate) =>
                                  candidate.id === seat.id
                                    ? { ...createDeliberationSeat(model), id: candidate.id }
                                    : candidate))
                              }}
                            />
                            <CrmFilterSelect
                              value={seat.effort}
                              options={(seatModel.reasoningEfforts ?? []).length === 0
                                ? [{ value: '', label: t('harness.composer.deliberation.automatic') }]
                                : (seatModel.reasoningEfforts ?? []).map((level) => ({
                                  value: level,
                                  label: t(`harness.composer.reasoning.${level}`),
                                }))}
                              size="xs"
                              menuPlacement="top"
                              menuMinWidth={120}
                              disabled={(seatModel.reasoningEfforts ?? []).length === 0}
                              ariaLabel={t('harness.composer.deliberation.effortFor', {
                                provider: providerDisplayName(seatModel.provider),
                              })}
                              onChange={(value) => setDeliberationSeats((current) => current.map((candidate) =>
                                candidate.id === seat.id ? { ...candidate, effort: value } : candidate))}
                            />
                            <button
                              type="button"
                              data-testid="harness-deliberation-remove-model"
                              className="grid size-7 place-items-center rounded-full border border-zinc-950/10 text-muted transition hover:bg-zinc-950/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/10 dark:hover:bg-white/10"
                              title={t('harness.composer.deliberation.removeModel')}
                              aria-label={t('harness.composer.deliberation.removeModel')}
                              disabled={deliberationSeats.length <= 2}
                              onClick={(event) => {
                                event.stopPropagation()
                                setDeliberationSeats((current) =>
                                  current.filter((candidate) => candidate.id !== seat.id))
                              }}
                            >
                              <MinusIcon className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1">
                      <p className="text-[10px] leading-4 text-muted">{t('harness.composer.deliberation.minimumModels')}</p>
                      <button
                        type="button"
                        data-testid="harness-deliberation-add-model"
                        className="grid size-7 shrink-0 place-items-center rounded-full border border-zinc-950/15 text-ink transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/15"
                        title={t('harness.composer.deliberation.addModel')}
                        aria-label={t('harness.composer.deliberation.addModel')}
                        disabled={!nextDeliberationModel}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (nextDeliberationModel) {
                            setDeliberationSeats((current) => [...current, createDeliberationSeat(nextDeliberationModel)])
                          }
                        }}
                      >
                        <PlusIcon className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                ) : null}
                <button
                  type="button"
                  data-testid="harness-computer-use-toggle"
                  role="switch"
                  aria-checked={computerUseEnabled}
                  disabled={
                    isBusy ||
                    !computerUseModels.some((model) => configuredProviders.has(model.provider))
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold hover:bg-zinc-950/5 dark:hover:bg-white/5 disabled:opacity-40 ${computerUseEnabled ? 'text-brand' : 'text-ink'}`}
                  onClick={() => onComputerUseEnabledChange(!computerUseEnabled)}
                >
                  <CpuIcon className="size-4 text-muted" aria-hidden />
                  <span className="flex-1">{t('harness.composer.computerUseModel')}</span>
                  <span className={`h-4 w-7 rounded-full p-0.5 transition ${computerUseEnabled ? 'bg-brand' : 'bg-zinc-400/50'}`} aria-hidden>
                    <span className={`block size-3 rounded-full bg-white transition ${computerUseEnabled ? 'translate-x-3' : ''}`} />
                  </span>
                </button>
              </div>
            ) : null}
          </div>
          {overlay ? null : (
          <CrmFilterSelect
            value={approvalMode}
            options={HARNESS_APPROVAL_MODES.map((mode) => ({
              value: mode,
              label: t(`settings.harness.approval.${mode}`),
            }))}
            size="xs"
            className="w-auto shrink-0"
            triggerClassName={COMPOSER_SELECT_TRIGGER}
            ariaLabel={t('settings.harness.approval.title')}
            menuPlacement="top"
            disabled={isBusy}
            renderLeading={() => <ShieldIcon className="size-3.5 shrink-0" aria-hidden />}
            onChange={(value) => {
              if (isHarnessApprovalMode(value)) onApprovalModeChange(value)
            }}
          />
          )}
          <div className="ml-auto flex min-w-0 items-center gap-0.5">
            {showReasoning ? (
              <HarnessReasoningSlider
                levels={reasoningLevels}
                value={effort}
                disabled={isBusy}
                open={openMenu === 'reasoning'}
                onOpenChange={setReasoningOpen}
                onChange={(next) => {
                  if (!isHarnessReasoningEffort(next)) return
                  setEffort(next)
                  saveHarnessReasoningEffort(selection.provider, selection.modelId, next)
                }}
              />
            ) : null}
            <HarnessModelPicker
              models={computerUseEnabled ? computerUseModels : models}
              selection={selection}
              configuredProviders={configuredProviders}
              disabled={isBusy}
              open={openMenu === 'model'}
              onOpenChange={setPickerOpen}
              onChange={onSelectionChange}
            />
            {isBusy ? (
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-zinc-950/10 text-ink transition hover:bg-zinc-950/15 dark:bg-white/10 dark:hover:bg-white/15"
                title={t('harness.composer.stop')}
                aria-label={t('harness.composer.stop')}
                onClick={onInterrupt}
              >
                <StopIcon className="size-3.5" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-fg transition disabled:opacity-40"
                title={t('harness.composer.send')}
                aria-label={t('harness.composer.send')}
                disabled={
                  (!value.trim() && attachments.length === 0 && !goal.trim()) ||
                  !configuredProviders.has(selection.provider) ||
                  (deliberationEnabled && selectedDeliberationModels.length < 2)
                }
                onClick={send}
              >
                <SendIcon className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
      {dropError ? (
        <p className="mt-2 px-1 text-xs font-medium text-danger">{dropError}</p>
      ) : null}
    </div>
  )
}
