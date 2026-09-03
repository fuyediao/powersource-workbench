import { Context, createContext, use } from 'react'
import { BaseConfig, Rule, RuleProvider } from 'tauri-plugin-mihomo-api'

import type { ProxyViewV1 } from '@/types/clash/proxy-view'

/**
 * Production code-splitting can evaluate this file in two chunks (Provider in
 * one, `useAppRefreshers` in another). A string key on `globalThis` keeps a
 * single context identity so Home cards still see `AppDataProvider`.
 */
const CLASH_APP_DATA_CONTEXTS_KEY = '__workbenchClashAppDataContexts'

export interface ProxiesContextType {
  proxyView: ProxyViewV1 | undefined
  isProxyViewPending: boolean
  isProxyViewError: boolean
}

export interface RulesContextType {
  rules: Rule[]
  ruleProviders: Record<string, RuleProvider | undefined>
}

export interface ClashConfigContextType {
  clashConfig: BaseConfig | undefined
  isClashConfigPending: boolean
}

export interface SystemContextType {
  sysproxy: any
  runningMode?: string
  isRunningModePending: boolean
  systemProxyAddress: string
}

export interface UptimeContextType {
  uptime: number
}

export interface CoreDataStatusContextType {
  isCoreDataPending: boolean
}

export interface RefreshersContextType {
  refreshProxy: () => Promise<unknown>
  refreshClashConfig: () => Promise<unknown>
  refreshRules: () => Promise<unknown>
  refreshSysproxy: () => Promise<unknown>
  refreshRuleProviders: () => Promise<unknown>
  refreshAll: () => Promise<unknown>
}

interface ClashAppDataContextBag {
  proxies: Context<ProxiesContextType | null>
  rules: Context<RulesContextType | null>
  clashConfig: Context<ClashConfigContextType | null>
  system: Context<SystemContextType | null>
  uptime: Context<UptimeContextType | null>
  coreDataStatus: Context<CoreDataStatusContextType | null>
  refreshers: Context<RefreshersContextType | null>
}

/**
 * Returns the process-wide Clash app-data contexts, creating them once.
 * @returns Shared context objects for {@link AppDataProvider} and its hooks.
 */
function clashAppDataContexts(): ClashAppDataContextBag {
  const root = globalThis as typeof globalThis & {
    [CLASH_APP_DATA_CONTEXTS_KEY]?: ClashAppDataContextBag
  }
  const existing = root[CLASH_APP_DATA_CONTEXTS_KEY]
  if (existing) {
    return existing
  }
  const created: ClashAppDataContextBag = {
    proxies: createContext<ProxiesContextType | null>(null),
    rules: createContext<RulesContextType | null>(null),
    clashConfig: createContext<ClashConfigContextType | null>(null),
    system: createContext<SystemContextType | null>(null),
    uptime: createContext<UptimeContextType | null>(null),
    coreDataStatus: createContext<CoreDataStatusContextType | null>(null),
    refreshers: createContext<RefreshersContextType | null>(null),
  }
  root[CLASH_APP_DATA_CONTEXTS_KEY] = created
  return created
}

const clashAppDataContextBag = clashAppDataContexts()

export const ProxiesContext = clashAppDataContextBag.proxies
export const RulesContext = clashAppDataContextBag.rules
export const ClashConfigContext = clashAppDataContextBag.clashConfig
export const SystemContext = clashAppDataContextBag.system
export const UptimeContext = clashAppDataContextBag.uptime
export const CoreDataStatusContext = clashAppDataContextBag.coreDataStatus
export const RefreshersContext = clashAppDataContextBag.refreshers

const useCtx = <T>(ctx: Context<T | null>, hookName: string): T => {
  const v = use(ctx)
  if (!v) throw new Error(`${hookName} must be used within AppDataProvider`)
  return v
}

export const useProxiesData = (): ProxiesContextType =>
  useCtx(ProxiesContext, 'useProxiesData')

export const useRulesData = () => {
  const { rules, ruleProviders } = useCtx(RulesContext, 'useRulesData')

  return {
    rules,
    ruleProviders: ruleProviders as Record<string, RuleProvider>,
  }
}

export const useClashConfigData = (): ClashConfigContextType =>
  useCtx(ClashConfigContext, 'useClashConfigData')

export const useSystemData = (): SystemContextType =>
  useCtx(SystemContext, 'useSystemData')

export const useUptimeData = (): UptimeContextType =>
  useCtx(UptimeContext, 'useUptimeData')

export const useAppRefreshers = (): RefreshersContextType =>
  useCtx(RefreshersContext, 'useAppRefreshers')

export const useCoreDataStatus = (): CoreDataStatusContextType =>
  useCtx(CoreDataStatusContext, 'useCoreDataStatus')
