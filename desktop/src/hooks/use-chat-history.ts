/**
 * React hook for Ask history stored in local SQLite.
 */

import { useCallback, useState } from 'react'
import type {
  HistoryRecord,
  HistoryInput,
  ChatMessage,
  ChatAssistantKind,
} from '@/types/chat'
import { parseChatAssistantKind } from '@/types/chat'

/** One local SQLite conversation row returned over IPC. */
interface LocalHistoryRow {
  id: string
  userId: string
  query: string
  messages: unknown[]
  assistantKind: ChatAssistantKind
  createdAt: string
  updatedAt: string
}

/**
 * Maps a local SQLite row to the renderer HistoryRecord shape.
 *
 * @param row - Local history DTO
 * @returns Parsed history record
 */
function mapLocalRow(row: LocalHistoryRow): HistoryRecord {
  return {
    id: row.id,
    userId: row.userId,
    query: row.query,
    messages: Array.isArray(row.messages) ? (row.messages as ChatMessage[]) : [],
    assistantKind: parseChatAssistantKind(row.assistantKind),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export interface UseChatHistoryReturn {
  history: HistoryRecord[]
  loadHistory: (
    userId: string,
    assistantKind: ChatAssistantKind,
    ownOnly?: boolean,
  ) => Promise<void>
  addHistory: (userId: string, input: HistoryInput) => Promise<HistoryRecord | null>
  updateHistory: (historyId: string, updates: Partial<HistoryInput>) => Promise<HistoryRecord | null>
  removeHistory: (historyId: string) => Promise<boolean>
  isLoading: boolean
  error: string | null
}

/**
 * Loads and mutates Ask history stored on this machine.
 *
 * @returns History list and CRUD helpers
 */
export function useChatHistory(): UseChatHistoryReturn {
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null)

  const loadHistory = useCallback(async (
    userId: string,
    assistantKind: ChatAssistantKind,
    _ownOnly = false,
  ) => {
    const api = window.workbench?.chatHistory
    if (!api) {
      return
    }
    setIsLoading(true)
    setError(null)
    setOwnerUserId(userId)
    try {
      const rows = await api.list(userId, parseChatAssistantKind(assistantKind))
      setHistory(rows.map(mapLocalRow))
    } catch (err) {
      console.error('Load history error:', err)
      setError('Failed to load history')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const addHistory = useCallback(
    async (userId: string, input: HistoryInput): Promise<HistoryRecord | null> => {
      const api = window.workbench?.chatHistory
      if (!api) {
        return null
      }
      setError(null)
      setOwnerUserId(userId)
      try {
        const row = await api.add(userId, {
          query: input.query,
          messages: input.messages,
          assistantKind: parseChatAssistantKind(input.assistantKind),
        })
        const record = mapLocalRow(row)
        setHistory((prev) => [record, ...prev])
        return record
      } catch (err) {
        console.error('Add history error:', err)
        setError('Failed to add history')
        return null
      }
    },
    [],
  )

  const updateHistory = useCallback(
    async (historyId: string, updates: Partial<HistoryInput>): Promise<HistoryRecord | null> => {
      const api = window.workbench?.chatHistory
      const userId = ownerUserId
      if (!api || !userId) {
        return null
      }
      setError(null)
      try {
        const row = await api.update(userId, historyId, {
          query: updates.query,
          messages: updates.messages,
        })
        if (!row) {
          return null
        }
        const record = mapLocalRow(row)
        setHistory((prev) => prev.map((item) => (item.id === historyId ? record : item)))
        return record
      } catch (err) {
        console.error('Update history error:', err)
        setError('Failed to update history')
        return null
      }
    },
    [ownerUserId],
  )

  const removeHistory = useCallback(async (historyId: string): Promise<boolean> => {
    const api = window.workbench?.chatHistory
    const userId = ownerUserId
    if (!api || !userId) {
      return false
    }
    setError(null)
    try {
      const removed = await api.remove(userId, historyId)
      if (removed) {
        setHistory((prev) => prev.filter((item) => item.id !== historyId))
      }
      return removed
    } catch (err) {
      console.error('Remove history error:', err)
      setError('Failed to remove history')
      return false
    }
  }, [ownerUserId])

  return {
    history,
    loadHistory,
    addHistory,
    updateHistory,
    removeHistory,
    isLoading,
    error,
  }
}
