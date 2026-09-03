import { useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import '@/styles/clash-host.css'

const ClashVergeApp = lazy(async () => {
  const module = await import('@clash-verge/app')
  return { default: module.ClashVergeApp }
})

/**
 * Starts the Mihomo sidecar when the Clash tile is shown.
 */
function ensureSidecar(): void {
  void window.workbench?.clash?.invoke?.('ensureSidecar')
}

/**
 * Clash feature page: in-tree Clash Verge UI (Aura-style island in this renderer).
 * Hosts `src/pages/clash/app-host.tsx`.
 * @returns Full-bleed pane matching Admin chrome (sidebar + padded workspace),
 *   sized to the shell under the custom title bar (`h-full`, not `h-dvh`).
 */
export function ClashPage() {
  const { t } = useTranslation()

  useEffect(() => {
    ensureSidecar()
  }, [])

  return (
    <div
      className="clash-page feature-page relative h-full max-h-full min-h-0 overflow-hidden text-ink"
      aria-label={t('functions.apps.clash')}
    >
      <Suspense fallback={null}>
        <ClashVergeApp />
      </Suspense>
    </div>
  )
}
