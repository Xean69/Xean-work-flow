import { useState } from 'react'

const CHARGE_TYPE_LABELS = { custom: 'Custom', late_fee: 'Late fee', credit: 'Credit' }

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const emptyValues = {
  description: '',
  amount: '',
  due_date: todayStr(),
  charge_type: 'custom',
  recurring: false,
}

// Manual one-time or recurring charge. Rent and addon charges are always
// system-generated (see the monthly job) — this form never creates those,
// only extra line items like a late fee or a manually-tracked add-on.
// isEditing hides type/recurring — those are structural and set once, only
// description/amount/due_date can change afterward.
function ChargeForm({ initialValues, isEditing = false, onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...emptyValues, ...initialValues })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setValues((v) => ({
      ...v,
      [name]: type === 'checkbox' ? checked : value,
      // Credits can't be recurring — switching to Credit clears a
      // previously-checked box rather than silently ignoring it on submit.
      ...(name === 'charge_type' && value === 'credit' ? { recurring: false } : {}),
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onSubmit({ ...values, amount: Number(values.amount) })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

      <div className="form-field">
        <label htmlFor="description">Description</label>
        <input
          id="description"
          name="description"
          value={values.description}
          onChange={handleChange}
          placeholder="e.g. Late fee for August"
          required
        />
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="amount">Amount ($)</label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            value={values.amount}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="due_date">Due date</label>
          <input id="due_date" name="due_date" type="date" value={values.due_date} onChange={handleChange} required />
        </div>
      </div>

      {!isEditing && (
        <div className="form-field">
          <label htmlFor="charge_type">Type</label>
          <select id="charge_type" name="charge_type" value={values.charge_type} onChange={handleChange}>
            {Object.entries(CHARGE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isEditing && values.charge_type !== 'credit' && (
        <div className="form-field">
          <label className="checkbox-label">
            <input type="checkbox" name="recurring" checked={values.recurring} onChange={handleChange} />
            Repeat this charge every month going forward
          </label>
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEditing ? 'Save charge' : 'Add charge'}
        </button>
      </div>
    </form>
  )
}

export default ChargeForm
