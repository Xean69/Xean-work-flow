import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PageHeader from '../components/PageHeader.jsx'
import Badge from '../components/Badge.jsx'
import {
  updateAdminLanguage,
  updateAdminPushPreference,
  updateAdminTimezone,
  updateBusinessTimezone,
  getBackupRuns,
} from '../api/client.js'
import { SUPPORTED_LANGUAGES } from '../i18n/languages.js'
import './LanguageSettings.css'

// The full real IANA list, from the runtime itself — no hardcoded list to
// keep in sync (unlike the small closed set of SUPPORTED_LANGUAGES above).
const TIMEZONES = Intl.supportedValuesOf('timeZone')

function formatBytes(bytes) {
  if (bytes == null) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`
}

function LanguageSettings() {
  const { admin, refreshAdmin } = useOutletContext()
  const { t } = useTranslation('language')
  const [saving, setSaving] = useState(null) // language code currently being saved, or null
  const [savingPushPref, setSavingPushPref] = useState(false)
  const [savingTimezone, setSavingTimezone] = useState(false)
  const [savingBusinessTimezone, setSavingBusinessTimezone] = useState(false)
  const [backupRuns, setBackupRuns] = useState(null) // null = not loaded yet (or not owner)

  // Owner-only, matching the backend route's own gating — a manager
  // wouldn't get a useful response anyway, so this never even asks.
  useEffect(() => {
    if (admin.role !== 'owner') return
    getBackupRuns()
      .then(setBackupRuns)
      .catch(() => setBackupRuns([]))
  }, [admin.role])

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

  async function handleTimezoneChange(e) {
    setSavingTimezone(true)
    try {
      await updateAdminTimezone(e.target.value)
      await refreshAdmin()
    } finally {
      setSavingTimezone(false)
    }
  }

  async function handleBusinessTimezoneChange(e) {
    setSavingBusinessTimezone(true)
    try {
      await updateBusinessTimezone(e.target.value)
      await refreshAdmin()
    } finally {
      setSavingBusinessTimezone(false)
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

        <h3 style={{ marginTop: 32, marginBottom: 4 }}>Your timezone</h3>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 0, marginBottom: 10, maxWidth: 480 }}>
          Controls how message and activity timestamps are displayed for you — detected automatically the first
          time you logged in, editable anytime.
        </p>
        <select value={admin.timezone || ''} onChange={handleTimezoneChange} disabled={savingTimezone}>
          {!admin.timezone && <option value="">Not yet detected — using your browser's current timezone</option>}
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>

        <h3 style={{ marginTop: 32, marginBottom: 4 }}>Business timezone</h3>
        <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 0, marginBottom: 10, maxWidth: 480 }}>
          Governs the monthly rent-billing job and other business-wide scheduling — not a personal display
          preference, so this is shared by everyone on your team.
        </p>
        <select
          value={admin.business_timezone}
          onChange={handleBusinessTimezoneChange}
          disabled={savingBusinessTimezone}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>

        {admin.role === 'owner' && (
          <>
            <h3 style={{ marginTop: 32, marginBottom: 4 }}>Database backups</h3>
            <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 0, marginBottom: 10, maxWidth: 480 }}>
              A full database backup runs automatically once a day and is kept for 7 days — this is here so a
              silent failure would actually be noticed, not just recorded in a log nobody reads.
            </p>
            {backupRuns === null ? (
              <p style={{ fontSize: 13, color: 'var(--slate)' }}>Loading…</p>
            ) : backupRuns.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--slate)' }}>No backups have run yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 480 }}>
                {backupRuns.map((run) => (
                  <div
                    key={run.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}
                  >
                    <span>
                      {new Date(run.started_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: admin.timezone,
                      })}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {run.status === 'success' && run.file_size_bytes && (
                        <span style={{ color: 'var(--slate)' }}>{formatBytes(run.file_size_bytes)}</span>
                      )}
                      <Badge variant={run.status === 'success' ? 'green' : run.status === 'failed' ? 'red' : 'slate'}>
                        {run.status}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default LanguageSettings
