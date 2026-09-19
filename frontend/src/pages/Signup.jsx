import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup } from '../api/client.js'
import { TotpSetupForm, BackupCodesDisplay } from '../components/TwoFactorSetup.jsx'
import './Login.css'

// Mirrors /signup's own per-account gating (see backend/src/routes/
// admin.js): a brand-new account's totp_required defaults false, so
// signup finishes with a real session immediately, same as it always has.
// Only an account created while the rollout's default is turned on goes
// through the same two extra setup steps as Login.jsx.
function Signup() {
  const [step, setStep] = useState('credentials') // credentials | setup | backup-codes
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [backupCodes, setBackupCodes] = useState(null)
  const navigate = useNavigate()

  function finishSignup() {
    navigate('/dashboard', { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await signup(businessName, email, password)
      if (result.requires_2fa_setup) setStep('setup')
      else finishSignup()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'setup') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ maxWidth: 420 }}>
          <div className="login-brand">
            <img src="/logo-nav.png" alt="Xean" className="login-mark" />
            <h1>Xean</h1>
          </div>
          <p className="login-sub">Set up two-factor authentication</p>
          <p style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: -8, marginBottom: 16 }}>
            Required for your account — one last step before your dashboard is ready.
          </p>
          <TotpSetupForm
            onComplete={(result) => {
              setBackupCodes(result.backup_codes)
              setStep('backup-codes')
            }}
            onCancel={() => setStep('credentials')}
          />
        </div>
      </div>
    )
  }

  if (step === 'backup-codes') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ maxWidth: 420 }}>
          <div className="login-brand">
            <img src="/logo-nav.png" alt="Xean" className="login-mark" />
            <h1>Xean</h1>
          </div>
          <p className="login-sub">Save your backup codes</p>
          <BackupCodesDisplay codes={backupCodes} onDone={finishSignup} doneLabel="Continue to dashboard" />
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo-nav.png" alt="Xean" className="login-mark" />
          <h1>
            Xean
          </h1>
        </div>
        <p className="login-sub">Set up your property management business</p>

        <form onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}

          <div className="form-field">
            <label htmlFor="businessName">Business name</label>
            <input
              id="businessName"
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              autoComplete="organization"
              required
              autoFocus
            />
          </div>

          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
            <span className="login-hint">At least 12 characters.</span>
          </div>

          <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="login-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

export default Signup
