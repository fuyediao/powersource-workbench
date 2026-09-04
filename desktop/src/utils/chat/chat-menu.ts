/**
 * Chat page bridge for the macOS native application menu (Mode + Model).
 */

export type ChatMenuProviderId = string

export type ChatMenuModelOption = {
  id: string
  label: string
}

export type ChatMenuProviderOption = {
  id: ChatMenuProviderId
  label: string
  configured: boolean
  models: ChatMenuModelOption[]
}

export type ChatMenuViewState = {
  thinkMode: 'quick' | 'think'
  provider: ChatMenuProviderId
  modelId: string
  providers: ChatMenuProviderOption[]
}

export type ChatMenuAction =
  | { type: 'set-think'; mode: 'quick' | 'think' }
  | { type: 'set-model'; provider: ChatMenuProviderId; modelId: string }

type ChatMenuHandlers = {
  setThinkMode?: (mode: 'quick' | 'think') => void
  setModel?: (provider: ChatMenuProviderId, modelId: string) => void
}

type SnapshotListener = () => void

const DEFAULT_VIEW: ChatMenuViewState = {
  thinkMode: 'quick',
  provider: 'gemini',
  modelId: 'gemini-3.1-pro-preview',
  providers: [],
}

let handlers: ChatMenuHandlers = {}
let snapshot: ChatMenuViewState = { ...DEFAULT_VIEW, providers: [] }
const snapshotListeners = new Set<SnapshotListener>()

/**
 * Returns whether two model rows match.
 * @param left - Current row
 * @param right - Candidate row
 * @returns True when id and label match
 */
function modelEquals(left: ChatMenuModelOption, right: ChatMenuModelOption): boolean {
  return left.id === right.id && left.label === right.label
}

/**
 * Returns whether two provider groups match.
 * @param left - Current group
 * @param right - Candidate group
 * @returns True when fields and models match
 */
function providerEquals(
  left: ChatMenuProviderOption,
  right: ChatMenuProviderOption,
): boolean {
  if (
    left.id !== right.id ||
    left.label !== right.label ||
    left.configured !== right.configured ||
    left.models.length !== right.models.length
  ) {
    return false
  }
  return left.models.every((model, index) => {
    const other = right.models[index]
    return other !== undefined && modelEquals(model, other)
  })
}

/**
 * Returns whether two Chat-menu snapshots are equivalent.
 * @param left - Current snapshot
 * @param right - Candidate snapshot
 * @returns True when every field matches
 */
function viewEquals(left: ChatMenuViewState, right: ChatMenuViewState): boolean {
  if (
    left.thinkMode !== right.thinkMode ||
    left.provider !== right.provider ||
    left.modelId !== right.modelId ||
    left.providers.length !== right.providers.length
  ) {
    return false
  }
  return left.providers.every((provider, index) => {
    const other = right.providers[index]
    return other !== undefined && providerEquals(provider, other)
  })
}

/**
 * Notify Chat-menu snapshot subscribers.
 * @returns Nothing
 */
function emitSnapshot(): void {
  snapshotListeners.forEach((listener) => listener())
}

/**
 * Latest Chat menu snapshot for the macOS application menu.
 * @returns View state
 */
export function getChatMenuSnapshot(): ChatMenuViewState {
  return snapshot
}

/**
 * Subscribe to Chat menu snapshot changes.
 * @param listener - Callback when radios or catalog change
 * @returns Unsubscribe function
 */
export function subscribeChatMenuSnapshot(listener: SnapshotListener): () => void {
  snapshotListeners.add(listener)
  return () => {
    snapshotListeners.delete(listener)
  }
}

/**
 * Merges live Chat-menu radios and catalog.
 * @param patch - Fields to update
 * @returns Nothing
 */
export function setChatMenuView(patch: Partial<ChatMenuViewState>): void {
  const next: ChatMenuViewState = {
    ...snapshot,
    ...patch,
    providers: patch.providers
      ? patch.providers.map((row) => ({
          ...row,
          models: row.models.map((model) => ({ ...model })),
        }))
      : snapshot.providers,
  }
  if (viewEquals(snapshot, next)) {
    return
  }
  snapshot = next
  emitSnapshot()
}

/**
 * Merges Chat-menu command handlers from the Chat page.
 * @param next - Handler patch
 * @returns Nothing
 */
export function patchChatMenuHandlers(next: ChatMenuHandlers): void {
  handlers = { ...handlers, ...next }
}

/**
 * Clears Chat-menu handlers and snapshot when the Chat page unmounts.
 * @returns Nothing
 */
export function unregisterChatMenuHost(): void {
  handlers = {}
  const empty: ChatMenuViewState = { ...DEFAULT_VIEW, providers: [] }
  if (viewEquals(snapshot, empty)) {
    return
  }
  snapshot = empty
  emitSnapshot()
}

/**
 * Runs a native Chat menu command.
 * @param action - Menu action
 * @returns Nothing
 */
export function dispatchChatMenuAction(action: ChatMenuAction): void {
  switch (action.type) {
    case 'set-think':
      handlers.setThinkMode?.(action.mode)
      return
    case 'set-model':
      handlers.setModel?.(action.provider, action.modelId)
      return
    default:
      return
  }
}
