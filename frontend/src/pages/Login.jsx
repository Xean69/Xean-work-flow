import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login, verifyTotpLogin } from '../api/client.js'
import { TotpSetupForm, BackupCodesDisplay } from '../components/TwoFactorSetup.jsx'
import './Login.css'

// Two-factor authentication is mandatory for every dashboard account (see
// backend/src/routes/admin.js) — login() itself now only ever returns
// { requires_2fa_setup } or { requires_2fa }, never a full session, so this
// is a small state machine rather than a single form:
//   'credentials' -> (2FA already configured) -> 'verify' -> dashboard
//   'credentials' -> (2FA not configured yet)  -> 'setup' -> 'backup-codes' -> dashboard
function Login() {
  const [step, setStep] = useState('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [totpInput, setTotpInput] = useState('')
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [backupCodes, setBackupCodes] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  function finishLogin() {
    navigate(location.state?.from ?? '/dashboard', { replace: true })
  }

  async function handleCredentialsSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await login(email, password)
      if (result.requires_2fa_setup) setStep('setup')
      else setStep('verify')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerifySubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await verifyTotpLogin(useBackupCode ? { backupCode: totpInput } : { code: totpInput })
      finishLogin()
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (step === 'setup') {
    return (
      <div className="login-screen login-screen-branded">
        <div className="login-card" style={{ maxWidth: 420 }}>
          <div className="login-brand">
            <img src="/logo-nav.png" alt="Xean" className="login-mark" />
            <h1>Xean</h1>
          </div>
          <p className="login-sub">Set up two-factor authentication</p>
          <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: -8, marginBottom: 16 }}>
            Required for every dashboard account — this only takes a minute.
          </p>
          <TotpSetupForm
            onComplete={(result) => {
              setBackupCodes(result.backup_codes)
              setStep('backup-codes')
            }}
          />
        </div>
      </div>
    )
  }

  if (step === 'backup-codes') {
    return (
      <div className="login-screen login-screen-branded">
        <div className="login-card" style={{ maxWidth: 420 }}>
          <div className="login-brand">
            <img src="/logo-nav.png" alt="Xean" className="login-mark" />
            <h1>Xean</h1>
          </div>
          <p className="login-sub">Save your backup codes</p>
          <BackupCodesDisplay codes={backupCodes} onDone={finishLogin} doneLabel="Continue to dashboard" />
        </div>
      </div>
    )
  }

  if (step === 'verify') {
    return (
      <div className="login-screen login-screen-branded">
        <div className="login-card">
          <div className="login-brand">
            <img src="/logo-nav.png" alt="Xean" className="login-mark" />
            <h1>Xean</h1>
          </div>
          <p className="login-sub">
            {useBackupCode ? 'Enter one of your backup codes' : 'Enter the 6-digit code from your authenticator app'}
          </p>

          <form onSubmit={handleVerifySubmit}>
            {error && <p className="form-error">{error}</p>}
            <div className="form-field">
              <label htmlFor="totp-input">{useBackupCode ? 'Backup code' : 'Authentication code'}</label>
              <input
                id="totp-input"
                value={totpInput}
                onChange={(e) =>
                  setTotpInput(useBackupCode ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                inputMode={useBackupCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                placeholder={useBackupCode ? 'XXXXX-XXXXX' : '123456'}
                autoFocus
                required
              />
            </div>
            <button type="submit" className="btn btn-primary login-submit" disabled={submitting || !totpInput}>
              {submitting ? 'Verifying…' : 'Verify'}
            </button>
          </form>

          <p className="login-switch">
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setUseBackupCode(!useBackupCode)
                setTotpInput('')
                setError('')
              }}
            >
              {useBackupCode ? 'Use your authenticator app instead' : "Lost your device? Use a backup code"}
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen login-screen-branded">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo-nav.png" alt="Xean" className="login-mark" />
          <h1>
            Xean
          </h1>
        </div>
        <p className="login-sub">Sign in to the manager dashboard</p>

        <form onSubmit={handleCredentialsSubmit}>
          {error && <p className="form-error">{error}</p>}

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="login-switch">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
        <p className="login-switch">
          New business? <Link to="/signup">Create an account</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
