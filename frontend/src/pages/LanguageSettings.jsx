import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import { updateAdminLanguage, updateAdminPushPreference } from '../api/client.js'
import { SUPPORTED_LANGUAGES } from '../i18n/languages.js'
import './LanguageSettings.css'

function LanguageSettings() {
  const { admin, refreshAdmin } = useOutletContext()
  const { t } = useTranslation('language')
  const [saving, setSaving] = useState(null) // language code currently being saved, or null
  const [savingPushPref, setSavingPushPref] = useState(false)

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

  async function handleTogglePushPreference() {
    setSavingPushPref(true)
    try {
      await updateAdminPushPreference(!admin.push_notify_other)
      await refreshAdmin()
    } finally {
      setSavingPushPref(false)
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

        <h3 style={{ marginTop: 32, marginBottom: 4 }}>{t('notifications.title')}</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={admin.push_notify_other}
            onChange={handleTogglePushPreference}
            disabled={savingPushPref}
          />
          {t('notifications.otherLabel')}
        </label>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 6, maxWidth: 480 }}>
          {t('notifications.otherNote')}
        </p>
      </div>
    </div>
  )
}

export default LanguageSettings
