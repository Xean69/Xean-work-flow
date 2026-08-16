import { useState } from 'react'

// Manual stand-in for a real invite/self-signup flow: the property manager
// sets a tenant's portal password directly from their record.
function TenantPasswordForm({ tenantName, onSubmit, onCancel }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit(password)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 16 }}>
        Set a portal password for {tenantName}. Share it with them directly — there's no email invite yet.
      </p>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="confirm">Confirm password</label>
        <input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save password'}
        </button>
      </div>
    </form>
  )
}

export default TenantPasswordForm
