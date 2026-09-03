/**
 * Shared chat module: types, engine, history helpers.
 */

export * from './chat-types'
export {
  runSendMessage,
  getSystemInstructionForMode,
} from './chat-engine'
export type { ChatModeType } from './chat-engine'
export { buildHistoryInput } from './chat-history'
export {
  ELECTRON_FALLBACK_MODELS,
  AI_PROVIDER_ORDER,
  groupAiModelsByProvider,
  loadElectronAiModelSelection,
  modelLabelKey,
  providerLabelKey,
  providerDisplayName,
  providerKeyAliases,
  chatProviderIcon,
  resolveElectronAiSelection,
  saveElectronAiModelSelection,
} from './ai-model-catalog'
export type { AiCatalogModel } from './ai-model-catalog'
