import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/client.js'
import './Login.css'

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // The backend always responds the same way whether or not the email
  // exists — this just reflects that same message once the request
  // completes, rather than branching on anything it returns.
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
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <img src="/logo-nav.png" alt="Xean" className="login-mark" />
          <h1>
            Xean
          </h1>
        </div>

        {submitted ? (
          <>
            <p className="login-sub" style={{ marginBottom: 4 }}>
              If that email has a dashboard account, we've sent a link to reset the password.
            </p>
            <p className="login-switch" style={{ marginTop: 16 }}>
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        ) : (
          <>
            <p className="login-sub">Enter your email and we'll send you a reset link.</p>

            <form onSubmit={handleSubmit}>
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

              <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Send reset link'}
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

export default ForgotPassword
