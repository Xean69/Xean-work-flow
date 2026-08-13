import { useState } from 'react'

const emptyValues = {
  name: '',
  address: '',
  city: '',
  province: '',
  postal_code: '',
}

function PropertyForm({ initialValues, onSubmit, onCancel }) {
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
        <label htmlFor="name">Property name</label>
        <input
          id="name"
          name="name"
          value={values.name}
          onChange={handleChange}
          placeholder="e.g. Maple Court"
          required
        />
      </div>

      <div className="form-field">
        <label htmlFor="address">Address</label>
        <input
          id="address"
          name="address"
          value={values.address}
          onChange={handleChange}
          placeholder="123 Maple St"
          required
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="city">City</label>
          <input id="city" name="city" value={values.city} onChange={handleChange} required />
        </div>
        <div className="form-field">
          <label htmlFor="province">Province</label>
          <input
            id="province"
            name="province"
            value={values.province}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="postal_code">Postal code</label>
        <input
          id="postal_code"
          name="postal_code"
          value={values.postal_code}
          onChange={handleChange}
          required
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save property'}
        </button>
      </div>
    </form>
  )
}

export default PropertyForm
