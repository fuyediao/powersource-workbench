/**
 * Probes the local Codex workflow host, collects the provider key the child
 * process needs, and pulls the VPS Hermes memory snapshot and skill index.
 *
 * Keys come from Settings → AI; Harness never signs in with a ChatGPT account.
 * Memory is read from the server, never from a local file.
 */

import { useCallback, useEffect, useState } from 'react'
import { resolveApiBaseUrl } from '@/config/deployment-urls'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { fetchAiKeys, readAiKeysFromLocalStorage } from '@/services/ai-keys-api'
import {
  fetchSkillIndex,
  fetchLibraryInstructions,
  formatSkillInstructions,
  isHarnessLibraryApiConfigured,
} from '@/services/harness-library-api'
import {
  fetchHarnessMemory,
  formatMemoryInstructions,
  isHarnessMemoryApiConfigured,
} from '@/services/harness-memory-api'
import {
  hydrateHarnessDevicePreferences,
  loadHarnessWorkFolder,
} from '@/utils/settings/harness-prefs'

export interface HarnessHostState {
  /** True once the probe finished. */
  isReady: boolean
  /** True when a pinned workflow binary is installed on this machine. */
  hostAvailable: boolean
  /** Provider key passed to the workflow process, when known. */
  apiKey: string | null
  /** Frozen memory snapshot plus skill index rendered as developer instructions. */
  developerInstructions: string | null
  /** Session JWT for main-process `/ai/harness/*` calls. */
  accessToken: string | null
  /** Public geocrm-api origin. */
  apiBaseUrl: string | null
  /** Working directory for local Codex turns. */
  cwd: string | null
  /** Re-probes the local workflow binary and reloads device preferences. */
  retry: () => void
}

/**
 * Reads the signed-in access token from the renderer Supabase client.
 * @returns JWT, or null when signed out.
 */
async function readAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    return null
  }
  return data.session?.access_token ?? null
}

/**
 * Loads workflow host availability, the provider key, memory, skills, and cwd.
 * @param userId - Signed-in user id, or null when unknown.
 * @returns Host state for the runtime factory.
 */
export function useHarnessHost(userId: string | null): HarnessHostState {
  const [probeVersion, setProbeVersion] = useState(0)
  const retry = useCallback((): void => setProbeVersion((value) => value + 1), [])
  const [state, setState] = useState<HarnessHostState>({
    isReady: false,
    hostAvailable: false,
    apiKey: null,
    developerInstructions: null,
    accessToken: null,
    apiBaseUrl: null,
    cwd: null,
    retry,
  })

  useEffect(() => {
    let cancelled = false

    void (async () => {
      await hydrateHarnessDevicePreferences()
      let hostAvailable = false
      try {
        const status = await window.geocrm?.harness?.status()
        hostAvailable = Boolean(status?.available)
      } catch {
        hostAvailable = false
      }

      let apiKey: string | null = readAiKeysFromLocalStorage().openai ?? null
      if (!apiKey && userId) {
        try {
          const keys = await fetchAiKeys(userId)
          apiKey = keys?.openai ?? null
        } catch {
          apiKey = null
        }
      }

      const sections: string[] = []
      if (isHarnessLibraryApiConfigured()) {
        try {
          const index = await fetchSkillIndex()
          const skills = formatSkillInstructions(index)
          if (skills) {
            sections.push(skills)
          }
          const library = await fetchLibraryInstructions()
          if (library) {
            sections.push(library)
          }
        } catch {
          // Skills are optional; a turn still runs without the index.
        }
      }
      if (isHarnessMemoryApiConfigured()) {
        try {
          const snapshot = await fetchHarnessMemory()
          const memory = formatMemoryInstructions(snapshot)
          if (memory) {
            sections.push(memory)
          }
        } catch {
          // Memory is optional; a turn still runs without a snapshot.
        }
      }

      const accessToken = await readAccessToken()
      const apiBaseUrl = resolveApiBaseUrl() || null
      let cwd = loadHarnessWorkFolder() || null
      if (!cwd) {
        try {
          cwd = (await window.geocrm?.harness?.defaultWorkFolder()) ?? null
        } catch {
          cwd = null
        }
      }

      if (!cancelled) {
        setState({
          isReady: true,
          hostAvailable,
          apiKey,
          developerInstructions: sections.length > 0 ? sections.join('\n\n') : null,
          accessToken,
          apiBaseUrl,
          cwd,
          retry,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [probeVersion, retry, userId])

  return state
}
