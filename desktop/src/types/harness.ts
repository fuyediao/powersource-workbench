/**
 * Harness workflow types.
 *
 * Shapes mirror the Codex `app-server` v2 JSON-RPC surface (thread / turn /
 * item) so the renderer can render real events without a translation layer.
 * Harness never routes through Ask (`POST /ai/aichat`).
 */

/** Lifecycle of a single thread item. */
export type HarnessItemStatus = 'inProgress' | 'completed' | 'failed' | 'declined'

/** How a patch touches one file. */
export type HarnessFileChangeKind = 'add' | 'delete' | 'update'

/** One file touched by a patch. */
export interface HarnessFileUpdateChange {
  path: string
  kind: HarnessFileChangeKind
}

/** Task text the user submitted. */
export interface HarnessUserMessageItem {
  id: string
  type: 'userMessage'
  text: string
}

/** Assistant prose reply. */
export interface HarnessAgentMessageItem {
  id: string
  type: 'agentMessage'
  text: string
}

/** Reasoning summary shown above the answer. */
export interface HarnessReasoningItem {
  id: string
  type: 'reasoning'
  text: string
}

/** Shell command run by the workflow. */
export interface HarnessCommandExecutionItem {
  id: string
  type: 'commandExecution'
  command: string
  cwd: string
  status: HarnessItemStatus
  aggregatedOutput: string
  exitCode: number | null
}

/** Patch applied to local files. */
export interface HarnessFileChangeItem {
  id: string
  type: 'fileChange'
  changes: HarnessFileUpdateChange[]
  status: HarnessItemStatus
  /** Unified diff text when the host can supply one. */
  diff: string | null
}

/** Third-party MCP tool call (never Workbench). */
export interface HarnessMcpToolCallItem {
  id: string
  type: 'mcpToolCall'
  server: string
  tool: string
  status: HarnessItemStatus
  /** JSON arguments sent to the tool. */
  arguments: string
  /** Text or JSON returned by the tool. */
  result: string
  /** Provider error detail when the call failed. */
  error: string
  /** Total tool duration reported by the workflow. */
  durationMs: number | null
}

/** First-party Workbench call over the signed-in session (CRM, mail, calendar). */
export interface HarnessCrmToolCallItem {
  id: string
  type: 'crmToolCall'
  tool: string
  summary: string
  status: HarnessItemStatus
  /** JSON arguments sent to the first-party tool. */
  arguments: string
  /** Text, JSON, or media reference returned by the tool. */
  result: string
  /** Total tool duration reported by the workflow. */
  durationMs: number | null
}

/** One visible action inside a Computer Use tool call. */
export interface HarnessComputerUseStepItem {
  id: string
  type: 'computerUseStep'
  parentId: string
  step: number
  action: string
  reason: string
  status: HarnessItemStatus
  /** Compact JPEG preview captured immediately before this action. */
  screenshotDataUrl: string
}

/** One provider/model seat in a multi-model deliberation. */
export interface HarnessDeliberationModel {
  provider: string
  modelId: string
  label: string
  effort: string | null
}

/** User-selected multi-model deliberation configuration. */
export interface HarnessDeliberationConfig {
  participants: HarnessDeliberationModel[]
  finalizer: HarnessDeliberationModel
}

/** One model's independent proposal and cross-review result. */
export interface HarnessDeliberationContribution extends HarnessDeliberationModel {
  proposal: string
  review: string
  error: string
}

/** Collapsible source material produced before the unique final response. */
export interface HarnessDeliberationItem {
  id: string
  type: 'deliberation'
  status: HarnessItemStatus
  contributions: HarnessDeliberationContribution[]
  finalizerLabel: string
}

/** Non-fatal error surfaced inside the transcript. */
export interface HarnessErrorItem {
  id: string
  type: 'error'
  message: string
}

/** Any transcript row. */
export type HarnessItem =
  | HarnessUserMessageItem
  | HarnessAgentMessageItem
  | HarnessReasoningItem
  | HarnessCommandExecutionItem
  | HarnessFileChangeItem
  | HarnessMcpToolCallItem
  | HarnessCrmToolCallItem
  | HarnessComputerUseStepItem
  | HarnessDeliberationItem
  | HarnessErrorItem

/** Whether a turn is running, done, or stopped. */
export type HarnessTurnStatus = 'idle' | 'running' | 'completed' | 'failed' | 'interrupted'

/** Connection and authorization state reported by Codex for one MCP server. */
export interface HarnessMcpServerStatus {
  name: string
  runtimeStatus: string | null
  authStatus: string
}

/** One local path selected from the composer. */
export interface HarnessComposerAttachment {
  path: string
  kind: 'file' | 'folder'
}

/** One `@` plugin mention sent with a turn. */
export interface HarnessComposerMention {
  name: string
  /** Codex path such as `app://gmail`, or empty for text-only mentions. */
  path: string
}

/** Optional behavior applied to one turn. */
export interface HarnessStartTurnExtras {
  wakeJobId?: string
  attachments?: HarnessComposerAttachment[]
  mentions?: HarnessComposerMention[]
  goal?: string | null
  planMode?: boolean
  /** Writes HTML and Markdown deliverables into the workspace `canvas/` folder. */
  canvasMode?: boolean
  /** Catalog-clamped reasoning effort sent as Codex `turn/start.effort`. */
  effort?: string | null
}

/** Which kind of action is waiting for the user. */
export type HarnessApprovalKind = 'commandExecution' | 'fileChange' | 'computerUse' | 'sendMail'

/** Safe mail details displayed before a send is released. */
export interface HarnessMailApprovalSummary {
  to: string[]
  cc: string[]
  subject: string
  snippet: string
  attachments: string[]
}

/** Pending approval raised mid-turn by the workflow. */
export interface HarnessApprovalRequest {
  requestId: string
  kind: HarnessApprovalKind
  itemId: string
  /** Reason the workflow gave for needing approval. */
  reason: string | null
  /** Present for `commandExecution`. */
  command: string | null
  /** Present for `commandExecution`. */
  cwd: string | null
  /** Present for `fileChange`. */
  changes: HarnessFileUpdateChange[] | null
  /** Sensitive Computer Use action waiting for confirmation. */
  computerAction: string | null
  /** Screenshot shown with a sensitive Computer Use confirmation. */
  screenshotDataUrl: string | null
  /** Mail summary shown for mandatory send confirmation. */
  mail: HarnessMailApprovalSummary | null
}

/** One display or native window available to Computer Use. */
export interface HarnessComputerTarget {
  id: string
  kind: 'display' | 'window'
  label: string
}

/** One direct child in the embedded workspace file browser. */
export interface HarnessWorkspaceEntry {
  name: string
  relativePath: string
  kind: 'directory' | 'file'
  size: number
}

/** Text preview returned for one workspace file. */
export interface HarnessWorkspaceFile {
  relativePath: string
  content: string
  binary: boolean
  truncated: boolean
}

/** Git working-tree snapshot shown in the embedded Review page. */
export interface HarnessReviewSnapshot {
  repository: boolean
  status: string
  summary: string
  diff: string
}

/** Renderer-side runtime contract for one selected marketplace tool. */
export interface HarnessActiveExpertConfig {
  id: string
  executorName: string
  name: string
  instructions: string
  outputMode: 'narrative' | 'table' | 'dashboard' | 'document'
  requiredConnectors: string[]
}

/** One real connector discovered through the Codex app directory. */
export interface HarnessAppConnector {
  id: string
  name: string
  description: string
  iconUrl: string
  installUrl: string
  accessible: boolean
  enabled: boolean
  installed: boolean
  callable: boolean
  toolNames: string[]
}

/** What the user chose for one pending approval. */
export type HarnessApprovalDecision = 'accept' | 'acceptForSession' | 'decline'

/** Events the runtime pushes into the renderer. */
export type HarnessEvent =
  | { type: 'snapshotReset' }
  | { type: 'threadStarted'; threadId: string }
  | { type: 'mcpStatus'; servers: HarnessMcpServerStatus[] }
  | { type: 'turnStarted'; turnId: string }
  | { type: 'itemStarted'; item: HarnessItem }
  | { type: 'itemUpdated'; item: HarnessItem }
  | { type: 'itemCompleted'; item: HarnessItem }
  | { type: 'approvalRequested'; request: HarnessApprovalRequest }
  | { type: 'approvalResolved'; requestId: string }
  | { type: 'turnCompleted' }
  | { type: 'turnFailed'; message: string }
  | { type: 'turnInterrupted' }

/**
 * Workflow backend for one Harness thread.
 * Phase 1 uses fixtures; phase 2 swaps in the local `codex app-server` host.
 */
export interface HarnessRuntime {
  /** Whether this runtime talks to a real workflow process. */
  readonly isLive: boolean
  /** Subscribes to runtime events; returns an unsubscribe function. */
  subscribe: (listener: (event: HarnessEvent) => void) => () => void
  /** Submits one task and starts a turn. */
  startTurn: (text: string, extras?: HarnessStartTurnExtras) => Promise<void>
  /** Starts the Codex-managed OAuth flow for one configured MCP server. */
  loginMcp: (name: string) => Promise<void>
  /** Lists hosted connectors from the signed-in Codex app directory. */
  listConnectors: (forceRefetch?: boolean) => Promise<HarnessAppConnector[]>
  /** Opens the provider-owned connector installation flow. */
  installConnector: (connectorId: string, installUrl: string) => Promise<void>
  /** Lists displays and native windows available for Computer Use. */
  listComputerTargets: () => Promise<HarnessComputerTarget[]>
  /** Requests cancellation of the in-flight turn. */
  interrupt: () => Promise<void>
  /** Answers a pending approval request. */
  respondToApproval: (requestId: string, decision: HarnessApprovalDecision) => Promise<void>
  /** Releases processes / timers. */
  dispose: () => void
}

/** Recurrence supported by the Scheduled view. */
export type HarnessScheduleKind = 'daily' | 'weekdays' | 'weekly'

/** Weekday keys for weekly schedules. */
export type HarnessWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/** When a scheduled job fires. */
export interface HarnessSchedule {
  kind: HarnessScheduleKind
  /** 24h `HH:MM` local time. */
  time: string
  /** Only meaningful for `weekly`. */
  days: HarnessWeekday[]
  /** IANA zone captured when the schedule is created. */
  timeZone?: string
}

/** Where a scheduled job runs. */
export type HarnessJobRuntimeTarget = 'vps' | 'thisPc'

/** Outcome of the last fire. */
export type HarnessJobLastStatus = 'ok' | 'failed' | 'waitingForThisPc'

/** One row in the Scheduled view. */
export interface HarnessScheduledJob {
  id: string
  name: string
  prompt: string
  schedule: HarnessSchedule
  /** `vps` runs with the laptop closed; `thisPc` waits for Electron. */
  target: HarnessJobRuntimeTarget
  paused: boolean
  nextRunAtMs: number | null
  lastRunAtMs: number | null
  lastStatus: HarnessJobLastStatus | null
  /** Latest server-side result or failure detail. */
  lastDigest?: string
}

/** Built-in office template offered when creating a job. */
export interface HarnessScheduleTemplate {
  id: 'dailyBrief' | 'weeklyReview' | 'followUpMonitor'
  schedule: HarnessSchedule
  target: HarnessJobRuntimeTarget
}
