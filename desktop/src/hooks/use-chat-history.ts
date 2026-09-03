/**
 * React hook for chat history (Supabase `history` table).
 */

import { useCallback, useState } from 'react'
import type {
  HistoryRecord,
  HistoryInput,
  ChatMessage,
  ShopLocation,
  Coordinates,
  ChatAssistantKind,
} from '@/types/chat'
import { parseChatAssistantKind } from '@/types/chat'
import type { Json } from '@/types/database'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/**
 * Maps a Supabase row to a typed HistoryRecord.
 *
 * @param row - Raw database row
 * @returns Parsed history record
 */
function mapRowToHistory(row: {
  id: string
  user_id: string
  query: string
  messages: Json | null
  locations: Json | null
  search_location: Json | null
  group_id: string | null
  created_by_user_id: string | null
  assistant_kind?: string | null
  harness_thread_id?: string | null
  harness_items?: Json | null
  created_at: string
  updated_at: string
}): HistoryRecord {
  let messages: ChatMessage[] = []
  let locations: ShopLocation[] = []
  let searchLocation: Coordinates | undefined

  try {
    if (row.messages) {
      messages =
        typeof row.messages === 'string'
          ? (JSON.parse(row.messages) as ChatMessage[])
          : (row.messages as unknown as ChatMessage[])
    }
  } catch {
    // ignore malformed JSON
  }
  try {
    if (row.locations) {
      locations =
        typeof row.locations === 'string'
          ? (JSON.parse(row.locations) as ShopLocation[])
          : (row.locations as unknown as ShopLocation[])
    }
  } catch {
    // ignore malformed JSON
  }
  try {
    if (row.search_location) {
      searchLocation =
        typeof row.search_location === 'string'
          ? (JSON.parse(row.search_location) as Coordinates)
          : (row.search_location as unknown as Coordinates)
    }
  } catch {
    // ignore malformed JSON
  }

  return {
    id: row.id,
    userId: row.user_id,
    query: row.query,
    messages,
    locations,
    searchLocation,
    groupId: row.group_id,
    createdByUserId: row.created_by_user_id,
    assistantKind: parseChatAssistantKind(row.assistant_kind),
    harnessThreadId: row.harness_thread_id ?? null,
    harnessItems: Array.isArray(row.harness_items)
      ? (row.harness_items as unknown as HistoryRecord['harnessItems'])
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Resolves the active group id for a user (shared history scope).
 *
 * @param userId - Auth user id
 * @returns Group id or null
 */
async function getGroupIdForUser(userId: string): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return data?.group_id ?? null
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
 * Loads and mutates Supabase chat history for the signed-in user.
 *
 * @returns History list and CRUD helpers
 */
export function useChatHistory(): UseChatHistoryReturn {
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async (
    userId: string,
    assistantKind: ChatAssistantKind,
    ownOnly = false,
  ) => {
    if (!isSupabaseConfigured || !supabase) return
    setIsLoading(true)
    setError(null)
    try {
      let query = supabase.from('history').select('*').eq('assistant_kind', assistantKind)
      if (ownOnly) {
        query = query.eq('user_id', userId).eq('created_by_user_id', userId)
      } else {
        const groupId = await getGroupIdForUser(userId)
        if (groupId) {
          query = query.eq('group_id', groupId)
        } else {
          query = query.is('group_id', null).eq('user_id', userId)
        }
      }
      const { data, error: queryError } = await query.order('created_at', { ascending: false })
      if (queryError) throw queryError
      setHistory((data ?? []).map((row) => mapRowToHistory(row)))
    } catch (err) {
      console.error('Load history error:', err)
      setError('Failed to load history')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const addHistory = useCallback(
    async (userId: string, input: HistoryInput): Promise<HistoryRecord | null> => {
      if (!isSupabaseConfigured || !supabase) return null
      setError(null)
      try {
        const groupId = await getGroupIdForUser(userId)
        const { data, error: insertError } = await supabase
          .from('history')
          .insert({
            user_id: userId,
            query: input.query,
            messages: input.messages as unknown as Json,
            locations: input.locations as unknown as Json,
            search_location: (input.searchLocation ?? null) as unknown as Json,
            created_by_user_id: userId,
            group_id: groupId ?? null,
            assistant_kind: parseChatAssistantKind(input.assistantKind),
            harness_thread_id: input.harnessThreadId ?? null,
            harness_items: (input.harnessItems ?? null) as unknown as Json,
          })
          .select()
          .single()
        if (insertError) throw insertError
        const record = mapRowToHistory(data)
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
      if (!isSupabaseConfigured || !supabase) return null
      setError(null)
      try {
        const updateData: {
          updated_at: string
          query?: string
          messages?: Json
          locations?: Json
          search_location?: Json | null
          harness_thread_id?: string | null
          harness_items?: Json | null
        } = { updated_at: new Date().toISOString() }
        if (updates.query !== undefined) updateData.query = updates.query
        if (updates.messages !== undefined) updateData.messages = updates.messages as unknown as Json
        if (updates.locations !== undefined) updateData.locations = updates.locations as unknown as Json
        if (updates.searchLocation !== undefined) {
          updateData.search_location = (updates.searchLocation ?? null) as unknown as Json
        }
        if (updates.harnessThreadId !== undefined) {
          updateData.harness_thread_id = updates.harnessThreadId ?? null
        }
        if (updates.harnessItems !== undefined) {
          updateData.harness_items = updates.harnessItems as unknown as Json
        }
        const { data, error: updateErr } = await supabase
          .from('history')
          .update(updateData)
          .eq('id', historyId)
          .select()
          .single()
        if (updateErr) throw updateErr
        const record = mapRowToHistory(data)
        setHistory((prev) => prev.map((h) => (h.id === historyId ? record : h)))
        return record
      } catch (err) {
        console.error('Update history error:', err)
        setError('Failed to update history')
        return null
      }
    },
    [],
  )

  const removeHistory = useCallback(async (historyId: string): Promise<boolean> => {
    if (!isSupabaseConfigured || !supabase) return false
    setError(null)
    try {
      const { error: deleteError } = await supabase.from('history').delete().eq('id', historyId)
      if (deleteError) throw deleteError
      setHistory((prev) => prev.filter((h) => h.id !== historyId))
      return true
    } catch (err) {
      console.error('Remove history error:', err)
      setError('Failed to remove history')
      return false
    }
  }, [])

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
