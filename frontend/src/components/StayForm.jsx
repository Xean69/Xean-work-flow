import { useState } from 'react'

const emptyValues = {
  unit_id: '',
  platform: 'airbnb',
  guest_name: '',
  checkout_date: '',
  next_checkin_date: '',
}

// units: [{ unit_id, label }] — every unit in the portfolio.
function StayForm({ initialValues, units, onSubmit, onCancel }) {
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
      await onSubmit({ ...values, unit_id: Number(values.unit_id) })
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
          {units.map((u) => (
            <option key={u.unit_id} value={u.unit_id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="platform">Platform</label>
          <select id="platform" name="platform" value={values.platform} onChange={handleChange}>
            <option value="airbnb">Airbnb</option>
            <option value="vrbo">Vrbo</option>
            <option value="booking">Booking.com</option>
            <option value="direct">Direct booking</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="guest_name">Guest name</label>
          <input
            id="guest_name"
            name="guest_name"
            value={values.guest_name}
            onChange={handleChange}
            placeholder="e.g. Jordan T."
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="checkout_date">Checkout date</label>
          <input
            id="checkout_date"
            name="checkout_date"
            type="date"
            value={values.checkout_date}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="next_checkin_date">Next check-in date</label>
          <input
            id="next_checkin_date"
            name="next_checkin_date"
            type="date"
            value={values.next_checkin_date}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save booking'}
        </button>
      </div>
    </form>
  )
}

export default StayForm
