import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HarnessPage } from '@/pages/harness-page'
import { useAuth } from '@/hooks/use-auth'
import { useAppearance } from '@/hooks/use-appearance'
import { LinkOpenProvider } from '@/hooks/link-open-context'
import { isAgentOverlayFallbackChord } from '@/utils/agent-overlay/agent-overlay-shortcut'
import { applyAppearanceFromLocalStorage } from '@/utils/appearance/sync-appearance-storage'
import { StatusLoading } from '@/components/common/status-loading'

/**
 * Hides the Agent overlay BrowserWindow.
 * @returns Nothing.
 */
function hideAgentOverlayWindow(): void {
  void window.workbench?.agentOverlay?.hide?.()
}

/**
 * Dedicated always-on-top Agent overlay (hash `#agent`).
 * Compact Harness transcript + composer, Chrome Gemini-style.
 * @returns Overlay page tree.
 */
export default function AgentOverlayPage() {
  const { t } = useTranslation()
  const auth = useAuth()
  const userId = auth.session?.user?.id ?? null
  useAppearance(userId)

  const nativeTrafficLights = Boolean(window.workbench?.window?.usesNativeApplicationMenu)

  useEffect(() => {
    document.documentElement.classList.add('agent-overlay-window')
    if (!nativeTrafficLights) {
      document.documentElement.classList.add('agent-overlay-frameless')
      document.body.classList.add('bg-transparent')
    }
    return () => {
      document.documentElement.classList.remove('agent-overlay-window')
      document.documentElement.classList.remove('agent-overlay-frameless')
      document.body.classList.remove('bg-transparent')
    }
  }, [nativeTrafficLights])

  useEffect(() => {
    return window.workbench?.agentOverlay?.onShown?.(() => {
      applyAppearanceFromLocalStorage()
      window.setTimeout(() => {
        document.querySelector<HTMLTextAreaElement>('textarea')?.focus()
      }, 40)
    })
  }, [])

  useEffect(() => {
    /**
     * Hides the overlay on Escape, matching a compact pop-out.
     * @param event - Keyboard event.
     * @returns Nothing.
     */
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape' || event.repeat) {
        return
      }
      event.preventDefault()
      hideAgentOverlayWindow()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  useEffect(() => {
    let cancelled = false
    let removeKeyDown: (() => void) | undefined
    void window.workbench?.agentOverlay?.usesGlobalShortcut?.().then((usesGlobal) => {
      if (cancelled || usesGlobal) {
        return
      }
      const accelerator = window.workbench?.agentOverlay?.accelerator ?? 'Alt+G'
      /**
       * Overlay-window shortcut fallback when the OS blocks the global overlay chord.
       * @param event - Keyboard event.
       * @returns Nothing.
       */
      function handleChord(event: KeyboardEvent): void {
        if (!isAgentOverlayFallbackChord(event, accelerator)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        void window.workbench?.agentOverlay?.toggle?.()
      }
      window.addEventListener('keydown', handleChord, true)
      removeKeyDown = () => window.removeEventListener('keydown', handleChord, true)
    })
    return () => {
      cancelled = true
      removeKeyDown?.()
    }
  }, [])

  return (
    <LinkOpenProvider
      userId={userId}
      onOpenInApp={(url) => {
        void window.workbench?.spotlight?.openInMain?.(url)
        hideAgentOverlayWindow()
      }}
    >
      <div className={nativeTrafficLights ? 'h-dvh' : 'h-dvh bg-transparent p-2'}>
        <div
          className={
            nativeTrafficLights
              ? 'flex h-full overflow-hidden bg-(--canvas)'
              : 'flex h-full overflow-hidden rounded-2xl bg-(--canvas) shadow-2xl ring-1 ring-zinc-950/10 dark:ring-white/10'
          }
        >
          {auth.loading ? (
            <StatusLoading />
          ) : userId ? (
            <HarnessPage overlay userId={userId} />
          ) : (
            <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm font-medium text-muted">
              {t('agentOverlay.signIn')}
            </div>
          )}
        </div>
      </div>
    </LinkOpenProvider>
  )
}
