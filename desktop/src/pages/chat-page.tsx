/**
 * Artificial Intelligence (Ask) feature page for the Electron desktop client.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { useChatHistory } from '@/hooks/use-chat-history'
import { ELECTRON_FALLBACK_MODELS, type AiCatalogModel } from '@/chat'
import { listAiModels } from '@/services/ai-api'
import { useAiModelAllowlist } from '@/hooks/use-ai-model-allowlist'
import { filterEnabledAiModels } from '@/utils/settings/ai-model-allowlist'
import type { ChatAssistantKind, ChatMessage, HistoryRecord } from '@/types/chat'
import {
  ChatMainPane,
  type ChatMainPaneHandle,
} from '@/components/chat/chat-main-pane'
import { loadChatKindSession } from '@/utils/chat/assistant-kind'
import {
  ArtificialIntelligenceIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from '@/icons/AllIcons'

/** Ask surface only until Harness is rebuilt. */
const ASK_KIND: ChatAssistantKind = 'ask'

interface ChatPageProps {
  userId: string
  user: User
}

/**
 * Ask page with history rail and a single main pane.
 *
 * @param props - Signed-in user
 * @returns Chat UI
 */
export function ChatPage({ userId, user }: ChatPageProps) {
  const { t } = useTranslation()
  const { history, loadHistory, removeHistory } = useChatHistory()

  const paneRef = useRef<ChatMainPaneHandle>(null)

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [showHistorySearch, setShowHistorySearch] = useState(false)
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('')
  const [historyId, setHistoryId] = useState<string | null>(
    () => loadChatKindSession(ASK_KIND).historyId,
  )
  const [rawCatalogModels, setRawCatalogModels] = useState<AiCatalogModel[]>(ELECTRON_FALLBACK_MODELS)
  const { overrides: modelOverrides } = useAiModelAllowlist()
  const catalogModels = useMemo(
    () => filterEnabledAiModels(rawCatalogModels, modelOverrides),
    [rawCatalogModels, modelOverrides],
  )

  useEffect(() => {
    void loadHistory(userId, ASK_KIND)
  }, [loadHistory, userId])

  useEffect(() => {
    let cancelled = false
    const applyCatalog = (rows: AiCatalogModel[]) => {
      if (cancelled || rows.length === 0) return
      setRawCatalogModels(rows)
    }
    applyCatalog(ELECTRON_FALLBACK_MODELS)
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
        applyCatalog(mapped.length > 0 ? mapped : ELECTRON_FALLBACK_MODELS)
      })
      .catch((err) => console.warn('Failed to load AI model catalog:', err))
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Records the open history row for this surface.
   * @param nextHistoryId - Active history id, or null for a new thread
   * @returns Nothing
   */
  const handleHistoryIdChange = useCallback((nextHistoryId: string | null) => {
    setHistoryId((prev) => (prev === nextHistoryId ? prev : nextHistoryId))
  }, [])

  /**
   * Reloads the sidebar list when Ask persisted a thread.
   * @param mutatedKind - Surface that wrote history
   * @returns Nothing
   */
  const handleHistoryMutated = useCallback(
    (mutatedKind: ChatAssistantKind) => {
      if (mutatedKind === ASK_KIND) {
        void loadHistory(userId, ASK_KIND)
      }
    },
    [loadHistory, userId],
  )

  const handleOpenMobileSidebar = useCallback(() => {
    setShowMobileSidebar(true)
    setIsSidebarCollapsed(false)
  }, [])

  const filteredHistory = useMemo(() => {
    if (!sidebarSearchQuery.trim()) return history
    const q = sidebarSearchQuery.trim().toLowerCase()
    return history.filter((h) => (h.query ?? '').toLowerCase().includes(q))
  }, [history, sidebarSearchQuery])

  /**
   * Starts a blank Ask thread.
   * @returns Nothing
   */
  const handleNewConversation = useCallback(() => {
    paneRef.current?.startNew()
    setShowMobileSidebar(false)
  }, [])

  /**
   * Opens a history row.
   * @param record - Sidebar row
   * @returns Nothing
   */
  const handleSelectHistory = useCallback((record: { id: string; messages: ChatMessage[] }) => {
    paneRef.current?.openHistory(record)
    setShowMobileSidebar(false)
  }, [])

  /**
   * Deletes a history row and clears the pane if that thread was open.
   * @param e - Click on the trash control
   * @param rowId - Row to remove
   * @returns Nothing
   */
  const handleDeleteHistory = useCallback(
    (e: ReactMouseEvent, rowId: string) => {
      e.stopPropagation()
      if (!window.confirm(t('chat.sidebar.confirmDelete'))) return
      void removeHistory(rowId).then(() => {
        paneRef.current?.clearIfHistoryId(rowId)
      })
    },
    [removeHistory, t],
  )

  return (
    <div className="chat-page relative flex h-full max-h-full min-h-0 overflow-hidden bg-transparent text-ink">
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside
          className={`chat-sidebar-rail relative flex h-full shrink-0 flex-col overflow-hidden border-r border-zinc-950/10 bg-transparent backdrop-blur-md dark:border-white/10 ${
            showMobileSidebar
              ? 'absolute inset-y-0 left-0 z-30 w-[280px] translate-x-0'
              : 'absolute inset-y-0 left-0 z-30 w-[280px] -translate-x-full pointer-events-none lg:pointer-events-auto lg:relative lg:translate-x-0'
          } ${
            isSidebarCollapsed && !showMobileSidebar ? 'lg:w-12' : 'lg:w-[280px]'
          }`}
          aria-expanded={!isSidebarCollapsed || showMobileSidebar}
        >
          <div
            className={`chat-sidebar-rail__expanded absolute inset-0 flex w-[280px] flex-col ${
              isSidebarCollapsed && !showMobileSidebar
                ? 'pointer-events-none invisible opacity-0'
                : 'opacity-100'
            }`}
          >
            <div className="flex items-center justify-between gap-1 px-3 pt-4 pb-2">
              <button
                type="button"
                onClick={() => {
                  setIsSidebarCollapsed(true)
                  setShowMobileSidebar(false)
                }}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-brand transition-colors hover:bg-brand/10"
                title={t('chat.sidebar.collapseSidebar')}
              >
                <ChevronLeftIcon className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setShowHistorySearch((v) => !v)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-brand transition-colors hover:bg-brand/10"
                title={
                  showHistorySearch ? t('chat.sidebar.closeSearch') : t('chat.sidebar.openSearch')
                }
              >
                <SearchIcon className="size-4" aria-hidden />
              </button>
            </div>

            <div className="px-4 pb-2">
              <button
                type="button"
                onClick={handleNewConversation}
                className="group flex w-full items-center gap-3 rounded-full border border-zinc-950/10 bg-panel/80 px-4 py-3 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-zinc-950/5 dark:border-white/5 dark:hover:bg-white/10"
              >
                <PlusIcon
                  className="size-[18px] shrink-0 text-brand transition-transform group-hover:scale-110"
                  aria-hidden
                />
                {t('chat.sidebar.newChat')}
              </button>
              {showHistorySearch ? (
                <div className="mt-2">
                  <input
                    type="text"
                    value={sidebarSearchQuery}
                    onChange={(e) => setSidebarSearchQuery(e.target.value)}
                    placeholder={t('chat.sidebar.searchHistory')}
                    className="w-full rounded-lg border border-zinc-950/10 bg-panel/80 px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand/50 focus:ring-2 focus:ring-brand/30 focus:outline-none dark:border-white/10"
                  />
                </div>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-2">
              {filteredHistory.length > 0 ? (
                <div>
                  <h3 className="mt-2 mb-3 px-3 text-xs font-semibold tracking-widest text-brand uppercase">
                    {t('chat.sidebar.recentConversations')}
                  </h3>
                  <div className="space-y-1">
                    {filteredHistory.map((record: HistoryRecord) => {
                      const isSelected = historyId === record.id
                      return (
                        <div
                          key={record.id}
                          className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                            isSelected
                              ? 'border-brand/20 bg-brand/15 text-brand'
                              : 'border-transparent text-brand hover:bg-brand/10'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectHistory(record)
                            }}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <ArtificialIntelligenceIcon className="size-4 shrink-0" aria-hidden />
                            <span className="truncate">{record.query || t('chat.sidebar.untitled')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteHistory(e, record.id)}
                            className="shrink-0 rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-zinc-950/10 hover:text-ink group-hover:opacity-100 dark:hover:bg-white/10"
                            title={t('chat.sidebar.deleteHistory')}
                          >
                            <TrashIcon className="size-3.5" aria-hidden />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted">{t('chat.noHistory')}</p>
              )}
              {showHistorySearch && filteredHistory.length === 0 && sidebarSearchQuery.trim() ? (
                <p className="px-3 text-center text-sm text-muted">
                  {t('chat.sidebar.noSearchResults')}
                </p>
              ) : null}
            </div>
          </div>

          <div
            className={`chat-sidebar-rail__collapsed absolute inset-0 z-1 flex w-12 flex-col ${
              isSidebarCollapsed && !showMobileSidebar
                ? 'opacity-100'
                : 'pointer-events-none invisible opacity-0'
            }`}
          >
            <div className="flex flex-col items-center gap-1 px-2 pt-4">
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-zinc-950/5 hover:text-ink dark:hover:bg-white/5"
                title={t('chat.sidebar.expandSidebar')}
                tabIndex={isSidebarCollapsed && !showMobileSidebar ? 0 : -1}
              >
                <ChevronRightIcon className="size-4 shrink-0" aria-hidden />
              </button>
              <button
                type="button"
                onClick={handleNewConversation}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-brand transition-colors hover:bg-zinc-950/5 dark:hover:bg-white/5"
                title={t('chat.sidebar.newChat')}
                tabIndex={isSidebarCollapsed && !showMobileSidebar ? 0 : -1}
              >
                <PlusIcon className="size-4 shrink-0" aria-hidden />
              </button>
            </div>
          </div>
        </aside>

        <button
          type="button"
          onClick={() => setShowMobileSidebar(false)}
          className={`fixed inset-0 z-20 bg-black/50 transition-opacity duration-300 lg:hidden ${
            showMobileSidebar ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-label={t('chat.sidebar.closeSearch')}
          tabIndex={showMobileSidebar ? 0 : -1}
        />

        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <ChatMainPane
            ref={paneRef}
            kind={ASK_KIND}
            visible
            userId={userId}
            user={user}
            catalogModels={catalogModels}
            onOpenMobileSidebar={handleOpenMobileSidebar}
            onHistoryIdChange={handleHistoryIdChange}
            onHistoryMutated={handleHistoryMutated}
          />
        </div>
      </div>
    </div>
  )
}
