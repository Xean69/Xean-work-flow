import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { updateTenantLanguage } from '../portalApi.js'
import { SUPPORTED_LANGUAGES } from '../../i18n/languages.js'
import './Language.css'

function Language() {
  const { tenant, refreshTenant } = useOutletContext()
  const { t } = useTranslation('language')
  const [saving, setSaving] = useState(null)

  async function handleSelect(code) {
    if (code === tenant.language || saving) return
    setSaving(code)
    try {
      await updateTenantLanguage(code)
      await refreshTenant()
    } finally {
      setSaving(null)
    }
  }

  return (
    <div>
      <p className="portal-greeting" style={{ fontSize: 20 }}>
        {t('title')}
      </p>
      <p style={{ color: 'var(--slate)', fontSize: 14, marginTop: -8, marginBottom: 20 }}>{t('subtitle')}</p>

      <div className="portal-language-grid">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isCurrent = tenant.language === lang.code
          return (
            <button
              key={lang.code}
              type="button"
              className={'portal-language-card' + (isCurrent ? ' portal-language-card-active' : '')}
              onClick={() => handleSelect(lang.code)}
              disabled={!!saving}
            >
              <span>{lang.name}</span>
              {isCurrent && <span className="portal-language-current">{t('current')}</span>}
              {saving === lang.code && <span className="portal-language-current">{t('saving')}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Language
