import { useCallback, useEffect, useState } from 'react'
import {
  getAiModelAllowlistSnapshot,
  loadAiModelAllowlist,
  setAiModelAllowlistEnabled,
  subscribeAiModelAllowlist,
} from '@/utils/settings/ai-model-allowlist'

/**
 * Subscribes to the desktop AI model allowlist (Settings → AI → Models).
 * Every surface using this hook re-renders live when a toggle changes
 * anywhere in the app, without needing a page reload.
 * @returns Current overrides plus setter and manual refresh.
 */
export function useAiModelAllowlist() {
  const [overrides, setOverrides] = useState<Map<string, boolean>>(getAiModelAllowlistSnapshot)

  useEffect(() => {
    void loadAiModelAllowlist()
    return subscribeAiModelAllowlist(() => {
      setOverrides(getAiModelAllowlistSnapshot())
    })
  }, [])

  const setEnabled = useCallback(
    (provider: string, modelId: string, enabled: boolean): Promise<void> =>
      setAiModelAllowlistEnabled(provider, modelId, enabled),
    [],
  )

  const refresh = useCallback((): Promise<Map<string, boolean>> => loadAiModelAllowlist(true), [])

  return { overrides, setEnabled, refresh }
}
