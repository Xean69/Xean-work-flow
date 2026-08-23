import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../api/client.js'
import './Login.css'

function ResetPassword() {
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
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <img src="/pwa-192x192.png" alt="Xean" className="login-mark" />
          <h1>
            Xean
          </h1>
        </div>

        {!token ? (
          <>
            <p className="form-error" style={{ marginBottom: 0 }}>
              This reset link is missing its token — check the link in your email, or request a new one.
            </p>
            <p className="login-switch">
              <Link to="/forgot-password">Request a new link</Link>
            </p>
          </>
        ) : done ? (
          <>
            <p className="login-sub" style={{ marginBottom: 4 }}>
              Your password has been updated.
            </p>
            <Link to="/login" className="btn btn-primary login-submit" style={{ marginTop: 8 }}>
              Sign in
            </Link>
          </>
        ) : (
          <>
            <p className="login-sub">Choose a new password for your account.</p>

            <form onSubmit={handleSubmit}>
              {error && <p className="form-error">{error}</p>}

              <div className="form-field">
                <label htmlFor="password">New password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  autoFocus
                />
                <span className="login-hint">At least 12 characters.</span>
              </div>

              <div className="form-field">
                <label htmlFor="confirmPassword">Confirm new password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
                {submitting ? 'Saving…' : 'Set new password'}
              </button>
            </form>

            <p className="login-switch">
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default ResetPassword
