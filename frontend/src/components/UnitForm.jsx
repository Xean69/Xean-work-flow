import { useState } from 'react'

const emptyValues = {
  unit_number: '',
  bedrooms: '',
  bathrooms: '',
  rent_amount: '',
  status: 'vacant',
}

function UnitForm({ initialValues, onSubmit, onCancel }) {
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
      await onSubmit({
        ...values,
        bedrooms: Number(values.bedrooms),
        bathrooms: Number(values.bathrooms),
        rent_amount: Number(values.rent_amount),
      })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="unit_number">Unit number</label>
        <input
          id="unit_number"
          name="unit_number"
          value={values.unit_number}
          onChange={handleChange}
          placeholder="e.g. 101"
          required
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="bedrooms">Bedrooms</label>
          <input
            id="bedrooms"
            name="bedrooms"
            type="number"
            min="0"
            step="1"
            value={values.bedrooms}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="bathrooms">Bathrooms</label>
          <input
            id="bathrooms"
            name="bathrooms"
            type="number"
            min="0"
            step="0.5"
            value={values.bathrooms}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="rent_amount">Monthly rent ($)</label>
          <input
            id="rent_amount"
            name="rent_amount"
            type="number"
            min="0"
            step="0.01"
            value={values.rent_amount}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" value={values.status} onChange={handleChange}>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save unit'}
        </button>
      </div>
    </form>
  )
}

export default UnitForm
