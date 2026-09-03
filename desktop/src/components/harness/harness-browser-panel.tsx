/**
 * Native embedded browser page for the Harness utility workspace.
 */

import { useCallback } from 'react'
import { InAppBrowser } from '@/components/browser/InAppBrowser'

interface HarnessBrowserPanelProps {
  /** Whether the native browser view may be shown. */
  active: boolean
  /** Signed-in user id used by optional OA/ERP login support. */
  userId: string | null
}

/** Renders the Harness browser with a themed start page until a URL is opened. */
export function HarnessBrowserPanel({ active, userId }: HarnessBrowserPanelProps) {
  const ignoreTitleChange = useCallback((): void => undefined, [])

  return (
    <div className="min-h-0 flex-1" data-testid="harness-browser-page">
      <InAppBrowser
        tabId="browser:harness-utility"
        initialUrl="about:blank"
        active={active}
        userId={userId ?? ''}
        onTitleChange={ignoreTitleChange}
      />
    </div>
  )
}
