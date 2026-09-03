import { useEffect, useRef, type RefObject } from 'react'
import { openMailCompose } from '@/utils/mail/mail-compose-request'
import { openAppUrl } from '@/utils/shared/open-app-url'

interface MailBodyIframeProps {
  title: string
  srcDoc: string
  /** When set, exposes the iframe element (e.g. for print). */
  iframeRef?: RefObject<HTMLIFrameElement | null>
  className?: string
  /**
   * When true, the iframe fills its parent and scrolls inside.
   * When false, it uses a modest max height with internal scroll (quoted text).
   */
  fill?: boolean
}

/**
 * Resolves an anchor href to an absolute http(s) or mailto URL when safe.
 * @param raw - Attribute value from the mail body.
 * @returns Absolute URL, or empty when unsupported / relative-only.
 */
function resolveMailHref(raw: string): string {
  const href = raw.trim()
  if (!href || href.startsWith('#') || /^javascript:/i.test(href)) {
    return ''
  }
  if (/^mailto:/i.test(href)) {
    return href
  }
  if (/^https?:\/\//i.test(href)) {
    return href
  }
  if (href.startsWith('//')) {
    return `https:${href}`
  }
  return ''
}

/**
 * Opens a mail-body link via Settings preference (http/https) or in-app compose (mailto).
 * @param href - Absolute mailto or http(s) URL.
 * @returns Nothing.
 */
function openMailBodyLink(href: string): void {
  if (/^mailto:/i.test(href)) {
    const email = decodeURIComponent(href.replace(/^mailto:/i, '').split('?')[0] ?? '').trim()
    if (email) {
      openMailCompose({ to: email })
    }
    return
  }
  openAppUrl(href)
}

/**
 * Sandboxed mail body iframe. Prefer `fill` so the reading chrome stays fixed
 * and only the message HTML scrolls inside the frame.
 * Anchor clicks are intercepted so http(s) follows Settings link-open mode.
 * @param props - Document title, srcDoc, and optional external ref.
 * @returns Iframe element.
 */
export function MailBodyIframe({
  title,
  srcDoc,
  iframeRef,
  className,
  fill = false,
}: MailBodyIframeProps) {
  const localRef = useRef<HTMLIFrameElement | null>(null)

  useEffect(() => {
    const iframe = localRef.current
    if (!iframe) {
      return
    }
    const mountedIframe = iframe

    /**
     * Binds click interception on the iframe document after srcDoc loads.
     * @param element - Mounted mail body iframe.
     * @returns Cleanup that removes the listener.
     */
    function bindLinkInterceptor(
      element: HTMLIFrameElement,
    ): (() => void) | undefined {
      const doc = element.contentDocument
      if (!doc) {
        return undefined
      }

      /**
       * Intercepts primary / middle clicks on anchors.
       * @param event - Click or auxclick inside the mail document.
       * @returns Nothing.
       */
      function onActivate(event: MouseEvent): void {
        if (event.defaultPrevented) {
          return
        }
        if (event.button !== 0 && event.button !== 1) {
          return
        }
        const target = event.target
        if (!(target instanceof Element)) {
          return
        }
        const anchor = target.closest('a')
        if (!(anchor instanceof HTMLAnchorElement)) {
          return
        }
        const resolved = resolveMailHref(anchor.getAttribute('href') ?? '')
        if (!resolved) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        openMailBodyLink(resolved)
      }

      doc.addEventListener('click', onActivate, true)
      doc.addEventListener('auxclick', onActivate, true)
      return () => {
        doc.removeEventListener('click', onActivate, true)
        doc.removeEventListener('auxclick', onActivate, true)
      }
    }

    let cleanup = bindLinkInterceptor(mountedIframe)
    /**
     * Rebinds after each srcDoc paint.
     * @returns Nothing.
     */
    function onLoad(): void {
      cleanup?.()
      cleanup = bindLinkInterceptor(mountedIframe)
    }
    mountedIframe.addEventListener('load', onLoad)
    return () => {
      mountedIframe.removeEventListener('load', onLoad)
      cleanup?.()
    }
  }, [srcDoc])

  return (
    <iframe
      ref={(node) => {
        localRef.current = node
        if (iframeRef) {
          iframeRef.current = node
        }
      }}
      title={title}
      sandbox="allow-same-origin allow-modals"
      referrerPolicy="no-referrer"
      srcDoc={srcDoc}
      className={
        className ??
        (fill
          ? 'block h-full w-full rounded-xl border-0 bg-white'
          : 'block max-h-64 w-full rounded-xl border-0 bg-white')
      }
    />
  )
}
