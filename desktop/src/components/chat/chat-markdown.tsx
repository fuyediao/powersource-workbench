import {
  useEffect,
  useMemo,
  useRef,
  type MouseEventHandler,
} from 'react'

import { useLinkOpen } from '@/hooks/link-open-context'
import {
  renderChatMarkdown,
  type ChatCodeToolbarI18n,
} from '@/utils/chat/chat-markdown'
import { enhanceChatMarkdown } from '@/utils/chat/enhance-chat-markdown'

export interface ChatMarkdownProps {
  /** Raw assistant markdown */
  content: string
  /** Localized code-block toolbar labels */
  toolbar: ChatCodeToolbarI18n
  /** Extra classes on the host */
  className?: string
  /** Bubbles code-toolbar clicks (copy / download) */
  onClick?: MouseEventHandler<HTMLDivElement>
}

/**
 * Runs the built-in copy or download action for a rendered code block.
 * @param target - Clicked element inside the Markdown host.
 * @returns Whether a code-block action handled the click.
 */
function runDefaultCodeBlockAction(target: Element): boolean {
  const button = target.closest<HTMLElement>('[data-chat-code-action]')
  if (!button) return false

  const action = button.dataset.chatCodeAction
  const code = button.closest('.chat-code-block')?.querySelector('pre code')?.textContent ?? ''
  if (!action) return false

  if (action === 'copy') {
    void navigator.clipboard.writeText(code)
    return true
  }

  if (action === 'download') {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/plain;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `snippet-${Date.now()}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
    return true
  }

  return false
}

/**
 * Renders assistant markdown to HTML, then runs Aura preview enhancers
 * (syntax highlight, Mermaid, ECharts, KaTeX, …) on the mounted DOM.
 * Link / linked-image clicks use Settings “Open links” (in-app browser chrome).
 *
 * @param props - Content and toolbar options
 * @returns Chat markdown host element
 */
export function ChatMarkdown({ content, toolbar, className, onClick }: ChatMarkdownProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { openUrl } = useLinkOpen()
  const { copy, download, plain } = toolbar

  const html = useMemo(
    () => renderChatMarkdown(content, { copy, download, plain }),
    [content, copy, download, plain],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    void enhanceChatMarkdown(host)
      .catch((error: unknown) => {
        console.error('[chat] Markdown enhancement failed:', error)
      })
      .finally(() => {
        if (cancelled) return
      })
    return () => {
      cancelled = true
    }
  }, [content, html])

  /**
   * Handles code-toolbar actions and http(s) link navigation.
   *
   * @param event - Click inside the markdown host
   */
  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    onClick?.(event)
    if (event.defaultPrevented) return

    const target = event.target
    if (!(target instanceof Element)) return

    if (runDefaultCodeBlockAction(target)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    const anchor = target.closest('a')
    if (!(anchor instanceof HTMLAnchorElement)) return

    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (!href || href.startsWith('#')) return

    // Resolve relative hrefs against the page (rare in chat).
    let absolute = href
    try {
      absolute = new URL(href, window.location.href).href
    } catch {
      return
    }

    if (!absolute.startsWith('https:') && !absolute.startsWith('http:')) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    openUrl(absolute)
  }

  return (
    <div
      ref={hostRef}
      className={className}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
