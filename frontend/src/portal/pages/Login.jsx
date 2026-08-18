import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login } from '../portalApi.js'
import '../portal.css'

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
      navigate('/portal/home', { replace: true })
    } catch (err) {
      setError(err.message)
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
        <p className="portal-login-sub">Sign in to your tenant portal</p>

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

        <p className="portal-login-switch">
          <Link to="/portal/forgot-password">Forgot password?</Link>
        </p>
      </div>
    </div>
  )
}

export default Login
