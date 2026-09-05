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
import SpotlightPage from '@/pages/spotlight-page'
import {
  applyBootAppearance,
  enableAccentAnimationAfterPaint,
} from '@/utils/appearance/boot-appearance'

applyBootAppearance()
enableAccentAnimationAfterPaint()

/**
 * Which dedicated BrowserWindow route this renderer instance is.
 * @returns Spotlight hash, or the main app.
 */
function windowRoute(): 'spotlight' | 'app' {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === 'spotlight') {
    return 'spotlight'
  }
  return 'app'
}

const route = windowRoute()

if (route === 'spotlight') {
  document.documentElement.classList.add('spotlight-window')
}

void i18nReady
  .catch((error: unknown) => {
    console.error('[i18n] failed to initialize locale bundles', error)
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        {route === 'spotlight' ? <SpotlightPage /> : <App />}
      </StrictMode>,
    )
  })
