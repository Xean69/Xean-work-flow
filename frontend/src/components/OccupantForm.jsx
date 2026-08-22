import { useState } from 'react'

const emptyValues = {
  full_name: '',
  relationship: '',
  notes: '',
}

// Additional occupants are informational only — no login, no lease terms
// of their own, just a record of who else lives in the unit.
function OccupantForm({ initialValues, onSubmit, onCancel }) {
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

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="full_name">Full name</label>
        <input id="full_name" name="full_name" value={values.full_name} onChange={handleChange} required />
      </div>

      <div className="form-field">
        <label htmlFor="relationship">Relationship (optional)</label>
        <input
          id="relationship"
          name="relationship"
          value={values.relationship}
          onChange={handleChange}
          placeholder="e.g. Spouse, Roommate, Child"
        />
      </div>

      <div className="form-field">
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" name="notes" value={values.notes} onChange={handleChange} rows={2} />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save occupant'}
        </button>
      </div>
    </form>
  )
}

export default OccupantForm
