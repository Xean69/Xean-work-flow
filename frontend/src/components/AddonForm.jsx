import { useState } from 'react'

const emptyValues = {
  name: '',
  monthly_price: '',
}

// Price is set here and only here — this is the single source of truth an
// addon's cost. The tenant form (where addons get applied to a lease) only
// ever lets a manager adjust quantity, never price.
function AddonForm({ initialValues, onSubmit, onCancel }) {
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
      await onSubmit({ ...values, monthly_price: Number(values.monthly_price) })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="name">Addon name</label>
        <input
          id="name"
          name="name"
          value={values.name}
          onChange={handleChange}
          placeholder="e.g. Parking"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="monthly_price">Monthly price ($)</label>
        <input
          id="monthly_price"
          name="monthly_price"
          type="number"
          min="0"
          step="0.01"
          value={values.monthly_price}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save addon'}
        </button>
      </div>
    </form>
  )
}

export default AddonForm
