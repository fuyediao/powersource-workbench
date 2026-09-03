import { useCallback } from 'react'
import { useAiModelAllowlist } from '@/hooks/use-ai-model-allowlist'
import { isAiVendorEnabled } from '@/utils/settings/ai-model-allowlist'

/**
 * Desktop allowlist check for vendor-only pickers (customer / KOL insight,
 * T&E review) that pick a vendor slug (`gemini`, `chatgpt`, `claude`, `grok`)
 * rather than a specific catalog model id. A vendor is usable when at least
 * one of its catalog models is enabled in Settings → AI → Models.
 * @returns Predicate: vendor slug -> whether at least one of its models is enabled.
 */
export function useEnabledAiVendors(): (vendor: string) => boolean {
  const { overrides } = useAiModelAllowlist()
  return useCallback((vendor: string) => isAiVendorEnabled(vendor, overrides), [overrides])
}
