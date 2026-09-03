/**
 * Cloud-backed Harness history with one row per Codex thread.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatHistory } from '@/hooks/use-chat-history'
import type { ChatMessage, HistoryRecord } from '@/types/chat'
import type { HarnessItem, HarnessTurnStatus } from '@/types/harness'

export interface HarnessHistoryState {
  records: HistoryRecord[]
  activeHistoryId: string | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  beginNew: () => void
  select: (record: HistoryRecord) => void
  rename: (historyId: string, title: string) => Promise<void>
  remove: (historyId: string) => Promise<void>
}

/**
 * Maps workflow transcript items to the existing generic history message shape.
 * @param items - Workflow transcript rows.
 * @returns User and assistant messages.
 */
function harnessItemsToMessages(items: HarnessItem[]): ChatMessage[] {
  const timestamp = Date.now()
  const messages: ChatMessage[] = []
  for (const item of items) {
    if (item.type === 'userMessage') {
      messages.push({ id: item.id, role: 'user', content: item.text, timestamp })
    } else if (item.type === 'agentMessage') {
      messages.push({ id: item.id, role: 'model', content: item.text, timestamp })
    }
  }
  return messages
}

/**
 * Restores workflow rows from a history record, including legacy message-only rows.
 * @param record - Agent history record.
 * @returns Transcript rows suitable for Harness.
 */
export function harnessItemsFromHistory(record: HistoryRecord): HarnessItem[] {
  if (record.harnessItems && record.harnessItems.length > 0) {
    return record.harnessItems
  }
  return record.messages
    .filter((message) => message.role === 'user' || message.role === 'model')
    .map((message): HarnessItem =>
      message.role === 'user'
        ? { id: message.id, type: 'userMessage', text: message.content }
        : { id: message.id, type: 'agentMessage', text: message.content },
    )
}

/**
 * Builds cross-device fallback instructions from a stored transcript.
 * @param record - History record being continued.
 * @returns English scaffolding plus the original conversation text.
 */
export function historyContinuationInstructions(record: HistoryRecord): string {
  const transcript = harnessItemsFromHistory(record)
    .flatMap((item) => {
      if (item.type === 'userMessage') return [`User: ${item.text}`]
      if (item.type === 'agentMessage') return [`Assistant: ${item.text}`]
      return []
    })
    .join('\n\n')
  return [
    '# Restored Harness conversation',
    '',
    'The user opened a previous Harness conversation on a device where its local Codex rollout may be unavailable. Continue with the following transcript as prior context. Do not repeat it unless needed.',
    '',
    transcript,
  ].join('\n')
}

/**
 * Persists and manages the signed-in user's Harness conversation list.
 * @param userId - Signed-in user id, or null when unknown.
 * @param items - Current transcript rows.
 * @param turnStatus - Current turn lifecycle.
 * @param isLive - Whether a real Harness host is available for persisted runs.
 * @param threadId - Local Codex thread id when available.
 * @returns History state and actions.
 */
export function useHarnessHistory(
  userId: string | null,
  items: HarnessItem[],
  turnStatus: HarnessTurnStatus,
  isLive: boolean,
  threadId: string | null,
): HarnessHistoryState {
  const {
    history,
    loadHistory,
    addHistory,
    updateHistory,
    removeHistory,
    isLoading,
    error,
  } = useChatHistory()
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null)
  const activeHistoryIdRef = useRef<string | null>(null)
  const itemsRef = useRef(items)
  const lastSavedRef = useRef('')
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve())
  itemsRef.current = items

  const refresh = useCallback(async (): Promise<void> => {
    if (!userId) return
    await loadHistory(userId, 'agent', true)
  }, [loadHistory, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!userId || !isLive || turnStatus === 'idle') {
      return
    }
    const currentItems = itemsRef.current
    const messages = harnessItemsToMessages(currentItems)
    if (messages.length === 0) return
    const fingerprint = JSON.stringify(currentItems)
    if (fingerprint === lastSavedRef.current) return
    const persist = async (): Promise<void> => {
      if (fingerprint === lastSavedRef.current) return
      const currentId = activeHistoryIdRef.current
      if (currentId) {
        await updateHistory(currentId, {
          messages,
          locations: [],
          harnessThreadId: threadId,
          harnessItems: currentItems,
          assistantKind: 'agent',
        })
        lastSavedRef.current = fingerprint
        return
      }
      const firstUser = messages.find((message) => message.role === 'user')
      const created = await addHistory(userId, {
        query: firstUser?.content.trim() || 'Harness',
        messages,
        locations: [],
        harnessThreadId: threadId,
        harnessItems: currentItems,
        assistantKind: 'agent',
      })
      if (created) {
        activeHistoryIdRef.current = created.id
        setActiveHistoryId(created.id)
        lastSavedRef.current = fingerprint
      }
    }
    const delay = turnStatus === 'running' ? 700 : 0
    const timer = window.setTimeout(() => {
      persistenceQueueRef.current = persistenceQueueRef.current
        .then(persist)
        .catch(() => undefined)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [addHistory, isLive, items, threadId, turnStatus, updateHistory, userId])

  const beginNew = useCallback((): void => {
    activeHistoryIdRef.current = null
    setActiveHistoryId(null)
    lastSavedRef.current = ''
  }, [])

  const select = useCallback((record: HistoryRecord): void => {
    activeHistoryIdRef.current = record.id
    setActiveHistoryId(record.id)
    lastSavedRef.current = JSON.stringify(harnessItemsFromHistory(record))
  }, [])

  const rename = useCallback(
    async (historyId: string, title: string): Promise<void> => {
      const query = title.trim()
      if (!query) return
      await updateHistory(historyId, { query })
    },
    [updateHistory],
  )

  const remove = useCallback(
    async (historyId: string): Promise<void> => {
      const removed = await removeHistory(historyId)
      if (removed && activeHistoryIdRef.current === historyId) beginNew()
    },
    [beginNew, removeHistory],
  )

  return {
    records: history,
    activeHistoryId,
    isLoading,
    error,
    refresh,
    beginNew,
    select,
    rename,
    remove,
  }
}
