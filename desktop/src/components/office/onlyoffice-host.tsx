/**
 * Embeds the OnlyOffice Document Server editor (`DocsAPI.DocEditor`) for one
 * `office_files` row. Loads the Document Server's own API script (its exact
 * URL comes from `workbench-api` `/office/session`) and mounts/destroys the
 * editor as `fileId` changes.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchOnlyOfficeSession,
  OfficeSessionError,
} from '@/services/office-session-api'
import { StatusLoading } from '@/components/common/status-loading'

interface DocEditorInstance {
  destroyEditor: () => void
}

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: Record<string, unknown>) => DocEditorInstance
    }
  }
}

const scriptLoadPromises = new Map<string, Promise<void>>()

/**
 * Loads (and caches) the Document Server's `api.js` script tag.
 * @param scriptUrl - Exact script URL returned by `/office/session`.
 * @returns Resolves once `window.DocsAPI` is available.
 */
function loadDocsApiScript(scriptUrl: string): Promise<void> {
  const cached = scriptLoadPromises.get(scriptUrl)
  if (cached) {
    return cached
  }
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${scriptUrl}"]`)
    if (existing && window.DocsAPI) {
      resolve()
      return
    }
    const script = existing instanceof HTMLScriptElement ? existing : document.createElement('script')
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('onlyoffice_script_failed')), { once: true })
    if (!existing) {
      script.src = scriptUrl
      script.async = true
      document.head.appendChild(script)
    }
  })
  scriptLoadPromises.set(scriptUrl, promise)
  return promise
}

export interface OnlyOfficeHostProps {
  /** `office_files.id`, or null to show the empty state. */
  fileId: string | null
  /** OnlyOffice `editorConfig.lang`. */
  lang: string
}

/**
 * Mounts the OnlyOffice editor for one file id; shows loading/error/empty
 * states while offline, unauthenticated, or the Document Server is down.
 * @param props - Active file id and editor language.
 * @returns OnlyOffice host pane.
 */
export function OnlyOfficeHost({ fileId, lang }: OnlyOfficeHostProps) {
  const { t } = useTranslation()
  const reactId = useId()
  const containerId = `onlyoffice-host-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<DocEditorInstance | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!fileId) {
      editorRef.current?.destroyEditor()
      editorRef.current = null
      host?.replaceChildren()
      setStatus('idle')
      return
    }
    if (!host) {
      return
    }

    const mount = document.createElement('div')
    mount.id = containerId
    mount.style.width = '100%'
    mount.style.height = '100%'
    host.replaceChildren(mount)

    let cancelled = false
    setStatus('loading')
    setErrorMessage(null)

    void (async () => {
      try {
        const session = await fetchOnlyOfficeSession(fileId, lang)
        await loadDocsApiScript(session.docServerUrl)
        if (cancelled) {
          return
        }
        if (!window.DocsAPI) {
          throw new Error('onlyoffice_unavailable')
        }
        editorRef.current?.destroyEditor()
        editorRef.current = new window.DocsAPI.DocEditor(containerId, session.config)
        setStatus('ready')
      } catch (error) {
        if (cancelled) {
          return
        }
        console.error('[onlyoffice-host]', error)
        setErrorMessage(
          error instanceof OfficeSessionError
            ? error.message
            : t('office.host.loadFailed'),
        )
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      try {
        editorRef.current?.destroyEditor()
      } catch (error) {
        console.warn('[onlyoffice-host] destroy:', error)
      }
      editorRef.current = null
      host.replaceChildren()
    }
    // containerId is stable for the lifetime of this component instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, lang, t])

  if (!fileId) {
    return (
      <div className="grid flex-1 place-items-center px-6 text-center">
        <p className="max-w-sm text-sm font-medium text-muted">{t('office.host.empty')}</p>
      </div>
    )
  }

  return (
    <div className="relative min-h-0 flex-1">
      {status === 'loading' ? (
        <div className="absolute inset-0 z-10 bg-canvas">
          <StatusLoading />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas px-6 text-center text-sm font-medium text-rose-500">
          {errorMessage}
        </div>
      ) : null}
      <div ref={hostRef} className="size-full" />
    </div>
  )
}
