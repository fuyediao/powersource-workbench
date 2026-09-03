/**
 * Ask AI companion chat: Ask-mode completions with an automatic page screenshot.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import {
  ELECTRON_FALLBACK_MODELS,
  loadElectronAiModelSelection,
  providerKeyAliases,
  resolveElectronAiSelection,
  saveElectronAiModelSelection,
  runSendMessage,
  type AiCatalogModel,
  type ChatModelId,
  type ChatModeType,
} from '@/chat'
import { AiCombinedModelPicker } from '@/components/chat/ai-combined-model-picker'
import { ChatMarkdown } from '@/components/chat/chat-markdown'
import { useAiKeys } from '@/hooks/use-ai-keys'
import { useClawdBridgeReporter } from '@/hooks/use-clawd-bridge'
import { useLoadingTimer } from '@/hooks/use-loading-timer'
import {
  AiIcon,
  AuraMarkdownIcon,
  ChevronDownIcon,
  CloseIcon,
  CpuIcon,
  PlusIcon,
  SendIcon,
  StopIcon,
  ZapIcon,
} from '@/icons/AllIcons'
import { listAiModels } from '@/services/ai-api'
import type { ChatMessage } from '@/types/chat'
import { loadAskAiMode, saveAskAiMode } from '@/utils/chat/ask-ai-mode'
import { useAiModelAllowlist } from '@/hooks/use-ai-model-allowlist'
import { filterEnabledAiModels } from '@/utils/settings/ai-model-allowlist'
import { exportMarkdownToAura } from '@/utils/aura/aura-document-request'
import { resolveUserDisplayName } from '@/utils/shared/user-profile'

const PANEL_MENU =
  'absolute z-50 mb-2 origin-bottom overflow-hidden rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl animate-dropdown-in-up dark:border-white/10 dark:bg-zinc-900'

const ASK_MODES: { id: 'quick' | 'think'; labelKey: string; Icon: typeof ZapIcon }[] = [
  { id: 'quick', labelKey: 'askAi.modeQuick', Icon: ZapIcon },
  { id: 'think', labelKey: 'askAi.modeThink', Icon: CpuIcon },
]

const SUGGESTION_KEYS = ['askAi.suggestionFeatures', 'askAi.suggestionQuestions', 'askAi.suggestionThink'] as const

interface AskAiPanelProps {
  user: User
  pageLabel: string
  getExcludeRightPx: () => number
}

/**
 * Compact Ask chat (screenshot of the left window on each send).
 *
 * @param props - Signed-in user, current tab label, sidebar width for capture crop
 * @returns Panel body
 */
export function AskAiPanel({ user, pageLabel, getExcludeRightPx }: AskAiPanelProps) {
  const { t } = useTranslation()
  const { keys: aiKeys } = useAiKeys(user.id)
  const { overrides: modelOverrides } = useAiModelAllowlist()
  const [rawCatalogModels, setRawCatalogModels] = useState<AiCatalogModel[]>(ELECTRON_FALLBACK_MODELS)
  const catalogModels = useMemo(
    () => filterEnabledAiModels(rawCatalogModels, modelOverrides),
    [rawCatalogModels, modelOverrides],
  )
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sharing, setSharing] = useState(true)
  const [sendError, setSendError] = useState<string | null>(null)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showModeDropdown, setShowModeDropdown] = useState(false)
  const [model, setModel] = useState<ChatModelId>(
    () => loadElectronAiModelSelection('ask')?.provider ?? 'gemini',
  )
  const [modelId, setModelId] = useState(
    () => loadElectronAiModelSelection('ask')?.modelId ?? 'gemini-3.1-pro-preview',
  )
  const [mode, setMode] = useState<ChatModeType>(() => loadAskAiMode())
  useClawdBridgeReporter({
    sessionId: 'ask-ai',
    loading: isLoading,
    thinkMode: mode === 'think',
    error: Boolean(sendError),
  })
  const loadingSeconds = useLoadingTimer(isLoading)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)

  const displayName = resolveUserDisplayName(user, user.email ?? '')
  const givenName = displayName.trim().split(/\s+/)[0] || t('askAi.guest')
  const sharingLabel = pageLabel.trim() || t('askAi.sharingThisWindow')

  const apiKeys = useMemo(
    () => ({
      gemini: aiKeys.gemini ?? '',
      openai: aiKeys.openai ?? '',
      anthropic: aiKeys.anthropic ?? '',
      grok: aiKeys.grok ?? '',
    }),
    [aiKeys],
  )

  const hasApiKey = useCallback(
    (m: ChatModelId): boolean => providerKeyAliases(m).some((id) => Boolean((aiKeys[id] ?? '').trim())),
    [aiKeys],
  )

  useEffect(() => {
    let cancelled = false
    listAiModels('electron')
      .then((rows) => {
        const mapped: AiCatalogModel[] = rows
          .filter((r) => typeof r.provider === 'string' && r.provider.trim() && r.id.trim())
          .map((r) => ({
            id: r.id,
            provider: r.provider,
            labelEn: r.labelEn,
            default: r.default,
          }))
        if (!cancelled && mapped.length > 0) {
          setRawCatalogModels(mapped)
        }
      })
      .catch(() => {
        // Keep the fallback catalog.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const next = resolveElectronAiSelection(catalogModels, loadElectronAiModelSelection('ask'))
    setModel(next.provider)
    setModelId(next.modelId)
  }, [catalogModels])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (modeRef.current?.contains(target)) {
        return
      }
      setShowModelPicker(false)
      setShowModeDropdown(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  const currentModeEntry = ASK_MODES.find((entry) => entry.id === mode) ?? ASK_MODES[0]
  const ModeIcon = currentModeEntry.Icon

  /**
   * Persists the Ask catalog selection (shared with the Chat Ask pane).
   * @param nextProvider - Provider slug
   * @param nextModelId - Vendor model id
   * @returns Nothing
   */
  function applyModel(nextProvider: ChatModelId, nextModelId: string): void {
    setModel(nextProvider)
    setModelId(nextModelId)
    saveElectronAiModelSelection({ provider: nextProvider, modelId: nextModelId }, 'ask')
    setShowModelPicker(false)
    setShowModeDropdown(false)
  }

  /**
   * Switches Ask quick vs think (same system prompt as Chat Ask).
   * @param next - Mode id
   * @returns Nothing
   */
  function applyMode(next: 'quick' | 'think'): void {
    setMode(next)
    saveAskAiMode(next)
    setShowModeDropdown(false)
  }

  /**
   * Sends an Ask turn, capturing the left window when sharing is on.
   * @param rawText - Prompt from the composer or a suggestion chip
   * @returns Nothing
   */
  const send = useCallback(
    async (rawText: string): Promise<void> => {
      const text = rawText.trim()
      if (!text || isLoading) return
      if (!hasApiKey(model)) {
        setInputText(text)
        setSendError(t('askAi.needApiKey'))
        return
      }

      let image: { mimeType: string; data: string } | undefined
      let screenshotDataUrl: string | undefined
      let captureWarning: string | null = null
      if (sharing) {
        try {
          const shot = await window.workbench?.askAi?.captureMainContent(getExcludeRightPx())
          if (shot?.data) {
            image = { mimeType: shot.mimeType, data: shot.data }
            screenshotDataUrl = `data:${shot.mimeType};base64,${shot.data}`
          } else {
            captureWarning = t('askAi.captureFailed')
          }
        } catch {
          captureWarning = t('askAi.captureFailed')
        }
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        screenshotDataUrl,
      }
      const requestHistory = [...messages, userMsg]
      setMessages(requestHistory)
      setInputText('')
      setSendError(captureWarning)
      setIsLoading(true)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const result = await runSendMessage({
          model,
          modelId,
          prompt: text,
          historyMessages: requestHistory,
          mode,
          apiKeys,
          image,
          signal: controller.signal,
        })
        if (controller.signal.aborted) {
          return
        }
        setMessages((prev) => [...prev, result.message])
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        setSendError(err instanceof Error ? err.message : t('askAi.errorGeneral'))
      } finally {
        setIsLoading(false)
        abortRef.current = null
      }
    },
    [apiKeys, getExcludeRightPx, hasApiKey, isLoading, messages, mode, model, modelId, sharing, t],
  )

  /**
   * Submits the composer on Enter (Shift+Enter inserts a newline).
   * IME candidate confirmation (CJK Enter / keyCode 229) does not send.
   * @param event - Keyboard event
   * @returns Nothing
   */
  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (composingRef.current || event.nativeEvent.isComposing || event.keyCode === 229) {
      return
    }
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void send(inputText)
  }

  /**
   * Aborts the in-flight Ask request.
   * @returns Nothing
   */
  function handleStop(): void {
    abortRef.current?.abort()
    setIsLoading(false)
  }

  /**
   * Clears the companion thread (does not touch Chat page history).
   * @returns Nothing
   */
  function handleNewChat(): void {
    abortRef.current?.abort()
    setMessages([])
    setInputText('')
    setSendError(null)
    setIsLoading(false)
  }

  const empty = messages.length === 0 && !isLoading

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-end px-3 pt-2">
        <button
          type="button"
          className="rounded-lg p-1.5 text-muted transition hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10"
          aria-label={t('askAi.newChat')}
          title={t('askAi.newChat')}
          onClick={handleNewChat}
        >
          <PlusIcon className="size-4" aria-hidden />
        </button>
      </div>

      {empty ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
          <AiIcon className="size-12 text-brand" />
          <div className="flex flex-col items-center text-center">
            <p className="text-lg font-semibold tracking-tight text-ink">{givenName}</p>
            <p className="text-lg font-semibold tracking-tight text-ink">{t('askAi.greetingTagline')}</p>
          </div>
          <div className="flex w-full flex-col gap-2">
            {SUGGESTION_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className="rounded-full border border-zinc-950/10 bg-white/60 px-3 py-2 text-sm text-ink transition hover:border-brand/40 hover:bg-brand/5 dark:border-white/10 dark:bg-white/5"
                onClick={() => void send(t(key))}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <div className="flex flex-col gap-4">
            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex flex-col items-end gap-1.5">
                  {msg.screenshotDataUrl ? (
                    <img
                      src={msg.screenshotDataUrl}
                      alt=""
                      className="max-h-28 max-w-[85%] rounded-xl border border-zinc-950/10 object-cover shadow-sm dark:border-white/10"
                    />
                  ) : null}
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-zinc-800 px-3 py-2 text-sm leading-relaxed text-zinc-100">
                    <p className="whitespace-pre-wrap wrap-break-word">{msg.content}</p>
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex flex-col gap-1">
                  <div className="max-w-[95%] rounded-2xl rounded-tl-sm border border-zinc-950/10 bg-white/90 px-3 py-2 shadow-sm dark:border-white/10 dark:bg-zinc-800/90">
                    <ChatMarkdown
                      className="chat-markdown text-[13px] leading-relaxed text-ink"
                      content={msg.content}
                      toolbar={{
                        copy: t('askAi.codeCopy'),
                        download: t('askAi.codeDownload'),
                        plain: t('askAi.codePlain'),
                      }}
                    />
                  </div>
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      onClick={() => exportMarkdownToAura(msg.content)}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10"
                      title={t('askAi.exportToAura')}
                    >
                      <AuraMarkdownIcon className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ),
            )}
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-brand">
                <ModeIcon className="size-3.5" aria-hidden />
                <span className="font-mono">
                  {t('askAi.loading')} {loadingSeconds.toFixed(1)}s
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="shrink-0 px-3 pb-3 pt-1">
        {sendError ? (
          <p className="mb-1.5 px-1 text-xs text-red-500" role="alert">
            {sendError}
          </p>
        ) : null}
        <div className="rounded-2xl border border-brand/40 bg-white/70 p-2 shadow-[0_0_20px_-8px_color-mix(in_srgb,var(--brand)_35%,transparent)] dark:bg-zinc-950/50">
          {sharing ? (
            <div className="mb-1.5 flex items-center gap-1.5 rounded-xl bg-zinc-950/5 px-2 py-1 text-[11px] text-muted dark:bg-white/5">
              <ZapIcon className="size-3 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {t('askAi.sharing').replace('{page}', sharingLabel)}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-muted transition hover:bg-zinc-950/10 hover:text-ink dark:hover:bg-white/10"
                aria-label={t('askAi.stopSharing')}
                onClick={() => setSharing(false)}
              >
                <CloseIcon className="size-3" aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="mb-1.5 rounded-xl px-2 py-1 text-left text-[11px] font-medium text-brand transition hover:bg-brand/10"
              onClick={() => setSharing(true)}
            >
              {t('askAi.startSharing')}
            </button>
          )}
          <textarea
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={() => {
              window.setTimeout(() => {
                composingRef.current = false
              }, 0)
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder={t('askAi.placeholder')}
            rows={2}
            disabled={isLoading}
            className="max-h-28 w-full resize-none border-0 bg-transparent px-2 py-1 text-sm leading-5 text-ink placeholder:text-muted focus:ring-0 focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-1">
            <div className="relative shrink-0" ref={modeRef}>
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-brand transition hover:bg-brand/10"
                aria-expanded={showModeDropdown}
                aria-label={t(currentModeEntry.labelKey)}
                onClick={(event) => {
                  event.stopPropagation()
                  setShowModeDropdown((open) => !open)
                  setShowModelPicker(false)
                }}
              >
                <ModeIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{t(currentModeEntry.labelKey)}</span>
                <ChevronDownIcon className="size-3 shrink-0" aria-hidden />
              </button>
              {showModeDropdown ? (
                <ul className={`${PANEL_MENU} bottom-full left-0 w-36`}>
                  {ASK_MODES.map(({ id, labelKey, Icon }) => (
                    <li key={id}>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold ${
                          mode === id ? 'bg-brand/15 text-brand' : 'text-brand hover:bg-brand/10'
                        }`}
                        onClick={() => applyMode(id)}
                      >
                        <Icon className="size-3.5 shrink-0" aria-hidden />
                        <span>{t(labelKey)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <AiCombinedModelPicker
              models={catalogModels}
              provider={model}
              modelId={modelId}
              isConfigured={hasApiKey}
              density="compact"
              menuAlign="left"
              open={showModelPicker}
              onOpenChange={(next) => {
                setShowModelPicker(next)
                if (next) setShowModeDropdown(false)
              }}
              onSelect={applyModel}
            />
            {isLoading ? (
              <button
                type="button"
                className="ml-auto rounded-full bg-brand p-1.5 text-brand-fg"
                aria-label={t('askAi.stopAnswering')}
                onClick={handleStop}
              >
                <StopIcon className="size-3.5" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                className="ml-auto rounded-full bg-brand p-1.5 text-brand-fg disabled:opacity-40"
                aria-label={t('askAi.send')}
                disabled={!inputText.trim()}
                onClick={() => void send(inputText)}
              >
                <SendIcon className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
