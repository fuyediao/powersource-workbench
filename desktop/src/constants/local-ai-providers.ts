import type { AiProviderDto } from '@/services/ai-api'

/** Local runtime provider ids (Electron-only; not on VPS registry). */
export const LOCAL_AI_PROVIDER_IDS = ['ollama', 'lmstudio', 'llamacpp'] as const

export type LocalAiProviderId = (typeof LOCAL_AI_PROVIDER_IDS)[number]

/** Catalog row for a local AI runtime. */
export type LocalAiProviderDto = AiProviderDto & {
  isLocal: true
  authOptional: true
}

/**
 * Returns true when the id is a local AI runtime.
 * @param id - Provider id.
 * @returns Whether local.
 */
export function isLocalAiProviderId(id: string): boolean {
  return (LOCAL_AI_PROVIDER_IDS as readonly string[]).includes(id)
}

/**
 * Cherry-style local providers (Electron talks to localhost directly).
 * Ollama uses native `/api/tags`; LM Studio and llama-server use OpenAI `/v1/models`.
 */
export const LOCAL_AI_PROVIDERS: LocalAiProviderDto[] = [
  {
    id: 'ollama',
    nameEn: 'Ollama',
    apiStyle: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    modelsPath: '/api/tags',
    pingModelId: '',
    isLocal: true,
    authOptional: true,
  },
  {
    id: 'lmstudio',
    nameEn: 'LM Studio',
    apiStyle: 'openai',
    baseUrl: 'http://127.0.0.1:1234',
    modelsPath: '/v1/models',
    pingModelId: '',
    isLocal: true,
    authOptional: true,
  },
  {
    id: 'llamacpp',
    nameEn: 'llama.cpp',
    apiStyle: 'openai',
    baseUrl: 'http://127.0.0.1:8080',
    modelsPath: '/v1/models',
    pingModelId: '',
    isLocal: true,
    authOptional: true,
  },
]

/**
 * Looks up a local provider definition.
 * @param id - Provider id.
 * @returns Local DTO or undefined.
 */
export function getLocalAiProvider(id: string): LocalAiProviderDto | undefined {
  return LOCAL_AI_PROVIDERS.find((p) => p.id === id)
}
