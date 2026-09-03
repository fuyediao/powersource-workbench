/**
 * Drives one Harness thread: transcript items, turn status, and approvals.
 * The runtime is either a live local Codex host or an explicit unavailable state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  HarnessApprovalDecision,
  HarnessApprovalRequest,
  HarnessEvent,
  HarnessItem,
  HarnessMcpServerStatus,
  HarnessRuntime,
  HarnessAppConnector,
  HarnessComputerTarget,
  HarnessDeliberationConfig,
  HarnessStartTurnExtras,
  HarnessTurnStatus,
} from '@/types/harness'
import type { ChatMessage } from '@/types/chat'
import { runHarnessDeliberation } from '@/services/harness-deliberation'

export interface HarnessSessionState {
  /** Local Codex thread id for history resume. */
  threadId: string | null
  /** Transcript rows in arrival order. */
  items: HarnessItem[]
  /** Current turn lifecycle. */
  turnStatus: HarnessTurnStatus
  /** Approval waiting on the user, or null. */
  approval: HarnessApprovalRequest | null
  /** Whether a real workflow process is attached. */
  isLive: boolean
  /** MCP runtime states reported by the local app-server. */
  mcpServers: HarnessMcpServerStatus[]
  /** Submits a task and starts a turn. */
  submit: (text: string, extras?: HarnessStartTurnExtras) => void
  /** Runs a private multi-model deliberation and appends one final answer. */
  deliberate: (text: string, config: HarnessDeliberationConfig) => void
  /** Starts OAuth for a configured MCP server. */
  loginMcp: (name: string) => void
  /** Lists connectors from the hosted app directory. */
  listConnectors: (forceRefetch?: boolean) => Promise<HarnessAppConnector[]>
  /** Opens one provider-owned connector installation flow. */
  installConnector: (connectorId: string, installUrl: string) => Promise<void>
  /** Lists displays and native windows available to Computer Use. */
  listComputerTargets: () => Promise<HarnessComputerTarget[]>
  /** Cancels the in-flight turn. */
  interrupt: () => void
  /** Answers the pending approval. */
  respond: (decision: HarnessApprovalDecision) => void
  /** Clears the transcript for a new task. */
  reset: () => void
  /** Replaces the transcript with a stored conversation. */
  restore: (items: HarnessItem[]) => void
}

/**
 * Replaces an item with the same id, or appends it.
 * @param items - Current transcript.
 * @param next - Incoming item.
 * @returns New transcript array.
 */
function upsertItem(items: HarnessItem[], next: HarnessItem): HarnessItem[] {
  const index = items.findIndex((item) => item.id === next.id)
  if (index < 0) {
    return [...items, next]
  }
  const copy = items.slice()
  copy[index] = next
  return copy
}

/**
 * Subscribes to a Harness runtime and exposes transcript state.
 * @param createRuntime - Factory for the workflow runtime.
 * @returns Session state and actions.
 */
export function useHarnessSession(createRuntime: () => HarnessRuntime): HarnessSessionState {
  const [items, setItems] = useState<HarnessItem[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [turnStatus, setTurnStatus] = useState<HarnessTurnStatus>('idle')
  const [approval, setApproval] = useState<HarnessApprovalRequest | null>(null)
  const runtimeRef = useRef<HarnessRuntime | null>(null)
  const itemsRef = useRef<HarnessItem[]>([])
  const deliberationAbortRef = useRef<AbortController | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [mcpServers, setMcpServers] = useState<HarnessMcpServerStatus[]>([])
  itemsRef.current = items

  const factory = useRef(createRuntime)
  factory.current = createRuntime

  useEffect(() => {
    const runtime = factory.current()
    runtimeRef.current = runtime
    setIsLive(runtime.isLive)

    const unsubscribe = runtime.subscribe((event: HarnessEvent) => {
      switch (event.type) {
        case 'snapshotReset':
          setItems([])
          setThreadId(null)
          setTurnStatus('idle')
          setApproval(null)
          break
        case 'threadStarted':
          setThreadId(event.threadId || null)
          break
        case 'mcpStatus':
          setMcpServers(event.servers)
          break
        case 'turnStarted':
          setTurnStatus('running')
          break
        case 'itemStarted':
        case 'itemUpdated':
        case 'itemCompleted':
          setItems((prev) => upsertItem(prev, event.item))
          break
        case 'approvalRequested':
          setApproval(event.request)
          break
        case 'approvalResolved':
          setApproval((prev) => (prev && prev.requestId === event.requestId ? null : prev))
          break
        case 'turnCompleted':
          setApproval(null)
          setTurnStatus('completed')
          break
        case 'turnFailed':
          setApproval(null)
          setTurnStatus('failed')
          setItems((prev) =>
            upsertItem(prev, {
              id: crypto.randomUUID(),
              type: 'error',
              message: event.message,
            }),
          )
          break
        case 'turnInterrupted':
          setApproval(null)
          setTurnStatus('interrupted')
          break
        default:
          break
      }
    })

    return () => {
      unsubscribe()
      runtime.dispose()
      runtimeRef.current = null
      deliberationAbortRef.current?.abort()
    }
  }, [createRuntime])

  /**
   * Submits a task and starts a turn.
   * @param text - User task text.
   * @param extras - Optional attachments, goal, planning mode, and Canvas mode.
   * @returns Nothing.
   */
  const submit = useCallback((text: string, extras?: HarnessStartTurnExtras) => {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    setTurnStatus('running')
    void runtimeRef.current?.startTurn(trimmed, extras)
  }, [])

  /** Runs one renderer-orchestrated model council without sharing initial drafts. */
  const deliberate = useCallback((text: string, config: HarnessDeliberationConfig): void => {
    const trimmed = text.trim()
    if (!trimmed || config.participants.length < 2) return
    const priorHistory = itemsRef.current.reduce<ChatMessage[]>((history, item) => {
      if (item.type === 'userMessage') {
        history.push({ id: item.id, role: 'user', content: item.text, timestamp: Date.now() })
      }
      if (item.type === 'agentMessage') {
        history.push({ id: item.id, role: 'model', content: item.text, timestamp: Date.now() })
      }
      return history
    }, [])
    const userItem: HarnessItem = { id: crypto.randomUUID(), type: 'userMessage', text: trimmed }
    const deliberationId = crypto.randomUUID()
    const pendingItem: HarnessItem = {
      id: deliberationId,
      type: 'deliberation',
      status: 'inProgress',
      contributions: [],
      finalizerLabel: config.finalizer.label,
    }
    const controller = new AbortController()
    deliberationAbortRef.current?.abort()
    deliberationAbortRef.current = controller
    setItems((current) => [...current, userItem, pendingItem])
    setApproval(null)
    setTurnStatus('running')
    void runHarnessDeliberation(trimmed, priorHistory, config, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setItems((current) => [
          ...current.map((item): HarnessItem => item.id === deliberationId
            ? { ...pendingItem, status: 'completed', contributions: result.contributions }
            : item),
          { id: crypto.randomUUID(), type: 'agentMessage', text: result.answer },
        ])
        setTurnStatus('completed')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setItems((current) => [
          ...current.filter((item) => item.id !== deliberationId),
          {
            id: crypto.randomUUID(),
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
          },
        ])
        setTurnStatus('failed')
      })
      .finally(() => {
        if (deliberationAbortRef.current === controller) deliberationAbortRef.current = null
      })
  }, [])

  const interrupt = useCallback(() => {
    deliberationAbortRef.current?.abort()
    deliberationAbortRef.current = null
    void runtimeRef.current?.interrupt()
    setTurnStatus('interrupted')
  }, [])

  const loginMcp = useCallback((name: string): void => {
    void runtimeRef.current?.loginMcp(name)
  }, [])

  const listConnectors = useCallback(async (forceRefetch = false): Promise<HarnessAppConnector[]> => {
    return runtimeRef.current?.listConnectors(forceRefetch) ?? []
  }, [])

  const installConnector = useCallback(async (connectorId: string, installUrl: string): Promise<void> => {
    await runtimeRef.current?.installConnector(connectorId, installUrl)
  }, [])

  const listComputerTargets = useCallback(async (): Promise<HarnessComputerTarget[]> => {
    return runtimeRef.current?.listComputerTargets() ?? []
  }, [])

  const respond = useCallback(
    (decision: HarnessApprovalDecision) => {
      if (!approval) {
        return
      }
      void runtimeRef.current?.respondToApproval(approval.requestId, decision)
    },
    [approval],
  )

  const reset = useCallback(() => {
    deliberationAbortRef.current?.abort()
    deliberationAbortRef.current = null
    setItems([])
    setThreadId(null)
    setApproval(null)
    setTurnStatus('idle')
    setMcpServers([])
  }, [])

  const restore = useCallback((nextItems: HarnessItem[]): void => {
    setItems(nextItems)
    setApproval(null)
    setTurnStatus(nextItems.length > 0 ? 'completed' : 'idle')
  }, [])

  return useMemo(
    () => ({ threadId, items, turnStatus, approval, isLive, mcpServers, submit, deliberate, loginMcp, listConnectors, installConnector, listComputerTargets, interrupt, respond, reset, restore }),
    [threadId, items, turnStatus, approval, isLive, mcpServers, submit, deliberate, loginMcp, listConnectors, installConnector, listComputerTargets, interrupt, respond, reset, restore],
  )
}
