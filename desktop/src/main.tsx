import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/plus-jakarta-sans/latin-400.css'
import '@fontsource/plus-jakarta-sans/latin-500.css'
import '@fontsource/plus-jakarta-sans/latin-600.css'
import '@fontsource/plus-jakarta-sans/latin-700.css'
import { i18nReady } from '@/i18n'
import App from '@/app'
import '@/index.css'
import { applyTheme, loadTheme } from '@/utils/theme'

applyTheme(loadTheme())
void i18nReady.finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
