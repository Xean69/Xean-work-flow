import { useState } from 'react'

const emptyValues = {
  unit_id: '',
  full_name: '',
  email: '',
  phone: '',
  lease_start: '',
  lease_end: '',
  rent_amount: '',
  deposit_amount: '',
}

// unitOptions: [{ value, label }] — the units this tenant can be assigned
// to (vacant units, plus the tenant's own current unit when editing).
function TenantForm({ initialValues, unitOptions, onSubmit, onCancel }) {
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
        unit_id: Number(values.unit_id),
        rent_amount: Number(values.rent_amount),
        deposit_amount: Number(values.deposit_amount || 0),
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
        <label htmlFor="unit_id">Property / Unit</label>
        <select id="unit_id" name="unit_id" value={values.unit_id} onChange={handleChange} required>
          <option value="" disabled>
            Select a unit…
          </option>
          {unitOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label htmlFor="full_name">Full name</label>
        <input
          id="full_name"
          name="full_name"
          value={values.full_name}
          onChange={handleChange}
          placeholder="e.g. Sarah K."
          required
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" value={values.email} onChange={handleChange} />
        </div>
        <div className="form-field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" value={values.phone} onChange={handleChange} />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="lease_start">Lease start</label>
          <input
            id="lease_start"
            name="lease_start"
            type="date"
            value={values.lease_start}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="lease_end">Lease end</label>
          <input
            id="lease_end"
            name="lease_end"
            type="date"
            value={values.lease_end}
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
          <label htmlFor="deposit_amount">Deposit ($)</label>
          <input
            id="deposit_amount"
            name="deposit_amount"
            type="number"
            min="0"
            step="0.01"
            value={values.deposit_amount}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save tenant'}
        </button>
      </div>
    </form>
  )
}

export default TenantForm
