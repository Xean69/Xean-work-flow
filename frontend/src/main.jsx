import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './i18n/index.js'
import { applyLanguage, readCachedLanguage, ADMIN_LANG_KEY, TENANT_LANG_KEY } from './i18n/sync.js'
import App from './App.jsx'

// Applies the last-known language (and its dir attribute) before the first
// render, from a plain localStorage read — same FOUC concern the PWA
// manifest swap already solves for route-based switching (see App.jsx's
// ManifestSync), just for preference-based switching instead. This runs
// before React Router knows whether the visit is a manager or tenant
// session, so it checks both caches; LocaleSync reconciles with the
// account's real value once getMe() resolves.
applyLanguage(readCachedLanguage(ADMIN_LANG_KEY) || readCachedLanguage(TENANT_LANG_KEY) || 'en')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
