import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-500.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import '@fontsource/plus-jakarta-sans/latin-800.css'
import { i18nReady } from '@/i18n'
import './index.css'
import App from './App'
import AgentOverlayPage from '@/pages/agent-overlay-page'
import SpotlightPage from '@/pages/spotlight-page'
import { HarnessPage } from '@/pages/harness-page'
import {
  applyBootAppearance,
  enableAccentAnimationAfterPaint,
} from '@/utils/appearance/boot-appearance'

applyBootAppearance()
enableAccentAnimationAfterPaint()

/**
 * Which dedicated BrowserWindow route this renderer instance is.
 * @returns Overlay hash, Spotlight hash, or the main app.
 */
function windowRoute(): 'spotlight' | 'agent' | 'app' {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === 'spotlight') {
    return 'spotlight'
  }
  if (hash === 'agent') {
    return 'agent'
  }
  return 'app'
}

const route = windowRoute()

if (route === 'spotlight') {
  document.documentElement.classList.add('spotlight-window')
}
if (route === 'agent') {
  document.documentElement.classList.add('agent-overlay-window')
  if (!window.geocrm?.window?.usesNativeApplicationMenu) {
    document.documentElement.classList.add('agent-overlay-frameless')
  }
}

void i18nReady
  .catch((error: unknown) => {
    console.error('[i18n] failed to initialize locale bundles', error)
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        {route === 'spotlight' ? (
          <SpotlightPage />
        ) : route === 'agent' ? (
          <AgentOverlayPage />
        ) : window.geocrm?.harness?.testMode ? (
          <HarnessPage />
        ) : (
          <App />
        )}
      </StrictMode>,
    )
  })
