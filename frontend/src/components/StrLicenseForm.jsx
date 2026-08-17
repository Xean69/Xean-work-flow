import { useState } from 'react'

const emptyValues = {
  license_number: '',
  issued_date: '',
}

// Mirrors the backend's addOneYear (routes/strLicenses.js) exactly — pure
// Y/M/D arithmetic, no Date/timezone round-trip — so the preview shown
// here always matches what actually gets saved.
function addOneYear(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null
  const [year, month, day] = isoDate.split('-').map(Number)
  const nextYear = year + 1
  const daysInMonth = new Date(nextYear, month, 0).getDate()
  const clampedDay = Math.min(day, daysInMonth)
  return `${nextYear}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// propertyName: shown read-only — this form is always launched from a
// specific property's row, so there's nothing to pick.
function StrLicenseForm({ propertyName, initialValues, onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...emptyValues, ...initialValues })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setValues((v) => ({ ...v, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit(values)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const expiry = addOneYear(values.issued_date)

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label>Property</label>
        <input value={propertyName} readOnly disabled />
      </div>

      <div className="form-field">
        <label htmlFor="license_number">License number</label>
        <input
          id="license_number"
          name="license_number"
          value={values.license_number}
          onChange={handleChange}
          placeholder="e.g. STR-2026-0001"
          required
          autoFocus
        />
      </div>

      <div className="form-field">
        <label htmlFor="issued_date">Issue date</label>
        <input
          id="issued_date"
          name="issued_date"
          type="date"
          value={values.issued_date}
          onChange={handleChange}
          required
        />
      </div>

      {expiry && (
        <p className="str-expiry-preview">
          Expires <strong>{formatDate(expiry)}</strong> — one year from the issue date.
        </p>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save license'}
        </button>
      </div>
    </form>
  )
}

export default StrLicenseForm
