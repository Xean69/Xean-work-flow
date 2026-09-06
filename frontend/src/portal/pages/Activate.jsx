import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../portalApi.js'
import '../portal.css'

// Reuses the exact same reset-token flow as ResetPassword.jsx — setting a
// password via a valid token is identical either way, only the framing
// differs (a first-time "welcome" rather than "reset").
function Activate() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-login-screen">
      <div className="portal-login-card">
        <div className="portal-login-brand">
          <img src="/logo-nav.png" alt="Xean" className="portal-login-mark" />
          <h1>
            Xean
          </h1>
        </div>

        {!token ? (
          <>
            <p className="portal-error" style={{ marginBottom: 0 }}>
              This activation link is missing its token — check the link in your email, or ask your landlord to
              resend it.
            </p>
            <p className="portal-login-switch">
              <Link to="/portal/login">Back to sign in</Link>
            </p>
          </>
        ) : done ? (
          <>
            <p className="portal-login-sub" style={{ marginBottom: 4 }}>
              Your account is active. You can now sign in.
            </p>
            <Link to="/portal/login" className="portal-btn portal-btn-primary" style={{ marginTop: 8 }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            <p className="portal-login-sub">Welcome to your tenant portal — set a password to activate your account.</p>

            <form onSubmit={handleSubmit}>
              {error && <p className="portal-error">{error}</p>}

              <div className="portal-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                  autoFocus
                />
                <span className="portal-login-hint">At least 8 characters.</span>
              </div>

              <div className="portal-field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              <button type="submit" className="portal-btn portal-btn-primary" disabled={submitting}>
                {submitting ? 'Activating…' : 'Activate account'}
              </button>
            </form>

            <p className="portal-login-switch">
              <Link to="/portal/login">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default Activate
