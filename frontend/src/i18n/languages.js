// The single list every language-aware part of the app reads from: the
// Language settings pages (manager + tenant), the i18n bootstrap below, and
// backend/src/utils/validate.js's SUPPORTED_LANGUAGES (duplicated there
// rather than shared, since frontend/backend are separate deploys — see
// that file's comment). Adding a 7th language means adding one entry here,
// widening the two backend CHECK constraints in schema.sql, and running
// backend/scripts/translate-locales.mjs for the new code.
//
// `name` is each language's own endonym (what a speaker of that language
// calls it) — a proper noun, not something to run through the translation
// pipeline, so it's hardcoded here rather than living in a JSON file.
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'pt', name: 'Português', dir: 'ltr' },
  { code: 'zh', name: '中文', dir: 'ltr' },
  { code: 'ar', name: 'العربية', dir: 'rtl' },
]

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((l) => l.code)

export function dirForLanguage(code) {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.dir || 'ltr'
}
