import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../portalApi.js'
import '../portal.css'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await forgotPassword(email)
      setSubmitted(true)
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
          <div className="portal-login-mark">X</div>
          <h1>
            Xean <span>Intake</span>
          </h1>
        </div>

        {submitted ? (
          <>
            <p className="portal-login-sub" style={{ marginBottom: 4 }}>
              If that email has a tenant portal account, we've sent a link to reset the password.
            </p>
            <p className="portal-login-switch" style={{ marginTop: 16 }}>
              <Link to="/portal/login">Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p className="portal-login-sub">Enter your email and we'll send you a reset link.</p>

            <form onSubmit={handleSubmit}>
              {error && <p className="portal-error">{error}</p>}

              <div className="portal-field">
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

              <button type="submit" className="portal-btn portal-btn-primary" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
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

export default ForgotPassword
