import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { updateTenantLanguage, updateTenantPushPreference, updateTenantTimezone } from '../portalApi.js'
import { SUPPORTED_LANGUAGES } from '../../i18n/languages.js'
import './Language.css'

// The full real IANA list, from the runtime itself — no hardcoded list to
// keep in sync (unlike the small closed set of SUPPORTED_LANGUAGES above).
const TIMEZONES = Intl.supportedValuesOf('timeZone')

function Language() {
  const { tenant, refreshTenant } = useOutletContext()
  const { t } = useTranslation('language')
  const [saving, setSaving] = useState(null)
  const [savingPushPref, setSavingPushPref] = useState(false)
  const [savingTimezone, setSavingTimezone] = useState(false)

  async function handleTimezoneChange(e) {
    setSavingTimezone(true)
    try {
      await updateTenantTimezone(e.target.value)
      await refreshTenant()
    } finally {
      setSavingTimezone(false)
    }
  }

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

  async function handleTogglePushPreference() {
    setSavingPushPref(true)
    try {
      await updateTenantPushPreference(!tenant.push_notify_other)
      await refreshTenant()
    } finally {
      setSavingPushPref(false)
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

      <p className="portal-greeting" style={{ fontSize: 16, marginTop: 32 }}>
        {t('notifications.title')}
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <input
          type="checkbox"
          checked={tenant.push_notify_other}
          onChange={handleTogglePushPreference}
          disabled={savingPushPref}
        />
        {t('notifications.otherLabel')}
      </label>
      <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 6 }}>{t('notifications.otherNote')}</p>

      <p className="portal-greeting" style={{ fontSize: 16, marginTop: 32 }}>
        Your timezone
      </p>
      <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: -4, marginBottom: 10 }}>
        Controls how message and repair-update timestamps are displayed for you — detected automatically the first
        time you logged in, editable anytime.
      </p>
      <select value={tenant.timezone || ''} onChange={handleTimezoneChange} disabled={savingTimezone}>
        {!tenant.timezone && <option value="">Not yet detected — using your browser's current timezone</option>}
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
    </div>
  )
}

export default Language
