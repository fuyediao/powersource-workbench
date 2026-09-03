import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AuraEditor } from '@/components/aura/aura-editor'
import { ToastHost } from '@/components/aura/toast-host'
import { ImagePreviewOverlay } from '@/components/aura/image-preview-overlay'
import { HintPopup } from '@/components/aura/hint-popup'
import {
  ensureShellThemeSynced,
  subscribeShellTheme,
} from '@/utils/aura/content-theme'
import {
  getDocumentSession,
  subscribeDocumentSession,
} from '@/hooks/aura/document-store'
import { useAuraLibrary } from '@/hooks/aura/use-aura-library'
import '@/styles/aura-host.css'
import '@/styles/aura/editor.css'

export interface AuraPageProps {
  /** Auth user id when signed in (drives the cloud Personal/Group library). */
  userId?: string | null
}

/**
 * Workbench feature page for the Markdown editor (menubar, sidebar, document).
 * Preferences live under Settings → Aura.
 *
 * @param props - Signed-in user id.
 * @returns Editor host page.
 */
export function AuraPage({ userId = null }: AuraPageProps) {
  const { i18n } = useTranslation()
  useAuraLibrary(userId)
  const [session, setSession] = useState(() => getDocumentSession())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setReady(true)
  }, [])

  useEffect(() => {
    void i18n.language
  }, [i18n.language])

  useEffect(() => {
    return subscribeDocumentSession(() => {
      setSession(getDocumentSession())
    })
  }, [])

  useEffect(() => {
    /**
     * Keep editor chrome / code theme aligned with Settings Theme.
     */
    const syncShellTheme = (): void => {
      ensureShellThemeSynced()
    }
    syncShellTheme()
    return subscribeShellTheme(syncShellTheme)
  }, [])

  const title = session.dirty ? `${session.title} *` : session.title

  if (!ready) {
    return (
      <div className="aura-page flex h-dvh max-h-dvh flex-col overflow-hidden text-ink" />
    )
  }

  return (
    <div className="aura-page flex h-dvh max-h-dvh flex-col overflow-hidden text-ink">
      <div
        key={i18n.language}
        className="aura-workbench-host flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4"
      >
        <AuraEditor documentTitle={title} />
        <ToastHost />
        <ImagePreviewOverlay />
        <HintPopup />
      </div>
    </div>
  )
}
