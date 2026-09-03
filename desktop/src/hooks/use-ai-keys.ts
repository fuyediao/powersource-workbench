import { useCallback, useEffect, useState } from 'react'
import {
  clearAiKeys,
  fetchAiKeys,
  getAiKey,
  readAiKeysFromLocalStorage,
  saveAiKeys,
  testAiKeyBrowser,
  writeAiKeysToLocalStorage,
  type AiKeysState,
  type AiModelKey,
} from '@/services/ai-keys-api'

/**
 * Manages AI provider API keys (localStorage + profiles write-through).
 * @param userId - Signed-in user id.
 * @returns Key state and actions.
 */
export function useAiKeys(userId: string | null | undefined) {
  const [keys, setKeys] = useState<AiKeysState>(() => readAiKeysFromLocalStorage())
  const [originalKeys, setOriginalKeys] = useState<AiKeysState>(() => readAiKeysFromLocalStorage())
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testingModel, setTestingModel] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<
    Record<string, { ok: boolean; message: string } | null>
  >({})

  useEffect(() => {
    if (!userId) {
      return
    }
    void (async () => {
      const loaded = await fetchAiKeys(userId)
      if (!loaded) {
        return
      }
      setKeys(loaded)
      setOriginalKeys(loaded)
      writeAiKeysToLocalStorage(loaded)
    })()
  }, [userId])

  /**
   * Updates one key in local state.
   * @param providerId - Provider id.
   * @param value - Key string.
   * @returns Nothing.
   */
  const setKey = useCallback((providerId: string, value: string) => {
    setKeys((prev) => {
      const next = { ...prev }
      const trimmed = value.trim()
      if (trimmed) {
        next[providerId] = value
      } else {
        delete next[providerId]
      }
      return next
    })
  }, [])

  /**
   * Saves all keys.
   * @returns Nothing.
   */
  const saveAll = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    const ok = await saveAiKeys(userId ?? undefined, keys)
    setIsSaving(false)
    if (!ok) {
      setSaveError('error')
      return
    }
    setOriginalKeys({ ...keys })
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }, [keys, userId])

  /**
   * Clears all keys.
   * @returns Nothing.
   */
  const clearAll = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    const ok = await clearAiKeys(userId ?? undefined)
    setKeys({})
    setOriginalKeys({})
    setIsSaving(false)
    if (!ok) {
      setSaveError('error')
      return
    }
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }, [userId])

  /**
   * Runs a browser connectivity probe for one legacy model.
   * @param model - Provider.
   * @returns Nothing.
   */
  const testConnection = useCallback(
    async (model: AiModelKey) => {
      setTestingModel(model)
      const result = await testAiKeyBrowser(model, getAiKey(keys, model))
      setTestResult((prev) => ({ ...prev, [model]: result }))
      setTestingModel(null)
    },
    [keys],
  )

  /**
   * Whether the key matches the last persisted non-empty value.
   * @param providerId - Provider id.
   * @returns Configured flag.
   */
  const isConfigured = useCallback(
    (providerId: string): boolean => {
      const cur = getAiKey(keys, providerId)
      return Boolean(cur) && cur === getAiKey(originalKeys, providerId)
    },
    [keys, originalKeys],
  )

  return {
    keys,
    setKey,
    saveAll,
    clearAll,
    testConnection,
    isConfigured,
    isSaving,
    saveSuccess,
    saveError,
    testingModel,
    testResult,
  }
}
