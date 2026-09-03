import '@/styles/clash/index.scss'

import { ResizeObserver } from '@juggle/resize-observer'
import { ComposeContextProvider } from 'foxact/compose-context-provider'
import { useEffect, useState, type ReactElement } from 'react'
import { I18nextProvider } from 'react-i18next'
import { RouterProvider } from 'react-router'
import { SWRConfig } from 'swr'
import { MihomoWebSocket } from 'tauri-plugin-mihomo-api'

import { BaseErrorBoundary } from '@/components/clash/base'
import { createClashRouter } from '@/pages/clash/_routers'
import { preloadHomePageCards } from '@/pages/clash/home'
import { AppDataProvider } from '@/providers/clash/app-data-provider'
import { WindowProvider } from '@/providers/clash/window'
import clashI18n, {
  FALLBACK_LANGUAGE,
  initializeLanguage,
} from '@/services/clash/i18n'
import {
  getPreloadConfig,
  preloadAppData,
  resolveThemeMode,
} from '@/services/clash/preload'
import { swrConfig } from '@/services/clash/query-client'
import {
  LoadingCacheProvider,
  ThemeModeProvider,
} from '@/services/clash/states'
import {
  consumePendingClashPath,
  subscribeClashPathRequest,
} from '@/utils/clash-page-request'

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = ResizeObserver
}

const clashRouter = createClashRouter(consumePendingClashPath() ?? '/')

/**
 * Clash Verge UI mounted inside the Workbench Clash tile (same renderer as Aura).
 * @returns Clash application tree.
 */
export function ClashVergeApp(): ReactElement {
  const [ready, setReady] = useState(false)
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    let cancelled = false
    const boot = async (): Promise<void> => {
      try {
        const { initialThemeMode } = await preloadAppData()
        void preloadHomePageCards()
        if (!cancelled) {
          setThemeMode(
            document.documentElement.classList.contains('dark')
              ? 'dark'
              : initialThemeMode,
          )
          setReady(true)
        }
      } catch (error) {
        console.error('[clash] bootstrap failed:', error)
        await initializeLanguage(FALLBACK_LANGUAGE).catch(() => undefined)
        if (!cancelled) {
          setThemeMode(resolveThemeMode(getPreloadConfig()))
          setReady(true)
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
      MihomoWebSocket.cleanupAll()
    }
  }, [])

  useEffect(() => {
    const pending = consumePendingClashPath()
    if (pending) {
      void clashRouter.navigate(pending)
    }
    return subscribeClashPathRequest((path) => {
      void clashRouter.navigate(path)
    })
  }, [])

  if (!ready) {
    return <div className="clash-verge-root h-full min-h-0 w-full" />
  }

  const contexts = [
    <ThemeModeProvider key="theme" initialState={themeMode} />,
    <LoadingCacheProvider key="loading" />,
  ]

  return (
    <div className="clash-verge-root h-full min-h-0 w-full overflow-hidden">
      <I18nextProvider i18n={clashI18n}>
        <ComposeContextProvider contexts={contexts}>
          <BaseErrorBoundary>
            <SWRConfig value={swrConfig}>
              <WindowProvider>
                <AppDataProvider>
                  <RouterProvider router={clashRouter} />
                </AppDataProvider>
              </WindowProvider>
            </SWRConfig>
          </BaseErrorBoundary>
        </ComposeContextProvider>
      </I18nextProvider>
    </div>
  )
}
