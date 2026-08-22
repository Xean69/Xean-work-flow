import { useState } from 'react'

export const STAGE_LABELS = {
  notice_issued: 'Notice Issued',
  filed_with_court: 'Filed with Court',
  hearing_scheduled: 'Hearing Scheduled',
  order_granted: 'Order Granted',
  resolved_withdrawn: 'Resolved/Withdrawn',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const emptyValues = {
  notice_type: '',
  stage: 'notice_issued',
  date_issued: todayStr(),
  notes: '',
}

// A running log entry, not a stored "current status" — the tenant's
// current stage is just whichever entry has the most recent date_issued.
// notice_type is free text since eviction notice names are jurisdiction-
// specific (e.g. Ontario's N4 vs. a US "Pay or Quit" notice).
function EvictionEventForm({ initialValues, onSubmit, onCancel }) {
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

      <div className="form-row">
        <div className="form-field">
          <label htmlFor="notice_type">Notice type</label>
          <input
            id="notice_type"
            name="notice_type"
            value={values.notice_type}
            onChange={handleChange}
            placeholder="e.g. N4, Pay or Quit"
            required
          />
        </div>
        <div className="form-field">
          <label htmlFor="date_issued">Date issued</label>
          <input
            id="date_issued"
            name="date_issued"
            type="date"
            value={values.date_issued}
            onChange={handleChange}
            required
          />
        </div>
      </div>

      <div className="form-field">
        <label htmlFor="stage">Stage</label>
        <select id="stage" name="stage" value={values.stage} onChange={handleChange}>
          {Object.entries(STAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
          {submitting ? 'Saving…' : 'Save event'}
        </button>
      </div>
    </form>
  )
}

export default EvictionEventForm
