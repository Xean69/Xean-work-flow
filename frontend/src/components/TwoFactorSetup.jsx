import { useEffect, useState } from 'react'
import { initTotpSetup, confirmTotpSetup } from '../api/client.js'

// Shared by two otherwise-unrelated call sites: Login.jsx's mandatory
// forced-setup step (no full session yet — the account just doesn't have
// 2FA configured), and LanguageSettings.jsx's voluntary "reset my 2FA"
// flow (a fully logged-in admin who's already re-entered their password).
// Both hit the exact same backend routes either way (see
// requireTwoFactorSetupAuth in utils/auth.js), so this component doesn't
// need to know or care which case it's in — it just calls onComplete with
// whatever /2fa/setup/confirm returns.
export function TotpSetupForm({ onComplete }) {
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [secret, setSecret] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    initTotpSetup()
      .then((data) => {
        setQrDataUrl(data.qr_code_data_url)
        setSecret(data.secret)
      })
      .catch((err) => setLoadError(err.message))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await confirmTotpSetup(code)
      onComplete(result)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loadError) return <p className="form-error">{loadError}</p>
  if (!qrDataUrl) return <p style={{ fontSize: 13, color: 'var(--slate)' }}>Loading…</p>

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--slate)', marginTop: 0 }}>
        Scan this code with Google Authenticator, Authy, or any compatible app.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}>
        <img src={qrDataUrl} alt="Two-factor authentication QR code" width={200} height={200} />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--slate)' }}>Can't scan it? Enter this code manually instead:</p>
      <p style={{ fontFamily: 'monospace', fontSize: 14, textAlign: 'center', letterSpacing: 1, wordBreak: 'break-all' }}>
        {secret}
      </p>

      <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
        {error && <p className="form-error">{error}</p>}
        <div className="form-field">
          <label htmlFor="totp-setup-code">Enter the 6-digit code from your app to confirm setup</label>
          <input
            id="totp-setup-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            autoFocus
            required
          />
        </div>
        <button type="submit" className="btn btn-primary login-submit" disabled={submitting || code.length !== 6}>
          {submitting ? 'Verifying…' : 'Enable two-factor authentication'}
        </button>
      </form>
    </div>
  )
}

// Shown exactly once, right after a setup is confirmed (first-time or a
// reset) — these plaintext codes are never retrievable again afterward
// (only their bcrypt hashes are stored), so this is the one and only
// moment there's anything to display.
export function BackupCodesDisplay({ codes, onDone, doneLabel = 'Done' }) {
  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--slate)', marginTop: 0 }}>
        Save these backup codes somewhere safe. Each one works once, in place of a 6-digit code, if you lose access
        to your authenticator app. You won't be able to see them again after this.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          fontFamily: 'monospace',
          fontSize: 13.5,
          background: 'var(--parchment)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: '14px 16px',
          margin: '16px 0',
        }}
      >
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <button type="button" className="btn btn-primary login-submit" onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  )
}
