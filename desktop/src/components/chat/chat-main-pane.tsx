/**
 * Ask transcript + composer for Artificial Intelligence.
 * `kind` remains for history / session keys (Ask only until Harness is rebuilt).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { useAiKeys } from '@/hooks/use-ai-keys'
import { useChatHistory } from '@/hooks/use-chat-history'
import { useClawdBridgeReporter } from '@/hooks/use-clawd-bridge'
import { useLoadingTimer } from '@/hooks/use-loading-timer'
import { useLinkOpen } from '@/hooks/link-open-context'
import {
  runSendMessage,
  buildHistoryInput,
  groupAiModelsByProvider,
  loadElectronAiModelSelection,
  modelLabelKey,
  providerDisplayName,
  providerLabelKey,
  providerKeyAliases,
  resolveElectronAiSelection,
  saveElectronAiModelSelection,
  type AiCatalogModel,
  type ChatModelId,
  type ChatModeType,
} from '@/chat'
import {
  patchChatMenuHandlers,
  setChatMenuView,
  unregisterChatMenuHost,
} from '@/utils/chat/chat-menu'
import {
  cancelMicrophoneRecording,
  isMicrophoneCaptureSupported,
  startMicrophoneRecording,
  stopMicrophoneRecording,
  transcribeAudioWithGemini,
} from '@/services/speech-to-text'
import type { ChatAssistantKind, ChatMessage, ShopLocation } from '@/types/chat'
import { AiCombinedModelPicker } from '@/components/chat/ai-combined-model-picker'
import { ChatMarkdown } from '@/components/chat/chat-markdown'
import { loadChatKindSession, saveChatKindSession } from '@/utils/chat/assistant-kind'
import { readBrowserGeolocation } from '@/utils/chat/read-geolocation'
import { exportMarkdownToAura } from '@/utils/aura/aura-document-request'
import {
  subscribeAskAiSearch,
  takePendingAskAiSearchQuery,
} from '@/utils/ask-ai/ask-ai-search-request'
import { resolveUserAvatarUrl, resolveUserDisplayName } from '@/utils/shared/user-profile'
import {
  AuraMarkdownIcon,
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  CpuIcon,
  MapPinIcon,
  MessageSquareIcon,
  MicIcon,
  PlusIcon,
  PencilIcon,
  RefreshIcon,
  SendIcon,
  StopIcon,
  ZapIcon,
} from '@/icons/AllIcons'

/** Menu panel chrome aligned with Settings dropdowns (opens upward). */
const CHAT_MENU_PANEL =
  'absolute z-50 mb-2 origin-bottom overflow-hidden rounded-2xl border border-zinc-950/10 bg-white py-1 shadow-xl animate-dropdown-in-up dark:border-white/10 dark:bg-zinc-900'

/** Compact composer trigger aligned with Settings brand text controls. */
const CHAT_MENU_TRIGGER =
  'flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 dark:hover:bg-brand/15 sm:px-3'

/**
 * Builds a Settings-style menu row className.
 * @param selected - Whether this row is the active value
 * @param disabled - Whether the row is non-interactive
 * @returns Tailwind class string
 */
function chatMenuItemClass(selected: boolean, disabled = false): string {
  if (disabled) {
    return 'flex w-full cursor-not-allowed items-center gap-3 px-3 py-2.5 text-left text-sm font-semibold text-muted opacity-50'
  }
  return `flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm font-semibold transition ${
    selected
      ? 'bg-brand/15 text-brand'
      : 'text-brand hover:bg-brand/10 dark:hover:bg-brand/15'
  }`
}

const MODES: { id: ChatModeType; labelKey: string; Icon: typeof ZapIcon }[] = [
  { id: 'quick', labelKey: 'chat.input.modeQuick', Icon: ZapIcon },
  { id: 'think', labelKey: 'chat.input.modeThink', Icon: CpuIcon },
]

interface ChatMainPaneProps {
  kind: ChatAssistantKind
  visible: boolean
  userId: string
  user: User
  catalogModels: AiCatalogModel[]
  onOpenMobileSidebar: () => void
  onHistoryIdChange: (historyId: string | null) => void
  onHistoryMutated: (kind: ChatAssistantKind) => void
}

/** Imperative API so the shared sidebar can drive the visible pane. */
export interface ChatMainPaneHandle {
  startNew: () => void
  openHistory: (record: { id: string; messages: ChatMessage[] }) => void
  clearIfHistoryId: (historyId: string) => void
}

/**
 * Returns the first token of a display name for welcome copy.
 *
 * @param fullName - User full name from metadata
 * @returns Given name or empty string
 */
function getWelcomeGivenName(fullName: string | undefined): string {
  if (!fullName?.trim()) return ''
  return fullName.trim().split(/\s+/)[0] ?? ''
}

/**
 * Returns whether microphone capture for voice-to-text is available.
 *
 * @returns True when MediaRecorder + getUserMedia can run
 */
function isVoiceInputSupported(): boolean {
  return isMicrophoneCaptureSupported()
}

/**
 * Builds a Google Maps search URL for a shop location.
 *
 * @param loc - Shop location pin
 * @returns HTTPS maps URL
 */
function googleMapsUrlForLocation(loc: ShopLocation): string {
  const q = encodeURIComponent(loc.name || `${loc.latitude},${loc.longitude}`)
  return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${loc.latitude},${loc.longitude}`
}

/**
 * Transcript and composer for the Ask surface.
 *
 * @param props - Kind, visibility, signed-in user, and shared catalog
 * @param ref - Sidebar actions (new chat, open history, clear after delete)
 * @returns Main chat column
 */
export const ChatMainPane = forwardRef<ChatMainPaneHandle, ChatMainPaneProps>(function ChatMainPane(
  {
    kind,
    visible,
    userId,
    user,
    catalogModels,
    onOpenMobileSidebar,
    onHistoryIdChange,
    onHistoryMutated,
  },
  ref,
) {
  const { t, i18n } = useTranslation()
  const { openUrl } = useLinkOpen()
  const { keys: aiKeys } = useAiKeys(userId)
  const { addHistory, updateHistory } = useChatHistory()
  const nativeApplicationMenu = Boolean(window.geocrm?.window?.usesNativeApplicationMenu)

  const displayName = resolveUserDisplayName(user, user.email ?? '')
  const avatarUrl = resolveUserAvatarUrl(user)
  const [avatarError, setAvatarError] = useState(false)

  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatKindSession(kind).messages)
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(
    () => loadChatKindSession(kind).historyId,
  )
  const [inputText, setInputText] = useState(() => loadChatKindSession(kind).inputText)
  const [isLoading, setIsLoading] = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [showModeDropdown, setShowModeDropdown] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const loadingSeconds = useLoadingTimer(isLoading)

  const abortControllerRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const modeDropdownRef = useRef<HTMLDivElement>(null)
  const composingRef = useRef(false)
  const webSearchRef = useRef(false)
  const sendPromptRef = useRef<
    (rawText: string, opts?: { webSearch?: boolean; newThread?: boolean }) => Promise<void>
  >(async () => undefined)
  const [model, setModelState] = useState<ChatModelId>(
    () => loadElectronAiModelSelection(kind)?.provider ?? 'gemini',
  )
  const [modelId, setModelIdState] = useState(
    () => loadElectronAiModelSelection(kind)?.modelId ?? 'gemini-3.1-pro-preview',
  )
  const [mode, setModeState] = useState<ChatModeType>('quick')
  const [mapSearch, setMapSearch] = useState(false)
  useClawdBridgeReporter({
    sessionId: 'ask',
    loading: isLoading,
    thinkMode: mode === 'think',
    error: Boolean(sendError),
  })

  const apiKeys = useMemo(
    () => ({
      gemini: aiKeys.gemini ?? '',
      openai: aiKeys.openai ?? '',
      anthropic: aiKeys.anthropic ?? '',
      grok: aiKeys.grok ?? '',
    }),
    [aiKeys],
  )

  useEffect(() => {
    saveChatKindSession(kind, { messages, historyId: currentHistoryId, inputText })
  }, [kind, messages, currentHistoryId, inputText])

  useEffect(() => {
    onHistoryIdChange(currentHistoryId)
  }, [currentHistoryId, onHistoryIdChange])

  useEffect(() => {
    if (!visible) {
      setShowModelPicker(false)
      setShowModeDropdown(false)
    }
  }, [visible])

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (modeDropdownRef.current?.contains(target)) {
        return
      }
      setShowModelPicker(false)
      setShowModeDropdown(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  useEffect(() => {
    const next = resolveElectronAiSelection(catalogModels, loadElectronAiModelSelection(kind))
    setModelState(next.provider)
    setModelIdState(next.modelId)
  }, [catalogModels, kind])

  useEffect(() => {
    const scroller = messagesScrollRef.current
    if (!scroller) return
    // Scroll only the chat transcript — never scrollIntoView (that moves the whole app shell).
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    return () => {
      cancelMicrophoneRecording()
    }
  }, [])

  const hasApiKey = useCallback(
    (m: ChatModelId): boolean => {
      return providerKeyAliases(m).some((id) => Boolean((aiKeys[id] ?? '').trim()))
    },
    [aiKeys],
  )

  const allLocations = useMemo(() => {
    const map = new Map<string, ShopLocation>()
    messages.forEach((msg) => {
      msg.relatedShops?.forEach((s) => {
        if (!map.has(s.name)) map.set(s.name, s)
      })
    })
    return Array.from(map.values())
  }, [messages])

  const handleAssistantCodeBlockClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest?.('[data-chat-code-action]')
    if (!el) return
    e.preventDefault()
    e.stopPropagation()
    const action = el.getAttribute('data-chat-code-action')
    const block = el.closest('.chat-code-block')
    const codeNode = block?.querySelector('pre code')
    if (!codeNode || !action) return
    const text = codeNode.textContent ?? ''
    if (action === 'copy') {
      void navigator.clipboard.writeText(text)
      return
    }
    if (action === 'download') {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `snippet-${Date.now()}.txt`
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [])

  const sendPrompt = useCallback(
    async (rawText: string, opts?: { webSearch?: boolean; newThread?: boolean }): Promise<void> => {
      const text = rawText.trim()
      if (!text) return
      if (!opts?.newThread && isLoading) return
      if (!hasApiKey(model)) {
        setInputText(text)
        setSendError(t('chat.ipCheck.pleaseSetGemini'))
        return
      }

      if (opts?.newThread) {
        abortControllerRef.current?.abort()
        abortControllerRef.current = null
        setCurrentHistoryId(null)
        setEditingMessageId(null)
      }

      const useWebSearch = Boolean(opts?.webSearch || webSearchRef.current)
      if (opts?.webSearch) {
        webSearchRef.current = true
      }
      const useMap = mapSearch && !useWebSearch

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }
      const requestHistoryMessages = opts?.newThread ? [userMsg] : [...messages, userMsg]
      setMessages(requestHistoryMessages)
      setInputText('')
      setEditingMessageId(null)
      setSendError(null)
      setIsLoading(true)
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const searchLocation = useMap ? await readBrowserGeolocation() : undefined
        const result = await runSendMessage({
          model,
          modelId,
          prompt: text,
          historyMessages: requestHistoryMessages,
          mode,
          mapSearch: useMap,
          webSearch: useWebSearch,
          location: searchLocation,
          apiKeys,
          signal: controller.signal,
        })
        const responseMessage = result.message
        const responseLocations = result.locations

        if (controller.signal.aborted) {
          return
        }

        setMessages((prev) => [...prev, responseMessage])

        const newMessages = [...requestHistoryMessages, responseMessage]
        const input = buildHistoryInput(
          newMessages,
          text,
          allLocations.concat(responseLocations),
          searchLocation ?? null,
          kind,
        )
        if (!opts?.newThread && currentHistoryId) {
          await updateHistory(currentHistoryId, input)
        } else {
          const record = await addHistory(userId, input)
          if (record) setCurrentHistoryId(record.id)
        }
        onHistoryMutated(kind)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        setSendError(err instanceof Error ? err.message : t('chat.error.general'))
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    [
      isLoading,
      model,
      modelId,
      mode,
      mapSearch,
      kind,
      hasApiKey,
      apiKeys,
      messages,
      allLocations,
      currentHistoryId,
      userId,
      t,
      addHistory,
      updateHistory,
      onHistoryMutated,
    ],
  )

  sendPromptRef.current = sendPrompt

  /**
   * Sends the composer text as an Ask turn.
   * @returns Nothing.
   */
  const handleSend = useCallback(async () => {
    await sendPrompt(inputText)
  }, [inputText, sendPrompt])

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'model',
        content: `*${t('chat.input.stopped')}*`,
        timestamp: Date.now(),
      },
    ])
    setIsLoading(false)
  }, [t])

  const handleRegenerate = useCallback(
    async (messageId: string) => {
      const idx = messages.findIndex((m) => m.id === messageId)
      if (idx <= 0) return
      let userIdx = -1
      for (let i = idx - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
          userIdx = i
          break
        }
      }
      if (userIdx === -1) return
      const query = messages[userIdx].content
      setMessages((prev) => prev.slice(0, idx))
      setIsLoading(true)
      setSendError(null)
      const controller = new AbortController()
      abortControllerRef.current = controller
      const historySlice = messages.slice(0, idx)
      try {
        const searchLocation = mapSearch ? await readBrowserGeolocation() : undefined
        const result = await runSendMessage({
          model,
          modelId,
          prompt: query,
          historyMessages: historySlice,
          mode,
          mapSearch,
          location: searchLocation,
          apiKeys,
          signal: controller.signal,
        })
        const responseMessage = result.message
        const responseLocations = result.locations

        if (controller.signal.aborted) {
          return
        }
        setMessages((prev) => [...prev, responseMessage])
        if (currentHistoryId) {
          const newMessages = historySlice.concat(responseMessage)
          await updateHistory(currentHistoryId, {
            query,
            messages: newMessages,
            locations: allLocations.concat(responseLocations),
            searchLocation,
          })
          onHistoryMutated(kind)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }
        setSendError(err instanceof Error ? err.message : t('chat.error.general'))
      } finally {
        setIsLoading(false)
        abortControllerRef.current = null
      }
    },
    [
      messages,
      model,
      modelId,
      mode,
      mapSearch,
      apiKeys,
      currentHistoryId,
      allLocations,
      updateHistory,
      onHistoryMutated,
      kind,
      t,
    ],
  )

  const handleCopy = useCallback(async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
    } catch {
      // ignore
    }
  }, [])

  /**
   * Saves an assistant reply as a personal Aura Markdown file and opens Editor.
   * @param content - Assistant Markdown to export.
   * @returns Nothing.
   */
  const handleExportToAura = useCallback((content: string): void => {
    exportMarkdownToAura(content)
  }, [])

  /**
   * Selects a catalog model and persists the choice.
   * @param nextProvider - Provider slug
   * @param nextModelId - Vendor or local model id
   * @returns Nothing
   */
  const setCatalogSelection = useCallback(
    (nextProvider: ChatModelId, nextModelId: string) => {
      setModelState(nextProvider)
      setModelIdState(nextModelId)
      saveElectronAiModelSelection({ provider: nextProvider, modelId: nextModelId }, kind)
      setShowModelPicker(false)
    },
    [kind],
  )

  const setMode = useCallback((m: ChatModeType) => {
    setModeState(m)
    setShowModeDropdown(false)
  }, [])

  /**
   * Aborts the in-flight reply and opens a blank thread on this surface.
   * @returns Nothing
   */
  const startNew = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    webSearchRef.current = false
    setIsLoading(false)
    setMessages([])
    setCurrentHistoryId(null)
    setInputText('')
    setSendError(null)
    setEditingMessageId(null)
  }, [])

  /**
   * Replaces the open thread with a saved history row.
   * @param record - History id and messages
   * @returns Nothing
   */
  const openHistory = useCallback(
    (record: { id: string; messages: ChatMessage[] }) => {
      if (record.id === currentHistoryId) return
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      webSearchRef.current = false
      setIsLoading(false)
      setMessages([...(record.messages ?? [])])
      setCurrentHistoryId(record.id)
      setInputText('')
      setSendError(null)
      setEditingMessageId(null)
    },
    [currentHistoryId],
  )

  /**
   * Clears this surface when the deleted history row is the one on screen.
   * @param historyId - Deleted row id
   * @returns Nothing
   */
  const clearIfHistoryId = useCallback((historyId: string) => {
    if (currentHistoryId !== historyId) return
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setIsLoading(false)
    setMessages([])
    setCurrentHistoryId(null)
    setInputText('')
    setSendError(null)
    setEditingMessageId(null)
  }, [currentHistoryId])

  useImperativeHandle(
    ref,
    () => ({
      startNew,
      openHistory,
      clearIfHistoryId,
    }),
    [startNew, openHistory, clearIfHistoryId],
  )

  useEffect(() => {
    /**
     * Sends a queued Home / Spotlight query on the Chat Ask page with web search.
     * @returns Nothing.
     */
    function flushPendingAskSearch(): void {
      const pending = takePendingAskAiSearchQuery()
      if (pending) {
        void sendPromptRef.current(pending, { webSearch: true, newThread: true })
      }
    }
    flushPendingAskSearch()
    return subscribeAskAiSearch(flushPendingAskSearch)
  }, [])

  useEffect(() => {
    if (!nativeApplicationMenu || !visible) {
      return
    }
    patchChatMenuHandlers({
      setThinkMode: (next) => {
        setModeState(next)
      },
      setModel: (provider, nextModelId) => {
        setModelState(provider)
        setModelIdState(nextModelId)
        saveElectronAiModelSelection({ provider, modelId: nextModelId }, kind)
      },
      setMapSearch: (enabled) => {
        setMapSearch(enabled)
        if (enabled) void readBrowserGeolocation()
      },
    })
    return () => {
      unregisterChatMenuHost()
    }
  }, [kind, nativeApplicationMenu, visible])

  useEffect(() => {
    if (!nativeApplicationMenu || !visible) {
      return
    }
    setChatMenuView({
      thinkMode: mode === 'think' ? 'think' : 'quick',
      provider: model,
      modelId,
      mapSearch,
      providers: groupAiModelsByProvider(catalogModels).map(({ provider, models }) => {
        const providerLabel = t(providerLabelKey(provider), {
          defaultValue: providerDisplayName(provider),
        })
        return {
          id: provider,
          label: providerLabel,
          configured: hasApiKey(provider),
          models: models.map((entry) => ({
            id: entry.id,
            label: t('chat.modelSelector.combinedLabel', {
              provider: providerLabel,
              model: t(modelLabelKey(entry.id), { defaultValue: entry.labelEn }),
            }),
          })),
        }
      }),
    })
  }, [
    catalogModels,
    hasApiKey,
    mapSearch,
    model,
    modelId,
    mode,
    nativeApplicationMenu,
    t,
    i18n.language,
    visible,
  ])

  const getSpeechLang = useCallback((): string => {
    const lang = i18n.language
    if (lang === 'zh-tw') return 'zh-TW'
    if (lang === 'zh-cn') return 'zh-CN'
    return 'en-US'
  }, [i18n.language])

  /**
   * Maps speech-to-text errors to a user-facing string.
   *
   * @param err - Thrown value from capture / Gemini
   * @returns Localized message
   */
  const voiceErrorMessage = useCallback(
    (err: unknown): string => {
      const code = err instanceof Error ? err.message : ''
      if (code === 'gemini_key_missing') return t('chat.input.voiceNeedsGemini')
      if (code === 'audio_too_short') return t('chat.input.voiceTooShort')
      if (code === 'empty_transcript') return t('chat.input.voiceEmpty')
      if (code === 'microphone_unsupported') return t('chat.input.voiceNotSupported')
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      ) {
        return t('chat.input.voiceMicDenied')
      }
      if (err instanceof Error && err.message.trim()) return err.message
      return t('chat.input.voiceFailed')
    },
    [t],
  )

  /**
   * Toggles desktop voice input: first click records, second click transcribes via Gemini.
   *
   * @returns Nothing
   */
  const startVoiceInput = useCallback(() => {
    if (!isVoiceInputSupported()) {
      setSendError(t('chat.input.voiceNotSupported'))
      return
    }

    void (async () => {
      if (isTranscribing) return

      if (isRecognizing) {
        setIsRecognizing(false)
        setIsTranscribing(true)
        setSendError(null)
        try {
          const blob = await stopMicrophoneRecording()
          if (!blob) {
            setSendError(t('chat.input.voiceTooShort'))
            return
          }
          const geminiKey = (aiKeys.gemini ?? '').trim()
          if (!geminiKey) {
            setSendError(t('chat.input.voiceNeedsGemini'))
            return
          }
          const transcript = await transcribeAudioWithGemini(
            blob,
            geminiKey,
            getSpeechLang(),
          )
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript).trim())
        } catch (err) {
          setSendError(voiceErrorMessage(err))
        } finally {
          setIsTranscribing(false)
        }
        return
      }

      setSendError(null)
      try {
        await startMicrophoneRecording()
        setIsRecognizing(true)
      } catch (err) {
        cancelMicrophoneRecording()
        setIsRecognizing(false)
        setSendError(voiceErrorMessage(err))
      }
    })()
  }, [
    aiKeys.gemini,
    getSpeechLang,
    isRecognizing,
    isTranscribing,
    t,
    voiceErrorMessage,
  ])

  const handleInputKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229) {
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSend()
      }
    },
    [handleSend],
  )

  const currentModeEntry = MODES.find((x) => x.id === mode)
  const welcomeName =
    getWelcomeGivenName(displayName) || user.email?.split('@')[0] || t('chat.welcome.guest')
  const welcomeDescription =
    t(mode === 'quick' ? 'chat.welcome.descriptionQuick' : 'chat.welcome.descriptionThink')
  const WelcomeIcon = MessageSquareIcon

  const composerActionRadius = nativeApplicationMenu ? 'rounded-full' : 'rounded-lg'

  /**
   * Turns Map search on or off and requests GPS when enabling.
   * @returns Nothing.
   */
  const toggleMapSearch = useCallback((): void => {
    setMapSearch((current) => {
      const next = !current
      if (next) void readBrowserGeolocation()
      return next
    })
  }, [])

  const mapToggleControl = (
    <button
      type="button"
      role="switch"
      aria-checked={mapSearch}
      onClick={toggleMapSearch}
      className={`${CHAT_MENU_TRIGGER} ${mapSearch ? 'text-brand' : ''}`}
      title={t('chat.input.mapSearch')}
    >
      <MapPinIcon className="size-[15px] shrink-0" aria-hidden />
      <span className="hidden sm:inline">{t('chat.input.mapSearch')}</span>
      <span
        className={`h-4 w-7 rounded-full p-0.5 transition ${mapSearch ? 'bg-brand' : 'bg-zinc-400/50'}`}
        aria-hidden
      >
        <span className={`block size-3 rounded-full bg-white transition ${mapSearch ? 'translate-x-3' : ''}`} />
      </span>
    </button>
  )

  const composerActionControl = (
    <div className="relative size-[34px] shrink-0">
      {isLoading ? (
        <button
          type="button"
          onClick={handleStop}
          className="absolute inset-0 flex size-full items-center justify-center rounded-full bg-zinc-800 transition-all hover:bg-zinc-700"
          title={t('chat.input.stopAnswering')}
        >
          <StopIcon className="size-3 text-brand" aria-hidden />
        </button>
      ) : isRecognizing || isTranscribing ? (
        <button
          type="button"
          onClick={startVoiceInput}
          disabled={isTranscribing}
          className={`absolute inset-0 flex items-center justify-center ${composerActionRadius} p-2 text-brand transition-colors hover:bg-brand/10 disabled:cursor-wait disabled:opacity-70`}
          title={
            isTranscribing ? t('chat.input.voiceTranscribing') : t('chat.input.voiceStop')
          }
        >
          <MicIcon
            className={`size-[18px] ${isRecognizing || isTranscribing ? 'animate-pulse' : ''}`}
            aria-hidden
          />
        </button>
      ) : inputText.trim() ? (
        <button
          type="button"
          onClick={() => void handleSend()}
          className={`absolute inset-0 flex items-center justify-center ${composerActionRadius} bg-brand p-2 text-brand-fg shadow-lg transition-all hover:opacity-90`}
          title={t('chat.input.sendButton')}
        >
          <SendIcon className="size-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={startVoiceInput}
          disabled={!isVoiceInputSupported()}
          className={`absolute inset-0 flex items-center justify-center ${composerActionRadius} p-2 text-muted transition-colors hover:bg-zinc-950/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/5`}
          title={t('chat.input.voiceStart')}
        >
          <MicIcon className="size-[18px]" aria-hidden />
        </button>
      )}
    </div>
  )

  return (
    <main
      className={`min-h-0 min-w-0 flex-col bg-transparent ${
        visible
          ? 'relative flex flex-1'
          : 'pointer-events-none invisible absolute inset-0 flex'
      }`}
      aria-hidden={!visible}
      inert={!visible}
    >
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 lg:hidden">
            <button
              type="button"
              onClick={onOpenMobileSidebar}
              className="rounded-lg border border-zinc-950/10 bg-panel/90 p-2 text-muted transition-colors hover:text-ink dark:border-white/10"
              title={t('chat.sidebar.expandSidebar')}
            >
              <ChevronRightIcon className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={startNew}
              className="rounded-lg border border-zinc-950/10 bg-panel/90 p-2 text-muted transition-colors hover:text-ink dark:border-white/10"
              title={t('chat.sidebar.newChat')}
            >
              <PlusIcon className="size-5 text-brand" aria-hidden />
            </button>
          </div>

          <div
            ref={messagesScrollRef}
            className="chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-6 scroll-smooth lg:px-8"
          >
            <div className="mx-auto max-w-[66.666667%] space-y-10 pb-6">
              {messages.length === 0 ? (
                <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
                  <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-brand text-brand-fg shadow-[0_0_15px_color-mix(in_srgb,var(--brand)_35%,transparent)]">
                    <WelcomeIcon className="size-10" aria-hidden />
                  </div>
                  <h2 className="mb-3 text-3xl font-bold text-brand">
                    {t('chat.welcome.titleWithName').replace(/\{name\}/g, welcomeName)}
                  </h2>
                  <p className="max-w-md text-sm leading-relaxed text-muted">{welcomeDescription}</p>
                </div>
              ) : (
                <>
                  <div className="space-y-10">
                    {messages.map((msg) =>
                      msg.role === 'user' ? (
                        <div
                          key={msg.id}
                          className="group/user-message flex items-start justify-end gap-2"
                        >
                          <div className="flex shrink-0 items-center gap-2 pt-4 opacity-0 transition-opacity group-hover/user-message:opacity-100">
                            <button
                              type="button"
                              onClick={() => void handleCopy(msg.content)}
                              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/5"
                            >
                              <CopyIcon className="size-3.5" aria-hidden />
                            </button>
                          </div>
                          <div className="flex max-w-[66.666667%] flex-col items-end">
                            <div className="rounded-3xl rounded-tr-sm border border-zinc-950/10 bg-zinc-800 px-6 py-4 text-zinc-100 shadow-md dark:border-white/5 dark:bg-zinc-800">
                              <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">
                                {msg.content}
                              </p>
                            </div>
                          </div>
                          {avatarUrl && !avatarError ? (
                            <img
                              src={avatarUrl}
                              alt=""
                              className="size-10 shrink-0 rounded-full border border-zinc-950/10 object-cover shadow-lg dark:border-white/10"
                              onError={() => setAvatarError(true)}
                            />
                          ) : (
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-zinc-950/10 bg-brand font-semibold text-brand-fg shadow-lg dark:border-white/10">
                              {displayName[0]?.toUpperCase() ??
                                user.email?.[0]?.toUpperCase() ??
                                'U'}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div key={msg.id} className="flex items-start gap-4">
                          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand/40 bg-brand/15 text-brand">
                            <BotIcon className="size-5" aria-hidden />
                          </div>
                          <div className="flex max-w-[90%] flex-col space-y-4 lg:max-w-[85%]">
                            <div className="rounded-3xl rounded-tl-sm border border-zinc-950/10 bg-white/90 px-5 py-4 shadow-md dark:border-white/10 dark:bg-zinc-800/90">
                              <ChatMarkdown
                                className="chat-markdown text-[15px] leading-relaxed text-ink sm:text-base"
                                onClick={handleAssistantCodeBlockClick}
                                content={msg.content}
                                toolbar={{
                                  copy: t('chat.codeBlock.copy'),
                                  download: t('chat.codeBlock.download'),
                                  plain: t('chat.codeBlock.plain'),
                                }}
                              />
                            </div>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => void handleRegenerate(msg.id)}
                                  className="rounded-lg p-2 text-muted transition-colors hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10"
                                >
                                  <RefreshIcon className="size-4" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleCopy(msg.content)}
                                  className="rounded-lg p-2 text-muted transition-colors hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10"
                                  title={t('chat.codeBlock.copy')}
                                >
                                  <CopyIcon className="size-4" aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleExportToAura(msg.content)}
                                  className="rounded-lg p-2 text-muted transition-colors hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/10"
                                  title={t('chat.message.exportToAura')}
                                >
                                  <AuraMarkdownIcon className="size-4" aria-hidden />
                                </button>
                              </div>
                              {msg.relatedShops && msg.relatedShops.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.relatedShops.map((loc) => (
                                    <button
                                      key={`${loc.name}-${loc.latitude}-${loc.longitude}`}
                                      type="button"
                                      onClick={() => openUrl(googleMapsUrlForLocation(loc))}
                                      className="inline-flex items-center gap-1 rounded-lg border border-brand/30 bg-brand/10 px-2 py-1 text-xs text-brand transition-colors hover:bg-brand/20"
                                    >
                                      <MapPinIcon className="size-3" aria-hidden />
                                      <span className="max-w-[140px] truncate">{loc.name}</span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                            {msg.thinkingTime !== undefined ? (
                              <div className="flex items-center gap-1.5 font-mono text-[10px] text-brand/80">
                                <CpuIcon className="size-3" aria-hidden />
                                <span>
                                  {t('chat.thinkingTime')}: {msg.thinkingTime.toFixed(1)}s
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ),
                    )}

                    {isLoading ? (
                      <div className="flex items-start gap-4">
                        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand/40 bg-brand/15 text-brand">
                          <BotIcon className="size-5" aria-hidden />
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl border border-zinc-950/10 bg-panel/80 px-4 py-3 dark:border-white/10">
                          <span className="inline-flex items-center gap-1">
                            <span className="size-1.5 animate-bounce rounded-full bg-brand/70 [animation-delay:0ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-brand/70 [animation-delay:150ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-brand/70 [animation-delay:300ms]" />
                          </span>
                          <span className="font-mono text-xs text-brand">
                            {t('chat.loading')} {loadingSeconds.toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Composer strip — in-flow below transcript so content never paints under the input */}
          <div className="relative z-10 shrink-0 border-t border-zinc-950/5 bg-panel/40 p-4 backdrop-blur-md dark:border-white/5 dark:bg-zinc-950/40 lg:p-6">
            <div className="relative mx-auto w-full max-w-3xl">
              {(sendError || editingMessageId) && (
                <div className="mb-2 flex flex-col gap-0.5 px-1">
                  {editingMessageId ? (
                    <div className="flex items-center gap-1.5">
                      <PencilIcon className="size-2.5 shrink-0 text-brand" aria-hidden />
                      <p className="text-xs text-brand">{t('chat.message.edit')}</p>
                    </div>
                  ) : null}
                  {sendError ? (
                    <p className="text-xs text-red-500" role="alert">
                      {sendError}
                    </p>
                  ) : null}
                </div>
              )}

              <div
                className={`relative flex rounded-[1.75rem] border border-brand/50 bg-transparent shadow-[0_0_20px_-5px_color-mix(in_srgb,var(--brand)_30%,transparent)] transition-all duration-300 focus-within:border-brand focus-within:shadow-[0_0_30px_-5px_color-mix(in_srgb,var(--brand)_50%,transparent)] ${
                  nativeApplicationMenu
                    ? 'min-h-0 flex-row items-end gap-2 p-2 pl-3'
                    : 'min-h-[80px] flex-col p-3'
                }`}
              >
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onCompositionStart={() => {
                    composingRef.current = true
                  }}
                  onCompositionEnd={() => {
                    window.setTimeout(() => {
                      composingRef.current = false
                    }, 0)
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder={t('chat.input.placeholder')}
                  className={`chat-composer-input max-h-32 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent text-sm leading-6 text-ink placeholder:text-muted focus:ring-0 focus:outline-none ${
                    nativeApplicationMenu ? 'px-1 py-1.5' : 'px-3 py-2'
                  }`}
                  rows={1}
                  style={
                    {
                      fieldSizing: 'content',
                      outline: 'none',
                      minHeight: nativeApplicationMenu ? '34px' : '48px',
                    } as CSSProperties
                  }
                  disabled={isLoading}
                />

                {!nativeApplicationMenu ? (
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-0.5">
                      {kind === 'ask' ? (
                        <div className="relative" ref={modeDropdownRef}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowModeDropdown((v) => !v)
                            setShowModelPicker(false)
                          }}
                          className={CHAT_MENU_TRIGGER}
                          aria-expanded={showModeDropdown}
                        >
                          {currentModeEntry ? (
                            <currentModeEntry.Icon className="size-[15px]" aria-hidden />
                          ) : (
                            <CpuIcon className="size-[15px]" aria-hidden />
                          )}
                          <span className="hidden sm:inline">
                            {t(currentModeEntry?.labelKey ?? 'chat.input.modeThink')}
                          </span>
                          <ChevronDownIcon
                            className={`size-3 shrink-0 transition ${showModeDropdown ? 'rotate-180' : ''}`}
                            aria-hidden
                          />
                        </button>
                        {showModeDropdown ? (
                          <ul
                            className={`${CHAT_MENU_PANEL} bottom-full left-0 w-40`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {MODES.map(({ id, labelKey, Icon }) => (
                              <li key={id}>
                                <button
                                  type="button"
                                  onClick={() => setMode(id)}
                                  className={chatMenuItemClass(mode === id)}
                                >
                                  <Icon className="size-[15px] shrink-0" aria-hidden />
                                  <span>{t(labelKey)}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      ) : null}
                      {kind === 'ask' ? mapToggleControl : null}
                    </div>

                    <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                      <AiCombinedModelPicker
                        models={catalogModels}
                        provider={model}
                        modelId={modelId}
                        isConfigured={hasApiKey}
                        open={showModelPicker}
                        onOpenChange={(next) => {
                          setShowModelPicker(next)
                          if (next) setShowModeDropdown(false)
                        }}
                        onSelect={setCatalogSelection}
                      />

                      {composerActionControl}
                    </div>
                  </div>
                ) : (
                  <div className="mb-0.5 flex items-center gap-1">
                    {composerActionControl}
                  </div>
                )}
              </div>
              <p
                className={`text-center text-[10px] text-muted md:text-xs ${
                  nativeApplicationMenu ? 'mt-2' : 'mt-4'
                }`}
              >
                {t('chat.input.disclaimer')}
              </p>
            </div>
          </div>
    </main>
  )
})
