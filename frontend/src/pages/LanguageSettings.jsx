import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import { updateAdminLanguage } from '../api/client.js'
import { SUPPORTED_LANGUAGES } from '../i18n/languages.js'
import './LanguageSettings.css'

function LanguageSettings() {
  const { admin, refreshAdmin } = useOutletContext()
  const { t } = useTranslation('language')
  const [saving, setSaving] = useState(null) // language code currently being saved, or null

  async function handleSelect(code) {
    if (code === admin.language || saving) return
    setSaving(code)
    try {
      await updateAdminLanguage(code)
      await refreshAdmin()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="content">
        <div className="language-grid">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isCurrent = admin.language === lang.code
            return (
              <button
                key={lang.code}
                type="button"
                className={'language-card' + (isCurrent ? ' language-card-active' : '')}
                onClick={() => handleSelect(lang.code)}
                disabled={!!saving}
              >
                <span className="language-name">{lang.name}</span>
                {isCurrent && <Badge variant="green">{t('current')}</Badge>}
                {saving === lang.code && <span className="language-saving">{t('saving')}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default LanguageSettings
