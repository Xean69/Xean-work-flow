import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import HttpBackend from 'i18next-http-backend'
import { LANGUAGE_CODES } from './languages.js'

// Only the two nav namespaces load upfront (needed immediately, on both
// sides, before any page-specific content mounts) — every other namespace
// loads lazily the first time a page calls useTranslation(ns), the same
// on-demand pattern this app already uses for jspdf/exceljs. Translation
// JSON is fetched at runtime from /public/locales rather than bundled into
// the JS build, so the bundle size never grows as language count grows,
// and adding a language later is a content change, not a rebuild.
i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: LANGUAGE_CODES,
    ns: ['common', 'portal-common'],
    defaultNS: 'common',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: { escapeValue: false }, // React already escapes rendered output
    // No Suspense boundaries exist in this app yet — with useSuspense:false,
    // a component renders its fallback/key text for one tick while a new
    // namespace loads, then re-renders once it arrives, instead of the
    // whole app needing a <Suspense> wrapper. Acceptable brief flash for a
    // first pass; revisit if it's ever visible in practice.
    react: { useSuspense: false },
  })

export default i18n
