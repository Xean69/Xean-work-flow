import { useState } from 'react'

const METHOD_LABELS = {
  e_transfer: 'E-transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  other: 'Other',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function currentPeriodStr() {
  return new Date().toISOString().slice(0, 7)
}

function emptyValues(rentAmount) {
  return {
    amount: rentAmount ?? '',
    payment_date: todayStr(),
    method: 'e_transfer',
    period_covered: currentPeriodStr(),
    notes: '',
  }
}

// Records a new payment, or edits an existing one — same form either way.
// rentAmount seeds the amount field so a full on-time payment is a single
// click, but it's a plain editable input for partial payments.
function RentPaymentForm({ rentAmount, initialValues, onSubmit, onCancel }) {
  const [values, setValues] = useState({ ...emptyValues(rentAmount), ...initialValues })
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
      await onSubmit({ ...values, amount: Number(values.amount) })
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="form-error">{error}</p>}

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
          <label htmlFor="period_covered">Period covered</label>
          <input
            id="period_covered"
            name="period_covered"
            type="month"
            value={values.period_covered}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="payment_date">Payment date</label>
          <input
            id="payment_date"
            name="payment_date"
            type="date"
            value={values.payment_date}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="method">Method</label>
          <select id="method" name="method" value={values.method} onChange={handleChange}>
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
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
          {submitting ? 'Saving…' : 'Save payment'}
        </button>
      </div>
    </form>
  )
}

export default RentPaymentForm
