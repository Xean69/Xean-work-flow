import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../staffApi.js'
import '../../portal/portal.css'

// Reuses the tenant portal's generic .portal-* login/field/button classes —
// same visual language, no tenant-specific meaning in those class names, so
// a second stylesheet just for this screen would be pure duplication.
function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/staff/tickets', { replace: true })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="portal-login-screen portal-login-screen-branded">
      <div className="portal-login-card">
        <div className="portal-login-brand">
          <img src="/logo-nav.png" alt="Xean" className="portal-login-mark" />
          <h1>Xean</h1>
        </div>
        <p className="portal-login-sub">Sign in to your maintenance portal</p>

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

          <div className="portal-field">
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

          <button type="submit" className="portal-btn portal-btn-primary" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
