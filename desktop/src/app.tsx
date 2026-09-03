import { useCallback, useEffect, useState } from 'react'
import { SignedInShell } from '@/components/app/SignedInShell'
import { AskAiSidebar } from '@/components/ask-ai/AskAiSidebar'
import { MacStyleTitleBar } from '@/components/layout/MacStyleTitleBar'
import { RequiredAppUpdateGate } from '@/components/settings/required-app-update-gate'
import { isFeatureTabId, parseWorkbenchSearchTarget } from '@/constants/feature-tabs'
import { isBrowserTabId } from '@/utils/settings/link-open-preference'
import { LinkOpenProvider } from '@/hooks/link-open-context'
import { useApplicationMenu } from '@/hooks/use-application-menu'
import { useAuth } from '@/hooks/use-auth'
import { useEnsureLocalePrefixes } from '@/hooks/use-ensure-locale-prefixes'
import { useTitleTabs } from '@/hooks/use-title-tabs'
import { LoginPage } from '@/pages/login'
import { StatusLoading } from '@/components/common/status-loading'
import {
  isSettingsSection,
  persistSettingsSection,
} from '@/components/settings/settings-types'
import {
  openGeoCrmSettings,
  subscribeOpenSettingsRequest,
} from '@/utils/settings/settings-section-request'
import { subscribeOpenMailRequest } from '@/utils/mail/mail-compose-request'
import { subscribeOpenCalendarRequest } from '@/utils/calendar/calendar-event-request'
import { isAgentOverlayFallbackChord } from '@/utils/agent-overlay/agent-overlay-shortcut'
import { isSpotlightFallbackChord } from '@/utils/spotlight/spotlight-shortcut'
import { migrateLegacyOfficeWorkspace } from '@/office/office-workspace-legacy-migration'
import {
  parseAskAiSearchUrl,
  requestAskAiSearch,
  subscribeAskAiSearch,
} from '@/utils/ask-ai/ask-ai-search-request'

/**
 * Compact sign-in window: form only, no Home / tabs / Ask AI.
 * @returns Login window root.
 */
function LoginWindowApp() {
  const auth = useAuth()
  const customTitleBar = Boolean(window.workbench?.window?.usesCustomTitleBar)
  const signedIn = Boolean(auth.session?.user)
  const localeReady = useEnsureLocalePrefixes('home', [])

  useApplicationMenu({
    signedIn: false,
    screen: 'home',
    localeReady,
    onNavigate: () => undefined,
    onCloseTab: () => undefined,
  })

  useEffect(() => {
    document.documentElement.classList.toggle('has-custom-title-bar', customTitleBar)
    return () => {
      document.documentElement.classList.remove('has-custom-title-bar')
    }
  }, [customTitleBar])

  useEffect(() => {
    if (auth.loading) {
      return
    }
    void window.workbench?.auth.setSignedIn?.(signedIn)
  }, [auth.loading, signedIn])

  const body =
    auth.loading || !localeReady || signedIn ? (
      <div className="auth-gate h-full min-h-dvh bg-canvas">
        <StatusLoading />
      </div>
    ) : (
      <LoginPage
        error={auth.error}
        loading={auth.isActionLoading}
        onLogin={auth.login}
      />
    )

  return (
    <>
      <MacStyleTitleBar compactChrome />
      <div className={customTitleBar ? 'pt-10' : undefined}>
        <div className={`flex ${customTitleBar ? 'h-[calc(100dvh-2.5rem)]' : 'min-h-dvh'}`}>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{body}</div>
        </div>
      </div>
      <RequiredAppUpdateGate />
    </>
  )
}

/**
 * Parks native WebContentsView panes that would cover Home / other features.
 * @param screen - Title-bar screen being shown.
 */
function hideForeignNativePanes(screen: string): void {
  if (!isBrowserTabId(screen)) {
    void window.workbench?.browser?.invoke?.('hideAll')
  }
}

/**
 * Auth gate + caption overlay (Windows traffic lights / macOS hidden title bar).
 * Signed-in UI lives in {@link SignedInShell}.
 * @returns Main shell root.
 */
function MainWindowApp() {
  const auth = useAuth()
  const customTitleBar = Boolean(window.workbench?.window?.usesCustomTitleBar)
  const showHomeLauncher = window.workbench?.window?.showHomeLauncher !== false
  const signedIn = Boolean(auth.session?.user)
  const tabs = useTitleTabs(signedIn, showHomeLauncher)
  const localeReady = useEnsureLocalePrefixes(
    signedIn ? tabs.screen : 'home',
    signedIn ? tabs.openTabs : [],
  )
  const [askAiOpen, setAskAiOpen] = useState(false)
  const [tabReloadEpoch, setTabReloadEpoch] = useState<Record<string, number>>({})

  /**
   * Reloads a title-bar tab: in-app browser pages reload in place; Settings
   * and feature pages remount so their data is fetched again.
   * @param tabId - Tab to refresh.
   * @returns Nothing.
   */
  function reloadTitleBarTab(tabId: string): void {
    if (isBrowserTabId(tabId)) {
      void window.workbench?.browser?.invoke?.('reload', tabId)
      return
    }
    setTabReloadEpoch((prev) => ({ ...prev, [tabId]: (prev[tabId] ?? 0) + 1 }))
  }

  const openBrowserTab = useCallback(
    (url: string) => {
      tabs.openBrowserTab(url)
    },
    [tabs],
  )

  /**
   * Hides native browser panes immediately when leaving an in-app browser tab.
   * Must run synchronously on click — waiting for useEffect leaves WebContentsView covering Home.
   *
   * @param tabId - Title-bar tab being activated
   */
  const selectTab = useCallback(
    (tabId: Parameters<typeof tabs.selectTab>[0]): void => {
      hideForeignNativePanes(tabId)
      tabs.selectTab(tabId)
    },
    [tabs],
  )

  useApplicationMenu({
    signedIn,
    screen: tabs.screen,
    userId: auth.session?.user?.id ?? null,
    localeReady,
    onNavigate: (target) => {
      if (target === 'home') {
        if (showHomeLauncher) {
          selectTab('home')
        }
        return
      }
      if (target === 'settings') {
        hideForeignNativePanes('settings')
        tabs.openSettings()
        return
      }
      if (isFeatureTabId(target)) {
        hideForeignNativePanes(target)
        tabs.openFeature(target)
      }
    },
    onCloseTab: () => {
      if (tabs.screen !== 'home') {
        tabs.closeTab(tabs.screen)
      }
    },
  })

  /**
   * Closes a title-bar tab; hides browser panes when landing on Home / Settings / feature.
   *
   * @param tabId - Tab to close
   */
  const closeTab = useCallback(
    (tabId: Parameters<typeof tabs.closeTab>[0]): void => {
      const wasBrowser = isBrowserTabId(tabId)
      const wasActive = tabs.screen === tabId
      tabs.closeTab(tabId)
      if (wasBrowser && wasActive) {
        hideForeignNativePanes('home')
      }
    },
    [tabs],
  )

  useEffect(() => {
    document.documentElement.classList.toggle('has-custom-title-bar', customTitleBar)
    return () => {
      document.documentElement.classList.remove('has-custom-title-bar')
    }
  }, [customTitleBar])

  useEffect(() => {
    if (auth.loading) {
      return
    }
    void window.workbench?.auth.setSignedIn?.(signedIn)
  }, [auth.loading, signedIn])

  useEffect(() => {
    if (!signedIn) {
      setAskAiOpen(false)
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      hideForeignNativePanes('home')
      return
    }
    hideForeignNativePanes(tabs.screen)
  }, [signedIn, tabs.screen])

  useEffect(() => {
    if (!signedIn) {
      return
    }
    return subscribeOpenSettingsRequest(() => {
      hideForeignNativePanes('settings')
      tabs.openSettings()
    })
  }, [signedIn, tabs])

  useEffect(() => {
    if (!signedIn || !auth.session?.user.id) {
      return
    }
    void migrateLegacyOfficeWorkspace(auth.session.user.id)
  }, [signedIn, auth.session?.user.id])

  useEffect(() => {
    if (!signedIn) {
      return
    }
    return subscribeOpenMailRequest(() => {
      hideForeignNativePanes('mail')
      tabs.openFeature('mail')
    })
  }, [signedIn, tabs])

  useEffect(() => {
    if (!signedIn) {
      return
    }
    return subscribeOpenCalendarRequest(() => {
      hideForeignNativePanes('calendar')
      tabs.openFeature('calendar')
    })
  }, [signedIn, tabs])

  useEffect(() => {
    if (!signedIn) {
      return
    }
    return window.workbench?.window?.onOpenSettings?.((section) => {
      hideForeignNativePanes('settings')
      if (section && isSettingsSection(section)) {
        persistSettingsSection(section)
        openGeoCrmSettings(section)
        return
      }
      tabs.openSettings()
    })
  }, [signedIn, tabs])

  useEffect(() => {
    return window.workbench?.window?.onSignOut?.(() => {
      hideForeignNativePanes('home')
      void auth.signOut()
    })
  }, [auth])

  useEffect(() => {
    void window.workbench?.spotlight?.setEnabled?.(signedIn)
    void window.workbench?.agentOverlay?.setEnabled?.(signedIn)
    return () => {
      void window.workbench?.spotlight?.setEnabled?.(false)
      void window.workbench?.agentOverlay?.setEnabled?.(false)
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      return
    }

    let cancelled = false
    let removeKeyDown: (() => void) | undefined

    void window.workbench?.spotlight?.usesGlobalShortcut?.().then((usesGlobal) => {
      if (cancelled || usesGlobal) {
        // Main process owns the global shortcut — avoid a second toggle from the renderer.
        return
      }
      const accelerator = window.workbench?.spotlight?.accelerator ?? 'Alt+Space'
      /**
       * In-window shortcut fallback when the OS blocks the global shortcut.
       * @param event - Keyboard event.
       * @returns Nothing.
       */
      function handleKeyDown(event: KeyboardEvent): void {
        if (!isSpotlightFallbackChord(event, accelerator)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        void window.workbench?.spotlight?.toggle?.()
      }
      window.addEventListener('keydown', handleKeyDown, true)
      removeKeyDown = () => window.removeEventListener('keydown', handleKeyDown, true)
    })

    return () => {
      cancelled = true
      removeKeyDown?.()
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      return
    }

    let cancelled = false
    let removeKeyDown: (() => void) | undefined

    void window.workbench?.agentOverlay?.usesGlobalShortcut?.().then((usesGlobal) => {
      if (cancelled || usesGlobal) {
        return
      }
      const accelerator = window.workbench?.agentOverlay?.accelerator ?? 'Alt+G'
      /**
       * In-window shortcut fallback when the OS blocks the global overlay chord.
       * @param event - Keyboard event.
       * @returns Nothing.
       */
      function handleKeyDown(event: KeyboardEvent): void {
        if (!isAgentOverlayFallbackChord(event, accelerator)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        void window.workbench?.agentOverlay?.toggle?.()
      }
      window.addEventListener('keydown', handleKeyDown, true)
      removeKeyDown = () => window.removeEventListener('keydown', handleKeyDown, true)
    })

    return () => {
      cancelled = true
      removeKeyDown?.()
    }
  }, [signedIn])

  useEffect(() => {
    return subscribeAskAiSearch(() => {
      hideForeignNativePanes('chat')
      tabs.openFeature('chat')
    })
  }, [tabs])

  useEffect(() => {
    if (!signedIn) {
      return
    }
    return window.workbench?.spotlight?.onOpenInApp?.((url) => {
      const askQuery = parseAskAiSearchUrl(url)
      if (askQuery) {
        requestAskAiSearch(askQuery)
        return
      }
      const target = parseWorkbenchSearchTarget(url)
      if (target) {
        if (target.kind === 'home') {
          if (showHomeLauncher) {
            selectTab('home')
          }
          return
        }
        if (target.kind === 'settings') {
          hideForeignNativePanes('settings')
          tabs.openSettings()
          return
        }
        hideForeignNativePanes(target.id)
        tabs.openFeature(target.id)
        return
      }
      openBrowserTab(url)
    })
  }, [signedIn, openBrowserTab, selectTab, showHomeLauncher, tabs])

  let body
  if (auth.loading || (!signedIn && !localeReady)) {
    body = (
      <div className="auth-gate h-full min-h-dvh bg-canvas">
        <StatusLoading />
      </div>
    )
  } else if (!auth.session?.user) {
    body = (
      <div className="auth-gate h-full min-h-dvh bg-canvas">
        <StatusLoading />
      </div>
    )
  } else {
    body = (
      <SignedInShell
        user={auth.session.user}
        screen={tabs.screen}
        openTabs={tabs.openTabs}
        browserTabs={tabs.browserTabs}
        onOpenSettings={tabs.openSettings}
        onOpenFeature={tabs.openFeature}
        onBrowserTabTitle={tabs.setBrowserTabTitle}
        onSignOut={auth.signOut}
        tabReloadEpoch={tabReloadEpoch}
      />
    )
  }

  const shell = (
    <>
      <MacStyleTitleBar
        tabs={tabs.tabs}
        activeTabId={signedIn ? tabs.screen : undefined}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
        onReorderTabs={tabs.reorderTabs}
        onTearOffTab={(tabId, screenPoint) => {
          void tabs.beginTabTransfer(tabId, screenPoint)
        }}
        onOpenTabInNewWindow={(tabId) => {
          void tabs.openTabInNewWindow(tabId)
        }}
        onMoveTabToWindow={(tabId, windowId) => {
          void tabs.moveTabToWindow(tabId, windowId)
        }}
        onReloadTab={reloadTitleBarTab}
        showHome={signedIn && showHomeLauncher}
        showAskAi={signedIn}
        askAiOpen={askAiOpen}
        onAskAiClick={() => {
          setAskAiOpen((open) => !open)
        }}
      />
      <div className={customTitleBar ? 'pt-10' : undefined}>
        <div
          className={`flex ${
            customTitleBar ? 'h-[calc(100dvh-2.5rem)]' : 'min-h-dvh'
          }`}
        >
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{body}</div>
          {signedIn && auth.session ? (
            <AskAiSidebar
              open={askAiOpen}
              user={auth.session.user}
              pageLabel={tabs.tabs?.find((tab) => tab.id === tabs.screen)?.label ?? ''}
            />
          ) : null}
        </div>
      </div>
    </>
  )

  if (signedIn) {
    return (
      <LinkOpenProvider userId={auth.session?.user?.id ?? null} onOpenInApp={openBrowserTab}>
        {shell}
        <RequiredAppUpdateGate />
      </LinkOpenProvider>
    )
  }

  return (
    <>
      {shell}
      <RequiredAppUpdateGate />
    </>
  )
}

/**
 * Picks the compact login window or the main Workbench shell.
 * @returns Window root.
 */
export default function App() {
  if (window.workbench?.window?.isLoginWindow) {
    return <LoginWindowApp />
  }
  return <MainWindowApp />
}
