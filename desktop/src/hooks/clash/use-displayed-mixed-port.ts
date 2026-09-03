import { use } from 'react'
import { useClashInfo, useRuntimeConfig } from '@/hooks/clash/use-clash'
import { useVerge } from '@/hooks/clash/use-verge'
import { ClashConfigContext } from '@/providers/clash/app-data-context'
import { resolveDisplayedMixedPort } from '@/utils/clash/mixed-port'

/**
 * Mixed port shown in Clash Home, system-proxy UI, and GeoCRM Settings.
 * Uses live Mihomo config when `AppDataProvider` is mounted; otherwise falls
 * back to runtime YAML, verge.yaml, and clash info (Settings is outside the
 * Clash island tree).
 * @returns A valid TCP port in 1–65535, defaulting to 7897.
 */
export const useDisplayedMixedPort = () => {
  const clashConfig = use(ClashConfigContext)?.clashConfig
  const { data: runtimeConfig } = useRuntimeConfig()
  const { clashInfo } = useClashInfo()
  const { verge } = useVerge()

  return resolveDisplayedMixedPort({
    live: clashConfig?.mixedPort,
    runtime: runtimeConfig?.['mixed-port'],
    selected: verge?.verge_mixed_port,
    merge: clashInfo?.mixed_port,
  })
}
