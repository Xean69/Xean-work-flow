import i18n from './index.js'
import { LANGUAGE_CODES, dirForLanguage } from './languages.js'

export const ADMIN_LANG_KEY = 'xean_admin_lang'
export const TENANT_LANG_KEY = 'xean_tenant_lang'

export function readCachedLanguage(storageKey) {
  try {
    return localStorage.getItem(storageKey)
  } catch {
    return null
  }
}

// Called both from main.jsx (once, synchronously, before the account's real
// language is known — see the FOUC note there) and from LocaleSync (once
// getMe()/portal getMe() resolves with the real value). document.dir is set
// independently of i18n.changeLanguage() finishing, since layout mirroring
// is pure CSS and shouldn't wait on a translation-file fetch — only the
// text itself needs to wait for that.
export function applyLanguage(language, storageKey) {
  const lang = LANGUAGE_CODES.includes(language) ? language : 'en'
  document.documentElement.lang = lang
  document.documentElement.dir = dirForLanguage(lang)
  i18n.changeLanguage(lang)
  if (storageKey) {
    try {
      localStorage.setItem(storageKey, lang)
    } catch {
      // localStorage can throw in private-browsing/storage-restricted
      // contexts — losing the FOUC-avoidance cache is harmless, so this is
      // a silent no-op rather than something worth surfacing.
    }
  }
}
